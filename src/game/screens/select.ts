// CHARACTER SELECT (docs/GDD.md section 10): five recipe cards on the dimmed lane, one jam-jar-lid cursor per
// JOINED seat, a beetroot READY stamp when a seat locks in, and the run starts the moment every joined seat
// has stamped - on the day board (game/screens/stage.js), where the party reads the day's plan and opens the truck.
//
// Seats are read ONLY by slot through engine/input.js, so a couch P2 dropping in mid-screen - on the keys or on a
// pad, seats 3 and 4 being pad-only - is the same code path as P1. Everything the screen simulates is two numbers
// per seat (which card, ready or not), which is what `checksumFields` reports. The rigs are built ONCE in enter() - one per card per possible seat, so a cursor
// moving to a card changes which pre-built rig is drawn rather than building one in draw().
import { VIEW_W, UI, PLAYER_COLORS, MAX_PLAYERS, LOCAL_PLAYERS } from '../../constants.ts';
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
import { freshSeed } from '../../lib/engine/rng.ts';
import { CARD_H, BUST_H, drawSign, drawStamp, drawHint, drawDim, drawTicket } from '../ui.ts';
import { drawLane, drawPorthole, PORT_R } from '../../art/logo.ts';
import { TRUCK } from '../../art/truck.ts';

const R = Math.round, TAU = Math.PI * 2;
/**
 * Card row: 5 x 116 with 8 px gaps is 612 of the 640, centred by cardX. The kit's 140 px card (game/ui.ts
 * CARD_W, which the day board still pins up three of) fitted four across; the fifth cast member does not, so
 * this screen cuts its own recipe cards a little narrower - the porthole (94 px with its doily) and the pip bars
 * still fit with room either side - and keeps the kit's height.
 */
const CARD_W = 116, CARD_GAP = 8, CARD_Y = 52;
/** Left edge of card `i` in a centred row of `n`. */
function cardX(i: number, n: number): number { const total = n * CARD_W + (n - 1) * CARD_GAP; return R((VIEW_W - total) / 2) + i * (CARD_W + CARD_GAP); }
/** Where each seat's cursor ring sits on a card, in card space: four corners, so four seats fit on one card. */
const RING_POS = Object.freeze([[16, 18], [CARD_W - 16, 18], [16, BUST_H - 10], [CARD_W - 16, BUST_H - 10]]);
/**
 * The doily porthole the bust sits in, in card space. The scale is set by the two limiting rigs: Chicory's 16 px
 * upright ears and Sorrel's toque are the species cues (docs/ART_STYLE.md section 0), so the rig has to clear the
 * circle's CHORD, not its tangent - hence the margin under the aperture's top and the calmer scale.
 */
const PORT_CY = 58, BUST_SCALE = 1.28, BUST_MARGIN = 4;
/** Text rows in card space. */
const NAME_Y = 104, ROLE_Y = 124, RULE_Y = 136, STAT_Y = 148, STAT_PITCH = 15;
/** Five pips per stat, 6 px each at a 9 px pitch: 42 px of bar, right-aligned in the card. */
const PIP_X = 66, PIP_N = 5, PIP_W = 6, PIP_PITCH = 9;
/**
 * The index-card furniture that makes these five read as RECIPE CARDS rather than stat blocks: a torn top edge
 * (the same 2x2 ink notches every 6 px as the paper ticket in game/ui.js), a beetroot margin rule down the left
 * and a ruled line under every written row. Beetroot is the truck's own body tone, not the orchard's apple red.
 */
const MARGIN_X = 7, TEXT_X = 13, NOTCH_PITCH = 6;
const STAT_LABELS = ['SPEED', 'KITCHEN', 'FORAGE'];
/**
 * Role flavour as five-pip bars (docs/GDD.md section 2: roles are flavour and small differences, never gates).
 * The hungry one carries, the chef cooks, the forager is fastest in the mini-games (GDD section 2 puts SPEED on
 * the forager, not the driver), the head chef is steady everywhere and best at the pass - and every bar is 2..5
 * so no card reads as the wrong pick.
 */
const STATS = { barley: [2, 3, 4], sorrel: [3, 5, 2], chicory: [4, 2, 3], cress: [5, 3, 5], rowan: [3, 5, 3] };
const STATS_DEFAULT = [3, 3, 3];
/** Slot numbers as strings, so the cursor's disc never builds one per frame. */
const SLOT_TEXT = ['1', '2', '3', '4'];
/** Header band captions, built here so draw() never joins a string. */
const PICKS_TEXT = ['P1 PICKS', 'P2 PICKS', 'P3 PICKS', 'P4 PICKS'];
/** The stamp's arrival, and how long the crew hold their READY before the fade. */
const STAMP_FRAMES = 24, START_HOLD = 30;
/**
 * Where the stamp lands, in card space: the band between the NAME and the first ruled row, so it crosses the
 * role line and the rule and nothing else. It used to land on the name row - a stamped card then told you
 * neither who was picked nor what the stamp said - and across the pip rows its ink broke up over the pips.
 */
const STAMP_ROW = 142;
/**
 * Beetroot stamp ink, taken from the truck's own body rather than copied as a hex - a palette change to the truck
 * now reaches the stamps. Beetroot over UI.red is a deliberate deviation from ART_STYLE section 4: the apple red
 * is the orchard's signal colour, and a signal colour is banned as decor on another screen.
 */
const STAMP_OPTS = { size: 3, color: TRUCK.body, light: TRUCK.bodyHi };
const HEAD_TEXT = 'CHOOSE YOUR CHARACTER';
/** The bio strip under the cards: a torn-off order pad with whoever P1 is standing on written on it. */
const BIO = { x: 150, y: 284, w: 340, h: 30 };
const JOIN_Y = CARD_Y + CARD_H + 10;

/**
 * One seat of the room, one per SLOT and not per joined player: seats sit unjoined until their first input,
 * which is what makes a couch drop-in the same code path as P1. The two numbers that can diverge between
 * machines are `card` and `ready` - `checksumFields` hashes exactly those, plus `on`.
 */
export interface SelectSeat {
  /** Player slot 0..3: the seat's colour, its keys or pad, its cursor and its ring position. */
  slot: number;
  /** True once engine/input.ts reports the seat joined; an unjoined seat draws no cursor and reads no input. */
  on: boolean;
  /** Index into `cards` of the card this seat is standing on. */
  card: number;
  /** True once the seat has stamped READY. */
  ready: boolean;
  /** Frames since the stamp landed, which drives the stamp's slam (STAMP_FRAMES); reset by a cancel. */
  t: number;
}

/**
 * One recipe card as the screen holds it: the cast entry, one rig per possible seat, the player that idles it
 * and the pose its bust is anchored on. Built ONCE in enter() - a cursor moving to a card changes which
 * pre-built rig is drawn rather than building one in draw().
 */
export interface SelectCard {
  /** The cast entry (content/critters/index.ts CRITTERS), in cast order. */
  def: CritterDef;
  /** Rigs by seat, offset by one: `rigs[0]` is the off-duty apron, `rigs[s + 1]` is slot `s`'s. */
  rigs: Rig[];
  /** Idling from a per-card offset (i * 11 ticks), so five busts in a row do not breathe in lockstep. */
  player: AnimPlayer;
  /** The first idle frame's pose, which art/portraits.ts anchors the bust's head on; null for a rig without one. */
  anchor: PartialPose | null;
  /** The three pip counts in STAT_LABELS order (STATS, or STATS_DEFAULT for a card with no entry). */
  stats: number[];
}

export class SelectScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations: es2022 defines a plain field before the constructor body runs, so a screen's own
  // declaration would also define the base's field back to undefined and wipe what the constructor just wrote.
  // `declare` erases under tsc, under esbuild and under Node's type stripping alike.

  /** One seat per SLOT, in slot order; how many are actually in the room is `seats.filter(s => s.on)`. */
  declare seats: SelectSeat[];
  /** The recipe cards, one per cast member in cast order. */
  declare cards: SelectCard[];
  /** The frame the run starts on, set once every joined seat has stamped; -1 whenever the countdown is off. */
  declare starting: number;
  /** True once the run has been started and the fade is running: the seats stop taking input. */
  declare started: boolean;
  /** The drop-in prompt for a KEYBOARD seat, joined once in enter() because it names P2's own key. */
  declare joinHintKeys: string;
  /** The drop-in prompt for a PAD seat: seats 3 and 4 have no keys, so a pad is the only way in. */
  declare joinHintPads: string;
  /** The hint strip under the cards, likewise joined once. */
  declare hint: string;
  /** The same strip written for a pad, so a player on a gamepad is not told to press a key they do not have. */
  declare hintPad: string;
  /** The drawBust options, reused every frame (draw() allocates nothing). */
  declare bustOpts: { margin: number; facing: number };

  constructor(game: Game) { super(game, 'select'); this.seats = []; this.cards = []; this.starting = -1; this.started = false; }

  override enter(params: ScreenParams) {
    super.enter(params);
    const inp = this.game.input;
    // One rig per card per seat, plus an off-duty one for a card nobody is standing on: the apron is the seat's
    // colour and tones are cached per rig, so these are built here and never in draw().
    this.cards = CRITTERS.map((def, i) => {
      const player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let k = 0; k < i * 11; k++) player.tick();
      const rigs = [critterRig(def, -1)];
      for (let s = 0; s < MAX_PLAYERS; s++) rigs.push(critterRig(def, s));
      return { def, rigs, player, anchor: idlePoseOf(def), stats: STATS[def.id] || STATS_DEFAULT };
    });
    this.seats = [];
    for (let s = 0; s < MAX_PLAYERS; s++) this.seats.push({ slot: s, on: inp.joined(s), card: s % this.cards.length, ready: false, t: 0 });
    this.starting = -1; this.started = false;
    // Two drop-in prompts, both built here: while the P2 keys are free the hint names them AND the pads, and once
    // somebody is on them the pads are all that is left to invite (seats 3 and 4 have no keyboard block).
    this.joinHintKeys = `P2: PRESS ${inp.keyText(1, 'action')}    GAMEPAD: PRESS ${inp.padText('action')} TO JOIN`;
    this.joinHintPads = `GAMEPAD: PRESS ${inp.padText('action')} TO JOIN`;
    // P1's own hint line in P1's own buttons - a lead seat on a pad is told A and B, not Z and C. BOTH are built
    // here and draw() picks one: the string is never joined in a draw (docs/ARCHITECTURE.md section 8), and the
    // device is never read in update(), which is where reading it would be a desync (docs/MULTIPLAYER.md).
    this.hint = `${inp.keyText(0, 'action')}: READY    ${inp.keyText(0, 'cancel')}: BACK`;
    this.hintPad = `${inp.padText('action')}: READY    ${inp.padText('cancel')}: BACK`;
    this.bustOpts = { margin: BUST_MARGIN, facing: 1 };
  }

  /** Seats that are actually in the room (P1 always; the other three after a keyboard or pad drop-in). */
  joinedCount() { let n = 0; for (const s of this.seats) if (s.on) n++; return n; }

  /** Somebody is here and every seat that is here has stamped. A plain loop: update() allocates nothing. */
  allReady() {
    let on = 0;
    for (const s of this.seats) { if (!s.on) continue; if (!s.ready) return false; on++; }
    return on > 0;
  }

  override update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    for (const seat of this.seats) {
      // A couch drop-in: engine/input.js joins the seat on its first key or button, and the cursor appears on its
      // own card. The press that SAT THEM DOWN is then eaten - held and buffered - because it is the same press,
      // on the same step, that would otherwise stamp READY on a card they have not looked at yet. Three of the
      // four seats arrive this way, so a join that locks the pick is a party stuck on its default cast.
      if (!seat.on && inp.joined(seat.slot)) {
        seat.on = true; seat.card = seat.slot % this.cards.length;
        inp.consume(seat.slot, 'action');
        audio.play('join');
        continue;
      }
      if (!seat.on) continue;
      if (seat.ready) seat.t++;
      if (this.started) continue;
      if (!seat.ready) {
        if (inp.pressed(seat.slot, 'right')) { seat.card = (seat.card + 1) % this.cards.length; audio.play('menu_move'); }
        if (inp.pressed(seat.slot, 'left')) { seat.card = (seat.card + this.cards.length - 1) % this.cards.length; audio.play('menu_move'); }
        if (inp.pressed(seat.slot, 'action')) { seat.ready = true; seat.t = 0; audio.play('stamp'); }
      }
      if (inp.pressed(seat.slot, 'cancel')) {
        if (seat.ready) { seat.ready = false; seat.t = 0; audio.play('menu_back'); }
        else if (seat.slot === 0 && !this.seats.some((x) => x.on && x.ready)) { audio.play('menu_back'); this.game.reset('title'); return; }
      }
    }
    for (const c of this.cards) c.player.tick();
    // Every joined seat has stamped: hold the stamps for a beat, then start the run and fade to the map. The
    // condition is re-read EVERY step, so a seat that cancels - or a couch seat that drops in - during the hold
    // calls the countdown off instead of being dragged into a run on a card it never chose.
    const allIn = this.allReady();
    if (!allIn) this.starting = -1;
    else if (this.starting < 0 && !this.started) this.starting = this.frame + START_HOLD;
    if (!this.started && this.starting >= 0 && this.frame >= this.starting) {
      this.started = true;
      const picks = [];
      for (const s of this.seats) if (s.on) picks.push(s.card);
      // A new day, a new seed - unless ?seed= (or test mode) pinned one for the page, in which case every run replays
      // it. Either way the gameplay rng is reseeded from the run's seed here, as net/session.ts does at START, so
      // a run is reproducible from its seed alone and not from how many menus were walked to reach it.
      const opts = this.game.options;
      if (!opts.seedFixed) opts.seed = freshSeed();
      this.game.rng.seed(opts.seed);
      // the two dev jumps ride along so a capture or a scenario that walks in through the front door still gets its day
      startRun(this.game, { seed: opts.seed, critters: picks, order: opts.order, recipes: opts.recipes });
      audio.play('menu_confirm');
      this.game.fadeTo(() => this.game.replace('stage'));
    }
  }

  // ---- drawing ----

  /** The jam-jar lid: a slot-coloured ring with a clip notch and a paper disc carrying the seat number. */
  cursor(ctx, seat) {
    const card = cardX(seat.card, this.cards.length), pos = RING_POS[seat.slot] || RING_POS[0];
    const x = card + pos[0], y = CARD_Y + pos[1], col = PLAYER_COLORS[seat.slot];
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

  /** Which seat is standing on card `i` (the first one, if two share it), or -1. */
  pickerOf(i) { for (const s of this.seats) if (s.on && s.card === i) return s.slot; return -1; }

  card(ctx, i) {
    const c = this.cards[i], x = cardX(i, this.cards.length), y = CARD_Y, slot = this.pickerOf(i);
    // paper, one ink line, a torn top edge, and a header band in the picking seat's colour
    ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x + 3, y + 4, CARD_W, CARD_H, 3); ctx.fill();
    pathRR(ctx, x, y, CARD_W, CARD_H, 3);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = UI.paper; ctx.fill();
    ctx.fillStyle = slot >= 0 ? PLAYER_COLORS[slot] : UI.paperDark;
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
    drawText(ctx, slot >= 0 ? PICKS_TEXT[slot] : c.def.species, x + CARD_W / 2, y + 5, { size: 1, color: UI.ink, align: 'center', shadow: false });
    // the plum doily porthole: the pale furs never sit on paper (docs/ART_STYLE.md section 1, the risk note).
    // The ring never changes, so it is one blit of a layer painted in art/logo.js; only the bust is live.
    const cx = x + CARD_W / 2, cy = y + PORT_CY;
    drawPorthole(ctx, cx, cy);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, PORT_R, 0, TAU); ctx.clip();
    drawBust(ctx, c.rigs[slot + 1], c.player.pose, c.anchor, cx - PORT_R, cy - PORT_R, PORT_R * 2, PORT_R * 2, BUST_SCALE, this.bustOpts);
    ctx.restore();
    // name, role, and the three pip bars
    drawTextOutlined(ctx, c.def.name, cx, y + NAME_Y, { size: 2, color: UI.ink, outline: UI.paperDark, thickness: 1, align: 'center', shadow: false });
    drawText(ctx, c.def.role, cx, y + ROLE_Y, { size: 1, color: UI.wood, align: 'center', shadow: false });
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 8, y + RULE_Y, CARD_W - 16, 1);
    // the margin rule and the ruled lines the rows are written on
    ctx.fillStyle = TRUCK.bodyHi; ctx.fillRect(x + MARGIN_X, y + 18, 2, CARD_H - 24);
    for (let k = 0; k < STAT_LABELS.length; k++) {
      const ry = y + STAT_Y + k * STAT_PITCH;
      ctx.fillStyle = UI.paperLine; ctx.fillRect(x + TEXT_X - 1, ry + 9, CARD_W - TEXT_X - 8, 1);
      drawText(ctx, STAT_LABELS[k], x + TEXT_X, ry, { size: 1, color: UI.ink, shadow: false });
      for (let p = 0; p < PIP_N; p++) {
        const px = x + PIP_X + p * PIP_PITCH;
        // filled pips are solid wood, empty ones are hollow paper: a squint counts them without reading them
        ctx.fillStyle = UI.ink; ctx.fillRect(px - 1, ry - 1, PIP_W + 2, PIP_W + 2);
        ctx.fillStyle = p < c.stats[k] ? UI.wood : UI.paper;
        ctx.fillRect(px, ry, PIP_W, PIP_W);
      }
    }
  }

  override draw(ctx: CanvasRenderingContext2D) {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 26, HEAD_TEXT, { size: 2 });
    for (let i = 0; i < this.cards.length; i++) this.card(ctx, i);
    for (const seat of this.seats) if (seat.on) this.cursor(ctx, seat);
    for (const seat of this.seats) {
      if (!seat.on || !seat.ready) continue;
      const x = cardX(seat.card, this.cards.length) + CARD_W / 2;
      drawStamp(ctx, 'READY', x, CARD_Y + STAMP_ROW, Math.min(1, seat.t / STAMP_FRAMES), STAMP_OPTS);
    }
    // the drop-in prompt goes on a paper strip like every other hint in the kit: outlined cream on the dimmed
    // lane was the one line on this screen you had to hunt for, and it is the line that invites a second player
    // A phone seats the one thumb that holds it, so there are no P2 keys to offer: a pad paired to it is the only
    // way a second critter gets a driver, and that is the half of the prompt a touch player is told.
    if (this.joinedCount() < LOCAL_PLAYERS) drawHint(ctx, (this.game.input.joined(1) || this.game.input.touchOn()) ? this.joinHintPads : this.joinHintKeys, JOIN_Y);
    const lead = this.cards[this.seats[0].card];
    drawTicket(ctx, BIO.x, BIO.y, BIO.w, BIO.h, { rules: false, header: false });
    drawText(ctx, lead.def.bio || lead.def.fullName, BIO.x + BIO.w / 2, BIO.y + 11, { size: 1, color: UI.ink, align: 'center', shadow: false });
    drawHint(ctx, this.game.input.device(0) === 'gamepad' ? this.hintPad : this.hint);
  }

  override summary() {
    return {
      seats: this.seats.filter((s) => s.on).map((s) => ({ slot: s.slot, critter: this.cards[s.card].def.id, ready: s.ready })),
      starting: this.starting >= 0, started: this.started,
    };
  }
  /** Every number that could differ between two machines: the cursor and the lock of each seat. */
  override checksumFields() {
    const out = [];
    for (const s of this.seats) out.push(s.on ? 1 : 0, s.card, s.ready ? 1 : 0);
    out.push(this.started ? 1 : 0);
    return out;
  }
}
