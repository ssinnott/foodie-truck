// Hazel Holt, painted once (docs/GDD.md section 5, docs/CONTENT_ROADMAP.md section E). A nut grove in the north-west
// corner of the map in the gold light of late September, side view: a low bank of hazel and walnut behind, four
// nut trees standing on the leaf litter at TREE_X (the screen draws those, because they SWAY when shaken), and the
// trodden band the crew walks in front of them.
//
// THREE layers, the hive's shape (no camera, no parallax):
//   far     rows 0..TRUNK_Y   sky, two hill tiers, the dark wood-edge the grove stands against, and the far litter
//   ground  the leaf litter with the walk band across it and the four scuffed shake spots under the trunks
//   near    a fringe of fallen leaves and grass along the bottom edge
// Nothing here animates. The scene's one saturated colour is SIGNAL.holt, the gold sparkle on a tree that still has
// nuts in it, and it appears nowhere in this file.
import { makeLayer, vGradient, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM, UI } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;
const SEED = 230;

/** The holt's muted constants: a September gold, the litter's russet, and the grove's deep green. */
export const HOLT = Object.freeze({
  skyTop: '#F6DDB8', skyLow: '#EFC48F', hillFar: '#A69A7C', hillNear: '#8E9468',
  wood: '#4E6040', woodDark: '#3C4A34', litter: '#A8865A', litterDark: '#8C6E48', leaf: '#C9A05C', leafDark: '#9A6B3A',
  trunk: '#6B4E3A', trunkDark: '#4A3628', canopy: '#6E8A4A', canopyDark: '#4F6838', canopyLit: '#93AB63',
  plum: PLUM.shadow,
});

/** Row bands (screen y): the trunks' feet, the ground layer's start, the walk band, the fringe. */
export const ROWS = Object.freeze({
  sky: 100, hills: 120, wood: 150, trunk: 200, ground: 200, band: 290, bandBot: 328, fringe: 332, bottom: VIEW_H,
});
/** Where the four nut trees stand (centre x of each trunk), 160 px apart; the crate of nuts past the last one. */
export const TREE_X = Object.freeze([90, 250, 410, 570]);
export const TREE_PITCH = 160;
export const CRATE_X = 620;

function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, ROWS.hills, [[0, HOLT.skyTop], [1, HOLT.skyLow]]);
  for (let x = 0; x < w; x += 4) {
    const far = ROWS.sky + 6 * Math.cos(x / 120) + 4 * Math.cos(x / 41 + 1), near = ROWS.hills - 8 + 5 * Math.cos(x / 80 + 2) + 3 * Math.cos(x / 29);
    g.fillStyle = HOLT.hillFar; g.fillRect(x, R(far), 4, h - R(far));
    g.fillStyle = HOLT.hillNear; g.fillRect(x, R(near), 4, h - R(near));
  }
  // the wood-edge the grove stands against: a scalloped crown of hazel, dark, its foot on the litter
  g.fillStyle = INK; g.fillRect(0, ROWS.wood - 2, w, h - ROWS.wood + 2);
  g.fillStyle = HOLT.woodDark; g.fillRect(0, ROWS.wood, w, h - ROWS.wood);
  g.fillStyle = HOLT.wood;
  for (let x = -6; x < w + 8; x += 14) { const rr = 12 + R(rnd() * 8); g.beginPath(); g.arc(x, ROWS.wood + 4 + R(rnd() * 6), rr, 0, TAU); g.fill(); }
  g.fillStyle = mix(HOLT.wood, HOLT.canopyLit, 0.35);
  for (let x = 2; x < w; x += 22) g.fillRect(x, ROWS.wood + 2 + R(rnd() * 4), 4, 2);
  // the far litter, hazed
  g.fillStyle = mix(HOLT.litter, HOLT.hillNear, 0.3); g.fillRect(0, h - 12, w, 12);
  g.fillStyle = INK; g.fillRect(0, h - 13, w, 1);
}

function paintGround(g, w, h, rnd) {
  const y0 = ROWS.ground;
  g.fillStyle = HOLT.litter; g.fillRect(0, 0, w, h);
  // fallen leaves, thicker at the back where the trees are
  for (let i = 0; i < 260; i++) {
    const x = R(rnd() * w), y = R(rnd() * rnd() * (ROWS.band - y0 - 6)) + 2;
    g.fillStyle = (i & 3) === 0 ? HOLT.leafDark : (i & 1) ? HOLT.leaf : HOLT.litterDark;
    g.fillRect(x, y, 3 + (i & 1), 2);
  }
  // the trodden band the crew walks in, and the scuffed shake spot under each trunk: its width is the reach
  const top = ROWS.band - y0, bot = ROWS.bandBot - y0, mid = R((top + bot) / 2);
  const trodden = mix(HOLT.litter, HOLT.plum, 0.3), edge = mix(HOLT.litter, trodden, 0.5);
  g.fillStyle = edge; g.fillRect(0, top - 5, w, bot - top + 10);
  g.fillStyle = trodden; g.fillRect(0, top - 2, w, bot - top + 4);
  for (let i = 0; i < TREE_X.length; i++) {
    const x = TREE_X[i];
    g.fillStyle = mix(trodden, HOLT.litterDark, 0.6); g.beginPath(); g.ellipse(x, mid, 18, 9, 0, 0, TAU); g.fill();
    g.fillStyle = HOLT.litterDark; g.beginPath(); g.ellipse(x, mid, 11, 6, 0, 0, TAU); g.fill();
  }
  // the crate of nuts at the right-hand end, on the litter behind the band
  g.fillStyle = INK; g.fillRect(CRATE_X - 15, ROWS.band - y0 - 26, 30, 18);
  g.fillStyle = UI.wood; g.fillRect(CRATE_X - 14, ROWS.band - y0 - 25, 28, 16);
  g.fillStyle = UI.woodDark; g.fillRect(CRATE_X - 14, ROWS.band - y0 - 17, 28, 2); g.fillRect(CRATE_X - 14, ROWS.band - y0 - 11, 28, 2);
}

function paintNear(g, w, h, rnd) {
  const base = h;
  for (let x = -4; x < w + 8; x += 6) {
    const tall = 6 + R(rnd() * 10);
    g.fillStyle = INK; g.fillRect(x - 1, base - tall - 1, 4, tall + 1);
    g.fillStyle = ((x >> 1) & 1) ? HOLT.canopyLit : mix(HOLT.canopyLit, HOLT.litter, 0.5); g.fillRect(x, base - tall, 2, tall);
    if ((x & 7) === 0) { g.fillStyle = INK; g.fillRect(x + 2, base - 5, 6, 4); g.fillStyle = HOLT.leaf; g.fillRect(x + 3, base - 4, 4, 2); }
  }
  g.fillStyle = INK; g.fillRect(0, h - 10, w, 2);
  g.fillStyle = mix(HOLT.litter, HOLT.plum, 0.4); g.fillRect(0, h - 8, w, 8);
}

let LAYERS = null;
/** Pre-render every layer once. Returns { far, ground, near }, each with the y the screen blits it at. */
export function holtLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.ground, paintFar, SEED), y: 0 },
    ground: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.ground, paintGround, SEED + 1), y: ROWS.ground },
    near: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.fringe, paintNear, SEED + 2), y: ROWS.fringe },
  };
  return LAYERS;
}
