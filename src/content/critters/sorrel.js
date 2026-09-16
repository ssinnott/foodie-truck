// SORREL the field mouse: the chef (CHOP / MIX). The smallest body in the cast under the tallest hat: a white toque
// with a blackberry band, two big round ears that flank the head, a thin rose tail that never settles, and a quick
// pattering walk on 3-frame keys. Lilac-grey fur, so the value ladder (not hue) carries every player colour.
import { critterBuild, makeCritterAnims, toque, F } from './common.js';

const FUR = '#E2DDEA', MARK = '#7A6A8C', ROSE = '#D9A2AE', TAIL = '#C96B7A', BLACKBERRY = '#4A3F6B';

export const build = critterBuild({
  palette: { skin: FUR, hair: MARK, belly: ROSE, secondary: FUR, shorts: BLACKBERRY, accent: TAIL, dark: '#2A1F1A' },
  // 48 px standing: short legs, a 16 px torso (14 left no apron under the chin), headR 11: the chef is the small one
  proportions: { headR: 11, torsoW: 20, torsoH: 16, hip: 16, upperArm: 7, lowerArm: 6, handR: 4, upperLeg: 5, lowerLeg: 4, footL: 8, footH: 4, armR: 3, legR: 3.5, hipX: 3 },
  // big round ears (0.5r) set out to the sides so the toque covers neither; the eyes sit a touch low to make room for the band
  ears: 'round', earR: 0.5, earPos: { near: { x: 0.72, y: -0.6 }, far: { x: -0.74, y: -0.55 } },
  face: { eyeY: 0 },
  muzzle: 1.05, tail: 'thin', tailHex: TAIL,
  accessories: [toque(BLACKBERRY)],
});

const KNIFE = { armL: [-12, 14] };
export const anims = makeCritterAnims({
  // a patter: eight 3-frame keys (24 frames) instead of four 7-frame ones, so the little legs churn
  walk: { loop: true, frames: [
    F(3, { legR: [28, 4], legL: [-20, 16], armR: [-16, 10], armL: [18, 16], torso: 4, root: [0, 0] }),
    F(3, { legR: [16, 16], legL: [-12, 10], armR: [-8, 10], armL: [10, 14], torso: 4, root: [0, 1], squash: 1.03 }),
    F(3, { legR: [2, 26], legL: [-2, 4], armR: [0, 12], armL: [2, 12], torso: 4, root: [0, 2], squash: 1.04 }),
    F(3, { legR: [-12, 20], legL: [12, 4], armR: [8, 14], armL: [-8, 10], torso: 4, root: [0, 1] }),
    F(3, { legR: [-20, 16], legL: [28, 4], armR: [18, 16], armL: [-16, 10], torso: 4, root: [0, 0] }),
    F(3, { legR: [-12, 10], legL: [16, 16], armR: [10, 14], armL: [-8, 10], torso: 4, root: [0, 1], squash: 1.03 }),
    F(3, { legR: [-2, 4], legL: [2, 26], armR: [2, 12], armL: [0, 12], torso: 4, root: [0, 2], squash: 1.04 }),
    F(3, { legR: [12, 4], legL: [-12, 20], armR: [-8, 10], armL: [8, 14], torso: 4, root: [0, 1] }),
  ] },
  // idle: the biggest head share of the cast, so the head does the breathing
  idle: { loop: true, frames: [
    F(26, { armR: [18, 12], armL: [-14, 12], torso: 2, head: -2, root: [0, 0] }),
    F(26, { armR: [22, 14], armL: [-10, 16], torso: 3, head: 3, root: [0, 1] }),
  ] },
  // the chef's chop: 'grit' on the wind-up, then eyes shut (the focus face) through the cut, and a smile after
  chop: { loop: false, frames: [
    F(5, { armR: [-110, -40], ...KNIFE, torso: -6, head: -4, weapon: -30, face: 'grit' }, { ease: 'in' }),
    F(3, { armR: [75, 30], ...KNIFE, torso: 14, head: 6, weapon: 20, root: [1, 1], face: 'closed' }, { ease: 'overshoot', smear: { from: -100, to: 60, a: 0.45 } }),
    F(4, { armR: [80, 34], ...KNIFE, torso: 16, head: 8, weapon: 20, root: [1, 2], squash: 1.04, face: 'closed' }),
    F(8, { armR: [20, 20], ...KNIFE, torso: 2, head: 0, weapon: 0, face: 'happy' }, { ease: 'inout' }),
  ] },
});

export const id = 'sorrel', name = 'SORREL', fullName = 'Sorrel Whiskerley', role = 'THE CHEF', species = 'mouse', colour = FUR;
export const bio = 'Runs the kitchen. Hits every beat.';
export default { id, name, fullName, role, species, colour, bio, build, anims };
