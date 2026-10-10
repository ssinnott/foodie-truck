// Tangle Wood's props (docs/CONTENT_ROADMAP.md section E): the bumps in the leaf litter a thing hides under, the
// thing itself once the leaves lift, the scene's two jokes - the toadstool and the vine - and the crew's beats.
//
// The jokes' furniture is drawn here and timed by the screen (screens/wood.ts): the curl of vine lying beside a bump
// (the tangle's TELL), the vine itself (creeping out of the litter to an ankle, then hanging from the canopy with a
// critter on the end of it), the cuff it makes round the ankle, the leaves a critter gets up wearing, and the stink
// lines off a critter that has had a noseful of toadstool. Every mark is inked (docs/ART_STYLE.md section 0.2): the
// vine is the near layer's fern stroke (ink under, green over), a leaf is the litter's own two browns in a line.
import { INK } from './layers.ts';
import { drawFood } from './food.ts';
import { F } from '../content/critters/common.ts';
import { WOOD } from './backgrounds/wood.ts';
import type { PoseSpec } from '../lib/art/poses.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * THE TANGLE's beats, in frames. The screen runs the joke as one countdown made of these (screens/wood.ts
 * TANGLE_TOTAL) and the anims below are built of the same numbers, so a key can never drift off the beat it plays:
 *   CREEP_FRAMES   the wind-up: crouched at the bump while the vine slides out of the litter and round the near
 *                  ankle (CREEP_REACH), then tugging at it;
 *   DANGLE_FRAMES  yanked up the vine (YANK_FRAMES) and swinging on it upside down;
 *   FALL_FRAMES    the vine lets go: down into the litter head first, and over onto the back;
 *   LIE_FRAMES, GETUP_FRAMES, STAND_FRAMES  on its back with leaves on it, up, and stood there blinking;
 *   SHAKE_FRAMES   shaking the leaves off.
 */
export const CREEP_FRAMES = 38, CREEP_REACH = 12, DANGLE_FRAMES = 52, YANK_FRAMES = 4, FALL_FRAMES = 8, LIE_FRAMES = 16, GETUP_FRAMES = 10, STAND_FRAMES = 10, SHAKE_FRAMES = 20;
/**
 * At the top of the vine the feet hang this many rows over the critter's own lane: enough that the tallest of the
 * cast (Rowan, 76 rows and the tallest toque there is) still hangs clear of the litter, head down.
 */
export const DANGLE_LIFT = 100;
/** The swing on the vine: the feet's first arc either side of the hang point, and the lean that keeps the body in line with the vine. */
const SWING_X = 18, SWING_ROT = 7;
/** Lying on its back after the FLUMP, the feet sit this many rows up: the body's half-width, so its back is on the litter. */
const BACK_Y = 11;
/** THE TOADSTOOL's beats: the two sniffs at it (the wind-up), then the stink, the stagger back and the shake of the head. */
export const SNIFF_FRAMES = 20, POOH_FRAMES = 52;

/**
 * A bump in the leaves with the thing under it lifting: `lift` 0..1 raises the leaves and shows the ingredient's
 * glyph beneath. At 0 it is a mound of litter and nothing else; a showing bump wears the sparkle the screen draws.
 */
export function drawBump(ctx, x, y, lift, icon, hex) {
  x = R(x); y = R(y);
  const up = R(lift * 8);
  // the mound of litter, then the thing rising out of the top of it, then a leaf or two still on its shoulders
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = WOOD.litterDark; ctx.beginPath(); ctx.ellipse(x, y, 12, 4, 0, 0, TAU); ctx.fill();
  if (lift > 0) drawFood(ctx, icon, x, y - 2 - up, 6, hex);
  ctx.fillStyle = WOOD.leafPale; ctx.fillRect(x - 9, y - 3, 5, 2); ctx.fillRect(x + 4, y - 2, 4, 2);
  ctx.fillStyle = WOOD.leaf; ctx.fillRect(x - 3, y - 1 - (up >> 1), 4, 2);
}

/** How far a brushed toadstool goes down into the litter as it sinks back: the whole cap and a row to spare. */
const SINK_DEPTH = 18;

/**
 * The toadstool: a red cap with white spots on a pale stem, rising out of the litter as `lift` grows. `sink` (0..1)
 * takes a brushed one back down INTO the litter - clipped at the ground row, so it goes under rather than shrinking.
 */
export function drawToadstool(ctx, x, y, lift, sink = 0) {
  x = R(x); y = R(y);
  if (sink > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - 12, y - 32, 24, 34); ctx.clip(); y += R(sink * SINK_DEPTH); }
  const up = R(lift * 10);
  ctx.fillStyle = INK; ctx.fillRect(x - 3, y - up - 2, 6, up + 2); ctx.fillStyle = '#F1E4C8'; ctx.fillRect(x - 2, y - up - 1, 4, up + 1);
  ctx.beginPath(); ctx.moveTo(x - 9, y - up); ctx.quadraticCurveTo(x, y - up - 16, x + 9, y - up); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = '#A65A48'; ctx.fill();
  ctx.fillStyle = '#F1E4C8'; ctx.fillRect(x - 5, y - up - 6, 2, 2); ctx.fillRect(x + 1, y - up - 9, 2, 2); ctx.fillRect(x + 4, y - up - 4, 2, 2);
  if (sink > 0) ctx.restore();
}

// ---------------------------------------------------------------- the vine
/** The vine is the near layer's fern stroke: an ink line VINE_INK wide with a green core VINE_CORE wide down it. */
const VINE_INK = 4, VINE_CORE = 2;

/** Stroke the path just built as vine: the ink line, then the green down the middle of it. */
function strokeVine(ctx) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = VINE_INK; ctx.stroke();
  ctx.strokeStyle = WOOD.fernLit; ctx.lineWidth = VINE_CORE; ctx.stroke();
}

/** One inked leaf, `rx` by `ry`, turned `rot` radians, in `hex`: a vine's own green or a litter leaf's brown. */
export function drawLeaf(ctx, x, y, rot, hex, rx = 4, ry = 2) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, rot, 0, TAU); ctx.fill();
  ctx.fillStyle = hex; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill();
}

/**
 * THE TELL: a curl of vine lying in the litter at (x, y) - a tail along the leaves, a hook rolled up at its end and
 * one leaf on it. The only green on the floor of the wood, and small: a sharp eye sees it. Every 64 frames the hook
 * twitches up a row for a few frames (index-hashed with `seed`, so two curls never twitch as one): it is alive.
 */
export function drawVineCurl(ctx, x, y, f, seed) {
  x = R(x); y = R(y);
  const lift = ((f + seed * 23) & 63) < 6 ? 1 : 0;
  ctx.beginPath(); ctx.moveTo(x - 11, y + 2); ctx.quadraticCurveTo(x - 4, y + 3, x + 1, y + 1 - lift);
  ctx.arc(x + 1, y - 3 - lift, 4, Math.PI / 2, Math.PI * 1.05, true);
  strokeVine(ctx);
  drawLeaf(ctx, x - 6, y - 1, -0.7, WOOD.fernLit, 3, 2);
}

/**
 * The vine sliding out of the litter for an ankle: from its curl at (x0, y0) toward (x1, y1), `k` (0..1) of the way
 * there, wriggling as it goes (`f` any frame counter). It comes down the litter to the feet's row first and along
 * it, hugging the ground, so it shows between and behind the feet; drawn BEHIND the critter, whose near foot is in
 * front of it (the cuff the vine closes into is drawn over the leg, drawVineCuff).
 */
export function drawVineCreep(ctx, x0, y0, x1, y1, k, f) {
  const cx = x0 + Math.sin(f * 0.7) * 3, cy = y1;
  const u = 1 - k, ex = u * u * x0 + 2 * u * k * cx + k * k * x1, ey = u * u * y0 + 2 * u * k * cy + k * k * y1;
  // the part of the curve travelled so far: the same quadratic cut at k (de Casteljau's control point for [0, k])
  ctx.beginPath(); ctx.moveTo(R(x0), R(y0)); ctx.quadraticCurveTo(R(x0 + (cx - x0) * k), R(y0 + (cy - y0) * k), R(ex), R(ey));
  strokeVine(ctx);
}

/**
 * The vine taut from the canopy at (x0, y0) down to an ankle at (x1, y1), bowed `bow` px off the straight line (the
 * swing's lag), with a leaf on it every quarter of the way, sides alternating. The screen draws it over a critter
 * hanging on it (upside down the feet are the top of the critter, so the vine crosses nothing but the foot it holds)
 * and behind one it has let go of, as it whips back up into the canopy.
 */
export function drawVineHang(ctx, x0, y0, x1, y1, bow) {
  const cx = (x0 + x1) / 2 + bow, cy = (y0 + y1) / 2;
  ctx.beginPath(); ctx.moveTo(R(x0), R(y0)); ctx.quadraticCurveTo(R(cx), R(cy), R(x1), R(y1));
  strokeVine(ctx);
  for (let i = 1; i < 4; i++) {
    const t = i / 4, u = 1 - t, side = i & 1 ? 1 : -1;
    drawLeaf(ctx, u * u * x0 + 2 * u * t * cx + t * t * x1 + side * 4, u * u * y0 + 2 * u * t * cy + t * t * y1, side * 0.8, WOOD.fernLit, 3, 2);
  }
}

/** The loop the vine makes round an ankle, drawn over the leg: a green ring with its ink. */
export function drawVineCuff(ctx, x, y) {
  ctx.beginPath(); ctx.ellipse(R(x), R(y), 4, 3, 0.4, 0, TAU);
  strokeVine(ctx);
}

/** A wobbly stink line rising `h` rows from (x, y), in `hex` with its ink; `phase` walks the wobble up it. */
export function drawStinkLine(ctx, x, y, h, phase, hex) {
  ctx.beginPath(); ctx.moveTo(R(x), R(y));
  for (let k = 3; k <= h; k += 3) ctx.lineTo(R(x + Math.sin(k * 0.45 + phase) * 2.5), R(y - k));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = VINE_INK; ctx.stroke();
  ctx.strokeStyle = hex; ctx.lineWidth = VINE_CORE; ctx.stroke();
}

// ---------------------------------------------------------------- the crew's beats
/** The brush crouch: down to the litter with the far paw sweeping the leaves and the basket upright on the near arm. */
const CROUCH: PoseSpec = { armR: [44, 36], armL: [70, 60], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1 };
/** The basket carried at rest (content/critters/common.ts CARRY), for the keys that hand back to it. */
const CARRIED: PoseSpec = { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 0] };
/** Tugging at a foot the vine has hold of: the near foot stays where the vine holds it and the rest of the critter leans off it. */
const TUG_A: PoseSpec = { armR: [70, 30], armL: [-70, -20], weapon: 90, legR: [22, 8], legL: [-12, 6], torso: -10, head: -4, root: [-2, 1], face: 'grit' };
const TUG_B: PoseSpec = { armR: [56, 44], armL: [-40, -10], weapon: 90, legR: [26, 2], legL: [-4, 10], torso: -2, head: 6, root: [-1, 2], face: 'grit' };
/**
 * Hanging by the near ankle, the root turned over (180) about the feet: the near leg straight up the vine, the far
 * one folded across it, both arms flung out past the head, which is where gravity has them now - the near arm up
 * FORWARD (ART_STYLE 0.7: the near paw lands beside the muzzle, never on it), the far arm up behind. The ears and
 * the apron come over with the root and hang the right way for a critter upside down without a key of their own.
 */
const HANG: PoseSpec = { legR: [0, 0], legL: [40, -95], armR: [128, 26], armL: [-140, -20], torso: 0, head: 0 };
const HANG_B: PoseSpec = { ...HANG, armR: [140, 14], armL: [-128, -30], legL: [34, -88] };
/**
 * On its back in the litter (the root at 270: feet to one side, head to the other, belly up), legs and arms in the
 * air like a beetle turned over: both arms FORWARD, which is up now, the far one a little behind the near so the two
 * paws read apart (back, which is down now, would push the far paw into the ground).
 */
const LIE: PoseSpec = { legR: [70, 30], legL: [52, 46], armR: [104, 30], armL: [126, 14], torso: 0, head: -6 };
/** Stood up again with no basket in the paw and leaves all over: both arms a little out, blinking. */
const DAZED: PoseSpec = { armR: [26, 10], armL: [-26, 10], legR: [6, 0], legL: [-6, 0], torso: -2, head: -4 };
/** One side of the shake: everything the other way on the next key, eyes screwed shut. */
const SHAKE_A: PoseSpec = { armR: [42, 24], armL: [-42, 24], legR: [8, 0], legL: [-8, 0], torso: 10, head: 16, root: [1, 0], squash: 1.04, face: 'closed' };
const SHAKE_B: PoseSpec = { ...SHAKE_A, torso: -10, head: -16, root: [-1, 0], squash: 1 };
/** Reeling back from the toadstool, the near paw out in front of the nose fanning the air (the basket swings under it). */
const RECOIL: PoseSpec = { armR: [100, 20], armL: [-60, -30], weapon: 90, legR: [-12, 4], legL: [12, 4], torso: -16, head: -18, root: [0, -1], face: 'hurt' };
const FAN_A: PoseSpec = { ...RECOIL, armR: [114, 6], legR: [-18, 10], legL: [6, 2], torso: -12, head: -14, root: [0, -2] };
const FAN_B: PoseSpec = { ...RECOIL, armR: [86, 34], legR: [6, 2], legL: [-18, 10], torso: -14, head: -18, root: [0, 0] };

/**
 * The crew's beats in the wood, on top of the shared table (the coop's COOP_ANIMS pattern):
 *   brush     a crouch to the litter, the far paw sweeping the leaves aside (the coop's pluck rule: the basket
 *             stays upright on the near arm);
 *   sniff     THE TOADSTOOL's wind-up: down at it, a sniff with the eyes shut, a deeper one, and a beat;
 *   pooh      ...its bang and look: reeling back, the near paw fanning the air in front of the nose while the
 *             critter staggers back (the screen walks the seat), then a shake of the head and the basket carried
 *             again;
 *   snagged   THE TANGLE's wind-up: the brush crouch, a startled look down as the vine closes, and tugging;
 *   dangle    yanked up the vine (YANK_FRAMES, turning over on the way) and swinging on it head down, each arc
 *             smaller, the lean matching the vine so the body hangs in line with it;
 *   flump     the vine lets go: the fall, over onto the back in the litter (a squash on the landing), lying there,
 *             up again (the root turned on round to 360, which is upright), and stood blinking;
 *   shakeOff  the leaves shaken off, eyes screwed shut, and the smile back.
 */
export const WOOD_ANIMS = Object.freeze({
  brush: { loop: false, frames: [
    F(5, { ...CROUCH, face: 'happy' }, { ease: 'in' }),
    F(7, { armR: [60, 50], armL: [30, 40], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  sniff: { loop: false, frames: [
    F(4, { ...CROUCH, face: 'neutral' }, { ease: 'in' }),
    F(4, { ...CROUCH, torso: 18, head: 18, root: [1, 5], face: 'closed' }),
    F(3, { ...CROUCH, torso: 12, head: 6, face: 'neutral' }),
    F(4, { ...CROUCH, torso: 20, head: 22, root: [2, 6], face: 'closed' }),
    F(SNIFF_FRAMES - 15, { ...CROUCH, torso: 12, head: 2, face: 'neutral' }),
  ] },
  pooh: { loop: false, frames: [
    F(4, RECOIL, { ease: 'out' }),
    F(5, FAN_A), F(5, FAN_B), F(5, FAN_A), F(5, FAN_B), F(5, FAN_A), F(5, FAN_B),
    F(8, { ...CARRIED, head: 12, face: 'closed' }, { ease: 'inout' }),
    F(8, { ...CARRIED, head: -10, face: 'closed' }, { ease: 'inout' }),
    F(POOH_FRAMES - 50, { ...CARRIED, face: 'happy' }),
  ] },
  snagged: { loop: false, frames: [
    F(4, { ...CROUCH, face: 'happy' }, { ease: 'in' }),
    F(CREEP_REACH - 4, { ...CROUCH, torso: 18, head: 22, face: 'shout' }),
    F(6, TUG_A), F(6, TUG_B), F(6, TUG_A),
    F(CREEP_FRAMES - CREEP_REACH - 18, TUG_B),
  ] },
  dangle: { loop: false, frames: [
    F(YANK_FRAMES, TUG_B, { ease: 'out' }),
    F(8, { ...HANG, root: [0, -DANGLE_LIFT - 12, 180], face: 'shout' }, { ease: 'out' }),
    F(12, { ...HANG_B, root: [SWING_X, -DANGLE_LIFT, 180 - SWING_ROT], face: 'hurt' }, { ease: 'inout' }),
    F(11, { ...HANG, root: [-SWING_X * 0.7, -DANGLE_LIFT, 180 + SWING_ROT * 0.7], face: 'hurt' }, { ease: 'inout' }),
    F(9, { ...HANG_B, root: [SWING_X * 0.4, -DANGLE_LIFT, 180 - SWING_ROT * 0.4], face: 'hurt' }, { ease: 'inout' }),
    F(DANGLE_FRAMES - YANK_FRAMES - 40, { ...HANG, root: [0, -DANGLE_LIFT, 180], face: 'hurt' }),
  ] },
  flump: { loop: false, frames: [
    F(FALL_FRAMES, { ...HANG, root: [0, -DANGLE_LIFT, 180], face: 'shout' }, { ease: 'in' }),
    F(3, { ...LIE, root: [0, -BACK_Y, 270], squash: 1.1, face: 'dazed' }, { ease: 'out' }),
    F(LIE_FRAMES - 3, { ...LIE, root: [0, -BACK_Y, 270], face: 'dazed' }),
    F(GETUP_FRAMES, { ...LIE, legR: [40, 40], legL: [30, 50], root: [0, -BACK_Y, 270], face: 'dazed' }, { ease: 'inout' }),
    F(STAND_FRAMES, { ...DAZED, root: [0, 0, 360], face: 'dazed' }),
  ] },
  shakeOff: { loop: false, frames: [
    F(3, SHAKE_A), F(3, SHAKE_B), F(3, SHAKE_A), F(3, SHAKE_B), F(3, SHAKE_A),
    F(SHAKE_FRAMES - 15, { ...DAZED, torso: 2, head: 0, face: 'happy' }, { ease: 'out' }),
  ] },
});
