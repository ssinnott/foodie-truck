// The kitchen's jokes, drawn (docs/GDD.md section 6; game/kitchenGags.ts runs them): the slice the knife flicks onto
// the ceiling - stuck there, peeling, dripping, falling, worn on a head, eaten, splatted on the floor - the pot lid
// blown off its pot, and the three beats the crew plays them in (KITCHEN_ANIMS, laid over the cast's own table with
// AnimPlayer.setOverlay, so no cast table changes). Its own file because art/kitchenProps.ts is the stations and is
// already near the size guide.
//
// Props in the rig's ink and three tones (docs/ART_STYLE.md sections 3 and 7): a slice is its ingredient's own hex
// for the skin, a creamier mix of it for the flesh and the ingredient's shade for the core; the lid is the pot's
// enamel with the kettle's brass knob. Nothing here is soft (the steam and the flour cloud are the screen's
// particles) and nothing is under 2 px. Every helper is allocation-free; a slice's tones are mixed once per
// ingredient by `sliceTones`, which the screen calls from update() the frame a slice appears.
import { INK } from './layers.ts';
import { UI } from '../constants.ts';
import { mix } from './palettes.ts';
import { foodTones } from './food.ts';
import { PROPS } from './kitchenProps.ts';
import { F, REST } from '../content/critters/common.ts';
import { LIGHT_X, LIGHT_Y } from '../lib/art/shading.ts';
import type { Anim } from '../lib/art/animation.ts';
import type { PoseSpec } from '../lib/art/poses.ts';
import type { Rig, RigWeapon } from '../lib/art/rig.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * A slice face-on is a disc SLICE_R across each way of its centre: 18 px, half as big again as the whole ingredient
 * is drawn on the board, because it has to read stuck to the ceiling from across a room.
 */
export const SLICE_R = 9;
/** As it peels, the slice sags SAG px off the ceiling on a sticky strand of itself, tilting TILT radians off it. */
const SAG = 18, TILT = 0.35;
/** The flesh is the skin mixed this far toward cream: pale enough that a slice reads as a cut face inside a rim. */
const FLESH_MIX = 0.7;
/** The pot lid: an enamel disc LID_RX by LID_RY seen side-on, its knob KNOB_W x KNOB_H on top. */
export const LID_RX = 20, LID_RY = 5;
const KNOB_W = 6, KNOB_H = 5;

/** One ingredient's slice tones. */
export interface SliceTones {
  skin: string;
  flesh: string;
  core: string;
}
const TONES = new Map<string, SliceTones>();
/** The slice tones of `hex`, mixed the first time it is asked for and kept. */
export function sliceTones(hex: string): SliceTones {
  let t = TONES.get(hex);
  if (!t) { t = { skin: hex, flesh: mix(hex, UI.cream, FLESH_MIX), core: foodTones(hex).sh }; TONES.set(hex, t); }
  return t;
}

/**
 * One slice: an inked ellipse `rx` by `ry` about (x, y), turned `rot` radians - the skin, the flesh inside it lit from
 * the top-left (the skin band is a pixel thicker at the bottom right), and the core once it is face-on enough to
 * have one.
 */
export function drawSlice(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, hex: string): void {
  const t = sliceTones(hex);
  ctx.save(); ctx.translate(R(x), R(y)); if (rot) ctx.rotate(rot);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = t.skin; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
  if (rx >= 4 && ry >= 3) { ctx.fillStyle = t.flesh; ctx.beginPath(); ctx.ellipse(-0.5, -0.5, rx - 2, ry - 2, 0, 0, TAU); ctx.fill(); }
  if (ry >= 5) { ctx.fillStyle = t.core; ctx.fillRect(-1, -1, 2, 2); }
  ctx.restore();
}

/** The stuck slice's half-depth for `peel`: pressed flat against the ceiling at 0, round again hanging off it at 1. */
function hangRy(peel: number): number { return R(SLICE_R * (0.55 + 0.45 * peel)); }

/**
 * The slice stuck to the ceiling (the top of the frame), hung from (x, y): pressed flat against it at `peel` 0 - an
 * 18 x 10 oval on the ceiling line - and, as it peels, sagging off it on a sticky strand of itself that stretches
 * and thins, tilting as it goes, until at 1 it dangles SAG px down by the strand alone; with a dab of it left on the
 * ceiling where it was. `wob` (radians) swings it on the strand, the screen's own sine.
 */
export function drawCeilingSlice(ctx: CanvasRenderingContext2D, x: number, y: number, peel: number, wob: number, hex: string): void {
  const t = sliceTones(hex), drop = R(peel * SAG), ry = hangRy(peel);
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y); ctx.rotate(peel * TILT + wob);
  if (drop > 0) {
    const w = drop > SAG / 2 ? 2 : 4;   // the strand thins as it stretches, and never below the 2 px floor
    ctx.fillStyle = INK; ctx.fillRect(-w / 2 - 1, 0, w + 2, drop + 2);
    ctx.fillStyle = t.skin; ctx.fillRect(-w / 2, 0, w, drop + 2);
  }
  drawSlice(ctx, 0, drop + ry, SLICE_R, ry, 0, hex);
  ctx.restore();
  if (drop > 0) { ctx.fillStyle = INK; ctx.fillRect(x - 6, y - 1, 12, 4); ctx.fillStyle = t.skin; ctx.fillRect(x - 5, y - 1, 10, 3); }
}

/**
 * Where the stuck slice's lowest point is for `peel` - what drips off it, and where it falls from - written into
 * `out`: the foot of drawCeilingSlice's strand and slice, turned with them (without the wobble).
 */
export function sliceTip(x: number, y: number, peel: number, out: { x: number; y: number }): void {
  const a = peel * TILT, len = peel * SAG + hangRy(peel) * 2;
  out.x = x - Math.sin(a) * len; out.y = y + Math.cos(a) * len;
}

/** One drip off the slice: 2 x 3 of the skin's colour, inked. */
export function drawDrip(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string): void {
  x = R(x); y = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 4, 5);
  ctx.fillStyle = sliceTones(hex).skin; ctx.fillRect(x, y, 2, 3);
}

/** The worn slice: lying HAT_RX x HAT_RY across the skull, sat HAT_LIFT rows up off its top (clear of the brows),
 *  its two ends flopped FLOP rows down the sides of the head. */
const HAT_RX = SLICE_R + 2, HAT_RY = 5, HAT_LIFT = 4, FLOP = 4;
/**
 * The slice worn on a head, (x, y) the top of the skull: lying flesh-up across it - a cut face in its rim, seen
 * from a little above, the way the room is - with both ends flopped down over the sides. `tilt` (radians) rocks it
 * with the head.
 */
export function drawHatSlice(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, hex: string): void {
  const t = sliceTones(hex), cy = -HAT_LIFT;
  ctx.save(); ctx.translate(R(x), R(y)); if (tilt) ctx.rotate(tilt);
  // the flopped ends first, so the top closes over them
  for (let s = -1; s <= 1; s += 2) {
    const ex = s * (HAT_RX - 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(ex, cy + FLOP, 4, HAT_RY, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = t.skin; ctx.beginPath(); ctx.ellipse(ex, cy + FLOP, 3, HAT_RY - 1, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, cy, HAT_RX + 1, HAT_RY + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = t.skin; ctx.beginPath(); ctx.ellipse(0, cy, HAT_RX, HAT_RY, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = t.flesh; ctx.beginPath(); ctx.ellipse(-1, cy - 1, HAT_RX - 3, HAT_RY - 2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = t.core; ctx.fillRect(-1, cy - 2, 2, 2);
  ctx.restore();
}

/** Floor splat sizes by step (orchard.ts's recipe): a wide flat blot that steps down a size at a time, never fading. */
const SPLAT_RX = Int8Array.of(11, 9, 7, 4), SPLAT_RY = Int8Array.of(3, 3, 2, 2);
export const SPLAT_STEPS = SPLAT_RX.length;
/** A slice that met the floor at (x, y), at size step `k` (0 the fresh splat .. SPLAT_STEPS - 1 the last of it). */
export function drawFloorSplat(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, hex: string): void {
  const t = sliceTones(hex), rx = SPLAT_RX[k], ry = SPLAT_RY[k];
  x = R(x); y = R(y);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = t.skin; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  if (ry >= 3) { ctx.fillStyle = t.flesh; ctx.beginPath(); ctx.ellipse(x - 1, y - 1, rx - 3, ry - 2, 0, 0, TAU); ctx.fill(); }
}

/**
 * The pot's enamel lid at (x, y), its centre: a disc seen side-on with the brass knob on top, turned `rot` radians
 * and squashed to `flip` (0..1) of its depth as it spins - the saucer flipping over in the air.
 */
export function drawPotLid(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, flip: number): void {
  const ry = Math.max(1.5, LID_RY * flip);
  ctx.save(); ctx.translate(R(x), R(y)); if (rot) ctx.rotate(rot);
  ctx.fillStyle = INK; ctx.fillRect(-KNOB_W / 2, -ry - KNOB_H + 1, KNOB_W, KNOB_H);
  ctx.fillStyle = PROPS.brass; ctx.fillRect(-KNOB_W / 2 + 1, -ry - KNOB_H + 2, KNOB_W - 2, KNOB_H - 2);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, LID_RX + 1, ry + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = PROPS.enamel; ctx.beginPath(); ctx.ellipse(0, 0, LID_RX, ry, 0, 0, TAU); ctx.fill();
  if (ry >= 3) { ctx.fillStyle = PROPS.enamelSh; ctx.beginPath(); ctx.ellipse(1, 1, LID_RX - 2, ry - 2, 0, 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = UI.cream; ctx.fillRect(-LID_RX + 5, -2, 4, 2);                   // the one highlight, top-left
  ctx.restore();
}

/** A rig carrying the colour of what is in its paw (game/screens/kitchen.ts CritterRig writes it). */
interface HoldingRig extends Rig {
  heldHex?: string | null;
}
/**
 * The slice in a paw, for the hungry one eating it (`rig.heldHex` is its ingredient): held up face-on, counter-turned
 * like every held item so it never tilts with the arm (content/critters/items.ts upright, minigame.ts's ribbon).
 */
export const SLICE_ITEM: RigWeapon = { attach: 'handR', length: 8, draw(ctx: CanvasRenderingContext2D, rig: HoldingRig) {
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  ctx.save(); ctx.rotate(a);
  drawSlice(ctx, 2, 1, SLICE_R - 2, SLICE_R - 2, 0, rig.heldHex || UI.cream);
  ctx.restore();
} };

/** The names of the beats below, and the anim events the chomp raises on its keys (game/kitchenGags.ts acts on them). */
export const CHOMP = 'chomp', SHAKE = 'shake', COUGH = 'cough';
export const CHEW_EVENT = 'chew', GULP_EVENT = 'gulp';
/** A chewing key: the food at the muzzle, the cheeks working (the head down a little, a squash), eyes shut. */
const CHEW_KEY: PoseSpec = { armR: [84, 40], armL: [-8, 14], torso: 0, head: 6, weapon: 40, squash: 1.05, face: 'closed' };
/** ...and between chews: the head back up, the smile. */
const MUNCH_KEY: PoseSpec = { armR: [88, 42], armL: [-8, 14], torso: -2, head: -2, weapon: 40, face: 'happy' };

/**
 * The kitchen's own beats, on top of the shared table (the ORCHARD_ANIMS / BRAMBLE_ANIMS pattern):
 *   chomp  the hungry one's PROPER chew, for his bite and for the slice he eats: the food up to the mouth with it
 *          wide open, the CHOMP (head down on it, a squash), three chews with crumbs (CHEW_EVENT on each), the swallow
 *          (chin up, a stretch: GULP_EVENT, and the paw is empty after it) and a happy finish. The shared `eat` is 42
 *          frames of one bite; this is the meal. The paws stop at the muzzle tip as `eat`'s do, so the face shows.
 *   shake  shaking off a slice, a lid or the flour: the head tossed side to side, eyes shut, then the smile back.
 *   cough  a floury cough: a breath in, the body snapping forward on the cough, and back.
 * Only `chomp` ever holds a seat (the screen's eat beat, which any push of the stick ends); the other two play only
 * on a seat with nothing else to do (game/kitchenGags.ts restAnim).
 */
export const KITCHEN_ANIMS: Readonly<Record<string, Anim>> = Object.freeze({
  [CHOMP]: { loop: false, frames: [
    F(7, { armR: [76, 56], armL: [-10, 14], torso: -4, head: -8, weapon: 50, face: 'shout' }, { ease: 'in' }),
    F(5, { armR: [92, 42], armL: [-10, 14], torso: 4, head: 12, weapon: 30, root: [0, 1], squash: 1.08, face: 'grit' }, { ease: 'overshoot' }),
    F(8, CHEW_KEY, { event: CHEW_EVENT }),
    F(7, MUNCH_KEY),
    F(8, CHEW_KEY, { event: CHEW_EVENT }),
    F(7, MUNCH_KEY),
    F(8, CHEW_KEY, { event: CHEW_EVENT }),
    F(10, { armR: [36, 26], armL: [-12, 12], torso: -6, head: -12, stretch: 1.06, face: 'closed' }, { ease: 'out', event: GULP_EVENT }),
    F(14, { ...REST, torso: 0, head: 0, root: [0, 1], squash: 1.03, face: 'happy' }, { ease: 'inout' }),
  ] },
  [SHAKE]: { loop: false, frames: [
    F(3, { ...REST, torso: -3, head: -18, root: [-1, 0], face: 'closed' }),
    F(3, { ...REST, torso: 3, head: 16, root: [1, 0], face: 'closed' }),
    F(3, { ...REST, torso: -3, head: -16, root: [-1, 0], face: 'closed' }),
    F(3, { ...REST, torso: 2, head: 12, root: [1, 0], face: 'closed' }),
    F(6, { ...REST, torso: 0, head: 0, face: 'happy' }, { ease: 'out' }),
  ] },
  [COUGH]: { loop: false, frames: [
    F(5, { ...REST, torso: -6, head: -10, stretch: 1.03, face: 'closed' }, { ease: 'in' }),
    F(4, { armR: [40, 50], armL: [-14, 10], torso: 14, head: 14, root: [0, 1], squash: 1.06, face: 'shout' }, { ease: 'overshoot' }),
    F(9, { ...REST, torso: 4, head: 4, face: 'closed' }, { ease: 'out' }),
  ] },
});

/** Frames in a beat of KITCHEN_ANIMS: the screen's timers are these, never a second copy of the number. */
export function beatFrames(name: string): number {
  let n = 0;
  for (const f of KITCHEN_ANIMS[name].frames) n += f.dur;
  return n;
}

/** Frames into a beat of KITCHEN_ANIMS at which the key raising `event` begins (its length if none does). */
export function eventAt(name: string, event: string): number {
  let n = 0;
  for (const f of KITCHEN_ANIMS[name].frames) { if (f.event === event) return n; n += f.dur; }
  return n;
}
