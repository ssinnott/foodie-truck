// CHARACTER SELECT (docs/GDD.md section 10): five recipe cards on the dimmed lane, the player's jam-jar-lid cursor,
// a beetroot READY stamp when they lock in, and the run starts a beat after the stamp lands - on the day board
// (game/screens/stage.js), where the day's plan is read and the truck is opened.
//
// One seat: this is the way into a game on this machine, and a machine is one player. A party of two to four picks
// in the online lobby instead (screens/lobby.ts), each player on their own machine; the couch seats this screen
// used to fill as P2 to P4 dropped in went with local co-op. The seat is still read by slot through
// engine/input.js like every other, and everything the screen simulates is two numbers (which card, ready or not),
// which is what `checksumFields` reports. The rigs are built ONCE in enter() - one per card in the seat's apron and
// one off duty - so a cursor moving to a card changes which pre-built rig is drawn rather than building one in draw().
//
// THE FRIENDS WHO RIDE ALONG (game/friends.ts): whoever the cursor stands on brings two more of the cast with them,
// and the screen says who before the stamp goes down - those two cards wear the truck's own mustard (its awning's
// stripe) across their header, lettered with the job each one does in the kitchen, and the bio strip names them
// under the bio. Not the off-duty apron they wear all day: that tan IS the paper-dark band every other card has.
import { VIEW_W, UI, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { CritterDef, Game, ScreenParams } from '../game.ts';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.ts';
import { pathRR } from '../../lib/art/shading.ts';
import { drawBust, idlePoseOf } from '../../art/portraits.ts';
import { critterRig } from '../../content/critters/common.ts';
import { CRITTERS } from '../../content/critters/index.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { PartialPose } from '../../lib/art/poses.ts';
import { startRun } from '../run.ts';
import { friendsOf } from '../friends.ts';
import type { FriendJob } from '../friends.ts';
import { clearWeek } from '../week.ts';
import { freshSeed } from '../../lib/engine/rng.ts';
import { drawSign, drawStamp, drawHint, drawDim, drawTicket } from '../ui.ts';
import { drawLane, drawPorthole, PORT_R } from '../../art/logo.ts';
import { TRUCK } from '../../art/truck.ts';

const R = Math.round, TAU = Math.PI * 2;
/**
 * Card row: 5 x 116 with 8 px gaps is 612 of the 640, centred by cardX. The kit's 140 px card (game/ui.ts
 * CARD_W, which the day board still pins up three of) fitted four across; the fifth cast member does not, so
 * this screen cuts its own recipe cards a little narrower - the porthole (94 px with its doily) still fits with room
 * either side. The stat rows are gone, so the card stops at its rule (150 px, not the kit's 200) and the row sits
 * centred between the header sign and the bio strip.
 */
const CARD_W = 116, CARD_H = 150, CARD_GAP = 8, CARD_Y = 80;
/** Left edge of card `i` in a centred row of `n`. */
function cardX(i: number, n: number): number { const total = n * CARD_W + (n - 1) * CARD_GAP; return R((VIEW_W - total) / 2) + i * (CARD_W + CARD_GAP); }
/** Where the cursor ring sits on a card, in card space: the top-left corner, clear of the bust. */
const RING_X = 16, RING_Y = 18;
/**
 * The doily porthole the bust sits in, in card space. The scale is set by the two limiting rigs: Chicory's 16 px
 * upright ears and Sorrel's toque are the species cues (docs/ART_STYLE.md section 0), so the rig has to clear the
 * circle's CHORD, not its tangent - hence the margin under the aperture's top and the calmer scale.
 */
const PORT_CY = 58, BUST_SCALE = 1.28, BUST_MARGIN = 4;
/** Text rows in card space. */
const NAME_Y = 104, ROLE_Y = 124, RULE_Y = 136;
/**
 * The index-card furniture that makes these five read as RECIPE CARDS: a torn top edge (the same 2x2 ink notches
 * every 6 px as the paper ticket in game/ui.js) and a beetroot margin rule down the left. Beetroot is the truck's own
 * body tone, not the orchard's apple red.
 */
const MARGIN_X = 7, NOTCH_PITCH = 6;
/** Slot numbers as strings, so the cursor's disc never builds one per frame. */
const SLOT_TEXT = ['1', '2', '3', '4'];
/** Header band captions, built here so draw() never joins a string. */
const PICKS_TEXT = ['P1 PICKS', 'P2 PICKS', 'P3 PICKS', 'P4 PICKS'];
/** The one seat this screen has: this machine's. */
const SEAT = 0;
/** The stamp's arrival, and how long the crew hold their READY before the fade. */
const STAMP_FRAMES = 24, START_HOLD = 30;
/**
 * Where the stamp lands, in card space: just under the NAME, across the role line and the rule, and a little over the
 * card's foot like a rubber stamp. It used to land on the name row - a stamped card then told you neither who was
 * picked nor what the stamp said.
 */
const STAMP_ROW = 142;
/**
 * Beetroot stamp ink, taken from the truck's own body rather than copied as a hex - a palette change to the truck
 * now reaches the stamps. Beetroot over UI.red is a deliberate deviation from ART_STYLE section 4: the apple red
 * is the orchard's signal colour, and a signal colour is banned as decor on another screen.
 */
const STAMP_OPTS = { size: 3, color: TRUCK.body, light: TRUCK.bodyHi };
const HEAD_TEXT = 'CHOOSE YOUR CHARACTER';
/** The bio strip under the cards: a torn-off order pad with whoever the cursor is standing on written on it, and
 *  under the bio who rides along with them. BIO_ROWS are the two rows' tops in strip space; a pick that brings
 *  nobody (never, from this screen) keeps the bio on the strip's one middle row. */
const BIO = { x: 150, y: 284, w: 340, h: 30 }, BIO_ROWS = [6, 17], BIO_MID = 11;
/** A friend card's header band, by the job they do in the kitchen (game/friends.ts). */
const JOB_TEXT: Record<FriendJob, string> = { order: 'TAKES ORDERS', run: 'RUNS ABOUT' };
/** The text kits the header bands and the bio strip write in (ink; the friends' row in the role line's wood), built
 *  once rather than per draw. */
const INK_TEXT = { size: 1, color: UI.ink, align: 'center' as const, shadow: false }, FRIENDS_TEXT = { size: 1, color: UI.wood, align: 'center' as const, shadow: false };

/**
 * The player's seat. The two numbers that can diverge between machines are `card` and `ready` - `checksumFields`
 * hashes exactly those.
 */
export interface SelectSeat {
  /** Player slot: the seat's colour, the input it reads and its cursor. Always this machine's, slot 0. */
  slot: number;
  /** Index into `cards` of the card this seat is standing on. */
  card: number;
  /** True once the seat has stamped READY. */
  ready: boolean;
  /** Frames since the stamp landed, which drives the stamp's slam (STAMP_FRAMES); reset by a cancel. */
  t: number;
}

/**
 * One recipe card as the screen holds it: the cast entry, its two rigs, the player that idles it and the pose its
 * bust is anchored on. Built ONCE in enter() - a cursor moving to a card changes which pre-built rig is drawn
 * rather than building one in draw().
 */
export interface SelectCard {
  /** The cast entry (content/critters/index.ts CRITTERS), in cast order. */
  def: CritterDef;
  /** `rigs[0]` is the off-duty apron, `rigs[1]` the seat's own colour: the card the cursor is on wears it. */
  rigs: Rig[];
  /** Idling from a per-card offset (i * 11 ticks), so five busts in a row do not breathe in lockstep. */
  player: AnimPlayer;
  /** The first idle frame's pose, which art/portraits.ts anchors the bust's head on; null for a rig without one. */
  anchor: PartialPose | null;
  /** Per card of the row: the job its cast member does riding along with THIS card's pick, or '' when they do not
   *  come (game/friends.ts friendsOf). Indexed like `cards`. */
  jobs: (FriendJob | '')[];
  /** The bio strip's second row for this pick: who rides along ('SORREL AND CHICORY RIDE ALONG'). */
  friendsText: string;
}

export class SelectScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations: es2022 defines a plain field before the constructor body runs, so a screen's own
  // declaration would also define the base's field back to undefined and wipe what the constructor just wrote.
  // `declare` erases under tsc, under esbuild and under Node's type stripping alike.

  /** The seats picking: one, this machine's (kept a list so the summary reads as every other seated screen's). */
  declare seats: SelectSeat[];
  /** The recipe cards, one per cast member in cast order. */
  declare cards: SelectCard[];
  /** The frame the run starts on, set once the seat has stamped; -1 whenever the countdown is off. */
  declare starting: number;
  /** True once the run has been started and the fade is running: the seat stops taking input. */
  declare started: boolean;
  /** The hint strip under the cards, joined once in enter() because it names the player's own keys. */
  declare hint: string;
  /** The same strip written for a pad, so a player on a gamepad is not told to press a key they do not have. */
  declare hintPad: string;
  /** The drawBust options, reused every frame (draw() allocates nothing). */
  declare bustOpts: { margin: number; facing: number };

  constructor(game: Game) { super(game, 'select'); this.seats = []; this.cards = []; this.starting = -1; this.started = false; }

  override enter(params: ScreenParams) {
    super.enter(params);
    const inp = this.game.input;
    // Two rigs per card, the seat's apron and an off-duty one for a card nobody is standing on: tones are cached
    // per rig, so these are built here and never in draw().
    this.cards = CRITTERS.map((def, i) => {
      const player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let k = 0; k < i * 11; k++) player.tick();
      return { def, rigs: [critterRig(def, -1), critterRig(def, SEAT)], player, anchor: idlePoseOf(def), jobs: [], friendsText: '' };
    });
    // who rides along with each pick, worked out once: the cards they stand on, the job each does, and the strip's row
    for (const c of this.cards) {
      const friends = friendsOf([{ critter: c.def.id }]), names: string[] = [];
      c.jobs = this.cards.map(() => '');
      for (const f of friends) {
        const k = this.cards.findIndex((o) => o.def.id === f.critter);
        if (k >= 0) { c.jobs[k] = f.job; names.push(this.cards[k].def.name); }
      }
      c.friendsText = names.length > 1 ? `${names.join(' AND ')} RIDE ALONG` : names.length ? `${names[0]} RIDES ALONG` : '';
    }
    this.seats = [{ slot: SEAT, card: 0, ready: false, t: 0 }];
    this.starting = -1; this.started = false;
    // The hint line in the player's own buttons - a player on a pad is told A and B, not Z and C. BOTH are built
    // here and draw() picks one: the string is never joined in a draw (docs/ARCHITECTURE.md section 8), and the
    // device is never read in update(), which is where reading it would be a desync (docs/MULTIPLAYER.md).
    this.hint = `${inp.keyText(0, 'action')}: READY    ${inp.keyText(0, 'cancel')}: BACK`;
    this.hintPad = `${inp.padText('action')}: READY    ${inp.padText('cancel')}: BACK`;
    this.bustOpts = { margin: BUST_MARGIN, facing: 1 };
  }

  /** Every seat has stamped. A plain loop: update() allocates nothing. */
  allReady() {
    for (const s of this.seats) if (!s.ready) return false;
    return this.seats.length > 0;
  }

  override update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    for (const seat of this.seats) {
      if (seat.ready) seat.t++;
      if (this.started) continue;
      if (!seat.ready) {
        if (inp.pressed(seat.slot, 'right')) { seat.card = (seat.card + 1) % this.cards.length; audio.play('menu_move'); }
        if (inp.pressed(seat.slot, 'left')) { seat.card = (seat.card + this.cards.length - 1) % this.cards.length; audio.play('menu_move'); }
        if (inp.pressed(seat.slot, 'action')) { seat.ready = true; seat.t = 0; audio.play('stamp'); }
      }
      if (inp.pressed(seat.slot, 'cancel')) {
        if (seat.ready) { seat.ready = false; seat.t = 0; audio.play('menu_back'); }
        else { audio.play('menu_back'); this.game.reset('title'); return; }
      }
    }
    for (const c of this.cards) c.player.tick();
    // The seat has stamped: hold the stamp for a beat, then start the run and fade to the map. The condition is
    // re-read EVERY step, so a cancel during the hold calls the countdown off instead of starting a run on a card
    // the player has just changed their mind about.
    const allIn = this.allReady();
    if (!allIn) this.starting = -1;
    else if (this.starting < 0 && !this.started) this.starting = this.frame + START_HOLD;
    if (!this.started && this.starting >= 0 && this.frame >= this.starting) {
      this.started = true;
      const picks = [];
      for (const s of this.seats) picks.push(s.card);
      // A new day, a new seed - unless ?seed= (or test mode) pinned one for the page, in which case every run replays
      // it. Either way the gameplay rng is reseeded from the run's seed here, as net/session.ts does at START, so
      // a run is reproducible from its seed alone and not from how many menus were walked to reach it.
      const opts = this.game.options;
      if (!opts.seedFixed) opts.seed = freshSeed();
      this.game.rng.seed(opts.seed);
      // the two dev jumps ride along so a capture or a scenario that walks in through the front door still gets its day
      startRun(this.game, { seed: opts.seed, critters: picks, order: opts.order, recipes: opts.recipes });
      // PLAY is a FRESH WEEK, so the one in progress is forgotten here rather than at the first closed board: a
      // player who starts a new week and walks away before Monday shuts must not be offered last week's Thursday
      // by CONTINUE. This is a WRITE, which cannot diverge two peers the way a read could (docs/MULTIPLAYER.md's
      // rule is about the simulation reading storage), and the select screen is never in a lockstep match.
      clearWeek();
      audio.play('menu_confirm');
      this.game.fadeTo(() => this.game.replace('stage'));
    }
  }

  // ---- drawing ----

  /** The jam-jar lid: a slot-coloured ring with a clip notch and a paper disc carrying the seat number. */
  cursor(ctx, seat) {
    const x = cardX(seat.card, this.cards.length) + RING_X, y = CARD_Y + RING_Y, col = PLAYER_COLORS[seat.slot];
    ctx.save();
    ctx.translate(R(x), R(y));
    ctx.rotate(Math.sin(this.frame * 0.08 + seat.slot) * 0.05);
    ctx.fillStyle = UI.ink; ctx.fillRect(-4, -20, 8, 9);
    ctx.fillStyle = col; ctx.fillRect(-3, -19, 6, 7);
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fillStyle = UI.ink; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fillStyle = UI.paper; ctx.fill();
    drawText(ctx, SLOT_TEXT[seat.slot], 0, -3, { size: 1, color: UI.ink, align: 'center', shadow: false });
    ctx.restore();
  }

  /** Which seat is standing on card `i`, or -1. */
  pickerOf(i) { for (const s of this.seats) if (s.card === i) return s.slot; return -1; }

  /** The job card `i`'s cast member does riding along with the pick under the cursor, or '' when they stay home. */
  jobOf(i: number): FriendJob | '' { const s = this.seats[0]; return s ? this.cards[s.card].jobs[i] : ''; }

  card(ctx, i) {
    const c = this.cards[i], x = cardX(i, this.cards.length), y = CARD_Y, slot = this.pickerOf(i), job = slot >= 0 ? '' : this.jobOf(i);
    // paper, one ink line, a torn top edge, and a header band in the picking seat's colour - or, on the two cards
    // riding along with the pick, the truck's mustard
    ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x + 3, y + 4, CARD_W, CARD_H, 3); ctx.fill();
    pathRR(ctx, x, y, CARD_W, CARD_H, 3);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = UI.paper; ctx.fill();
    ctx.fillStyle = slot >= 0 ? PLAYER_COLORS[slot] : job ? TRUCK.mustard : UI.paperDark;
    ctx.fillRect(x + 1, y + 1, CARD_W - 2, 14);
    ctx.fillStyle = UI.ink; ctx.fillRect(x + 1, y + 15, CARD_W - 2, 1);
    ctx.fillStyle = UI.ink;
    for (let nx = x + 4; nx < x + CARD_W - 3; nx += NOTCH_PITCH) ctx.fillRect(nx, y, 2, 2);
    // the seat's colour runs the whole card edge, not just the header: from across the room a card is P1's or nobody's
    if (slot >= 0) {
      ctx.fillStyle = PLAYER_COLORS[slot];
      ctx.fillRect(x + 1, y + 16, 2, CARD_H - 18);
      ctx.fillRect(x + CARD_W - 3, y + 16, 2, CARD_H - 18);
      ctx.fillRect(x + 1, y + CARD_H - 3, CARD_W - 2, 2);
    }
    drawText(ctx, slot >= 0 ? PICKS_TEXT[slot] : job ? JOB_TEXT[job] : c.def.species, x + CARD_W / 2, y + 5, INK_TEXT);
    // the plum doily porthole: the pale furs never sit on paper (docs/ART_STYLE.md section 1, the risk note).
    // The ring never changes, so it is one blit of a layer painted in art/logo.js; only the bust is live.
    const cx = x + CARD_W / 2, cy = y + PORT_CY;
    drawPorthole(ctx, cx, cy);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, PORT_R, 0, TAU); ctx.clip();
    drawBust(ctx, c.rigs[slot >= 0 ? 1 : 0], c.player.pose, c.anchor, cx - PORT_R, cy - PORT_R, PORT_R * 2, PORT_R * 2, BUST_SCALE, this.bustOpts);
    ctx.restore();
    // name, role, and the rule under them
    drawTextOutlined(ctx, c.def.name, cx, y + NAME_Y, { size: 2, color: UI.ink, outline: UI.paperDark, thickness: 1, align: 'center', shadow: false });
    drawText(ctx, c.def.role, cx, y + ROLE_Y, { size: 1, color: UI.wood, align: 'center', shadow: false });
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 8, y + RULE_Y, CARD_W - 16, 1);
    // the beetroot margin rule down the left of the card
    ctx.fillStyle = TRUCK.bodyHi; ctx.fillRect(x + MARGIN_X, y + 18, 2, CARD_H - 24);
  }

  override draw(ctx: CanvasRenderingContext2D) {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 26, HEAD_TEXT, { size: 2 });
    for (let i = 0; i < this.cards.length; i++) this.card(ctx, i);
    for (const seat of this.seats) this.cursor(ctx, seat);
    for (const seat of this.seats) {
      if (!seat.ready) continue;
      const x = cardX(seat.card, this.cards.length) + CARD_W / 2;
      drawStamp(ctx, 'READY', x, CARD_Y + STAMP_ROW, Math.min(1, seat.t / STAMP_FRAMES), STAMP_OPTS);
    }
    const lead = this.cards[this.seats[0].card], two = !!lead.friendsText;
    drawTicket(ctx, BIO.x, BIO.y, BIO.w, BIO.h, { rules: false, header: false });
    drawText(ctx, lead.def.bio || lead.def.fullName, BIO.x + BIO.w / 2, BIO.y + (two ? BIO_ROWS[0] : BIO_MID), INK_TEXT);
    if (two) drawText(ctx, lead.friendsText, BIO.x + BIO.w / 2, BIO.y + BIO_ROWS[1], FRIENDS_TEXT);
    drawHint(ctx, this.game.input.device(0) === 'gamepad' ? this.hintPad : this.hint);
  }

  override summary() {
    return {
      seats: this.seats.map((s) => ({ slot: s.slot, critter: this.cards[s.card].def.id, ready: s.ready })),
      // who rides along with the pick under the cursor, as the cards and the strip show it ('sorrel:order')
      friends: this.seats.length ? this.cards[this.seats[0].card].jobs.map((j, k) => j ? `${this.cards[k].def.id}:${j}` : '').filter(Boolean) : [],
      friendsText: this.seats.length ? this.cards[this.seats[0].card].friendsText : '',
      starting: this.starting >= 0, started: this.started,
    };
  }
  /** Every number that could differ between two machines: the cursor and the lock of each seat. */
  override checksumFields() {
    const out = [];
    for (const s of this.seats) out.push(s.card, s.ready ? 1 : 0);
    out.push(this.started ? 1 : 0);
    return out;
  }
}
