// Fishing kit for the pond (docs/GDD.md section 5, docs/ART_STYLE.md section 1 "Pond"): the rod stances every
// critter plays, the integer tables the simulation reads (a 24-entry parabola for the cast and the caught fish),
// the tables only draw() reads (the float's bob, the nibble dips), and the sprites: the 2 px mid-brown line, the
// float with its slot cap and tag, the trout, the bucket. Screen space, integer coordinates, no allocation per call.
import { UI, PLAYER_COLORS, SIGNAL } from '../constants.ts';
import { pathRR } from '../lib/art/shading.ts';
import { F } from '../content/critters/common.ts';

const R = Math.round, TAU = Math.PI * 2;
export const INK = UI.ink;
/** The line is 2 px mid-brown, never 1 px ink (the judges' graft: the 1 px line broke the floor). */
export const LINE = '#5E4A3A';
export const TROUT = Object.freeze({ body: '#B8C4C9', back: '#7FA9B8', gill: '#D9A2AE' });
/**
 * The float: a plain cream body with the seat's colour on the cap and the tag (ART_STYLE section 1 "Pond":
 * "floats white with a slot-colour cap"). Round 2: the body used to carry a 3 px dark-willow band which, under the
 * 2 px ink, left the 6x8 capsule as two cream slivers around a brown middle — the panel read the whole float as a
 * second tiny willow basket. The body is now bare cream and the only band it ever wears is the mint one, lit while
 * that seat's bite window is open, so the only thing wearing the scene's signal colour is the thing asking to be
 * pressed (ART_STYLE section 4 binds mint to ONE meaning).
 */
export const FLOAT = Object.freeze({ body: '#F1E4C8', bite: SIGNAL.pond });
export const BUCKET = Object.freeze({ willow: '#6B4E3A', tip: '#B8C4C9' });

// ---------------------------------------------------------------- tables
/** Cast arc: 24 steps. PARA_T[i] is the along-track fraction, PARA_H[i] the lift in px (4t(1-t) * 36), integers. */
export const PARA_N = 24;
export const PARA_T = new Float64Array(PARA_N), PARA_H = new Int16Array(PARA_N);
for (let i = 0; i < PARA_N; i++) { const t = i / (PARA_N - 1); PARA_T[i] = t; PARA_H[i] = R(4 * t * (1 - t) * 36); }
/** The waiting float's bob, 32 entries of -1..1 px, read in draw only (index (frame >> 1) & 31). */
export const BOB = new Int8Array(32);
for (let i = 0; i < 32; i++) BOB[i] = R(Math.sin(i / 32 * TAU));
/** The nibble telegraph: over its 30 frames the float dips 2 px twice (frames 0..7 and 15..22). */
export const NIBBLE = new Int8Array(30);
for (let i = 0; i < 30; i++) NIBBLE[i] = (i < 8 || (i >= 15 && i < 23)) ? 2 : 0;

// ---------------------------------------------------------------- stances (an AnimPlayer overlay table)
// Rod angles: the rig's weapon angle is the hand angle minus weapon.rot (0 = down, 90 = forward, 180 = up), so a
// rod held ~45 degrees above level from an arm at [22, 12] (hand ~36) wants rot -99: the idle float then dangles a
// clear 12 px short of the next seat's head (at -85 it hung on the neighbour's muzzle). The waiting rod at ~45
// degrees from [48, 30] (hand ~78) wants -58, so the line drops from a raised tip to the float. Every key sets both
// arms so the off-paw stays visible, and no rod crosses the face (a tip above the muzzle is beside it).
const IDLE_ARMS = { armL: [-12, 12] };
export const POND_ANIMS = Object.freeze({
  /** Rod low at the side, breathing on two keys over 52 frames. */
  rodIdle: { loop: true, frames: [
    F(26, { ...IDLE_ARMS, armR: [22, 12], weapon: -99, torso: 2, root: [0, 0] }),
    F(26, { ...IDLE_ARMS, armR: [24, 14], weapon: -93, torso: 4, root: [0, 1], head: 2 }),
  ] },
  /** Rod out over the water while the float waits; the same breath. */
  rodWait: { loop: true, frames: [
    F(26, { ...IDLE_ARMS, armR: [48, 30], weapon: -58, torso: 0, root: [0, 0] }),
    F(26, { ...IDLE_ARMS, armR: [50, 32], weapon: -52, torso: 2, root: [0, 1], head: 2 }),
  ] },
  /**
   * The nibble telegraph on the CRITTER (the float's 2 px dip is 300 px away from where the player is looking):
   * the rod tip dips twice, 10 degrees, on the same 8/7/8/7 beat as the NIBBLE table above.
   */
  rodNibble: { loop: false, frames: [
    F(8, { ...IDLE_ARMS, armR: [46, 33], weapon: -48, torso: 1, head: 1, face: 'neutral' }, { ease: 'out' }),
    F(7, { ...IDLE_ARMS, armR: [48, 30], weapon: -58, torso: 0, head: 0, face: 'neutral' }, { ease: 'inout' }),
    F(8, { ...IDLE_ARMS, armR: [46, 33], weapon: -48, torso: 1, head: 1, face: 'neutral' }, { ease: 'out' }),
    F(7, { ...IDLE_ARMS, armR: [48, 30], weapon: -58, torso: 0, head: 0, face: 'neutral' }, { ease: 'inout' }),
  ] },
  /** The bite: the tip is yanked down and the critter leans into it, gritting — the 18-frame "press now". */
  rodBite: { loop: false, frames: [
    F(4, { ...IDLE_ARMS, armR: [44, 26], weapon: -30, torso: 6, head: 4, root: [0, 1], face: 'grit' }, { ease: 'out' }),
    F(14, { ...IDLE_ARMS, armR: [46, 28], weapon: -34, torso: 5, head: 3, root: [0, 1], face: 'grit' }),
  ] },
  /**
   * The miss. The shared `bump` sets no `weapon`, so it snapped the rod to 0 (straight down) and held it there for
   * the whole 40-frame beat — shaft, float and slot tag under the waterline. This one keeps the rod at the waiting
   * angle through the flinch and walks it back to the rodIdle angle over the last 25 frames, under the reel-in.
   */
  bump: { loop: false, frames: [
    F(5, { ...IDLE_ARMS, armR: [60, 20], weapon: -58, torso: -8, head: -6, root: [0, 0], squash: 1.08, face: 'hurt' }, { ease: 'out' }),
    F(10, { ...IDLE_ARMS, armR: [52, 28], weapon: -58, torso: 2, head: 2, root: [0, 0], face: 'hurt' }, { ease: 'inout' }),
    F(25, { ...IDLE_ARMS, armR: [22, 12], weapon: -99, torso: 2, head: 0, root: [0, 0], face: 'dazed' }, { ease: 'inout' }),
  ] },
  /** The hook: rod straight up in front (the reach key, so the paw lands beside the muzzle), happy. */
  pull: { loop: false, frames: [
    F(6, { armR: [140, 30], armL: [-150, -10], weapon: 0, torso: -6, head: -8, root: [0, 0], stretch: 1.03, face: 'happy' }, { ease: 'out' }),
    F(34, { armR: [146, 28], armL: [-156, -12], weapon: 0, torso: -8, head: -10, root: [0, -1], stretch: 1.04, face: 'happy' }),
  ] },
});
/**
 * The rod whip EVERY seat casts with: wind-up `in` 8f with the rod back over the shoulder, the snap `overshoot` 4f
 * with a smear (the chop's beat on the rod arm), a hold, and a return `inout` onto the rodWait stance so the float's
 * landing and the stance change share one moment.
 *
 * It overrides an authored `cast` on purpose. Cress's own cast is written for her basket and ends at `weapon: 60`;
 * rodWait opens at -58, so handing her the rod gave a 118-degree rod swing between two adjacent keys — a flail by
 * ART_STYLE section 10. This whip ends ON the rodWait pose, so no seat has a seam there.
 */
export const POND_ANIMS_CAST = Object.freeze({
  ...POND_ANIMS,
  cast: { loop: false, frames: [
    F(8, { armR: [-120, -30], armL: [30, 40], torso: -10, head: -6, weapon: -60, root: [-2, 1], legR: [10, 6], legL: [-14, 12], face: 'grit' }, { ease: 'in' }),
    F(4, { armR: [108, 30], armL: [40, 50], torso: 14, head: 4, weapon: 70, root: [2, 1], legR: [20, 4], legL: [-20, 20], squash: 1.04, face: 'shout' }, { ease: 'overshoot', smear: { from: -160, to: 40, a: 0.4 } }),
    F(10, { armR: [100, 36], armL: [40, 50], torso: 10, head: 0, weapon: 62, root: [2, 1], legR: [20, 4], legL: [-20, 20], face: 'happy' }),
    F(10, { armR: [48, 30], armL: [-12, 12], torso: 0, head: 0, weapon: -58, root: [0, 0], face: 'happy' }, { ease: 'inout' }),
  ] },
});
/** The frame of the cast on which the float leaves the rod tip (the end of the whip key). */
export const CAST_LAUNCH = 12;

// ---------------------------------------------------------------- sprites
/**
 * The line: three 2 px segments from the rod tip to the float with a quadratic sag (draw-only maths). Falls
 * straight down when the float dangles under the tip.
 */
export function drawLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const dx = x1 - x0, dy = y1 - y0;
  const sag = Math.min(14, Math.hypot(dx, dy) * 0.06);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0);
  ctx.lineTo(R(x0 + dx / 3), R(y0 + dy / 3 + sag * 0.9));
  ctx.lineTo(R(x0 + dx * 2 / 3), R(y0 + dy * 2 / 3 + sag * 0.75));
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * The float, centred on (x, y): an 8x10 cream capsule under its own 2 px ink — the lightest mark on the pond — with
 * a 6x5 slot cap floating a clear 2 px above it and, when `tag` is on, the 8x5 slot tag above that (the judges'
 * graft). Round 2: the cap used to butt straight onto the capsule, so ink met ink and the pair read as one 6x11
 * blob; the 2 px of daylight between them is what makes the seat's colour read as a tag of its own at 1x.
 * `tag` is off while the float dangles under the rod tip — up there the tag would land ABOVE the tip with the shaft
 * between it and the float it labels, reading as a card stapled to the rod. `bite` lights the waterline mint.
 */
export function drawFloat(ctx: CanvasRenderingContext2D, x: number, y: number, slot: number, tag = true, bite = false): void {
  const col = PLAYER_COLORS[slot] || UI.paperDark;
  pathRR(ctx, x - 4, y - 4, 8, 10, 4); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = FLOAT.body; ctx.fill();
  if (bite) { ctx.save(); pathRR(ctx, x - 4, y - 4, 8, 10, 4); ctx.clip(); ctx.fillStyle = FLOAT.bite; ctx.fillRect(x - 4, y + 1, 8, 5); ctx.restore(); }
  ctx.fillStyle = INK; ctx.fillRect(x - 4, y - 14, 8, 7);
  ctx.fillStyle = col; ctx.fillRect(x - 3, y - 13, 6, 5);
  if (!tag) return;
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y - 24, 10, 7);
  ctx.fillStyle = col; ctx.fillRect(x - 4, y - 23, 8, 5);
}

/** The trout: a 24x12 inked body facing `facing`, a darker back inside the same ink, a rose gill dot, an ink eye. */
export function drawTrout(ctx: CanvasRenderingContext2D, cx: number, cy: number, facing = 1): void {
  ctx.save(); ctx.translate(cx, cy); if (facing < 0) ctx.scale(-1, 1);
  ctx.beginPath(); ctx.ellipse(-2, 0, 9, 5, 0, 0, TAU);
  ctx.moveTo(6, 0); ctx.lineTo(12, -5); ctx.lineTo(12, 5); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = TROUT.body; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = TROUT.back; ctx.fillRect(-12, -6, 24, 4); ctx.restore();
  ctx.fillStyle = TROUT.gill; ctx.fillRect(-6, 0, 2, 2);
  ctx.fillStyle = INK; ctx.fillRect(-9, -2, 2, 2);
  ctx.restore();
}

/**
 * The bucket at a seat's feet: 14x12 dark willow with a 3 px slot band, and a 2 px silver tail tip per fish (up to
 * 5). `squash` above 1 widens and squats it about its base for the few frames after a trout drops in, so the
 * landing has a contact beat instead of the count simply ticking over.
 */
export function drawBucket(ctx: CanvasRenderingContext2D, x: number, y: number, slot: number, fish: number, squash = 1): void {
  const col = PLAYER_COLORS[slot] || UI.paperDark;
  const n = fish > 5 ? 5 : fish;
  if (squash !== 1) { ctx.save(); ctx.translate(x + 7, y); ctx.scale(squash, 1 / squash); ctx.translate(-(x + 7), -y); }
  for (let i = 0; i < n; i++) { ctx.fillStyle = INK; ctx.fillRect(x + 1 + i * 3, y - 16, 3, 5); ctx.fillStyle = BUCKET.tip; ctx.fillRect(x + 2 + i * 3, y - 15, 2, 3); }
  ctx.beginPath(); ctx.moveTo(x - 1, y - 12); ctx.lineTo(x + 15, y - 12); ctx.lineTo(x + 13, y); ctx.lineTo(x + 1, y); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = BUCKET.willow; ctx.fill();
  ctx.fillStyle = col; ctx.fillRect(x, y - 10, 14, 3);
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 13, 16, 2);
  if (squash !== 1) ctx.restore();
}
