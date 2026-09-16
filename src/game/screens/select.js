// CRITTER SELECT (docs/GDD.md section 10): four recipe cards on the dimmed lane, one jam-jar-lid cursor per
// JOINED seat, a beetroot READY stamp when a seat locks in, and the run starts the moment every joined seat
// has stamped.
//
// Seats are read ONLY by slot through engine/input.js, so a couch P2 dropping in mid-screen is the same code
// path as P1. Everything the screen simulates is two numbers per seat (which card, ready or not), which is what
// `checksumFields` reports. The rigs are built ONCE in enter() - one per card per possible seat, so a cursor
// moving to a card changes which pre-built rig is drawn rather than building one in draw().
import { VIEW_W, UI, PLUM, PLAYER_COLORS, MAX_PLAYERS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { pathRR } from '../../art/shading.js';
import { drawBust, idlePoseOf } from '../../art/portraits.js';
import { critterRig } from '../../content/critters/common.js';
import { CRITTERS } from '../../content/critters/index.js';
import { AnimPlayer } from '../animation.js';
import { startRun } from '../run.js';
import { CARD_W, CARD_H, RING_POS, cardX, drawSign, drawStamp, drawHint, drawDim, drawTicket } from '../ui.js';
import { drawLane } from '../../art/logo.js';

const R = Math.round, TAU = Math.PI * 2;
/** Card row: 4 x 140 with 12 px gaps is 596 of the 640, centred by ui.cardX. */
const CARD_Y = 52;
/** The doily porthole the bust sits in, in card space. */
const PORT_CY = 58, PORT_R = 40, BUST_SCALE = 1.9;
/** Text rows in card space. */
const NAME_Y = 104, ROLE_Y = 124, RULE_Y = 136, STAT_Y = 146, STAT_PITCH = 14;
/** Five pips per stat, 5 px each at a 7 px pitch: 33 px of bar, right-aligned in the card. */
const PIP_X = 82, PIP_N = 5, PIP_W = 6, PIP_PITCH = 9;
const STAT_LABELS = ['SPEED', 'KITCHEN', 'FORAGE'];
/**
 * Role flavour as five-pip bars (docs/GDD.md section 2: roles are flavour and small differences, never gates).
 * The hungry one carries, the chef cooks, the driver drives, the forager gathers - and every bar is 2..5 so no
 * card reads as the wrong pick.
 */
const STATS = { barley: [2, 3, 4], sorrel: [3, 5, 2], chicory: [5, 2, 3], cress: [4, 3, 5] };
const STATS_DEFAULT = [3, 3, 3];
/** Slot numbers as strings, so the cursor's disc never builds one per frame. */
const SLOT_TEXT = ['1', '2', '3', '4'];
/** Header band captions, built here so draw() never joins a string. */
const PICKS_TEXT = ['P1 PICKS', 'P2 PICKS', 'P3 PICKS', 'P4 PICKS'];
/** The stamp's arrival, and how long the crew hold their READY before the fade. */
const STAMP_FRAMES = 24, START_HOLD = 30;
const HEAD_TEXT = 'CHOOSE YOUR CRITTER';
/** The bio strip under the cards: a torn-off order pad with whoever P1 is standing on written on it. */
const BIO = { x: 150, y: 284, w: 340, h: 30 };
const JOIN_Y = CARD_Y + CARD_H + 10;

export class SelectScreen extends Screen {
  constructor(game) { super(game, 'select'); this.seats = []; this.cards = []; this.starting = -1; this.started = false; }

  enter(params) {
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
    this.joinHint = `P2: PRESS ${inp.keyText(1, 'action')} TO JOIN`;
    this.hint = `${inp.keyText(0, 'action')}: READY    ${inp.keyText(0, 'cancel')}: BACK`;
    this.bustOpts = { margin: 6, facing: 1 };
  }

  /** Seats that are actually in the room (P1 always; P2 after a drop-in; 2 and 3 are online seats). */
  joinedCount() { let n = 0; for (const s of this.seats) if (s.on) n++; return n; }

  update() {
    super.update();
    const inp = this.game.input;
    for (const seat of this.seats) {
      // a couch drop-in: engine/input.js joins the seat on its first key, and the cursor appears on its own card
      if (!seat.on && inp.joined(seat.slot)) { seat.on = true; seat.card = seat.slot % this.cards.length; }
      if (!seat.on) continue;
      if (seat.ready) seat.t++;
      if (this.started) continue;
      if (!seat.ready) {
        if (inp.pressed(seat.slot, 'right')) seat.card = (seat.card + 1) % this.cards.length;
        if (inp.pressed(seat.slot, 'left')) seat.card = (seat.card + this.cards.length - 1) % this.cards.length;
        if (inp.pressed(seat.slot, 'action')) { seat.ready = true; seat.t = 0; }
      }
      if (inp.pressed(seat.slot, 'cancel')) {
        if (seat.ready) { seat.ready = false; seat.t = 0; }
        else if (seat.slot === 0 && !this.seats.some((x) => x.on && x.ready)) { this.game.reset('title'); return; }
      }
    }
    for (const c of this.cards) c.player.tick();
    // every joined seat has stamped: hold the stamps for a beat, then start the run and fade to the map
    if (this.starting < 0 && !this.started && this.joinedCount() > 0 && this.seats.every((s) => !s.on || s.ready)) this.starting = this.frame + START_HOLD;
    if (!this.started && this.starting >= 0 && this.frame >= this.starting) {
      this.started = true;
      const picks = [];
      for (const s of this.seats) if (s.on) picks.push(s.card);
      startRun(this.game, { seed: this.game.options.seed, critters: picks });
      this.game.fadeTo(() => this.game.replace('map'));
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
    // paper, one ink line, and a header band in the picking seat's colour
    ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x + 3, y + 4, CARD_W, CARD_H, 3); ctx.fill();
    pathRR(ctx, x, y, CARD_W, CARD_H, 3);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = UI.paper; ctx.fill();
    ctx.fillStyle = slot >= 0 ? PLAYER_COLORS[slot] : UI.paperDark;
    ctx.fillRect(x + 1, y + 1, CARD_W - 2, 14);
    ctx.fillStyle = UI.ink; ctx.fillRect(x + 1, y + 15, CARD_W - 2, 1);
    drawText(ctx, slot >= 0 ? PICKS_TEXT[slot] : c.def.species, x + CARD_W / 2, y + 5, { size: 1, color: UI.ink, align: 'center', shadow: false });
    // the plum doily porthole: the pale furs never sit on paper (docs/ART_STYLE.md section 1, the risk note)
    const cx = x + CARD_W / 2, cy = y + PORT_CY;
    ctx.beginPath(); ctx.arc(cx, cy, PORT_R + 3, 0, TAU); ctx.fillStyle = UI.cream; ctx.fill();
    ctx.fillStyle = UI.paperDark;
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (PORT_R + 3), cy + Math.sin(a) * (PORT_R + 3), 3, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, PORT_R + 1, 0, TAU); ctx.fillStyle = UI.ink; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, PORT_R, 0, TAU); ctx.fillStyle = PLUM.shadow; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, PORT_R, 0, TAU); ctx.clip();
    drawBust(ctx, c.rigs[slot + 1], c.player.pose, c.anchor, cx - PORT_R, cy - PORT_R, PORT_R * 2, PORT_R * 2, BUST_SCALE, this.bustOpts);
    ctx.restore();
    // name, role, and the three pip bars
    drawTextOutlined(ctx, c.def.name, cx, y + NAME_Y, { size: 2, color: UI.ink, outline: UI.paperDark, thickness: 1, align: 'center', shadow: false });
    drawText(ctx, c.def.role, cx, y + ROLE_Y, { size: 1, color: UI.wood, align: 'center', shadow: false });
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 8, y + RULE_Y, CARD_W - 16, 1);
    for (let k = 0; k < STAT_LABELS.length; k++) {
      const ry = y + STAT_Y + k * STAT_PITCH;
      drawText(ctx, STAT_LABELS[k], x + 10, ry, { size: 1, color: UI.ink, shadow: false });
      for (let p = 0; p < PIP_N; p++) {
        const px = x + PIP_X + p * PIP_PITCH;
        // filled pips are solid wood, empty ones are hollow paper: a squint counts them without reading them
        ctx.fillStyle = UI.ink; ctx.fillRect(px - 1, ry - 1, PIP_W + 2, PIP_W + 2);
        ctx.fillStyle = p < c.stats[k] ? UI.wood : UI.paper;
        ctx.fillRect(px, ry, PIP_W, PIP_W);
      }
    }
  }

  draw(ctx) {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 26, HEAD_TEXT, { size: 2 });
    for (let i = 0; i < this.cards.length; i++) this.card(ctx, i);
    for (const seat of this.seats) if (seat.on) this.cursor(ctx, seat);
    for (const seat of this.seats) {
      if (!seat.on || !seat.ready) continue;
      const x = cardX(seat.card, this.cards.length) + CARD_W / 2;
      drawStamp(ctx, 'READY', x, CARD_Y + PORT_CY + 46, Math.min(1, seat.t / STAMP_FRAMES), { size: 3, color: '#7E3A56', light: '#9A5470' });
    }
    if (!this.game.input.joined(1)) {
      drawTextOutlined(ctx, this.joinHint, VIEW_W / 2, JOIN_Y, { size: 1, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
    }
    const lead = this.cards[this.seats[0].card];
    drawTicket(ctx, BIO.x, BIO.y, BIO.w, BIO.h, { rules: false, header: false });
    drawText(ctx, lead.def.bio || lead.def.fullName, BIO.x + BIO.w / 2, BIO.y + 11, { size: 1, color: UI.ink, align: 'center', shadow: false });
    drawHint(ctx, this.hint);
  }

  summary() {
    return {
      seats: this.seats.filter((s) => s.on).map((s) => ({ slot: s.slot, critter: this.cards[s.card].def.id, ready: s.ready })),
      starting: this.starting >= 0, started: this.started,
    };
  }
  /** Every number that could differ between two machines: the cursor and the lock of each seat. */
  checksumFields() {
    const out = [];
    for (const s of this.seats) out.push(s.on ? 1 : 0, s.card, s.ready ? 1 : 0);
    out.push(this.started ? 1 : 0);
    return out;
  }
}
