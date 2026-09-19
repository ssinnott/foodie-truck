// Tangle Wood's props (docs/CONTENT_ROADMAP.md section E): the bumps in the leaf litter a thing hides under, the
// thing itself once the leaves lift, the toadstool the joke is, and the crew's brush beat.
import { INK } from './layers.ts';
import { drawFood } from './food.ts';
import { F } from '../content/critters/common.ts';
import { WOOD } from './backgrounds/wood.ts';

const R = Math.round, TAU = Math.PI * 2;

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

/** The toadstool: a red cap with white spots on a pale stem, rising out of the litter as `lift` grows. */
export function drawToadstool(ctx, x, y, lift) {
  x = R(x); y = R(y);
  const up = R(lift * 10);
  ctx.fillStyle = INK; ctx.fillRect(x - 3, y - up - 2, 6, up + 2); ctx.fillStyle = '#F1E4C8'; ctx.fillRect(x - 2, y - up - 1, 4, up + 1);
  ctx.beginPath(); ctx.moveTo(x - 9, y - up); ctx.quadraticCurveTo(x, y - up - 16, x + 9, y - up); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = '#A65A48'; ctx.fill();
  ctx.fillStyle = '#F1E4C8'; ctx.fillRect(x - 5, y - up - 6, 2, 2); ctx.fillRect(x + 1, y - up - 9, 2, 2); ctx.fillRect(x + 4, y - up - 4, 2, 2);
}

/**
 * The crew's beat: `brush`, a crouch to the litter with the far paw sweeping the leaves aside (the basket stays
 * upright on the near arm, the coop's pluck rule), and `pooh`, a step back from the toadstool with the nose wrinkled.
 */
export const WOOD_ANIMS = Object.freeze({
  brush: { loop: false, frames: [
    F(5, { armR: [44, 36], armL: [70, 60], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1, face: 'happy' }, { ease: 'in' }),
    F(7, { armR: [60, 50], armL: [30, 40], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  pooh: { loop: false, frames: [
    F(4, { armR: [50, 40], armL: [-60, -30], weapon: 90, torso: -10, head: -10, root: [-3, 0], face: 'hurt' }, { ease: 'out' }),
    F(12, { armR: [50, 40], armL: [-70, -40], weapon: 90, torso: -12, head: -12, root: [-4, 0], face: 'hurt' }),
    F(4, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'happy' }, { ease: 'inout' }),
  ] },
});
