// CHICORY the brown hare: the driver (DRIVE / HONK). Dark peat fur under a cream muzzle, 16 px upright ears with
// dark tips that lag on a chain, a tweed flat cap with driving goggles pushed up on it, a cream scarf whose loose
// end streams behind on a chain, long feet and a lope of a walk. The gag from the judge panel: the goggles slide
// down onto the eye row on every `hurt` key (the one allowed eye-row intrusion, docs/ART_STYLE.md section 12).
import { celBall } from '../../art/shading.js';
import { FACE } from '../../art/poses.js';
import { critterBuild, makeCritterAnims, cap, scarf, scarfTail, hatY, F } from './common.js';

const R = Math.round;
const TAU = Math.PI * 2;
const FUR = '#6B5241', PEAT = '#3A2B22', CREAM = '#EBD9B4', TWEED = '#9A7A5A', LENS = '#B8C4C9';
/** The cast table's #B99A6A shorts measured 0.01 against P2's marmalade apron (art-check), so a darker tweed. */
const SHORTS = '#8C6E48';

/**
 * Driving goggles (head space): two r4 rings joined by a bridge, parked on the cap above the hairline. On a `hurt`
 * key they drop onto the eye row (a stepped offset, never a lerp): the eyes sit inside the rings.
 */
const goggles = { attach: 'head', draw(ctx, rig, pose) {
  const r = rig.p.headR, fo = rig.faceOpts || {};
  const hurt = (pose.face | 0) === FACE.hurt;
  const y = hurt ? R(-r * 0.42) + (fo.eyeY || 0) + 3 : hatY(rig) - 5;
  const nx = R(r * 0.32) + 3, fx = R(-r * 0.36) + 3;
  if (!rig.override) { ctx.fillStyle = rig.col(PEAT); ctx.fillRect(fx, y - 1, nx - fx, 2); }   // the bridge, 2 px
  celBall(ctx, rig, fx, y, 4, PEAT, false);
  celBall(ctx, rig, nx, y, 4, PEAT, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(LENS);
  ctx.beginPath(); ctx.arc(fx, y, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(nx, y, 2, 0, TAU); ctx.fill();
} };

export const build = critterBuild({
  palette: { skin: FUR, hair: PEAT, belly: CREAM, secondary: FUR, shorts: SHORTS, accent: TWEED, dark: PEAT },
  proportions: { headR: 13, torsoW: 24, torsoH: 16, hip: 20, handR: 4.5, footL: 11 },
  ears: 'long', earTip: true,
  face: { eyeY: 1 },    // the eyes sit a pixel low so the cap has a hairline to rest on
  muzzle: 1.1, tail: 'puff',
  accessories: [scarfTail(CREAM), cap(TWEED), goggles, scarf(CREAM)],
});

export const anims = makeCritterAnims({
  // a lope: a deep bob with a stretch on the pass keys; the ears trail on their chain a beat behind
  walk: { loop: true, frames: [
    F(7, { legR: [30, 4], legL: [-26, 22], armR: [-20, 10], armL: [22, 18], torso: 6, head: -2, root: [0, -1], stretch: 1.03 }),
    F(7, { legR: [6, 30], legL: [-2, 4], armR: [0, 12], armL: [2, 12], torso: 6, head: 2, root: [0, 2], squash: 1.04 }),
    F(7, { legR: [-26, 22], legL: [30, 4], armR: [22, 18], armL: [-20, 10], torso: 6, head: -2, root: [0, -1], stretch: 1.03 }),
    F(7, { legR: [-2, 4], legL: [6, 30], armR: [2, 12], armL: [0, 12], torso: 6, head: 2, root: [0, 2], squash: 1.04 }),
  ] },
  // the signature: a two-key pop on the bulb horn, squashed on the squeeze
  honk: { loop: false, frames: [
    F(4, { armR: [60, 60], armL: [-10, 14], torso: -4, head: -6, weapon: 80, root: [0, -1], stretch: 1.04, face: 'happy' }, { ease: 'in' }),
    F(8, { armR: [70, 70], armL: [-8, 14], torso: 4, head: 6, weapon: 80, root: [0, 2], squash: 1.12, face: 'shout' }, { ease: 'out' }),
  ] },
});

export const id = 'chicory', name = 'CHICORY', fullName = 'Chicory Lepworth', role = 'THE DRIVER', species = 'hare', colour = FUR;
export const bio = 'Reads the ticket. Drives the truck. Honks.';
export default { id, name, fullName, role, species, colour, bio, build, anims };
