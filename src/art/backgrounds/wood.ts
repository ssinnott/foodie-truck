// Tangle Wood, painted once (docs/CONTENT_ROADMAP.md section E). A dark wood in the north-east corner: tall trunks
// close together against a dim green, the light coming down in a few shafts, a deep floor of leaf litter the crew
// works along, and ferns along the bottom edge.
//   far     rows 0..ground   the dim sky through the trunks, the trunks themselves, the shafts of light
//   ground  the leaf litter with the walk band across it
//   near    ferns and dead leaves along the bottom edge
// Nothing here animates. The scene's one saturated colour is SIGNAL.wood, the gold sparkle on a bump that is
// showing, and it appears nowhere in this file.
import { makeLayer, vGradient, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;
const SEED = 240;

export const WOOD = Object.freeze({
  skyTop: '#B9C49A', skyLow: '#8FA07A', deep: '#3C4A34', trunk: '#4A3A30', trunkLit: '#6B5646', canopy: '#4E6040', canopyLit: '#6E8A4A',
  litter: '#8C6E48', litterDark: '#6E5438', leaf: '#B8894E', leafPale: '#C9A05C', fern: '#5F7A3C', fernLit: '#7FA850',
  plum: PLUM.shadow,
});
export const ROWS = Object.freeze({ sky: 0, canopy: 60, ground: 200, band: 290, bandBot: 328, fringe: 332, bottom: VIEW_H });

function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, h, [[0, WOOD.skyTop], [1, WOOD.skyLow]]);
  // the canopy overhead: a dark mass with a scalloped foot
  g.fillStyle = WOOD.deep; g.fillRect(0, 0, w, ROWS.canopy);
  g.fillStyle = WOOD.canopy; for (let x = -10; x < w + 10; x += 18) { g.beginPath(); g.arc(x, ROWS.canopy + R(rnd() * 10), 16 + R(rnd() * 8), 0, TAU); g.fill(); }
  // the trunks, tall and close, the far ones dim; every one an ink-edged post
  for (let i = 0; i < 26; i++) {
    const x = R(rnd() * w), tw = 8 + R(rnd() * 10), lit = i > 16;
    g.fillStyle = INK; g.fillRect(x - 1, ROWS.canopy - 10, tw + 2, h - ROWS.canopy + 10);
    g.fillStyle = lit ? WOOD.trunk : mix(WOOD.trunk, WOOD.skyLow, 0.35); g.fillRect(x, ROWS.canopy - 8, tw, h - ROWS.canopy + 8);
    g.fillStyle = lit ? WOOD.trunkLit : mix(WOOD.trunkLit, WOOD.skyLow, 0.35); g.fillRect(x, ROWS.canopy - 8, 2, h - ROWS.canopy + 8);
  }
  // three shafts of light coming down between them
  g.globalAlpha = 0.16; g.fillStyle = '#FBE3C4';
  for (const sx of [150, 360, 540]) { g.beginPath(); g.moveTo(sx - 8, ROWS.canopy); g.lineTo(sx + 12, ROWS.canopy); g.lineTo(sx + 40, h); g.lineTo(sx - 20, h); g.closePath(); g.fill(); }
  g.globalAlpha = 1;
  g.fillStyle = INK; g.fillRect(0, h - 3, w, 3);
}

function paintGround(g, w, h, rnd) {
  const y0 = ROWS.ground;
  g.fillStyle = WOOD.litter; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 320; i++) {
    const x = R(rnd() * w), y = R(rnd() * (h - 10));
    g.fillStyle = (i & 3) === 0 ? WOOD.leafPale : (i & 1) ? WOOD.leaf : WOOD.litterDark;
    g.fillRect(x, y, 3 + (i & 1), 2);
  }
  const top = ROWS.band - y0, bot = ROWS.bandBot - y0;
  const trodden = mix(WOOD.litter, WOOD.plum, 0.3), edge = mix(WOOD.litter, trodden, 0.5);
  g.fillStyle = edge; g.fillRect(0, top - 5, w, bot - top + 10);
  g.fillStyle = trodden; g.fillRect(0, top - 2, w, bot - top + 4);
  // a fallen log at the left end of the band, behind the lanes
  g.fillStyle = INK; g.fillRect(8, top - 22, 90, 14); g.fillStyle = WOOD.trunk; g.fillRect(9, top - 21, 88, 12); g.fillStyle = WOOD.trunkLit; g.fillRect(9, top - 21, 88, 3);
}

function paintNear(g, w, h, rnd) {
  const base = h;
  for (let x = -6; x < w + 8; x += 9) {
    const tall = 10 + R(rnd() * 14), lean = ((x >> 3) & 1) ? 1 : -1;
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * 4, base - tall * 0.6, x + lean * 8, base - tall); g.stroke();
    g.strokeStyle = ((x >> 1) & 1) ? WOOD.fernLit : WOOD.fern; g.lineWidth = 2; g.stroke();
    for (let k = 1; k < 4; k++) { const fy = base - tall * k / 4; g.fillStyle = WOOD.fern; g.fillRect(x + lean * (2 * k) - 3, R(fy), 7, 2); }
  }
  g.fillStyle = INK; g.fillRect(0, h - 10, w, 2);
  g.fillStyle = mix(WOOD.litter, WOOD.plum, 0.4); g.fillRect(0, h - 8, w, 8);
}

let LAYERS = null;
export function woodLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.ground, paintFar, SEED), y: 0 },
    ground: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.ground, paintGround, SEED + 1), y: ROWS.ground },
    near: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.fringe, paintNear, SEED + 2), y: ROWS.fringe },
  };
  return LAYERS;
}
