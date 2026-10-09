// Hazel Holt's props (docs/CONTENT_ROADMAP.md section E): the four nut trees the crew shakes, drawn per frame because
// a shaken canopy SWAYS - and an overloaded one SAGS, which is the avalanche's tell; the nuts in the canopy while
// the tree still has some; and the crew's own beats, an AnimPlayer overlay on the shared table (the hive's
// pattern), the jokes' poses with them. The squirrel and the rest of the jokes' art are in art/holtGags.ts.
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
/** The canopy's four blobs per layout, [dx, dy, r] about the crown: the left, the right, the top, the bottom. */
const BLOBS = [
  Int8Array.of(-20, -10, 28, 22, -2, 26, -2, -28, 24, -6, 10, 22),
  Int8Array.of(-22, -4, 26, 20, -8, 28, 0, -26, 26, 4, 8, 22),
];
/**
 * An overloaded crop (the avalanche's tell): as many nuts again in the canopy, [dx, dy] about the crown before
 * the sag, and three clusters of two hanging just under the leaves' edge on their stalks, per layout - [dx, dy]
 * with the dy before the sag, measured off the blobs so each pair hangs clear of the ink at SAG.
 */
const NUT_EXTRA = Int8Array.of(-14, -16, 4, -8, 20, -4, -24, 4, 16, 10, -2, 22, 30, 12, -18, 20, 0, -16);
const DANGLE = [Int8Array.of(-36, 26, 38, 30, 14, 30), Int8Array.of(-36, 29, 38, 26, 14, 31)];
/**
 * The droop of an overloaded canopy at rest, in rows (the screen adds the creak's dip and the wind-up's pull): the
 * side blobs hang all of it lower and a third of it further out, the bottom blob half of it, the crown a third -
 * so the tree's round head turns into a heavy, drooping umbrella.
 */
export const SAG = 12;

/** How far a canopy point sags with the crop: the sides by all of it, the middle by a third. */
function sagAt(dx, sag) { const k = dx < 0 ? -dx : dx; return k >= 24 ? sag : R(sag * (0.33 + 0.67 * k / 24)); }

/**
 * A nut tree with its feet at (x, y): an inked trunk, the canopy as four overlapping blobs swayed `sway` px (the
 * shake), the nuts hanging in it in the visit's own glyph and hex while `full`, and a squirrel-sized hole in the
 * crown where the light comes through. `kind` 0/1 varies the blob layout so four trees are not one stamp.
 * `sag` > 0 is an OVERLOADED tree: the side blobs droop that many rows (and spread out a third of it), the bottom
 * half as far and the crown a third, and a second crop hangs in it - the extra nuts in the leaves and three
 * clusters dangling below the leaves on their stalks - so the tree that will avalanche can be picked out across the
 * room. A plain tree (`sag` 0) draws exactly as it always has.
 */
export function drawNutTree(ctx, x, y, kind, sway, full, icon, hex, sag = 0) {
  x = R(x); y = R(y);
  const cx = x + sway, cy = y - TRUNK_H, b = BLOBS[kind & 1], out = R(sag / 3), half = R(sag / 2);
  ctx.fillStyle = INK; ctx.fillRect(x - 6, cy - 4, 12, TRUNK_H + 4);
  ctx.fillStyle = HOLT.trunk; ctx.fillRect(x - 5, cy - 3, 10, TRUNK_H + 3);
  ctx.fillStyle = TRUNK_SH; ctx.fillRect(x + 1, cy - 3, 4, TRUNK_H + 3);
  ctx.fillStyle = INK; ctx.fillRect(x - 9, y - 4, 18, 4);   // the root flare
  // the clusters dangle UNDER the leaves: their stalks run up into the canopy, which is drawn over them
  if (sag > 0 && full) {
    const d = DANGLE[kind & 1];
    for (let i = 0; i < d.length; i += 2) {
      const dx = cx + d[i], ny = cy + d[i + 1] + sag;
      ctx.fillStyle = INK; ctx.fillRect(dx - 1, ny - 12, 2, 9);
      drawFood(ctx, icon, dx - 3, ny, 4, hex); drawFood(ctx, icon, dx + 4, ny + 1, 4, hex);
    }
  }
  // the canopy: ink first as one silhouette, then the blobs, then the lit caps
  for (let pass = 0; pass < 4; pass++) {
    ctx.fillStyle = pass === 0 ? INK : pass === 1 ? HOLT.canopy : pass === 2 ? HOLT.canopyDark : HOLT.canopyLit;
    for (let i = 0; i < 12; i += 3) {
      // the side blobs (0, 1) hang the whole sag and spread; the crown (2) a third of it; the bottom (3) half
      const side = i < 6, bx = cx + b[i] + (side ? (b[i] < 0 ? -out : out) : 0), by = cy + b[i + 1] + (side ? sag : i === 6 ? out : half), r = b[i + 2];
      ctx.beginPath();
      if (pass === 0) ctx.arc(bx, by, r + 2, 0, TAU);
      else if (pass === 1) ctx.arc(bx, by, r, 0, TAU);
      else if (pass === 2) ctx.arc(bx + 4, by + 8, r - 6, 0, TAU);
      else ctx.arc(bx - 6, by - 8, r * 0.45, 0, TAU);
      ctx.fill();
    }
  }
  if (!full) return;
  for (let i = 0; i < NUT_AT.length; i += 2) drawFood(ctx, icon, cx + NUT_AT[i], cy + NUT_AT[i + 1] + sagAt(NUT_AT[i], sag), 4, hex);
  if (sag > 0) for (let i = 0; i < NUT_EXTRA.length; i += 2) drawFood(ctx, icon, cx + NUT_EXTRA[i], cy + NUT_EXTRA[i + 1] + sagAt(NUT_EXTRA[i], sag), 4, hex);
}

/** The gold sparkle over a tree that still has nuts in it: the coop's fresh-egg mark, same meaning. */
export function drawNutSpark(ctx, x, y, colour) {
  ctx.fillStyle = colour; ctx.fillRect(x - 1, y - 8, 2, 8); ctx.fillRect(x - 4, y - 5, 8, 2);
}

/** The crate on the litter fills with the party's nuts: up to CRATE_CAP drawn on top of it. */
export const CRATE_CAP = 8;
export function drawNutCrate(ctx, x, y, nuts, icon, hex) {
  const n = Math.min(CRATE_CAP, nuts);
  for (let i = 0; i < n; i++) drawFood(ctx, icon, x - 10 + (i % 4) * 7, y - 22 - ((i / 4) | 0) * 5, 4, hex);
}

/**
 * The crew's beats, every one with the basket still in the near paw (`weapon: 90`, the shared CARRY's): nothing a
 * joke does takes the nuts away. `shake`: both paws on the trunk, the whole body rocking with the push, looping
 * while the hold runs. The jokes' (game/screens/holtGags.ts plays them, phase by phase):
 *   shakeLook    the avalanche's wind-up: still shaking, but leaning back off the trunk with the head tipped right
 *                back to stare up at the groaning branches, worried brows; the rock quickens;
 *   lookUp       the crop lets go (or the squirrel tumbles out): paws off the trunk, a step back, staring straight
 *                up with the mouth open;
 *   buried       under the heap: crouched and squashed with the paws (and the basket) tucked in, eyes shut,
 *                wriggling now and then - so the ears that poke out of the heap twitch;
 *   popUp        out of the heap with a jump, arms flung up, and down on its feet dazed;
 *   dizzy        stood bolt upright with the arms out, swaying slowly: a nut balanced on top, or a bonk to sleep off;
 *   shakeOff     a wet dog's shiver, two frames a side, eyes shut;
 *   squirrelHat  the squirrel scolding from the head: frozen stiff, eyes rolled up at it, wincing, a tremble;
 *   bonked       BONK: driven down into the knees, the head ducked, then up into the sway;
 *   flipNut      Barley eats the evidence: a dip, the head snapped back to flip the nut up off it, mouth open;
 *   chomp        ...and it landed in it: the chew, eyes shut, bobbing.
 * Raised arms go up FORWARD with the elbow open and the far arm back (docs/ART_STYLE.md section 0.7).
 */
export const HOLT_ANIMS = Object.freeze({
  shake: { loop: true, frames: [
    F(5, { armR: [96, 20], armL: [-100, -20], weapon: 90, legR: [14, 10], legL: [-14, 12], torso: 8, head: -6, root: [1, 0], face: 'grit' }, { ease: 'inout' }),
    F(5, { armR: [102, 24], armL: [-106, -24], weapon: 90, legR: [14, 10], legL: [-14, 12], torso: 14, head: -2, root: [3, 1], squash: 1.03, face: 'grit' }, { ease: 'inout' }),
  ] },
  shakeLook: { loop: true, frames: [
    F(4, { armR: [96, 20], armL: [-100, -20], weapon: 90, legR: [14, 10], legL: [-14, 12], torso: -2, head: -26, root: [0, 0], face: 'hurt' }, { ease: 'inout' }),
    F(4, { armR: [100, 22], armL: [-104, -22], weapon: 90, legR: [14, 10], legL: [-14, 12], torso: 2, head: -22, root: [1, 1], squash: 1.02, face: 'hurt' }, { ease: 'inout' }),
  ] },
  lookUp: { loop: false, frames: [
    F(3, { armR: [50, 30], armL: [-50, 20], weapon: 90, legR: [10, 4], legL: [-12, 6], torso: -8, head: -28, root: [-2, 0], squash: 1.04, face: 'shout' }, { ease: 'out' }),
    F(30, { armR: [56, 34], armL: [-56, 24], weapon: 90, legR: [10, 4], legL: [-12, 6], torso: -10, head: -30, root: [-2, -1], face: 'shout' }),
  ] },
  buried: { loop: true, frames: [
    F(12, { armR: [40, 70], armL: [-30, 40], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 6, head: 6, root: [0, 4], squash: 1.1, face: 'closed' }),
    F(6, { armR: [42, 70], armL: [-28, 40], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 2, head: -6, root: [1, 4], squash: 1.1, face: 'closed' }, { ease: 'inout' }),
  ] },
  popUp: { loop: false, frames: [
    F(4, { armR: [120, 20], armL: [-140, -20], weapon: 90, legR: [20, -30], legL: [-10, -20], torso: -4, head: -8, root: [0, -10], stretch: 1.08, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [40, 10], armL: [-40, 10], weapon: 90, legR: [6, 0], legL: [-6, 0], torso: 0, head: 0, root: [0, 2], squash: 1.1, face: 'dazed' }, { ease: 'in' }),
  ] },
  dizzy: { loop: true, frames: [
    F(12, { armR: [38, 8], armL: [-38, 8], weapon: 90, legR: [6, 0], legL: [-6, 0], torso: -4, head: -6, root: [-1, 0], face: 'dazed' }, { ease: 'inout' }),
    F(12, { armR: [42, 8], armL: [-34, 8], weapon: 90, legR: [6, 0], legL: [-6, 0], torso: 4, head: 2, root: [1, 0], face: 'dazed' }, { ease: 'inout' }),
  ] },
  shakeOff: { loop: true, frames: [
    F(2, { armR: [30, 8], armL: [-30, 8], weapon: 90, torso: -6, head: -10, root: [-2, 0], face: 'closed' }),
    F(2, { armR: [34, 8], armL: [-26, 8], weapon: 90, torso: 6, head: 10, root: [2, 0], face: 'closed' }),
  ] },
  squirrelHat: { loop: true, frames: [
    F(3, { armR: [30, 6], armL: [-30, 6], weapon: 90, torso: -2, head: -12, root: [0, 0], squash: 1.03, face: 'hurt' }),
    F(3, { armR: [32, 6], armL: [-32, 6], weapon: 90, torso: -2, head: -12, root: [1, 0], squash: 1.03, face: 'hurt' }),
  ] },
  bonked: { loop: false, frames: [
    F(3, { armR: [50, 20], armL: [-50, 20], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 8, head: 16, root: [0, 4], squash: 1.12, face: 'dazed' }, { ease: 'out' }),
    F(8, { armR: [40, 10], armL: [-40, 10], weapon: 90, legR: [6, 0], legL: [-6, 0], torso: -2, head: -4, root: [0, 0], face: 'dazed' }, { ease: 'inout' }),
  ] },
  flipNut: { loop: false, frames: [
    F(4, { armR: [38, 8], armL: [-38, 8], weapon: 90, torso: 4, head: 14, root: [0, 1], face: 'neutral' }, { ease: 'in' }),
    F(3, { armR: [44, 10], armL: [-44, 10], weapon: 90, torso: -6, head: -26, root: [0, -2], stretch: 1.04, face: 'shout' }, { ease: 'out' }),
    F(30, { armR: [44, 10], armL: [-44, 10], weapon: 90, torso: -4, head: -22, root: [0, -1], face: 'shout' }),
  ] },
  chomp: { loop: true, frames: [
    F(4, { armR: [30, 10], armL: [-24, 8], weapon: 90, torso: 2, head: 6, root: [0, 1], squash: 1.04, face: 'closed' }),
    F(4, { armR: [30, 10], armL: [-24, 8], weapon: 90, torso: 0, head: 0, root: [0, 0], face: 'closed' }),
  ] },
});
/** The trunk's foot row, for the screen. */
export const TREE_Y = ROWS.trunk;
