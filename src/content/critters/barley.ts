// BARLEY the Suffolk sheep: the hungry one (EAT / CARRY). The canonical reference rig (docs/ART_STYLE.md section 1):
// the widest body in the cast under a scalloped wool cap, a dark face with the eye whites always on, small drooping
// ears, hooves, and a brass bell on a plum strap that swings on a one-segment chain. Everything here is a
// parameter or a hook on the shared chibi rig in ./common.js; the file owns only what is sheep.
import { celPath, celBall, tones, pathRR, band } from '../../lib/art/shading.ts';
import { getChain } from '../../lib/art/secondary.ts';
import { rad } from '../../lib/engine/math.ts';
import { critterBuild, makeCritterAnims, muzzleGeom, F, PLUM_STRAP } from './common.ts';

const R = Math.round;
const TAU = Math.PI * 2;
const WOOL = '#F1E4C8', FACE = '#3F3A48', MUZZLE = '#8C7A86', HOOF = '#2E2A33', BRASS = '#E2B44A';

/**
 * Dark face: an oval of `hair` over the front of the skull (its back edge at x = -0.3r at eye height, curving in
 * above and below), clipped inside the skull's own ink so it is a marking with no line of its own; then the muzzle
 * repainted in `belly` on top so it stays the light patch the mouth sits on. Runs after makeHead's muzzle pass,
 * which is why the muzzle is drawn twice: the second one is the one that shows.
 */
function darkFace(ctx, rig, pose, inf) {
  const r = inf.r, pal = rig.palette;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 0.5, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(pal.hair); ctx.beginPath(); ctx.ellipse(R(r * 0.65), 0, R(r * 0.95), R(r * 0.9), 0, 0, TAU); ctx.fill();
  ctx.restore();
  const g = muzzleGeom(r, rig.build.muzzle);
  ctx.save(); ctx.beginPath(); ctx.ellipse(g.mx, g.my, g.rx, g.ry, 0, 0, TAU); ctx.clip();
  const lt = tones(rig, pal.belly);
  ctx.fillStyle = lt.base; ctx.fillRect(g.mx - g.rx, g.my - g.ry, g.rx * 2, g.ry * 2);
  ctx.fillStyle = lt.sh; ctx.fillRect(g.mx - g.rx, g.my + R(g.ry * 0.4), g.rx * 2, g.ry);
  ctx.restore();
}

/** Wool ball centres around the crown, as fractions of headR: back-low to front-top, ending above the brow row. */
const CAP = [[-1.0, -0.15], [-0.85, -0.55], [-0.55, -0.85], [-0.2, -1.0], [0.15, -1.02], [0.5, -0.92]];
/**
 * The wool cap (parts.hair hook, head space): six balls appended into ONE path, stroked once and filled once, so
 * the outline scallops around the mass and no line crosses inside it. Sits over the top of the dark face.
 */
function woolCap(ctx, rig, pose, inf) {
  const r = inf.r, br = R(r * 0.33);
  ctx.beginPath();
  for (let i = 0; i < CAP.length; i++) { const x = R(r * CAP[i][0]), y = R(r * CAP[i][1]); ctx.moveTo(x + br, y); ctx.arc(x, y, br, 0, TAU); }
  celPath(ctx, rig, rig.palette.skin, R(-r * 0.25), R(-r * 0.75), r, 0.3, 0.32);
}

/**
 * The bell strap: a 4 px plum band across the collar, drawn with the torso so the chin can overlap it. It runs from
 * the FAR shoulder to the centre line only: the full-width band used to lie across both of the apron's straps and
 * paint the player's colour plum for four of its seven pixels.
 */
function strap(ctx, rig, pose, inf) {
  const H = inf.h, hw = R(inf.w / 2);
  band(ctx, rig, -R(hw * 0.68), -H + 1, R(hw * 0.75), 4, PLUM_STRAP);
}
/** The brass bell (front torso accessory): a 7x6 ball hanging below the collar on a one-segment chain. */
const bell = { attach: 'torso', layer: 'front', draw(ctx, rig) {
  const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2);
  const ch = getChain(rig, 'bell', 1, { joint: 'torso', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 3, maxAng: 40 });
  // hung from the FAR end of the strap. On the near side it sat exactly where the near arm now hangs (the arm
  // roots moved out to the shoulder) and the bell read as a brass lump on a forearm; dead centre it cut the
  // player's apron in half. Off to the far shoulder it hangs clear of both, and the bib's block stays whole.
  ctx.save(); ctx.translate(-R(hw * 0.5), -H + 3); ctx.rotate(rad(ch.ang[0]));
  band(ctx, rig, -2, 0, 4, 4, PLUM_STRAP);                       // the loop, 4 px: an inked band any thinner is all ink
  pathRR(ctx, -4, 3, 7, 6, 3);
  celPath(ctx, rig, BRASS, -1, 6, 4, 0.4, 0);
  if (!rig.override) { ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(-2, 7, 2, 2); }   // the clapper slit
  ctx.restore();
} };

export const build = critterBuild({
  palette: { skin: WOOL, hair: FACE, belly: MUZZLE, secondary: FACE, shorts: FACE, accent: BRASS, dark: HOOF },
  // shoulderX 9 = 0.33 torsoW: the widest body in the cast carries the widest apron, so its arms root furthest out
  proportions: { headR: 15, torsoW: 28, torsoH: 20, hip: 22, handR: 5, footL: 9, armR: 4, legR: 4, shoulderX: 9 },
  // the flaps hang beside the jaw, where the wool cap stops, not behind the skull: from -0.5r back they never cleared the head
  ears: 'droop', earSlot: 'hair', earPos: { near: { x: -0.25, y: -0.15 }, far: { x: -0.5, y: -0.05 } },
  face: { whitesAlways: true },   // the whites stay on through blinks and smiles: ink arcs vanish on the dark face
  muzzle: 0.95, markings: darkFace, tail: 'stub', boots: HOOF,
  chest: strap,
  parts: { hair: woolCap },
  accessories: [bell],
});

export const anims = makeCritterAnims({
  // the heaviest bob in the cast: a sheep walks like a sack of wool
  walk: { loop: true, frames: [
    F(7, { legR: [26, 6], legL: [-22, 18], armR: [-8, 10], armL: [10, 16], torso: 5, root: [0, 0] }),
    F(7, { legR: [4, 28], legL: [-2, 4], armR: [10, 12], armL: [-4, 12], torso: 6, root: [0, 2], squash: 1.05 }),
    F(7, { legR: [-22, 18], legL: [26, 6], armR: [26, 14], armL: [-26, 10], torso: 5, root: [0, 0] }),
    F(7, { legR: [-2, 4], legL: [4, 28], armR: [10, 12], armL: [-4, 12], torso: 6, root: [0, 2], squash: 1.05 }),
  ] },
  // the signature: creeping up on the ingredients, leaning back with the eyes shut as if that made him invisible
  sneak: { loop: true, frames: [
    F(9, { legR: [30, 10], legL: [-16, 20], armR: [30, 40], armL: [-24, 30], torso: -8, head: 6, root: [0, 1], face: 'closed' }),
    F(9, { legR: [8, 30], legL: [-4, 6], armR: [34, 42], armL: [-20, 28], torso: -8, head: 8, root: [0, 3], squash: 1.04, face: 'closed' }),
    F(9, { legR: [-16, 20], legL: [30, 10], armR: [30, 40], armL: [-24, 30], torso: -8, head: 6, root: [0, 1], face: 'closed' }),
    F(9, { legR: [-4, 6], legL: [8, 30], armR: [34, 42], armL: [-20, 28], torso: -8, head: 8, root: [0, 3], squash: 1.04, face: 'closed' }),
  ] },
});

export const id = 'barley', name = 'BARLEY', fullName = 'Barley Fold', role = 'THE HUNGRY ONE', species = 'sheep', colour = WOOL;
export const bio = 'Eats the ingredients. Carries the rest.';
export default { id, name, fullName, role, species, colour, bio, build, anims };
