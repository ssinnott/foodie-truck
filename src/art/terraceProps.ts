// Thyme Terrace's props (docs/CONTENT_ROADMAP.md section E): the herb clumps in their three kinds at their four
// stages (stubble, shoots, half, full), the hedgehog asleep under one of them, and the crew's snip and eek beats.
import { INK } from './layers.ts';
import { drawFood, foodTones } from './food.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { F } from '../content/critters/common.ts';

const R = Math.round, TAU = Math.PI * 2;

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
      if (snips === 3 && (k & 1)) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, y - bh - 2, 4, 0, TAU); ctx.fill(); ctx.fillStyle = '#B08CFF'; ctx.beginPath(); ctx.arc(bx, y - bh - 2, 3, 0, TAU); ctx.fill(); }
    }
    return;
  }
  if (ing === 'rosemary') {
    for (let k = -2; k <= 2; k++) {
      const bx = x + k * 5, bh = hgt - Math.abs(k) * 3;
      ctx.fillStyle = INK; ctx.fillRect(bx - 2, y - bh - 1, 4, bh + 1); ctx.fillStyle = '#8C6A48'; ctx.fillRect(bx - 1, y - bh, 2, bh);
      ctx.fillStyle = t.base; for (let yy = y - bh + 2; yy < y - 4; yy += 4) { ctx.fillRect(bx - 5, yy, 4, 2); ctx.fillRect(bx + 1, yy + 1, 4, 2); }
    }
    return;
  }
  // mint: overlapping round leaf masses, ink first
  const blobs = snips === 1 ? [[0, -8, 7]] : snips === 2 ? [[-7, -10, 8], [7, -12, 8], [0, -18, 7]] : [[-10, -12, 9], [10, -13, 9], [0, -22, 9], [-4, -30, 7], [6, -28, 6]];
  ctx.fillStyle = INK; for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0], y + b[1], b[2] + 2, 0, TAU); ctx.fill(); }
  ctx.fillStyle = t.base; for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0], y + b[1], b[2], 0, TAU); ctx.fill(); }
  ctx.fillStyle = t.sh; for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0] + 2, y + b[1] + 3, b[2] - 3, 0, TAU); ctx.fill(); }
  ctx.fillStyle = t.hi; for (const b of blobs) ctx.fillRect(x + b[0] - 3, y + b[1] - 4, 2, 2);
}

/** The hedgehog: a brown spiky ball with a small pale face at one end, feet at (x, y); `curled` hides the face (asleep). */
export function drawHedgehog(ctx, x, y, facing, curled) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  ctx.fillStyle = INK;
  for (let k = -5; k <= 5; k += 2) ctx.fillRect(k - 1, -12 - (3 - Math.abs(k) / 2), 2, 4);   // the spikes
  ctx.beginPath(); ctx.ellipse(0, -6, 8, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6E5438'; ctx.beginPath(); ctx.ellipse(0, -6, 7, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8C6E48'; for (let k = -4; k <= 4; k += 2) ctx.fillRect(k, -11 - (2 - Math.abs(k) / 3), 1, 3);
  if (!curled) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(12, -5); ctx.lineTo(5, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#D9C39A'; ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(11, -5); ctx.lineTo(6, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(7, -6, 1, 1); ctx.fillRect(11, -6, 1, 1);
    ctx.fillRect(-4, -1, 2, 2); ctx.fillRect(2, -1, 2, 2);
  }
  ctx.restore();
}

/**
 * The crew's beats. `snip`: a crouch to the clump with the far paw out and closing (the shears), the basket upright
 * on the near arm. `eek`: a jump back from the clump, both arms up, `shout`, then settle.
 */
export const TERRACE_ANIMS = Object.freeze({
  snip: { loop: false, frames: [
    F(4, { armR: [44, 36], armL: [60, 70], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1, face: 'happy' }, { ease: 'in' }),
    F(6, { armR: [60, 50], armL: [30, 40], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  eek: { loop: false, frames: [
    F(4, { armR: [-40, -20], armL: [-50, -20], weapon: 90, legR: [30, -50], legL: [10, -30], torso: -6, head: -8, root: [-4, -14], stretch: 1.06, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [-30, -10], armL: [-40, -10], weapon: 90, torso: -4, head: -6, root: [-6, 0], squash: 1.06, face: 'shout' }, { ease: 'in' }),
    F(10, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [-6, 0], face: 'hurt' }, { ease: 'inout' }),
  ] },
});
