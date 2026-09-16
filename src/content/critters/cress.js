// CRESS the pond frog: the forager (GATHER / CAST). A wide head with two eye domes on the crown that carry the
// pupils, a wide mouth and no nose, long legs on big feet, a straw sunhat with a plum band perched above the
// domes, and a dark-willow basket slung on the far hip in the back layer. The frog is the second dark fur, so the
// aprons clear it by value (.28+) like the hare's.
import { celPath, pathRR, band } from '../../art/shading.js';
import { critterBuild, makeCritterAnims, F, PLUM_STRAP } from './common.js';

const R = Math.round;
const SKIN = '#3F7D3B', MOSS = '#2A5A2A', CREAM = '#CFE3A6', WATER = '#2F5F7A', STRAW = '#E2B44A', DEEP = '#23412A';
/** Baskets are dark willow with cream weave lines (docs/ART_STYLE.md section 1), never wicker. */
const WILLOW = '#6B4E3A', WILLOW_LINE = '#C9B58E';

/**
 * Straw sunhat (head space): sits ABOVE the eye domes, not on the hairline, because the domes are the eyes and a
 * brim through them would break the eye row. A wide 4 px inked brim, a low crown in one path, and a plum band.
 */
const sunhat = { attach: 'head', draw(ctx, rig) {
  const r = rig.p.headR, y = R(-r * 1.28), bw = R(r * 1.25), cw = R(r * 0.7), ch = R(r * 0.42);
  // the crown's flat bottom closes INSIDE the band (y - 2), not at y - ch - 1: two pixels of wall used to show
  // between crown and band and the hat read as two stacked objects
  ctx.beginPath(); ctx.ellipse(0, y - 2, cw, ch + 4, 0, Math.PI, 0); ctx.closePath();
  celPath(ctx, rig, STRAW, 0, y - ch, cw, 0.36, 0.3);
  band(ctx, rig, -cw - 1, y - 4, cw * 2 + 2, 4, PLUM_STRAP);
  band(ctx, rig, -bw, y - 1, bw * 2, 4, STRAW, 2);
} };

/** The foraging basket, slung on the far hip (hip space, back layer): a willow block with one cream weave line. */
const hipBasket = { attach: 'hip', layer: 'back', draw(ctx, rig) {
  const hw = R(rig.p.hip / 2), x = -hw - 7, y = -7;
  pathRR(ctx, x, y, 12, 10, 3);
  celPath(ctx, rig, WILLOW, x + 6, y + 5, 6, 0.36, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(WILLOW_LINE); ctx.fillRect(x + 2, y + 4, 8, 2);
} };

export const build = critterBuild({
  palette: { skin: SKIN, hair: MOSS, belly: CREAM, secondary: SKIN, shorts: WATER, accent: STRAW, dark: DEEP },
  // long legs and big feet; the torso is 16 (not the table's squat 12) because a 13 px head hid a 12 px torso's apron
  proportions: { headR: 13, torsoW: 26, torsoH: 16, hip: 20, handR: 4.5, upperLeg: 7, lowerLeg: 6, footL: 11, legR: 4 },
  ears: 'dome', face: { domeEyes: true, wideMouth: true }, muzzle: 1.2, nose: false, tail: 'none',
  accessories: [hipBasket, sunhat],
});

export const anims = makeCritterAnims({
  // the frog is the only rig whose legs are longer than its arms: on the shared REST the paw parked in the foot
  // row and the paw + both feet read as three identical green discs. The elbow rides ~10 deg higher here, which
  // puts the paw at hip height and leaves the two feet alone at the bottom of the silhouette.
  idle: { loop: true, frames: [
    F(26, { armR: [40, 6], armL: [-30, 8], torso: 2, root: [0, 0] }),
    F(26, { armR: [44, 8], armL: [-26, 10], torso: 4, root: [0, 1], head: 2 }),
  ] },
  // long legs: a higher step and a lower crouch than the shared walk
  walk: { loop: true, frames: [
    F(7, { legR: [34, 8], legL: [-28, 26], armR: [-18, 10], armL: [20, 18], torso: 6, root: [0, 0] }),
    F(7, { legR: [6, 34], legL: [-2, 6], armR: [0, 12], armL: [2, 12], torso: 6, root: [0, 2], squash: 1.04 }),
    F(7, { legR: [-28, 26], legL: [34, 8], armR: [20, 18], armL: [-18, 10], torso: 6, root: [0, 0] }),
    F(7, { legR: [-2, 6], legL: [6, 34], armR: [2, 12], armL: [0, 12], torso: 6, root: [0, 2], squash: 1.04 }),
  ] },
  // the signature: a rod whip. Wind-up with the rod back over the shoulder, a snap forward with a smear, a hold, a return.
  // weapon rot is tuned so the rod ends level and forward (hand 150 - rot 60 = 90): a rod at 120 crossed the eye domes.
  cast: { loop: false, frames: [
    // Wind-up: the paw drops BEHIND the hip and the rod stands up over the shoulder on weapon rot, drawn in the
    // back layer (weaponBack) so neither the rod nor the paw crosses the hat brim or the eye domes. Up at
    // [-120, -30] the paw sat on the skull and the rod lay across the brim for the whole 8 frames.
    F(8, { armR: [-45, -25], armL: [30, 40], torso: -10, head: -6, weapon: 80, weaponBack: 1, root: [-2, 1], legR: [10, 6], legL: [-14, 12], face: 'grit' }, { ease: 'in' }),
    // the snap: the arm comes through level and the rod finishes just above the horizontal (hand 102 - rot 4),
    // which keeps the paw in front of the chin instead of on the muzzle the deep torso lean brings down to meet it
    F(4, { armR: [88, 0], armL: [40, 50], torso: 14, head: 4, weapon: 4, root: [2, 1], legR: [20, 4], legL: [-20, 20], squash: 1.04, face: 'shout' }, { ease: 'overshoot', smear: { from: -40, to: 45, a: 0.4 } }),
    F(10, { armR: [84, 6], armL: [40, 50], torso: 10, head: 0, weapon: 6, root: [2, 1], legR: [20, 4], legL: [-20, 20], face: 'happy' }),
    F(10, { armR: [60, 40], armL: [10, 30], torso: 2, head: 0, weapon: 60, root: [0, 0], face: 'happy' }, { ease: 'inout' }),
  ] },
});

export const id = 'cress', name = 'CRESS', fullName = 'Cress Paddock', role = 'THE FORAGER', species = 'frog', colour = SKIN;
export const bio = 'Finds what the order is missing. Fast.';
export default { id, name, fullName, role, species, colour, bio, build, anims };
