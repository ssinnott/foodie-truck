// THE LINE (docs/GDD.md sections 3 and 10): the truck pulled up at a landmark with a queue of village diners
// waiting at its hatch. The front one steps up and says what they want - their order on a paper bubble over their
// head - and CONFIRM (or 600 frames) takes the order into the kitchen. `results` hands back here after every dish
// while the line still has anyone in it (the served customer is gone and the next one is at the front), and to the
// map once it is empty; the run's `line` and `customer` say who is where.
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
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { PLACES } from '../../content/places.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawSign, drawHint } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawLane, TRUCK_Y, CREW_Y } from '../../art/logo.ts';
import { recipeOf } from '../run.ts';

/** The truck parks where the title parks it, turned to face LEFT so the hatch (its rear) opens on the queue. */
const TRUCK_X = 150, TRUCK_OPTS = { scale: 2, wheel: 0, facing: -1, heads: null as unknown as LineHead[] };
/** The queue: the front diner stands this far right of the hatch, the rest QUEUE_PITCH apart behind them. */
const QUEUE_X0 = 268, QUEUE_PITCH = 62, QUEUE_SCALE = 1.35;
/** The driver in the cab, as on the map. */
const DRIVER = 'chicory';
/** The front diner waves at the hatch once the screen has settled, then the bubble opens; confirm counts from CONFIRM_AT. */
const WAVE_AT = 12, BUBBLE_AT = 30, CONFIRM_AT = 20, AUTO_AT = 600;
/** The bubble: a paper ticket over the front diner's head with their name on the band and their words under it,
 *  never further left than BUBBLE_MIN_X, which is where the truck's roof board ends. */
const BUBBLE_Y = 150, BUBBLE_H = 30, BUBBLE_PAD = 12, BUBBLE_TAIL = 6, BUBBLE_MIN_X = 236;
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
  /** The diners still waiting, front first. */
  declare queue: Diner[];
  /** 1 once confirm has taken the order and the fade is running. */
  declare taken: number;
  /** The sign over the scene: which line this is and where. */
  declare signText: string;
  declare signW: number;
  /** The bubble's band: the front diner's name. */
  declare bubbleTitle: string;
  /** Their words. */
  declare bubbleText: string;
  declare bubbleW: number;
  declare bubbleX: number;
  /** The hint line. */
  declare hint: string;

  constructor(game: Game) { super(game, 'line'); this.fields = []; this.seats = []; this.heads = []; this.queue = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    const ln = run.lines[run.line], place = PLACES.find((p) => p.id === ln.place);
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
      const def = getCustomer(ln.customers[k].customer), player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let t = 0; t < this.queue.length * 11; t++) player.tick();
      this.queue.push({ rig: critterRig(def, -1), player, x: QUEUE_X0 + this.queue.length * QUEUE_PITCH, waved: false });
    }
    this.taken = 0;
    this.signText = `LINE ${run.line + 1} OF ${run.lines.length}  -  ${place ? place.name : ln.place.toUpperCase()}`;
    this.signW = measureText(this.signText, 1) + 24;
    const front = ln.customers[run.customer];
    const def = getCustomer(front ? front.customer : run.order.customer);
    this.bubbleTitle = def.name;
    this.bubbleText = front ? recipeOf(front.recipe).line : run.order.line;
    this.bubbleW = Math.max(measureText(this.bubbleTitle, 1), measureText(this.bubbleText, 1)) + BUBBLE_PAD * 2;
    this.bubbleX = Math.min(VIEW_W - 8 - this.bubbleW, Math.max(BUBBLE_MIN_X, Math.round(QUEUE_X0 - this.bubbleW / 2)));
    this.hint = `${game.input.keyText(0, 'action')}: TAKE THE ORDER`;
    this.fields.length = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, f = this.frame;
    for (const s of this.seats) { s.player.tick(); if (s.player.done) s.player.play('idle', { restart: true }); }
    for (let i = 0; i < this.queue.length; i++) {
      const d = this.queue[i];
      if (i === 0 && !d.waved && f >= WAVE_AT) { d.waved = true; d.player.play('wave', { restart: true }); game.audio.play('hello'); }
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
    TRUCK_OPTS.heads = this.heads;
    drawTruck(ctx, TRUCK_X, TRUCK_Y, TRUCK_OPTS);
    // the queue, back to front so the diner at the hatch is drawn last and in front
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const d = this.queue[i];
      drawShadow(ctx, d.x, CREW_Y, 34, 0.4);
      drawRig(ctx, d.rig, d.player.pose, { x: d.x, y: CREW_Y, facing: -1, scale: QUEUE_SCALE });
    }
    if (f >= BUBBLE_AT && this.queue.length) this.bubble(ctx);
    drawSign(ctx, VIEW_W / 2, SIGN_Y, this.signW, 22, this.signText, { size: 1 });
    if (f >= BUBBLE_AT && f % BLINK_PERIOD < BLINK_ON) drawHint(ctx, this.hint);
  }

  /** The order, said out loud: a paper bubble over the front diner with their name on its band. */
  bubble(ctx: CanvasRenderingContext2D): void {
    const x = this.bubbleX, y = BUBBLE_Y, w = this.bubbleW;
    drawTicket(ctx, x, y, w, BUBBLE_H, { title: this.bubbleTitle, rules: false, perforated: false });
    drawText(ctx, this.bubbleText, x + w / 2, y + 19, { size: 1, color: UI.ink, align: 'center', shadow: false });
    // the tail, pointing down at the diner
    const tx = this.queue[0].x;
    ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.moveTo(tx - BUBBLE_TAIL - 1, y + BUBBLE_H - 1); ctx.lineTo(tx + BUBBLE_TAIL + 1, y + BUBBLE_H - 1); ctx.lineTo(tx, y + BUBBLE_H + BUBBLE_TAIL + 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = UI.paper; ctx.beginPath(); ctx.moveTo(tx - BUBBLE_TAIL + 1, y + BUBBLE_H - 2); ctx.lineTo(tx + BUBBLE_TAIL - 1, y + BUBBLE_H - 2); ctx.lineTo(tx, y + BUBBLE_H + BUBBLE_TAIL - 2); ctx.closePath(); ctx.fill();
  }

  override summary() {
    const run = this.game.run;
    return { line: run.line, place: run.lines[run.line].place, waiting: this.queue.length, customer: run.order.customer, dish: run.order.dish, taken: this.taken, bubble: this.frame >= BUBBLE_AT ? this.bubbleText : '' };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] { const f = this.fields; f.length = 0; f.push(this.frame, this.taken); return f; }
}
