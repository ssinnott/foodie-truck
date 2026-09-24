// THE LINE (docs/GDD.md sections 3 and 10): the truck pulled up at a landmark with a queue of village diners
// waiting at its hatch. EVERYONE in the queue says what they want - each diner's order on a paper bubble over their
// own head, front first, the bubbles stacked up the sky so each one's tail runs down behind the ones below it to
// the diner who said it - and CONFIRM (or 600 frames) takes every order into the kitchen at once. The kitchen
// cooks the whole line's dishes one after another and `results` serves them all together, then sends the truck
// back to the map; the run's `line` and `customer` say who is where.
//
// The picture is the title's dusk lane with the parked truck turned round so its hatch faces the queue, the crew's
// heads in its windows, and one rig per diner still waiting. Nothing here simulates anything but the frame count
// and the one press, so `checksumFields` is two numbers; the rigs, the wave and the bubble are visual.
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
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
import { PLACES } from '../../content/places.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawSign, drawHint } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawLane, TRUCK_Y, CREW_Y } from '../../art/logo.ts';
import { recipeOf, twistSay } from '../run.ts';

/** The truck parks where the title parks it, turned to face LEFT so the hatch (its rear) opens on the queue.
 *  Exported with the queue's geometry below: results serves the whole line on this same lane, everyone where they stood. */
export const TRUCK_X = 150;
const TRUCK_OPTS = { scale: 2, wheel: 0, facing: -1, heads: null as unknown as LineHead[], style: null as unknown as TruckStyle };
/** The queue: the front diner stands this far right of the hatch, the rest QUEUE_PITCH apart behind them. */
export const QUEUE_X0 = 268, QUEUE_PITCH = 62, QUEUE_SCALE = 1.35;
/** The driver in the cab, as on the map. */
export const DRIVER = 'chicory';
/** The diners wave at the hatch once the screen has settled, WAVE_LAG apart front to back, and each one's bubble
 *  opens BUBBLE_AT after their wave; confirm counts from CONFIRM_AT. */
const WAVE_AT = 12, WAVE_LAG = 14, BUBBLE_AT = 18, CONFIRM_AT = 20, AUTO_AT = 600;
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

/** One diner still in the queue, front first. */
export interface Diner {
  /** Built once in enter(): the off-duty apron, no seat. */
  rig: Rig;
  player: AnimPlayer;
  /** Feet centre. */
  x: number;
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
  /** The diners still waiting, front first. */
  declare queue: Diner[];
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
    const ln = run.lines[run.line], place = PLACES.find((p) => p.id === ln.place);
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
    // the queue: everyone from the customer at the hatch to the back of the line, each on their own idle beat
    this.queue.length = 0;
    for (let k = run.customer; k < ln.customers.length; k++) {
      const c = ln.customers[k], def = getCustomer(c.customer), player = new AnimPlayer(def.anims), i = this.queue.length;
      player.play('idle');
      for (let t = 0; t < i * 11; t++) player.tick();
      const x = QUEUE_X0 + i * QUEUE_PITCH, text = recipeOf(c.recipe).line + (twistSay(c) ? ' ' + twistSay(c) : '');
      const bw = Math.max(measureText(def.name, 1), measureText(text, 1)) + BUBBLE_PAD * 2;
      this.queue.push({
        rig: critterRig(def, -1), player, x, waved: false, waveAt: WAVE_AT + i * WAVE_LAG, bubbleAt: WAVE_AT + i * WAVE_LAG + BUBBLE_AT,
        title: def.name, text, bw, by: Math.max(BUBBLE_TOP, BUBBLE_Y - i * BUBBLE_STEP),
        // each bubble steps right with its diner, so the stack cascades down to the front of the line
        bx: Math.min(VIEW_W - 8 - bw, Math.max(BUBBLE_MIN_X + i * QUEUE_PITCH, Math.round(x - bw / 2))),
      });
    }
    this.taken = 0;
    this.signText = `LINE ${run.line + 1} OF ${run.lines.length}  -  ${place ? place.name : ln.place.toUpperCase()}`;
    this.signW = measureText(this.signText, 1) + 24;
    this.hint = `${game.input.keyText(0, 'action')}: ${this.queue.length > 1 ? 'TAKE EVERYONE\'S ORDER' : 'TAKE THE ORDER'}`;
    this.fields.length = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, f = this.frame;
    for (const s of this.seats) { s.player.tick(); if (s.player.done) s.player.play('idle', { restart: true }); }
    for (let i = 0; i < this.queue.length; i++) {
      const d = this.queue[i];
      if (!d.waved && f >= d.waveAt) { d.waved = true; d.player.play('wave', { restart: true }); game.audio.play('hello'); }
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
    // the queue, back to front so the diner at the hatch is drawn last and in front
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const d = this.queue[i];
      drawShadow(ctx, d.x, CREW_Y, 34, 0.4);
      drawRig(ctx, d.rig, d.player.pose, { x: d.x, y: CREW_Y, facing: -1, scale: QUEUE_SCALE });
    }
    // the bubbles, back of the line first: the highest is drawn first, so each lower bubble covers the tails that
    // run down behind it and every tail comes out underneath pointing at the one who said it
    for (let i = this.queue.length - 1; i >= 0; i--) if (f >= this.queue[i].bubbleAt) this.bubble(ctx, this.queue[i]);
    drawSign(ctx, VIEW_W / 2, SIGN_Y, this.signW, 22, this.signText, { size: 1 });
    if (this.queue.length && f >= this.queue[0].bubbleAt && f % BLINK_PERIOD < BLINK_ON) drawHint(ctx, this.hint);
  }

  /** An order, said out loud: a paper bubble over its diner with their name on the band, the tail tapering down to
   *  just over their head. The tail is drawn first so the paper sits on its root. */
  bubble(ctx: CanvasRenderingContext2D, d: Diner): void {
    const x = d.bx, y = d.by, w = d.bw, tx = d.x, base = y + BUBBLE_H - 2, tip = TAIL_Y - TIP_H;
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
    return { line: run.line, place: run.lines[run.line].place, waiting: this.queue.length, customer: run.order.customer, dish: run.order.dish, taken: this.taken,
      bubble: this.queue.length && this.frame >= this.queue[0].bubbleAt ? this.queue[0].text : '',
      bubbles: this.queue.filter((d) => this.frame >= d.bubbleAt).map((d) => d.text) };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] { const f = this.fields; f.length = 0; f.push(this.frame, this.taken); return f; }
}
