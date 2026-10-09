// THE LINE (docs/GDD.md sections 3 and 10): the truck pulled up at a town stop with ONE GIANT LINE of village diners
// waiting at its hatch - a crowd of different animals, the whole day's customers, snaking back along the lane - and
// the whole line orders at once: ONE GIANT ORDER. The diners wave in turn, front to back, and each one joins in with
// everyone else who wants the same dish: one paper bubble per dish on the order (run.ts dishGroups), its words the
// dish's own line, its band the count so far (`3 X MUSHROOM SOUP`), a tail running down from it to every diner who
// asked for it, and under the words whoever wants theirs a little different (`BRUIN: A BIG ONE!`). The bubbles stack
// up the sky, the dish asked for nearest the front lowest, so each one's tails run down behind the ones below it -
// and every tail ends in a paper bead over its diner's head with the dish's own picture in it, so whichever bubble a
// tail came out from under, the diner under it is plainly asking for that. CONFIRM (or 600 frames) takes the whole
// order into the kitchen at once; `results` serves the whole line, and the day is done.
//
// The picture is the title's dusk lane with the parked truck turned round so its hatch faces the queue, the crew's
// heads in its windows, and one rig per diner: the front row at full size along the lane and the rest of the line
// winding back behind it in smaller rows (queueSpot). Nothing here simulates anything but the frame count and the
// one press, so `checksumFields` is two numbers; the rigs, the wave and the bubbles are visual.
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import type { Pose } from '../../lib/art/poses.ts';
import { drawShadow } from '../../art/fx.ts';
import { drawDish } from '../../art/dishes.ts';
import { drawHeldPlate } from '../../art/kitchenProps.ts';
import { drawTruck } from '../../art/truck.ts';
import type { TruckStyle } from '../../art/truck.ts';
import { truckStyleFor } from '../garage.ts';
import { ridersFor, pushRiderHeads } from '../friends.ts';
import type { Rider } from '../friends.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { placeName } from '../../content/places.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawSign, drawHint, ROW } from '../ui.ts';
import type { TicketOpts } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawLane, TRUCK_Y, CREW_Y } from '../../art/logo.ts';
import { recipeOf, twistSay, dishGroups } from '../run.ts';

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
/**
 * A plate a diner holds out in front of them (results: the dish the kitchen handed them through the hatch, `bites`
 * of it eaten): it moves with their near paw while `follow` is set, and stays where it was held while the paw goes
 * to their mouth for a bite. `x` and `y` are where it was last drawn.
 */
export interface HeldPlate { dish: string; bites: number; x: number; y: number; follow: boolean }
/** A diner of the line the lane is showing, drawn by drawWaiters: a rig on its own idle beat at a spot of the line. */
export interface Waiter {
  rig: Rig;
  player: AnimPlayer;
  /** Feet centre and rig scale right now. */
  x: number;
  y: number;
  s: number;
  /** The plate in their paws, if they are holding one. */
  plate?: HeldPlate | null;
}
/** Scratch for a diner's near paw, refilled by drawWaiters for each plate it draws; and a held plate's size against
 *  the diner holding it (the kitchen's plate at 1x is a little big in the paws of a whole critter out on the lane). */
const PAW: Point = { x: 0, y: 0 }, HELD_SCALE = 0.85;
/** Draw the diners of a line back to front: the smaller rows further up the lane first, the front row over them -
 *  each with the plate in their paws, if they hold one, drawn with them so the rows in front stand in front of it. */
export function drawWaiters(ctx: CanvasRenderingContext2D, list: readonly Waiter[]): void {
  // three passes by which row of the line a diner stands in, the furthest up the lane first; within a pass the back
  // of the line is drawn first
  for (let pass = 0; pass < 3; pass++) {
    const lo = pass === 0 ? -1e9 : pass === 1 ? (ROWS[2].y + ROWS[1].y) / 2 : (ROWS[1].y + ROWS[0].y) / 2;
    const hi = pass === 0 ? (ROWS[2].y + ROWS[1].y) / 2 : pass === 1 ? (ROWS[1].y + ROWS[0].y) / 2 : 1e9;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.y < lo || d.y >= hi) continue;
      drawShadow(ctx, d.x, d.y, 34 * d.s / QUEUE_SCALE, 0.4);
      drawRig(ctx, d.rig, d.player.pose, { x: d.x, y: d.y, facing: -1, scale: d.s });
      const p = d.plate;
      if (p) {
        if (p.follow) { jointScreen(d.rig, 'handN', PAW); p.x = PAW.x; p.y = PAW.y; }
        drawHeldPlate(ctx, p.x, p.y, p.dish, p.bites, d.s * HELD_SCALE);
      }
    }
  }
}

/** The driver in the cab, as on the map. */
export const DRIVER = 'chicory';
/** The diners wave once the screen has settled, WAVE_LAG apart front to back, and each one joins their dish's
 *  bubble JOIN_AT after their wave; confirm counts from CONFIRM_AT. */
const WAVE_AT = 12, WAVE_LAG = 10, JOIN_AT = 18, CONFIRM_AT = 20, AUTO_AT = 600;
/** The bubbles: a paper ticket per dish with the count on the band and the dish's line under it, then a row per
 *  pair of twists. The one asked for nearest the front hangs lowest, its foot at BUBBLE_FOOT, and each after it
 *  BUBBLE_GAP higher (less, down to 2, when a stack of twists would push the top one above BUBBLE_TOP); none starts
 *  further left than BUBBLE_MIN_X (where the truck's roof board ends). */
const BUBBLE_FOOT = 166, BUBBLE_GAP = 8, BUBBLE_TOP = 26, BUBBLE_H = 30, BUBBLE_PAD = 12, BUBBLE_MIN_X = 236, STEM = 3;
/** Every tail is a STEM-wide strip from the paper's foot down to a paper bead with the diner's dish in it (BEAD_R
 *  across, the dish drawn at BEAD_S, both by the row of the line they stand in), and a POINT_H point under the bead
 *  ending just over their head: at TAIL_Y over the front row, TAIL_RISE over the feet scaled down with the diner for
 *  the rows further up the lane. */
const TAIL_Y = 196, TAIL_RISE = CREW_Y - TAIL_Y, POINT_H = 3, BEAD_R = [9, 7, 6], BEAD_S = [5, 4, 3];
const TAU = Math.PI * 2;
/** A bubble reaches TAIL_PAD past the outermost diner it points at, so every tail leaves from under the paper; two
 *  twists share a row while they fit in NOTE_ROW_W. */
const TAIL_PAD = 14, NOTE_ROW_W = 300, NOTE_SEP = '   ';
const SIGN_Y = 2;
const BLINK_PERIOD = 60, BLINK_ON = 40;
/** The bubble's paper and its two kinds of words, reused for every bubble every frame (the band's title is set per draw). */
const BUBBLE_OPTS: TicketOpts = { title: '', rules: false, perforated: false };
const LINE_TEXT = { size: 1, color: UI.ink, align: 'center' as const, shadow: false }, NOTE_TEXT = { size: 1, color: UI.wood, align: 'center' as const, shadow: false };

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

/** One diner in the line, front first: a Waiter (rig, idle beat and where they stand) plus when they speak up. */
export interface Diner extends Waiter {
  /** Which dish of the order they asked for: an index into the screen's `chorus`, and its ORDERS id (the bead's picture). */
  dish: number;
  recipe: string;
  /** Where the tail to them ends (just over their head), and the bead on it: centre, radius and the dish's size in it,
   *  all by the row of the line they stand in. */
  tipY: number;
  beadY: number;
  beadR: number;
  beadS: number;
  /** True once this diner's one wave has been thrown. */
  waved: boolean;
  /** The frame they wave, and the frame they join in: their tail drops from their dish's bubble and its count goes up. */
  waveAt: number;
  joinAt: number;
}

/** One dish of the giant order, said by everyone who wants it: a paper bubble with a tail to each of them. */
export interface Chorus {
  /** The band, by how many have joined in: `titles[k - 1]` once k of them have ('3 X MUSHROOM SOUP'). */
  titles: string[];
  /** The dish's own line, and the twist rows under it ('BRUIN: A BIG ONE!'). */
  text: string;
  notes: string[];
  /** Indices into the queue of the diners who asked for it, front first. */
  members: number[];
  /** Where the paper hangs, and how big it is. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
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
  /** The heads in the truck's windows: the driver first, then the rest, then the friends riding along. */
  declare heads: LineHead[];
  /** The friends riding along (game/friends.ts): heads at the hatch after the crew's, idling with them. */
  declare riders: Rider[];
  /** The livery the truck is drawn in, read once in enter() (game/garage.ts: never from update()). */
  declare truckStyle: TruckStyle;
  /** The diners still waiting, front first: the whole line, every one of them ordering. */
  declare queue: Diner[];
  /** The giant order by dish, the dish asked for nearest the front first: one bubble each. */
  declare chorus: Chorus[];
  /** 1 once confirm has taken the order and the fade is running. */
  declare taken: number;
  /** The sign over the scene: how long the line is and where. */
  declare signText: string;
  declare signW: number;
  /** The hint line. */
  declare hint: string;

  constructor(game: Game) { super(game, 'line'); this.fields = []; this.seats = []; this.heads = []; this.riders = []; this.queue = []; this.chorus = []; }

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
    // and the friends riding along, at the hatch after the crew (game/friends.ts)
    this.riders = ridersFor(run.party, this.seats.length);
    pushRiderHeads(this.heads, this.riders);
    // the queue: everyone from the customer at the hatch to the back of the line, each on their own idle beat and
    // waving in turn - the whole line is ordering
    this.queue.length = 0;
    const waiting = ln.customers.slice(run.customer);
    const groups = dishGroups(waiting.map((c) => c.recipe));
    for (let i = 0; i < waiting.length; i++) {
      const def = getCustomer(waiting[i].customer), player = new AnimPlayer(def.anims), sp = queueSpot(i);
      player.play('idle');
      for (let t = 0; t < i * 11; t++) player.tick();
      let dish = 0;
      for (let g = 0; g < groups.length; g++) if (groups[g].members.indexOf(i) >= 0) { dish = g; break; }
      const row = Math.min(BEAD_R.length - 1, Math.floor(i / ROW_SLOTS)), tipY = Math.round(sp.y - TAIL_RISE * sp.s / QUEUE_SCALE);
      this.queue.push({
        rig: critterRig(def, -1), player, x: sp.x, y: sp.y, s: sp.s, dish, recipe: waiting[i].recipe,
        tipY, beadY: tipY - POINT_H - BEAD_R[row], beadR: BEAD_R[row], beadS: BEAD_S[row],
        waved: false, waveAt: WAVE_AT + i * WAVE_LAG, joinAt: WAVE_AT + i * WAVE_LAG + JOIN_AT,
      });
    }
    // the order, a bubble per dish: its band counts the diners in as they join, its words are the dish's own line,
    // and whoever wants theirs different says so under it, two to a row
    this.chorus.length = 0;
    for (const g of groups) {
      const rec = recipeOf(g.id), titles: string[] = [], notes: string[] = [];
      for (let k = 1; k <= g.members.length; k++) titles.push(`${k} X ${rec.dish}`);
      let row = '';
      for (const i of g.members) {
        const say = twistSay(waiting[i]);
        if (!say) continue;
        const note = `${getCustomer(waiting[i].customer).name}: ${say}`;
        if (row && measureText(row + NOTE_SEP + note, 1) <= NOTE_ROW_W) row += NOTE_SEP + note;
        else { if (row) notes.push(row); row = note; }
      }
      if (row) notes.push(row);
      let lo = VIEW_W, hi = 0;
      for (const i of g.members) { lo = Math.min(lo, this.queue[i].x); hi = Math.max(hi, this.queue[i].x); }
      let tw = Math.max(measureText(titles[titles.length - 1], 1), measureText(rec.line, 1));
      for (const n of notes) tw = Math.max(tw, measureText(n, 1));
      const bw = Math.max(tw + BUBBLE_PAD * 2, hi - lo + TAIL_PAD * 2);
      this.chorus.push({
        titles, text: rec.line, notes, members: g.members.slice(), bw, bh: BUBBLE_H + ROW * notes.length,
        bx: Math.max(BUBBLE_MIN_X, Math.min(VIEW_W - 8 - bw, Math.round((lo + hi) / 2 - bw / 2))), by: 0,
      });
    }
    // stack them up the sky from BUBBLE_FOOT, closing the gaps when a pile of twists would run into the sign
    let tall = 0;
    for (const c of this.chorus) tall += c.bh;
    const gap = this.chorus.length > 1 ? Math.max(2, Math.min(BUBBLE_GAP, Math.floor((BUBBLE_FOOT - BUBBLE_TOP - tall) / (this.chorus.length - 1)))) : 0;
    let foot = BUBBLE_FOOT;
    for (const c of this.chorus) { c.by = foot - c.bh; foot = c.by - gap; }
    this.taken = 0;
    this.signText = run.lines.length > 1 ? `LINE ${run.line + 1} OF ${run.lines.length}  -  ${placeName(ln.place)}` : `${this.queue.length} IN THE LINE  -  ${placeName(ln.place)}`;
    this.signW = measureText(this.signText, 1) + 24;
    this.hint = `${game.input.keyText(0, 'action')}: ${this.queue.length > 1 ? 'TAKE EVERYONE\'S ORDER' : 'TAKE THE ORDER'}`;
    this.fields.length = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, f = this.frame;
    for (const s of this.seats) { s.player.tick(); if (s.player.done) s.player.play('idle', { restart: true }); }
    for (const r of this.riders) r.player.tick();
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
    // the line, back to front: the rows winding away up the lane first, the diner at the hatch drawn last and in front
    drawWaiters(ctx, this.queue);
    // the bubbles, the highest first: each lower bubble covers the tails that run down behind it, so every tail
    // comes out from under the paper of the dish it belongs to and points at a diner who asked for it
    for (let k = this.chorus.length - 1; k >= 0; k--) this.bubble(ctx, this.chorus[k], f);
    drawSign(ctx, VIEW_W / 2, SIGN_Y, this.signW, 22, this.signText, { size: 1 });
    if (this.queue.length && f >= this.queue[0].joinAt && f % BLINK_PERIOD < BLINK_ON) drawHint(ctx, this.hint);
  }

  /** How many of a dish's diners have joined in by frame `f` (they join front first). */
  joined(c: Chorus, f: number): number {
    let n = 0;
    for (let j = 0; j < c.members.length; j++) if (f >= this.queue[c.members[j]].joinAt) n++;
    return n;
  }

  /** A dish, said out loud by everyone who wants it: a paper bubble with the count on its band and the dish's line
   *  under it, and a tail down from its foot to a bead over each of their heads with the dish's picture in it. Tails
   *  first, so the paper sits on their roots. Nothing until its first diner has joined in. */
  bubble(ctx: CanvasRenderingContext2D, c: Chorus, f: number): void {
    const n = this.joined(c, f);
    if (!n) return;
    const x = c.bx, y = c.by, w = c.bw, base = y + c.bh - 2;
    for (let j = 0; j < n; j++) {
      const d = this.queue[c.members[j]], tx = d.x, top = d.beadY - d.beadR;
      // a stem down from the paper (hidden behind any lower bubble) to the bead, and the bead's point at their head
      ctx.fillStyle = UI.ink; ctx.fillRect(tx - STEM - 1, base, STEM * 2 + 2, top - base + 1);
      ctx.beginPath(); ctx.moveTo(tx - POINT_H - 1, d.beadY + d.beadR - 2); ctx.lineTo(tx + POINT_H + 1, d.beadY + d.beadR - 2); ctx.lineTo(tx, d.tipY + 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(tx, d.beadY, d.beadR + 1, 0, TAU); ctx.fill();
      ctx.fillStyle = UI.paper; ctx.fillRect(tx - STEM + 1, base, STEM * 2 - 2, top - base + 2);
      ctx.beginPath(); ctx.arc(tx, d.beadY, d.beadR - 1, 0, TAU); ctx.fill();
      drawDish(ctx, d.recipe, tx, d.beadY + 1, d.beadS);
    }
    BUBBLE_OPTS.title = c.titles[n - 1];
    drawTicket(ctx, x, y, w, c.bh, BUBBLE_OPTS);
    drawText(ctx, c.text, x + w / 2, y + 19, LINE_TEXT);
    for (let r = 0; r < c.notes.length; r++) drawText(ctx, c.notes[r], x + w / 2, y + 19 + ROW * (r + 1), NOTE_TEXT);
  }

  override summary() {
    const run = this.game.run, f = this.frame;
    return { line: run.line, place: run.lines[run.line].place, waiting: this.queue.length, customer: run.order.customer, dish: run.order.dish, taken: this.taken,
      // the truck's windows: every head in them, and which of them are the friends riding along
      heads: this.heads.length, friends: this.riders.map((r) => r.critter),
      // the order as said so far: what the diner at the hatch is asking for, one bubble per dish, its band and its
      // words, and how many have joined in
      bubble: this.queue.length && f >= this.queue[0].joinAt ? this.chorus[this.queue[0].dish].text : '',
      bubbles: this.chorus.filter((c) => this.joined(c, f) > 0).map((c) => c.text),
      chorus: this.chorus.map((c) => ({ title: this.joined(c, f) ? c.titles[this.joined(c, f) - 1] : '', joined: this.joined(c, f), count: c.members.length, notes: c.notes.slice(), box: [c.bx, c.by, c.bw, c.bh] })),
      // who stands where: the whole line's species and places, front first, and which bubble each one's tail hangs from
      diners: this.queue.map((d, i) => run.lines[run.line].customers[run.customer + i].customer), spots: this.queue.map((d) => d.x + ',' + d.y), dishes: this.queue.map((d) => d.dish) };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] { const f = this.fields; f.length = 0; f.push(this.frame, this.taken); return f; }
}
