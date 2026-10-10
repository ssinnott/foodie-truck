// Thyme Terrace's props (docs/CONTENT_ROADMAP.md section E): the herb clumps in their three kinds at their four
// stages (stubble, shoots, half, full) and grown WILD (the topiary's tell), the hedgehog asleep under one of them, the
// spiky ball it curls into when it is woken, and the crew's beats for the snip and both jokes.
import { INK } from './layers.ts';
import { foodTones } from './food.ts';
import { drawText } from '../engine/text.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { F } from '../content/critters/common.ts';

const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;
/** The chives' flower heads: the one place the bed is not green. */
const CHIVE_FLOWER = '#B08CFF';
/** Rosemary's woody stems. */
const ROSEMARY_WOOD = '#8C6A48';
/** The hedgehog: its spines, the spines' light tips, and its pale face. */
const HOG = '#6E5438', HOG_TIP = '#8C6E48', HOG_FACE = '#D9C39A';
/** The snore's little z: the paper cream every remark in the game is written on. */
const SNORE = '#FFF6E0';

/** Mint's leaf masses per stage, [dx, dy, r] from the clump's feet: one, three, five overlapping rounds. */
const MINT_BLOBS = [
  [],
  [[0, -8, 7]],
  [[-7, -10, 8], [7, -12, 8], [0, -18, 7]],
  [[-10, -12, 9], [10, -13, 9], [0, -22, 9], [-4, -30, 7], [6, -28, 6]],
];
/** Mint grown wild: the full clump's five rounds at a bit under twice the size, ten of them, 70 px across. */
const WILD_MINT = [[-22, -12, 11], [22, -13, 11], [0, -16, 12], [-14, -30, 12], [14, -31, 12], [0, -44, 12], [-22, -44, 8], [23, -45, 8], [-8, -58, 9], [9, -56, 8]];
/** How tall a wild clump stands (the sparkle and the stray sprigs are placed off it). */
export const WILD_H = 70;
/**
 * The stray sprigs a wild clump has sticking out everywhere: [dx from the centre, height up the clump as a fraction of
 * WILD_H, angle (degrees off straight up, + to the right), length]. Fixed, so a wild clump is always the same mess.
 */
const STRAYS = [
  [-31, 0.32, -72, 12], [31, 0.36, 74, 12], [-27, 0.68, -42, 14], [28, 0.7, 46, 13], [-10, 0.93, -16, 12],
  [12, 0.9, 22, 14], [1, 0.98, -2, 10], [-35, 0.12, -96, 10], [35, 0.15, 100, 10],
];

/**
 * A clump of the visit's herb with its feet at (x, y), `snips` 0..3 snips still on it (0 is stubble, 3 is full):
 * mint is a round bushy mass of paired leaves, chives a sheaf of tubes with purple heads, rosemary a woody bush of
 * upright sprigs. The stage sets the height, so a clump grows back visibly.
 */
export function drawClump(ctx, x, y, ing, snips) {
  x = R(x); y = R(y);
  const hex = INGREDIENTS[ing].hex, t = foodTones(hex), hgt = 6 + snips * 9;
  // the stubble every clump starts from
  ctx.fillStyle = INK; ctx.fillRect(x - 12, y - 5, 24, 5); ctx.fillStyle = t.sh; ctx.fillRect(x - 11, y - 4, 22, 3);
  if (snips === 0) return;
  if (ing === 'chive') {
    for (let k = -3; k <= 3; k++) {
      const bx = x + k * 4, bh = hgt + ((k & 1) ? 4 : 0);
      ctx.fillStyle = INK; ctx.fillRect(bx - 2, y - bh - 1, 4, bh + 1); ctx.fillStyle = t.base; ctx.fillRect(bx - 1, y - bh, 2, bh);
      if (snips === 3 && (k & 1)) drawBud(ctx, bx, y - bh - 2, 3, CHIVE_FLOWER);
    }
    return;
  }
  if (ing === 'rosemary') {
    for (let k = -2; k <= 2; k++) {
      const bx = x + k * 5, bh = hgt - Math.abs(k) * 3;
      ctx.fillStyle = INK; ctx.fillRect(bx - 2, y - bh - 1, 4, bh + 1); ctx.fillStyle = ROSEMARY_WOOD; ctx.fillRect(bx - 1, y - bh, 2, bh);
      ctx.fillStyle = t.base; for (let yy = y - bh + 2; yy < y - 4; yy += 4) { ctx.fillRect(bx - 5, yy, 4, 2); ctx.fillRect(bx + 1, yy + 1, 4, 2); }
    }
    return;
  }
  drawBlobs(ctx, x, y, MINT_BLOBS[snips], t);
}

/** Overlapping round leaf masses, ink first so the whole mass carries one outline. */
function drawBlobs(ctx, x, y, blobs, t) {
  ctx.fillStyle = INK; for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0], y + b[1], b[2] + 2, 0, TAU); ctx.fill(); }
  ctx.fillStyle = t.base; for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0], y + b[1], b[2], 0, TAU); ctx.fill(); }
  ctx.fillStyle = t.sh; for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0] + 2, y + b[1] + 3, b[2] - 3, 0, TAU); ctx.fill(); }
  ctx.fillStyle = t.hi; for (const b of blobs) ctx.fillRect(x + b[0] - 3, y + b[1] - 4, 2, 2);
}

/** A round inked bud of radius `r` (a chive's flower head, a stray sprig's leaf). */
function drawBud(ctx, x, y, r, hex) {
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, TAU); ctx.fill();
  ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/** An inked stalk from (x0, y0) to (x1, y1): a 4 px ink line under a 2 px line of `hex`. */
function stalk(ctx, x0, y0, x1, y1, hex) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = hex; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

/**
 * THE TOPIARY'S TELL: a clump grown WILD, feet at (x, y). The visit's herb at a bit under twice the full clump's size
 * (WILD_H tall, 70 px across) with stray sprigs sticking out of it everywhere, each one swaying on its own phase of
 * `f` (draw-side only), so from across the room it reads as the one clump nobody has been keeping in order.
 */
export function drawWildClump(ctx, x, y, ing, f) {
  x = R(x); y = R(y);
  const t = foodTones(INGREDIENTS[ing].hex);
  ctx.fillStyle = INK; ctx.fillRect(x - 18, y - 5, 36, 5); ctx.fillStyle = t.sh; ctx.fillRect(x - 17, y - 4, 34, 3);
  if (ing === 'chive') {
    // eleven tubes fanned out instead of seven standing, and every other one in flower
    for (let k = -5; k <= 5; k++) {
      const h = 50 + ((k & 1) ? 8 : 0) - Math.abs(k) * 2, tx = x + k * 6, ty = y - h;
      stalk(ctx, x + k * 3, y - 3, tx, ty, t.base);
      if (k & 1) drawBud(ctx, tx, ty - 2, 3, CHIVE_FLOWER);
    }
  } else if (ing === 'rosemary') {
    // nine woody sprigs fanned out, needles in pairs up each one
    for (let k = -4; k <= 4; k++) {
      const h = 58 - Math.abs(k) * 4, bx = x + k * 3, tx = x + k * 8, ty = y - h;
      stalk(ctx, bx, y - 3, tx, ty, ROSEMARY_WOOD);
      ctx.fillStyle = t.base;
      for (let s = 0.2; s < 0.95; s += 0.12) { const px = R(bx + (tx - bx) * s), py = R(y - 3 + (ty - y + 3) * s); ctx.fillRect(px - 5, py, 4, 2); ctx.fillRect(px + 1, py + 1, 4, 2); }
    }
  } else drawBlobs(ctx, x, y, WILD_MINT, t);
  // the strays: the sprigs sticking out every way, a pair of leaves on each tip (a bud on a chive)
  for (let i = 0; i < STRAYS.length; i++) {
    const s = STRAYS[i], a = (s[2] + Math.sin(f * 0.07 + i * 1.7) * 5) * DEG;
    const x0 = x + s[0], y0 = y - R(s[1] * WILD_H), x1 = R(x0 + Math.sin(a) * s[3]), y1 = R(y0 - Math.cos(a) * s[3]);
    stalk(ctx, x0, y0, x1, y1, ing === 'rosemary' ? ROSEMARY_WOOD : t.base);
    if (ing === 'chive') drawBud(ctx, x1, y1, 2, CHIVE_FLOWER); else leafPair(ctx, x1, y1, a, i & 1 ? t.hi : t.base);
  }
}

/** Two leaves opening off a sprig's tip at (x, y), the sprig pointing `a` radians off straight up: one each side, inked. */
function leafPair(ctx, x, y, a, hex) {
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? INK : hex;
    for (let side = -1; side <= 1; side += 2) {
      const b = a + side * 0.75, cx = x + Math.sin(b) * 3, cy = y - Math.cos(b) * 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, 4 - pass, 2.5 - pass, b - Math.PI / 2, 0, TAU); ctx.fill();
    }
  }
}

/**
 * The hedgehog: a brown spiky ball with a small pale face at one end, feet at (x, y); `curled` hides the face
 * (asleep). `glare` is the face it wakes up with: a brow pressed down over a bigger eye, aimed at whoever woke it.
 */
export function drawHedgehog(ctx, x, y, facing, curled, glare = false) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  ctx.fillStyle = INK;
  for (let k = -5; k <= 5; k += 2) ctx.fillRect(k - 1, -12 - (3 - Math.abs(k) / 2), 2, 4);   // the spikes
  ctx.beginPath(); ctx.ellipse(0, -6, 8, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = HOG; ctx.beginPath(); ctx.ellipse(0, -6, 7, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = HOG_TIP; for (let k = -4; k <= 4; k += 2) ctx.fillRect(k, -11 - (2 - Math.abs(k) / 3), 1, 3);
  if (!curled) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(12, -5); ctx.lineTo(5, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = HOG_FACE; ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(11, -5); ctx.lineTo(6, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(11, -6, 1, 1);
    ctx.fillRect(-4, -1, 2, 2); ctx.fillRect(2, -1, 2, 2);
    // the eye: a dot asleep on its feet, a 2 px eye under a slanted 2 px brow when it glares
    if (glare) { ctx.fillRect(7, -7, 2, 2); ctx.fillRect(5, -10, 3, 2); ctx.fillRect(7, -9, 3, 2); } else ctx.fillRect(7, -6, 1, 1);
  }
  ctx.restore();
}

/**
 * The hedgehog woken and curled up tight: a round ball of spines, centre 7 rows over (x, y), the spines turned by
 * `spin` (radians) so a bouncing ball reads as rolling. Twelve spines, each an inked wedge with a light tip.
 */
export function drawHogBall(ctx, x, y, spin) {
  x = R(x); y = R(y) - 7;
  for (let k = 0; k < 12; k++) {
    const a = spin + (k * TAU) / 12, c = Math.cos(a), s = Math.sin(a);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x + c * 12, y + s * 12); ctx.lineTo(x - s * 3 + c * 5, y + c * 3 + s * 5); ctx.lineTo(x + s * 3 + c * 5, y - c * 3 + s * 5); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = HOG; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = HOG_TIP;
  for (let k = 0; k < 6; k++) { const a = spin + (k * TAU) / 6; ctx.fillRect(R(x + Math.cos(a) * 4) - 1, R(y + Math.sin(a) * 4) - 1, 2, 2); }
}

/** The snore's Z: the game's own letter with its drop shadow, the way every float text is written. */
const SNORE_TEXT = { size: 1, color: SNORE, align: 'center' as const, shadow: true };

/**
 * The sleeper's tell for a sharp eye: a little Z drifting up off the curled hedgehog, one every 64 frames, rising 10
 * rows over 40 and then gone. Draw-only (`f` is the screen's frame); (x, y) is where it starts.
 */
export function drawSnore(ctx, x, y, f) {
  const k = f & 63;
  if (k < 40) drawText(ctx, 'Z', R(x + k / 10), R(y - k / 4), SNORE_TEXT);
}

/**
 * The crew's beats, on top of the shared table (the orchard's ORCHARD_ANIMS pattern). Every key sets `ease`; the
 * basket stays upright in the near paw through all of them (`weapon: 90`), because nothing scored ever leaves it.
 *   snip       a crouch to the clump with the far paw out and closing (the shears), the basket upright on the near arm.
 * THE TOPIARY:
 *   frenzy     the shears have run away with the critter: six 2-frame keys of the far paw whirling round, the body
 *              jittering, `grit` and `shout` by turns - a blur of arms, half hidden in the storm the screen draws over it.
 *   stepBack   backing away from the statue, still facing it, the head tipped right back to take it in.
 *   admire     stood looking up at it: `shout` (ooh) then `happy`.
 *   present    turned round to the room: the far paw stretched back up at the statue - ta-da - chest out.
 *   bow        the paw to the chest, then a bow from the hips with the eyes shut and the far paw swept up behind
 *              toward the statue (a flourish), the far foot stepped back, held, and back up.
 *   leapBite   Barley's: a crouch, a leap up at the statue's head with the mouth open, CHOMP (`closed`) at the top,
 *              and down; the screen lifts the whole rig to the head's height, so the keys carry no root height.
 *   munch      Barley's: chewing it over, eyes shut and a smile by turns.
 * THE HEDGEHOG:
 *   braced     the spiky ball is coming: leaning back from it, looking down at it, paws up, `shout`.
 *   leap       EEK: flung up with both arms high and the legs tucked (the screen lifts it and puts the fur on end).
 *   ouchHop    hopping on the far foot, the near knee up and both paws at the shin, `hurt`.
 */
export const TERRACE_ANIMS = Object.freeze({
  snip: { loop: false, frames: [
    F(4, { armR: [44, 36], armL: [60, 70], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1, face: 'happy' }, { ease: 'in' }),
    F(6, { armR: [60, 50], armL: [30, 40], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  frenzy: { loop: true, frames: [
    F(2, { armR: [40, 60], armL: [130, 30], weapon: 90, legR: [12, 8], legL: [-10, 14], torso: 12, head: 8, root: [-2, 0], squash: 1.05, face: 'grit' }, { ease: 'inout' }),
    F(2, { armR: [74, 30], armL: [20, 90], weapon: 90, legR: [-8, 16], legL: [14, 4], torso: 18, head: 12, root: [2, -2], stretch: 1.05, face: 'shout' }, { ease: 'inout' }),
    F(2, { armR: [52, 46], armL: [150, -20], weapon: 90, legR: [14, 4], legL: [-12, 16], torso: 8, head: 4, root: [-1, -1], squash: 1.04, face: 'grit' }, { ease: 'inout' }),
    F(2, { armR: [80, 24], armL: [60, 80], weapon: 90, legR: [-6, 14], legL: [10, 6], torso: 20, head: 14, root: [2, 0], stretch: 1.04, face: 'shout' }, { ease: 'inout' }),
    F(2, { armR: [46, 50], armL: [110, 50], weapon: 90, legR: [10, 10], legL: [-8, 12], torso: 10, head: 6, root: [-2, -2], squash: 1.05, face: 'grit' }, { ease: 'inout' }),
    F(2, { armR: [70, 36], armL: [-30, 60], weapon: 90, legR: [-10, 18], legL: [12, 4], torso: 16, head: 10, root: [1, 0], stretch: 1.05, face: 'shout' }, { ease: 'inout' }),
  ] },
  stepBack: { loop: true, frames: [
    F(5, { armR: [34, 20], armL: [-34, 16], weapon: 90, legR: [-20, 16], legL: [22, 6], torso: -6, head: -16, root: [0, 0], face: 'shout' }, { ease: 'inout' }),
    F(5, { armR: [34, 20], armL: [-34, 16], weapon: 90, legR: [-2, 4], legL: [4, 26], torso: -6, head: -16, root: [0, 1], squash: 1.03, face: 'shout' }, { ease: 'inout' }),
    F(5, { armR: [34, 20], armL: [-34, 16], weapon: 90, legR: [22, 6], legL: [-20, 16], torso: -6, head: -16, root: [0, 0], face: 'shout' }, { ease: 'inout' }),
    F(5, { armR: [34, 20], armL: [-34, 16], weapon: 90, legR: [4, 26], legL: [-2, 4], torso: -6, head: -16, root: [0, 1], squash: 1.03, face: 'shout' }, { ease: 'inout' }),
  ] },
  admire: { loop: true, frames: [
    F(12, { armR: [30, 24], armL: [-22, 10], weapon: 90, torso: -6, head: -18, root: [0, 0], face: 'shout' }, { ease: 'inout' }),
    F(12, { armR: [32, 22], armL: [-20, 12], weapon: 90, torso: -8, head: -20, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
  ] },
  present: { loop: false, frames: [
    F(6, { armR: [40, 30], armL: [-110, 30], weapon: 90, torso: -4, head: -6, root: [0, -1], face: 'happy' }, { ease: 'out' }),
    F(6, { armR: [44, 28], armL: [-122, 24], weapon: 90, torso: -6, head: -8, root: [0, -1], face: 'happy' }, { ease: 'inout' }),
  ] },
  bow: { loop: false, frames: [
    F(8, { armR: [30, 64], armL: [-70, 24], weapon: 90, legR: [6, 4], legL: [-8, 8], torso: 4, head: 2, root: [0, 0], face: 'happy' }, { ease: 'in' }),
    F(14, { armR: [22, 76], armL: [-150, 12], weapon: 90, legR: [-2, 6], legL: [-16, 14], torso: 36, head: 22, root: [-2, 1], face: 'closed' }, { ease: 'out' }),
    F(8, { armR: [24, 74], armL: [-146, 14], weapon: 90, legR: [-2, 6], legL: [-16, 14], torso: 34, head: 22, root: [-2, 1], face: 'closed' }, { ease: 'inout' }),
    F(8, { armR: [40, 30], armL: [-20, 10], weapon: 90, torso: 0, head: -4, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  leapBite: { loop: false, frames: [
    F(6, { armR: [30, 30], armL: [-30, 20], weapon: 90, legR: [24, 34], legL: [-16, 34], torso: 16, head: 6, root: [0, 4], squash: 1.12, face: 'happy' }, { ease: 'in' }),
    F(5, { armR: [60, 20], armL: [-60, 10], weapon: 90, legR: [30, -40], legL: [10, -30], torso: -6, head: -14, root: [0, 0], stretch: 1.1, face: 'shout' }, { ease: 'out' }),
    F(4, { armR: [64, 18], armL: [-64, 10], weapon: 90, legR: [36, -50], legL: [16, -40], torso: -4, head: -8, root: [0, 0], stretch: 1.06, face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [40, 20], armL: [-40, 14], weapon: 90, legR: [20, -20], legL: [6, -14], torso: 2, head: 0, root: [0, 0], stretch: 1.02, face: 'closed' }, { ease: 'in' }),
    F(6, { armR: [30, 24], armL: [-24, 12], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 12, head: 4, root: [0, 4], squash: 1.12, face: 'closed' }, { ease: 'out' }),
  ] },
  munch: { loop: true, frames: [
    F(7, { armR: [24, 30], armL: [-20, 12], weapon: 90, torso: 2, head: 6, root: [0, 0], face: 'closed' }, { ease: 'inout' }),
    F(7, { armR: [26, 28], armL: [-18, 12], weapon: 90, torso: 4, head: -2, root: [0, 1], squash: 1.02, face: 'happy' }, { ease: 'inout' }),
  ] },
  braced: { loop: false, frames: [
    F(6, { armR: [60, 60], armL: [40, 70], weapon: 90, legR: [-6, 10], legL: [-14, 12], torso: 10, head: 16, root: [-2, 0], face: 'shout' }, { ease: 'out' }),
    F(10, { armR: [64, 56], armL: [44, 66], weapon: 90, legR: [-8, 12], legL: [-16, 14], torso: 12, head: 20, root: [-3, 1], squash: 1.04, face: 'shout' }, { ease: 'inout' }),
  ] },
  leap: { loop: false, frames: [
    F(4, { armR: [140, 10], armL: [-160, 0], weapon: 90, legR: [40, -70], legL: [20, -60], torso: -10, head: -12, root: [0, 0], stretch: 1.14, face: 'shout' }, { ease: 'out' }),
    F(14, { armR: [146, 6], armL: [-166, -4], weapon: 90, legR: [50, -86], legL: [30, -76], torso: -8, head: -10, root: [0, 0], stretch: 1.1, face: 'shout' }, { ease: 'inout' }),
    F(4, { armR: [100, 20], armL: [-120, 10], weapon: 90, legR: [20, -30], legL: [6, -20], torso: 0, head: -4, root: [0, 0], stretch: 1.04, face: 'hurt' }, { ease: 'in' }),
  ] },
  ouchHop: { loop: true, frames: [
    F(5, { armR: [70, 40], armL: [50, 60], weapon: 90, legR: [70, -80], legL: [-4, 8], torso: 18, head: 10, root: [0, 0], squash: 1.06, face: 'hurt' }, { ease: 'in' }),
    F(5, { armR: [72, 38], armL: [52, 58], weapon: 90, legR: [74, -84], legL: [-10, 20], torso: 16, head: 8, root: [1, -5], stretch: 1.04, face: 'hurt' }, { ease: 'out' }),
  ] },
});
