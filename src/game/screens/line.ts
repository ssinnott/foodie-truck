// THE LINE (docs/GDD.md sections 3 and 10): the truck pulled up at a town stop with ONE GIANT LINE of village diners
// waiting at its hatch - a crowd of different animals, the whole day's customers, snaking back along the lane. The
// line is far too long for the kitchen to cook at once, so it is served in ROUNDS (run.batch()): the diners at the
// front say what they want - each one's order on a paper bubble over their own head, front first, the bubbles
// stacked up the sky so each one's tail runs down behind the ones below it to the diner who said it - and CONFIRM
// (or 600 frames) takes the round's orders into the kitchen at once. `results` serves them, and the line comes back
// here with the next round stepping up to the hatch, until the last diner has been fed; the run's `line` and
// `customer` say who is where.
//
// The picture is the title's dusk lane with the parked truck turned round so its hatch faces the queue, the crew's
// heads in its windows, and one rig per diner still waiting: the front row at full size along the lane and the rest
// of the line winding back behind it in smaller rows (queueSpot). Nothing here simulates anything but the frame
// count and the one press, so `checksumFields` is two numbers; the rigs, the wave, the step up and the bubbles are
// visual.
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Run, ScreenParams } from '../game.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { drawRig } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Pose } from '../../lib/art/poses.ts';
import { drawShadow } from '../../art/fx.ts';
import { drawTruck } from '../../art/truck.ts';
import type { TruckStyle } from '../../art/truck.ts';
import { truckStyleFor } from '../garage.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { placeName } from '../../content/places.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawSign, drawHint } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawLane, TRUCK_Y, CREW_Y } from '../../art/logo.ts';
import { recipeOf, twistSay, batchSize } from '../run.ts';

/** The truck parks where the title parks it, turned to face LEFT so the hatch (its rear) opens on the queue.
 *  Exported with the queue's geometry below: results serves the whole line on this same lane, everyone where they stood. */
export const TRUCK_X = 150;
const TRUCK_OPTS = { scale: 2, wheel: 0, facing: -1, heads: null as unknown as LineHead[], style: null as unknown as TruckStyle };
/** The queue: the front diner stands this far right of the hatch, the rest QUEUE_PITCH apart behind them. */
export const QUEUE_X0 = 268, QUEUE_PITCH = 62, QUEUE_SCALE = 1.35;
/**
 * THE GIANT LINE'S SHAPE. Six diners to a row; the first row runs along the lane at full size (QUEUE_X0, QUEUE_PITCH,
 * QUEUE_SCALE above), and the line then turns back on itself in a second row up on the verge and
 * smaller, running back toward the truck, and a third row smaller still running out again: an S winding into the
 * distance, which is what a queue that long looks like. Room for ROW_SLOTS * 3 diners (run.ts LINE_MAX).
 */
export const ROW_SLOTS = 6;
const ROWS = Object.freeze([
  { x0: QUEUE_X0, dx: QUEUE_PITCH, y: CREW_Y, s: QUEUE_SCALE },
  { x0: 547, dx: -56, y: 250, s: 0.88 },
  { x0: 420, dx: 36, y: 234, s: 0.7 },
]);
/** Where one place in the line stands: feet centre and rig scale. */
export interface QueueSpot { x: number; y: number; s: number }
/** The i-th place in the line (0 = the hatch), written into `out` (a fresh spot when omitted). */
export function queueSpot(i: number, out: QueueSpot = { x: 0, y: 0, s: 0 }): QueueSpot {
  const row = ROWS[Math.min(ROWS.length - 1, Math.floor(i / ROW_SLOTS))], j = i - Math.floor(i / ROW_SLOTS) * ROW_SLOTS;
  out.x = row.x0 + j * row.dx; out.y = row.y; out.s = row.s;
  return out;
}
/** A diner of the line the lane is showing, drawn by drawWaiters: a rig on its own idle beat at a spot of the line. */
export interface Waiter {
  rig: Rig;
  player: AnimPlayer;
  /** Feet centre and rig scale right now. */
  x: number;
  y: number;
  s: number;
}
/**
 * The diners of the line behind the ones at the hatch, for a screen that shows the lane (results): everyone from
 * place `from` of the line (counted from the front of what is left) back, each built once and idling on its own beat.
 */
export function buildWaiters(run: Run, from: number): Waiter[] {
  const out: Waiter[] = [], ln = run.lines[run.line];
  if (!ln) return out;
  for (let k = run.customer + from, i = from; k < ln.customers.length; k++, i++) {
    const def = getCustomer(ln.customers[k].customer), player = new AnimPlayer(def.anims), sp = queueSpot(i);
    player.play('idle');
    for (let t = 0; t < i * 11; t++) player.tick();
    out.push({ rig: critterRig(def, -1), player, x: sp.x, y: sp.y, s: sp.s });
  }
  return out;
}
/** Draw the diners of a line back to front: the smaller rows further up the lane first, the front row over them. */
export function drawWaiters(ctx: CanvasRenderingContext2D, list: readonly Waiter[]): void {
  // three passes by how far up the lane a diner stands now (a diner stepping up between rows is in whichever pass
  // its y has reached); within a pass the back of the line is drawn first
  for (let pass = 0; pass < 3; pass++) {
    const lo = pass === 0 ? -1e9 : pass === 1 ? (ROWS[2].y + ROWS[1].y) / 2 : (ROWS[1].y + ROWS[0].y) / 2;
    const hi = pass === 0 ? (ROWS[2].y + ROWS[1].y) / 2 : pass === 1 ? (ROWS[1].y + ROWS[0].y) / 2 : 1e9;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.y < lo || d.y >= hi) continue;
      drawShadow(ctx, d.x, d.y, 34 * d.s / QUEUE_SCALE, 0.4);
      drawRig(ctx, d.rig, d.player.pose, { x: d.x, y: d.y, facing: -1, scale: d.s });
    }
  }
}

/** The driver in the cab, as on the map. */
export const DRIVER = 'chicory';
/** The diners wave at the hatch once the screen has settled, WAVE_LAG apart front to back, and each one's bubble
 *  opens BUBBLE_AT after their wave; confirm counts from CONFIRM_AT. */
const WAVE_AT = 12, WAVE_LAG = 14, BUBBLE_AT = 18, CONFIRM_AT = 20, AUTO_AT = 600;
/** When the next round comes back to the lane, the line steps up this many frames (the front of it, the hatch's round, last). */
const STEP_FRAMES = 24;
/** The bubbles: a paper ticket per diner with their name on the band and their words under it, the front diner's
 *  lowest and each one behind it BUBBLE_STEP higher, never further left than BUBBLE_MIN_X (where the truck's roof
 *  board ends). Every tail is a STEM-wide strip ending in a TIP_H point at TAIL_Y, just over its diner's head. */
const BUBBLE_Y = 148, BUBBLE_STEP = 38, BUBBLE_TOP = 30, BUBBLE_H = 30, BUBBLE_PAD = 12, BUBBLE_TAIL = 6, BUBBLE_MIN_X = 236, TAIL_Y = 196, TIP_H = 12, STEM = 3;
const SIGN_Y = 2;
const BLINK_PERIOD = 60, BLINK_ON = 40;

/** A head riding in the truck's window: the crew, drawn by art/truck.ts drawTruck. */
export interface LineHead {
  rig: Rig;
  /** The seat player's live pose object: the player rewrites it in place, so this reference stays current. */
  pose: Pose;
}

/** One crew member: the rig in its seat's apron and the player idling it, whose pose the head in the window shares. */
export interface LineSeat {
  rig: Rig;
  player: AnimPlayer;
}

/** One diner still in the line, front first: a Waiter (rig, idle beat and where they stand) plus what they say. */
export interface Diner extends Waiter {
  /** Where they stand when the line has settled, and where they stood before it stepped up (the last round just left). */
  tx: number;
  ty: number;
  ts: number;
  fx: number;
  fy: number;
  fs: number;
  /** True for the diners at the hatch this round: only they wave and order; the rest of the line waits behind. */
  speaks: boolean;
  /** True once this diner's one wave has been thrown. */
  waved: boolean;
  /** The frame they wave, and the frame their bubble opens. */
  waveAt: number;
  bubbleAt: number;
  /** Their bubble: their name on the band, their order under it, where it hangs. */
  title: string;
  text: string;
  bx: number;
  by: number;
  bw: number;
}

export class LineScreen extends Screen {
  // The fields, for the checker only, in constructor then enter() order. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name (es2022 defines them before
  // the constructor body runs, and a screen's own declaration would also define a base field back to undefined),
  // and this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The crew, in party order. */
  declare seats: LineSeat[];
  /** The heads in the truck's windows: the driver first, then the rest. */
  declare heads: LineHead[];
  /** The livery the truck is drawn in, read once in enter() (game/garage.ts: never from update()). */
  declare truckStyle: TruckStyle;
  /** The diners still waiting, front first: the whole line, the first `round` of them at the hatch. */
  declare queue: Diner[];
  /** How many of the queue are at the hatch this round (run.batch()). */
  declare round: number;
  /** 1 once confirm has taken the order and the fade is running. */
  declare taken: number;
  /** The sign over the scene: which line this is and where. */
  declare signText: string;
  declare signW: number;
  /** The hint line. */
  declare hint: string;

  constructor(game: Game) { super(game, 'line'); this.fields = []; this.seats = []; this.heads = []; this.queue = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    const ln = run.lines[run.line];
    this.truckStyle = truckStyleFor(game);
    // the crew: one rig per seat, idling; the driver's head in the cab, the rest at the hatch (as on the map)
    this.seats.length = 0; this.heads.length = 0;
    for (const p of run.party) {
      const def = getCritter(p.critter), player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let k = 0; k < this.seats.length * 9; k++) player.tick();
      this.seats.push({ rig: critterRig(def, p.slot), player });
    }
    const di = Math.max(0, run.party.findIndex((p) => p.critter === DRIVER));
    this.heads.push({ rig: this.seats[di].rig, pose: this.seats[di].player.pose });
    for (let i = 0; i < this.seats.length; i++) if (i !== di) this.heads.push({ rig: this.seats[i].rig, pose: this.seats[i].player.pose });
    // the queue: everyone from the customer at the hatch to the back of the line, each on their own idle beat; the
    // first run.batch() of them are this round's diners at the hatch, who wave and order
    this.queue.length = 0;
    this.round = run.batch();
    // a line that has had a round served steps up: everyone starts where they stood a round ago
    const shift = run.customer > 0 ? batchSize(ln.customers.length) : 0;
    for (let k = run.customer; k < ln.customers.length; k++) {
      const c = ln.customers[k], def = getCustomer(c.customer), player = new AnimPlayer(def.anims), i = this.queue.length;
      player.play('idle');
      for (let t = 0; t < i * 11; t++) player.tick();
      const to = queueSpot(i), from = shift ? queueSpot(i + shift) : to;
      const speaks = i < this.round, text = recipeOf(c.recipe).line + (twistSay(c) ? ' ' + twistSay(c) : '');
      const bw = Math.max(measureText(def.name, 1), measureText(text, 1)) + BUBBLE_PAD * 2;
      this.queue.push({
        rig: critterRig(def, -1), player, x: from.x, y: from.y, s: from.s, tx: to.x, ty: to.y, ts: to.s, fx: from.x, fy: from.y, fs: from.s,
        speaks, waved: false, waveAt: WAVE_AT + i * WAVE_LAG, bubbleAt: WAVE_AT + i * WAVE_LAG + BUBBLE_AT,
        title: def.name, text, bw, by: Math.max(BUBBLE_TOP, BUBBLE_Y - i * BUBBLE_STEP),
        // each bubble steps right with its diner, so the stack cascades down to the front of the line
        bx: Math.min(VIEW_W - 8 - bw, Math.max(BUBBLE_MIN_X + i * QUEUE_PITCH, Math.round(to.x - bw / 2))),
      });
    }
    this.taken = 0;
    this.signText = run.lines.length > 1 ? `LINE ${run.line + 1} OF ${run.lines.length}  -  ${placeName(ln.place)}` : `${this.queue.length} IN THE LINE  -  ${placeName(ln.place)}`;
    this.signW = measureText(this.signText, 1) + 24;
    this.hint = `${game.input.keyText(0, 'action')}: ${this.round > 1 ? 'TAKE EVERYONE\'S ORDER' : 'TAKE THE ORDER'}`;
    this.fields.length = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, f = this.frame;
    for (const s of this.seats) { s.player.tick(); if (s.player.done) s.player.play('idle', { restart: true }); }
    for (let i = 0; i < this.queue.length; i++) {
      const d = this.queue[i];
      // the line stepping up to the hatch after a round: an eased slide from the place a round back
      if (f <= STEP_FRAMES && (d.fx !== d.tx || d.fy !== d.ty)) {
        const t = f / STEP_FRAMES, k = t * t * (3 - 2 * t);
        d.x = Math.round(d.fx + (d.tx - d.fx) * k); d.y = Math.round(d.fy + (d.ty - d.fy) * k); d.s = d.fs + (d.ts - d.fs) * k;
      }
      if (d.speaks && !d.waved && f >= d.waveAt) { d.waved = true; d.player.play('wave', { restart: true }); game.audio.play('hello'); }
      d.player.tick();
      if (d.player.done) d.player.play('idle', { restart: true });
    }
    if (this.taken) return;
    if ((f >= CONFIRM_AT && confirmPressed(game.input) >= 0) || f >= AUTO_AT) {
      this.taken = 1;
      game.audio.play('menu_confirm');
      game.fadeTo(() => game.replace('kitchen'));
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame;
    drawLane(ctx);
    drawShadow(ctx, TRUCK_X, TRUCK_Y, 112, 0.28);
    TRUCK_OPTS.heads = this.heads; TRUCK_OPTS.style = this.truckStyle;
    drawTruck(ctx, TRUCK_X, TRUCK_Y, TRUCK_OPTS);
    // the line, back to front: the rows winding away up the lane first, the diner at the hatch drawn last and in front
    drawWaiters(ctx, this.queue);
    // the bubbles, back of the round first: the highest is drawn first, so each lower bubble covers the tails that
    // run down behind it and every tail comes out underneath pointing at the one who said it
    for (let i = this.round - 1; i >= 0; i--) if (f >= this.queue[i].bubbleAt) this.bubble(ctx, this.queue[i]);
    drawSign(ctx, VIEW_W / 2, SIGN_Y, this.signW, 22, this.signText, { size: 1 });
    if (this.queue.length && f >= this.queue[0].bubbleAt && f % BLINK_PERIOD < BLINK_ON) drawHint(ctx, this.hint);
  }

  /** An order, said out loud: a paper bubble over its diner with their name on the band, the tail tapering down to
   *  just over their head. The tail is drawn first so the paper sits on its root. */
  bubble(ctx: CanvasRenderingContext2D, d: Diner): void {
    const x = d.bx, y = d.by, w = d.bw, tx = d.tx, base = y + BUBBLE_H - 2, tip = TAIL_Y - TIP_H;
    // a stem down from the paper (hidden behind any lower bubble), then the point over the diner's head
    ctx.fillStyle = UI.ink; ctx.fillRect(tx - STEM - 1, base, STEM * 2 + 2, tip - base + 1);
    ctx.beginPath(); ctx.moveTo(tx - BUBBLE_TAIL - 1, tip); ctx.lineTo(tx + BUBBLE_TAIL + 1, tip); ctx.lineTo(tx, TAIL_Y + 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = UI.paper; ctx.fillRect(tx - STEM + 1, base, STEM * 2 - 2, tip - base + 2);
    ctx.beginPath(); ctx.moveTo(tx - BUBBLE_TAIL + 1, tip + 1); ctx.lineTo(tx + BUBBLE_TAIL - 1, tip + 1); ctx.lineTo(tx, TAIL_Y - 2); ctx.closePath(); ctx.fill();
    drawTicket(ctx, x, y, w, BUBBLE_H, { title: d.title, rules: false, perforated: false });
    drawText(ctx, d.text, x + w / 2, y + 19, { size: 1, color: UI.ink, align: 'center', shadow: false });
  }

  override summary() {
    const run = this.game.run;
    return { line: run.line, place: run.lines[run.line].place, waiting: this.queue.length, round: this.round, customer: run.order.customer, dish: run.order.dish, taken: this.taken,
      bubble: this.queue.length && this.frame >= this.queue[0].bubbleAt ? this.queue[0].text : '',
      bubbles: this.queue.filter((d) => d.speaks && this.frame >= d.bubbleAt).map((d) => d.text),
      // who stands where: the whole line's species and places, front first
      diners: this.queue.map((d, i) => run.lines[run.line].customers[run.customer + i].customer), spots: this.queue.map((d) => d.tx + ',' + d.ty) };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] { const f = this.fields; f.length = 0; f.push(this.frame, this.taken); return f; }
}
