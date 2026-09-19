// Hazel Holt's props (docs/CONTENT_ROADMAP.md section E): the four nut trees the crew shakes, drawn per frame because
// a shaken canopy SWAYS; the nuts in the canopy while the tree still has some; the squirrel that comes down with
// them one shake in six; and the crew's own beats, an AnimPlayer overlay on the shared table (the hive's pattern).
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood } from './food.ts';
import { F } from '../content/critters/common.ts';
import { HOLT, ROWS } from './backgrounds/holt.ts';

const R = Math.round, TAU = Math.PI * 2;

/** The trunk's height above its foot, and the canopy's radius about its crown. */
export const TRUNK_H = 60, CANOPY_R = 44;
const TRUNK_SH = mix(HOLT.trunk, HOLT.trunkDark, 0.6);
/** Where the nuts hang in a full canopy, about the crown: [dx, dy] pairs. */
const NUT_AT = Int8Array.of(-22, -6, -4, -26, 14, -14, 26, 4, -10, 10, 8, 18, -30, 14);

/**
 * A nut tree with its feet at (x, y): an inked trunk, the canopy as four overlapping blobs swayed `sway` px (the
 * shake), the nuts hanging in it in the visit's own glyph and hex while `full`, and a squirrel-sized hole in the
 * crown where the light comes through. `kind` 0/1 varies the blob layout so four trees are not one stamp.
 */
export function drawNutTree(ctx, x, y, kind, sway, full, icon, hex) {
  x = R(x); y = R(y);
  const cx = x + sway, cy = y - TRUNK_H, k = kind & 1;
  ctx.fillStyle = INK; ctx.fillRect(x - 6, cy - 4, 12, TRUNK_H + 4);
  ctx.fillStyle = HOLT.trunk; ctx.fillRect(x - 5, cy - 3, 10, TRUNK_H + 3);
  ctx.fillStyle = TRUNK_SH; ctx.fillRect(x + 1, cy - 3, 4, TRUNK_H + 3);
  ctx.fillStyle = INK; ctx.fillRect(x - 9, y - 4, 18, 4);   // the root flare
  // the canopy: ink first as one silhouette, then the blobs, then the lit caps
  const blobs = k ? [[-22, -4, 26], [20, -8, 28], [0, -26, 26], [4, 8, 22]] : [[-20, -10, 28], [22, -2, 26], [-2, -28, 24], [-6, 10, 22]];
  ctx.fillStyle = INK; for (const b of blobs) { ctx.beginPath(); ctx.arc(cx + b[0], cy + b[1], b[2] + 2, 0, TAU); ctx.fill(); }
  ctx.fillStyle = HOLT.canopy; for (const b of blobs) { ctx.beginPath(); ctx.arc(cx + b[0], cy + b[1], b[2], 0, TAU); ctx.fill(); }
  ctx.fillStyle = HOLT.canopyDark; for (const b of blobs) { ctx.beginPath(); ctx.arc(cx + b[0] + 4, cy + b[1] + 8, b[2] - 6, 0, TAU); ctx.fill(); }
  ctx.fillStyle = HOLT.canopyLit; for (const b of blobs) { ctx.beginPath(); ctx.arc(cx + b[0] - 6, cy + b[1] - 8, b[2] * 0.45, 0, TAU); ctx.fill(); }
  if (full) for (let i = 0; i < NUT_AT.length; i += 2) drawFood(ctx, icon, cx + NUT_AT[i], cy + NUT_AT[i + 1], 4, hex);
}

/** The gold sparkle over a tree that still has nuts in it: the coop's fresh-egg mark, same meaning. */
export function drawNutSpark(ctx, x, y, colour) {
  ctx.fillStyle = colour; ctx.fillRect(x - 1, y - 8, 2, 8); ctx.fillRect(x - 4, y - 5, 8, 2);
}

/** The squirrel: a rust body, a big curled tail behind, feet at (x, y), facing `facing`. About 16 px. */
export function drawSquirrel(ctx, x, y, facing) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-16, -6, -12, -18); ctx.quadraticCurveTo(-9, -24, -4, -18); ctx.quadraticCurveTo(-8, -12, -4, -6); ctx.closePath(); ctx.stroke(); ctx.fillStyle = '#A8623A'; ctx.fill();   // the tail
  ctx.beginPath(); ctx.ellipse(0, -6, 6, 5, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = '#B8703F'; ctx.fill();
  ctx.beginPath(); ctx.arc(5, -11, 4, 0, TAU); ctx.stroke(); ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(6, -12, 1, 1); ctx.fillRect(3, -16, 2, 3); ctx.fillRect(6, -16, 2, 3);   // the eye and the ears
  ctx.fillStyle = '#F1E4C8'; ctx.fillRect(-2, -5, 4, 3);   // the belly
  ctx.fillStyle = INK; ctx.fillRect(-4, -1, 3, 2); ctx.fillRect(2, -1, 3, 2);
  ctx.restore();
}

/** The crate on the litter fills with the party's nuts: up to CRATE_CAP drawn on top of it. */
export const CRATE_CAP = 8;
export function drawNutCrate(ctx, x, y, nuts, icon, hex) {
  const n = Math.min(CRATE_CAP, nuts);
  for (let i = 0; i < n; i++) drawFood(ctx, icon, x - 10 + (i % 4) * 7, y - 22 - ((i / 4) | 0) * 5, 4, hex);
}

/**
 * The crew's beats. `shake`: both paws on the trunk, the whole body rocking with the push, looping while the hold
 * runs (the basket hangs off the near arm as ever). `squirrelHat`: bolt upright with the arms out and `dazed`, the
 * squirrel on the head, then a shake of it off.
 */
export const HOLT_ANIMS = Object.freeze({
  shake: { loop: true, frames: [
    F(5, { armR: [96, 20], armL: [-100, -20], weapon: 90, legR: [14, 10], legL: [-14, 12], torso: 8, head: -6, root: [1, 0], face: 'grit' }, { ease: 'inout' }),
    F(5, { armR: [102, 24], armL: [-106, -24], weapon: 90, legR: [14, 10], legL: [-14, 12], torso: 14, head: -2, root: [3, 1], squash: 1.03, face: 'grit' }, { ease: 'inout' }),
  ] },
  squirrelHat: { loop: false, frames: [
    F(4, { armR: [34, 6], armL: [-34, 6], weapon: 90, torso: -2, head: -4, root: [0, 0], squash: 1.03, face: 'dazed' }, { ease: 'out' }),
    F(30, { armR: [36, 6], armL: [-36, 6], weapon: 90, torso: -2, head: -4, root: [1, 0], face: 'dazed' }),
    F(6, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'happy' }, { ease: 'inout' }),
  ] },
});
/** The trunk's foot row, for the screen. */
export const TREE_Y = ROWS.trunk;
