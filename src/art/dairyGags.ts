// The byre's two jokes, drawn (docs/GDD.md section 5; docs/ART_STYLE.md sections 0, 3, 7): the milker's beats for
// both of them, the cow's tongue, the cowlick it leaves standing on the milker's head, and the lash of the tail.
// The WHEN of every one of these is the screen's (game/screens/dairyGags.ts deals the jokes and counts their
// frames down); this module only says what each beat looks like, in screen space, allocating nothing per call.
//
// Like every prop in the byre: 1 px warm ink round each OBJECT, flat fills in the scene's own tones, integer pixels.
// No SIGNAL colour appears here - the tongue is a muted pink a step off the cow's own muzzle, the lash is cream, and
// the cowlick is the critter's own fur.
import { UI, PLUM } from '../constants.ts';
import { mix } from './palettes.ts';
import { F } from '../content/critters/common.ts';
import { DAIRY_ANIMS, SIT, SIT_ROOT_Y, MILK_HI } from './dairyProps.ts';

const R = Math.round, DEG = Math.PI / 180, TAU = Math.PI * 2;
const INK = UI.ink;

// ---------------------------------------------------------------- the milker's beats
/**
 * The two jokes' poses, on top of the byre's own (art/dairyProps.ts DAIRY_ANIMS) - every key sets both legs and the
 * root, as those do, or a seated critter stands up mid-beat. The screen plays each one on the frame its countdown
 * says (game/screens/dairyGags.ts), so a beat's LENGTH here is its length there: the numbers in the comments are
 * the screen's constants.
 *
 * THE COWLICK (her tongue, then the fur it leaves standing up):
 *   lickWait   the wind-up, LICK_WIND: frozen mid-pull, the head comes round and UP at the tongue on its way, and
 *              the eyes go wide (`shout`) for the last beat - the '!' bubble's moment;
 *   licked     the lick, LICKED: up off the stool onto the toes and stretched tall, eyes squeezed shut, then down
 *              again, still shut - the tongue lifted it;
 *   quiffStun  STUN: eyes open, rolled up at the thing now standing on its head;
 *   quiffPat   a pat, PAT: the near paw goes up to the brow - the highest a chibi paw reaches is its own head's
 *              middle - takes the quiff's crest and pulls it down over the brow (`closed`), the head bowing into
 *              it; the screen lets it go at the end, BOING;
 *   quiffGlare between pats, GLARE: paws in the lap, glaring up at it (`grit`);
 *   quiffPress the last pat, PRESS: the same, held down until it stays;
 *   quiffDone  the paw comes back to the teat and the smile comes back: DONE frames into the milking pose.
 * THE TAIL (the old joke, bigger):
 *   swishBrace the wind-up, SWISH_WIND: it hears the swishing, looks up, then hunches with its eyes shut;
 *   thwapSpin  the bang, SPIN: the hit held a beat, then knocked backward off the stool, a tucked somersault
 *              through the air (the root turns a full -360: backward is negative, and a left-facing seat mirrors
 *              it), landing on its bottom in the straw. A root rotation turns the rig about its FEET, so each
 *              airborne key's root offset is worked out to keep the body's middle (SPIN_C = 24 rows up) on a hop up
 *              and back instead of swinging it through the floor - root = middle - SPIN_C * (sin rot, -cos rot) -
 *              with a key every 60 degrees, close enough that the lerp between two never takes the tallest head
 *              in the cast (Barley's, 64 rows off its feet) under the floor line;
 *   thwapSit   the look: sat in the straw where it landed, leaning back on its paws, the head lolling - the dizzy
 *              stars go round it (looping);
 *   thwapClimb the recovery, CLIMB: a scramble and a hop back up onto the stool, landing in the milking pose.
 */
/** The milking arms (DAIRY_ANIMS milkIdle's first key): a beat that ends on them hands back to milkIdle without a pop. */
const MILK_ARMS = { armR: [126, 0], armL: [-30, -12] };
/** Paws in the lap, for the beats that only look: the near forearm across the thighs, the off paw back on the stool. */
const LAP_ARMS = { armR: [-10, 50], armL: [-30, -6] };
/**
 * A pat: the near paw up at the brow, as high as a chibi arm goes (it ends at its own head's middle), to take the
 * quiff's crest - then down in front of the muzzle, pulling it over (drawQuiff's `hold`, below).
 */
const PAT_UP = { armR: [146, 24], armL: [-30, -6] }, PAT_DOWN = { armR: [118, 32], armL: [-32, -6] };
/** Where a thrown seat lands: this far behind its stool (rig px; a left-facing seat lands to the right), sat in the straw. */
export const LAND_X = -30;
const LAND_Y = 8;
const TUCK = { legR: [118, -100], legL: [108, -90], armR: [80, 60], armL: [-20, 60], torso: 10, head: 10, face: 'dazed' as const };
const DAIRY_GAG_ANIMS = Object.freeze({
  lickWait: { loop: false, frames: [
    F(6, { ...SIT, ...MILK_ARMS, root: [0, SIT_ROOT_Y], torso: 2, head: 4, face: 'neutral' }, { ease: 'inout' }),
    F(10, { ...SIT, armR: [124, 2], armL: [-32, -12], root: [0, SIT_ROOT_Y], torso: -2, head: -14, face: 'neutral' }),
    F(8, { ...SIT, armR: [122, 4], armL: [-36, -14], root: [1, SIT_ROOT_Y - 1], torso: -6, head: -20, face: 'shout' }),
  ] },
  licked: { loop: false, frames: [
    F(3, { legR: [14, 4], legL: [-8, 4], armR: [26, 10], armL: [-30, 10], root: [2, -3], torso: -10, head: -18, stretch: 1.12, face: 'closed' }, { ease: 'out' }),
    F(9, { legR: [10, 2], legL: [-6, 2], armR: [32, 14], armL: [-36, 12], root: [2, -5], torso: -8, head: -16, stretch: 1.08, face: 'closed' }),
    F(8, { ...SIT, ...LAP_ARMS, root: [0, SIT_ROOT_Y], torso: 2, head: -6, face: 'closed' }, { ease: 'inout' }),
  ] },
  quiffStun: { loop: true, frames: [
    F(11, { ...SIT, ...LAP_ARMS, root: [0, SIT_ROOT_Y], torso: -2, head: -16, face: 'neutral' }),
    F(11, { ...SIT, ...LAP_ARMS, root: [0, SIT_ROOT_Y], torso: -3, head: -18, face: 'neutral' }),
  ] },
  quiffPat: { loop: false, frames: [
    F(5, { ...SIT, ...PAT_UP, root: [0, SIT_ROOT_Y], torso: 2, head: -4, face: 'grit' }, { ease: 'out' }),
    F(6, { ...SIT, ...PAT_DOWN, root: [0, SIT_ROOT_Y + 1], torso: 6, head: 6, squash: 0.97, face: 'closed' }),
    F(3, { ...SIT, ...PAT_DOWN, root: [1, SIT_ROOT_Y + 1], torso: 7, head: 8, squash: 0.97, face: 'grit' }),
  ] },
  quiffGlare: { loop: true, frames: [
    F(6, { ...SIT, ...LAP_ARMS, root: [0, SIT_ROOT_Y], torso: 0, head: -14, face: 'grit' }),
    F(6, { ...SIT, armR: [24, 36], armL: [-28, -6], root: [0, SIT_ROOT_Y + 1], torso: 1, head: -12, face: 'grit' }),
  ] },
  quiffPress: { loop: false, frames: [
    F(5, { ...SIT, ...PAT_UP, root: [0, SIT_ROOT_Y], torso: 2, head: -4, face: 'grit' }, { ease: 'out' }),
    F(13, { ...SIT, ...PAT_DOWN, root: [0, SIT_ROOT_Y + 1], torso: 8, head: 10, squash: 0.96, face: 'closed' }),
  ] },
  quiffDone: { loop: false, frames: [
    F(6, { ...SIT, armR: [100, 30], armL: [-30, -10], root: [0, SIT_ROOT_Y], torso: 2, head: 2, face: 'happy' }, { ease: 'inout' }),
    F(10, { ...SIT, ...MILK_ARMS, root: [0, SIT_ROOT_Y], torso: 4, head: 8, face: 'happy' }),
  ] },
  swishBrace: { loop: false, frames: [
    F(6, { ...SIT, ...MILK_ARMS, root: [0, SIT_ROOT_Y], torso: 0, head: -6, face: 'neutral' }, { ease: 'inout' }),
    F(10, { ...SIT, armR: [124, 2], armL: [-34, -12], root: [0, SIT_ROOT_Y], torso: -4, head: -16, face: 'neutral' }),
    F(14, { ...SIT, armR: [112, 14], armL: [-44, -20], root: [0, SIT_ROOT_Y + 1], torso: 10, head: 14, squash: 0.95, face: 'closed' }),
  ] },
  // the middle goes (-6, -40) (-12, -48) (-18, -50) (-24, -46) (-28, -34) at -60 .. -300: a hop up and back
  thwapSpin: { loop: false, frames: [
    F(3, { legR: [104, -40], legL: [92, -30], armR: [150, 20], armL: [-150, 10], root: [-3, 0, -30], torso: -12, head: -22, squash: 1.1, face: 'hurt' }, { interp: false }),
    F(2, { ...TUCK, root: [15, -28, -60] }),
    F(3, { ...TUCK, root: [9, -60, -120] }),
    F(3, { ...TUCK, root: [-18, -74, -180] }),
    F(3, { ...TUCK, root: [-45, -58, -240] }),
    F(2, { ...TUCK, root: [-49, -22, -300] }),
    F(2, { legR: [80, 0], legL: [70, 4], armR: [-36, 10], armL: [-46, 10], root: [LAND_X, LAND_Y, -360], torso: -10, head: -8, squash: 1.1, face: 'dazed' }),
  ] },
  thwapSit: { loop: true, frames: [
    F(12, { legR: [80, 0], legL: [70, 4], armR: [-34, 10], armL: [-44, 10], root: [LAND_X, LAND_Y, -10], torso: -8, head: -10, face: 'dazed' }, { ease: 'inout' }),
    F(12, { legR: [82, 2], legL: [68, 4], armR: [-30, 12], armL: [-40, 12], root: [LAND_X, LAND_Y, -6], torso: -6, head: 6, face: 'dazed' }, { ease: 'inout' }),
  ] },
  thwapClimb: { loop: false, frames: [
    F(4, { legR: [100, -70], legL: [90, -60], armR: [40, 30], armL: [-20, 20], root: [LAND_X + 4, LAND_Y - 2, -4], torso: 12, head: 6, squash: 1.06, face: 'neutral' }, { ease: 'in' }),
    F(5, { legR: [50, -50], legL: [40, -40], armR: [90, 30], armL: [-30, -10], root: [-12, -8, 0], torso: 4, head: 2, stretch: 1.05, face: 'neutral' }, { ease: 'out' }),
    F(5, { ...SIT, ...MILK_ARMS, root: [0, SIT_ROOT_Y], torso: 4, head: 8, face: 'happy' }),
  ] },
});
/** The byre's beats and the jokes' together: the one overlay table a dairy seat carries (AnimPlayer.setOverlay). */
export const DAIRY_SEAT_ANIMS = Object.freeze({ ...DAIRY_ANIMS, ...DAIRY_GAG_ANIMS });

// ---------------------------------------------------------------- the tongue
/**
 * The tongue: a muted pink a step off the cow's own muzzle (#A88178) and lighter, so it reads as wet and alive
 * against the hide and against every fur in the cast - never SIGNAL.hot, which it would be one ramp away from.
 */
const TONGUE = '#D98390';
const TONGUE_SH = mix(TONGUE, PLUM.shadow, 0.3);
/**
 * The cow's tongue: a fat strap from her mouth at (x0, y0) to its tip at (x1, y1), sagging `sag` rows at the
 * middle, `w` px of pink inside its own 1 px ink and a 2 px glint near the tip (it is wet). While it is still
 * unrolling, `curl` is the radius of the roll at its tip - a party blower's, which shrinks to 0 as it comes out.
 */
export function drawTongue(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number, w: number, curl: number): void {
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + sag;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = w + 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  if (curl >= 2) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x1, y1 - curl, curl + 1, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = TONGUE; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  if (curl >= 2) {
    ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.arc(x1, y1 - curl, curl - 1, 0, TAU); ctx.fill();
    ctx.fillStyle = TONGUE_SH; ctx.beginPath(); ctx.arc(x1, y1 - curl, Math.max(1, curl - 3), 0, TAU); ctx.fill();
  }
  // the glint, on the curve 70 % of the way out and on its upper edge (the light is above)
  const t = 0.7, u = 1 - t, gx = u * u * x0 + 2 * u * t * cx + t * t * x1, gy = u * u * y0 + 2 * u * t * cy + t * t * y1;
  ctx.fillStyle = MILK_HI; ctx.fillRect(R(gx) - 1, R(gy - w / 2) + 1, 2, 2);
}

// ---------------------------------------------------------------- the cowlick
/**
 * The cowlick: the fur the tongue swept up, standing straight up off the head in a giant quiff - a flame of fur as
 * wide as the brow with a little spike at the back and the big lock cresting forward into a hook, a literal
 * cow-lick. Outline in units of the head radius, origin at its root on the brow, +x toward the face and y down, from
 * the base's back corner round to its front one; the base itself carries NO ink, so the quiff grows out of the head
 * (and out from under a hat) instead of sitting on it like a cap.
 */
const QUIFF = Float32Array.of(-0.64, 0.2, -0.82, -0.45, -0.68, -1.22, -0.36, -0.92, -0.24, -1.5, 0.16, -1.86, 0.62, -1.72, 0.84, -1.38, 0.46, -1.34, 0.34, -0.78, 0.64, 0.2);
/**
 * The shadow side: a band up the front edge into the hook's underside, the side away from the rig's light (which
 * flips with the sprite, ART_STYLE section 3, so the back of a quiff is always its lit side). It is what keeps a
 * pale quiff off a pale hat - Sorrel's lilac-white fur in front of her white toque was one shape without it.
 */
const QUIFF_SH = Float32Array.of(0.64, 0.2, 0.34, -0.78, 0.46, -1.34, 0.84, -1.38, 0.58, -1.16, 0.1, -0.72, 0.3, 0.2);
/** The two glints, in quiff space: high on the big lock's back edge, and on the little back spike. */
const GLINT = Float32Array.of(-0.12, -1.52, -0.6, -1.0);
/** The crest, the quiff's highest point: when the paw pulls it down, this is the point that goes to the paw. */
const CREST_X = 0.16, CREST_Y = -1.86, CREST = Math.hypot(CREST_X, CREST_Y);
/** Where the quiff grows from on the head: forward of the crown, on the brow, in head radii from the head joint. */
const ROOT_X = 0.18, ROOT_Y = -0.9;
/** Pressed down for good it is squashed to FLAT_H of its height and spread to FLAT_W of its width, tipped FLAT_TIP degrees forward. */
const FLAT_H = 0.3, FLAT_W = 1.25, FLAT_TIP = 16;
/** Pulled down to the paw, it thins to HELD_W of its width: a lock of fur stretched, not the whole quiff bent. */
const HELD_W = 0.6;
/** Its corners' radius, px: rounded enough to be fur, sharp enough that the tips are tips. */
const QUIFF_ROUND = 2.5;
/** The screen points of this frame's outline, shadow band and glints, written in place. */
const QP = new Float32Array(QUIFF.length), QS = new Float32Array(QUIFF_SH.length), QG = new Float32Array(GLINT.length);

/**
 * Quiff space to screen: squash by `w` x `h`, mirror by `facing`, turn by `phi` (radians, clockwise from screen-up:
 * where the quiff's own up points), scale by `r` and place its root at (bx, by).
 */
function placeQuiff(src: Float32Array, out: Float32Array, bx: number, by: number, r: number, w: number, h: number, phi: number, facing: number): void {
  const c = Math.cos(phi), s = Math.sin(phi);
  for (let i = 0; i < src.length; i += 2) {
    const qx = src[i] * w * facing, qy = src[i + 1] * h;
    out[i] = bx + (qx * c - qy * s) * r; out[i + 1] = by + (qx * s + qy * c) * r;
  }
}

/** The outline through `pts` with every inner corner rounded; `close` runs the base back to the start (the fill only). */
function quiffPath(ctx: CanvasRenderingContext2D, pts: Float32Array, close: boolean): void {
  const n = pts.length >> 1;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) ctx.arcTo(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], QUIFF_ROUND);
  ctx.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  if (close) ctx.closePath();
}

/**
 * The cowlick on a head whose joint is at (hx, hy) on screen, `r` its radius, `ang` the head's screen tilt in
 * degrees and `facing` the seat's. `lift` is 1 standing straight up, 0 pressed down for good into a flat bun on the
 * head, and above 1 the overshoot of the spring back up (BOING: taller, and leaning back). `hold` 0..1 is how far
 * the paw at (px, py) has pulled it down: its crest bent over to the paw, the lock stretched thin between - the
 * nearest a chibi arm, which ends at its own head's middle, can come to patting the top of it. `fur` is the
 * critter's own fur and `shade` that fur's shadow tone (the rig's cached ramp, so nothing is mixed here). The
 * glisten is the lick's: two milk-white glints on the side the rig's own light falls on.
 */
export function drawQuiff(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, ang: number, facing: number, lift: number, hold: number, px: number, py: number, fur: string, shade: string): void {
  const a = ang * DEG, ca = Math.cos(a), sa = Math.sin(a);
  const rx = ROOT_X * facing * r, ry = ROOT_Y * r;
  const bx = R(hx + rx * ca - ry * sa), by = R(hy + rx * sa + ry * ca);
  const up = Math.max(0, lift), k = Math.min(1, up);
  let h = up > 1 ? up : FLAT_H + (1 - FLAT_H) * up, w = FLAT_W + (1 - FLAT_W) * k, phi = a + facing * (1 - up) * FLAT_TIP * DEG;
  if (hold > 0) {
    // aim the crest at the paw: the turn that takes the crest's own direction onto the line to the paw, and the
    // stretch that makes it reach - blended in by `hold`, so the lock bends over as the paw arrives
    const dx = px - bx, dy = py - by, aim = Math.atan2(dx, -dy) - facing * Math.atan2(CREST_X, -CREST_Y);
    let turn = aim - phi;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    phi += turn * hold; h += (Math.hypot(dx, dy) / (CREST * r) - h) * hold; w += (HELD_W - w) * hold;
  }
  placeQuiff(QUIFF, QP, bx, by, r, w, h, phi, facing);
  placeQuiff(QUIFF_SH, QS, bx, by, r, w, h, phi, facing);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  quiffPath(ctx, QP, false); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  quiffPath(ctx, QP, true); ctx.fillStyle = fur; ctx.fill();
  // the shadow band, a colour change inside the quiff's own ink: clipped to it, no line of its own (ART_STYLE 0.2)
  ctx.save(); ctx.clip();
  quiffPath(ctx, QS, true); ctx.fillStyle = shade; ctx.fill();
  ctx.restore();
  if (up > 0.6) {
    placeQuiff(GLINT, QG, bx, by, r, w, h, phi, facing);
    ctx.fillStyle = MILK_HI;
    ctx.fillRect(R(QG[0]) - 1, R(QG[1]) - 1, 2, 3);
    ctx.fillRect(R(QG[2]) - 1, R(QG[3]) - 1, 2, 2);
  }
}

// ---------------------------------------------------------------- the lash
/**
 * The tail's lash, the frame it lands and a few after: a comic swoosh, two inked cream bands on the arc the tuft
 * swept, centred on the tail's root at (cx, cy) with radius `r`, from canvas angle `a0` back to `a1` (degrees,
 * swept anticlockwise - over the rump, down and across the milker). `k` 0..1 is its life: the bands draw in from
 * the trailing end toward the leading one, and thin, so the swoosh chases the tuft off the screen. The inner band
 * is a pixel narrower and never under the 2 px floor (ART_STYLE 0.8).
 */
export function drawLash(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, k: number): void {
  const from = (a0 + (a1 - a0) * k * 0.7) * DEG, to = a1 * DEG, w = k < 0.5 ? 4 : 3;
  cx = R(cx); cy = R(cy);
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const rr = r - i * 8, ww = i ? w - 1 : w;
    ctx.strokeStyle = INK; ctx.lineWidth = ww + 2;
    ctx.beginPath(); ctx.arc(cx, cy, rr, from, to, true); ctx.stroke();
    ctx.strokeStyle = UI.cream; ctx.lineWidth = ww;
    ctx.beginPath(); ctx.arc(cx, cy, rr, from, to, true); ctx.stroke();
  }
}
