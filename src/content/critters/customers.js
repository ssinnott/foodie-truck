// The customers (docs/GDD.md section 2): three village NPCs on the same chibi rig as the cast, drawn only as busts
// leaning into the serving hatch and eating on the results screen. Small, distinct silhouettes - an owl with short
// ear tufts, big whites and cheek discs; an otter with small ears and a thin tail; a goat with drooping ears, two
// short horns and a beard - in muted village palettes that clear the hatch's plum wall (#4A3038, L .22) by value.
// They wear the off-duty apron (critterRig(def, -1)): no seat, no player colour.
import { celPoly } from '../../art/shading.js';
import { critterBuild, makeCritterAnims, muzzleGeom } from './common.js';

const R = Math.round;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the owl
const OWL_FUR = '#9C7B5C', OWL_DARK = '#5A4030', OWL_CREAM = '#EAD9B8', OWL_WAISTCOAT = '#5E5470', BEAK = '#E2B44A';
/**
 * Facial discs: two cream ovals round the eye row, clipped inside the skull's own ink (a marking, no line), and the
 * beak: one small gold triangle at the muzzle tip in place of the nose.
 */
function owlMarkings(ctx, rig, pose, inf) {
  const r = inf.r, pal = rig.palette;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(pal.belly);
  ctx.beginPath(); ctx.ellipse(R(r * 0.45), R(-r * 0.25), R(r * 0.42), R(r * 0.5), 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(R(-r * 0.25), R(-r * 0.25), R(r * 0.42), R(r * 0.5), 0, 0, TAU); ctx.fill();
  ctx.restore();
  const g = muzzleGeom(r, rig.build.muzzle);
  celPoly(ctx, rig, [g.mx + g.rx - 5, g.my - 4, g.mx + g.rx + 3, g.my - 1, g.mx + g.rx - 5, g.my + 2], BEAK, 0.4, 0);
}
export const owl = {
  id: 'owl', name: 'MRS TAWNY', fullName: 'Mrs Tawny Hoot', role: 'THE REGULAR', species: 'owl', colour: OWL_FUR,
  build: critterBuild({
    palette: { skin: OWL_FUR, hair: OWL_DARK, belly: OWL_CREAM, secondary: OWL_FUR, shorts: OWL_WAISTCOAT, accent: BEAK, dark: '#2A1F1A' },
    proportions: { headR: 13, torsoW: 24, torsoH: 16, hip: 18, handR: 4.5, footL: 8 },
    ears: 'point', earTip: true, earPos: { near: { x: 0.5, y: -0.72 }, far: { x: -0.42, y: -0.7 } },
    face: { eyeY: -1 }, muzzle: 0.7, nose: false, markings: owlMarkings, tail: 'stub',
  }),
  anims: makeCritterAnims(),
};

// ---------------------------------------------------------------- the otter
const OTTER_FUR = '#6E5A48', OTTER_DARK = '#4A3A2C', OTTER_CREAM = '#D9C7A0', OTTER_SHORTS = '#3F6B7A';
export const otter = {
  id: 'otter', name: 'DIPPER', fullName: 'Dipper Brookside', role: 'THE HUNGRY REGULAR', species: 'otter', colour: OTTER_FUR,
  build: critterBuild({
    palette: { skin: OTTER_FUR, hair: OTTER_DARK, belly: OTTER_CREAM, secondary: OTTER_FUR, shorts: OTTER_SHORTS, accent: OTTER_CREAM, dark: '#2A1F1A' },
    proportions: { headR: 12, torsoW: 22, torsoH: 18, hip: 18, handR: 4.5, footL: 9 },
    ears: 'small', earPos: { near: { x: 0.55, y: -0.7 }, far: { x: -0.5, y: -0.66 } },
    muzzle: 1.1, tail: 'thin', tailHex: OTTER_FUR,   // whiskers omitted: nothing under 2 px
  }),
  anims: makeCritterAnims(),
};

// ---------------------------------------------------------------- the goat
const GOAT_FUR = '#D8CFC0', GOAT_DARK = '#8A7F70', GOAT_CREAM = '#F1E9DC', GOAT_SHORTS = '#6B4E3A', HORN = '#B8A48A';
/** The beard: one small inked polygon of dark fur hanging under the chin (head space, after the muzzle). */
function goatBeard(ctx, rig, pose, inf) {
  const r = inf.r, g = muzzleGeom(r, rig.build.muzzle), x = g.mx - 2, y = g.my + g.ry - 1;
  celPoly(ctx, rig, [x - 3, y, x + 3, y, x, y + 7], rig.palette.hair, 0.4, 0);
}
/** Two short horns on the crown: small inked polygons curving back, drawn with the head so they turn with it. */
const horns = { attach: 'head', draw(ctx, rig) {
  const r = rig.p.headR, y = R(-r * 0.86);
  celPoly(ctx, rig, [R(-r * 0.45), y, R(-r * 0.2), y, R(-r * 0.5), y - 8], HORN, 0.4, 0);
  celPoly(ctx, rig, [R(r * 0.1), y, R(r * 0.36), y, R(-r * 0.05), y - 8], HORN, 0.4, 0);
} };
export const goat = {
  id: 'goat', name: 'OLD BRAMBLE', fullName: 'Bramble Tuppence', role: 'THE PICKY ONE', species: 'goat', colour: GOAT_FUR,
  build: critterBuild({
    palette: { skin: GOAT_FUR, hair: GOAT_DARK, belly: GOAT_CREAM, secondary: GOAT_FUR, shorts: GOAT_SHORTS, accent: HORN, dark: '#2A1F1A' },
    proportions: { headR: 13, torsoW: 24, torsoH: 17, hip: 20, handR: 4.5, footL: 9 },
    ears: 'droop', earPos: { near: { x: 0.2, y: -0.55 }, far: { x: -0.4, y: -0.5 } },
    muzzle: 1.05, markings: goatBeard, tail: 'stub',
    accessories: [horns],
  }),
  anims: makeCritterAnims(),
};

export const CUSTOMERS = Object.freeze({ owl, otter, goat });
/** A customer by id (content/recipes.js ORDERS[].customer); an unknown id gets the owl, so a stale order still draws. */
export function getCustomer(id) { return CUSTOMERS[id] || owl; }
