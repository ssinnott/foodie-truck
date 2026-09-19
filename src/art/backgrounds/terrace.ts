// Thyme Terrace, painted once (docs/CONTENT_ROADMAP.md section E). A walled herb garden on a warm morning: a
// brick wall with a gate along the back, two stepped stone terraces with the beds the herb clumps stand in (the
// screen draws the clumps: they are snipped and grow back), the gravel walk the crew works from in front, and a
// row of pots along the bottom edge.
//   far     rows 0..ground   sky, the wall and its gate, the upper terrace's stone
//   ground  the bed's earth and the gravel walk band across it, a scuffed spot under each clump
//   near    the low front wall with its pots
// Nothing here animates. The scene's one saturated colour is SIGNAL.terrace, the gold sparkle over a clump with a
// snip left on it, and it appears nowhere in this file.
import { makeLayer, vGradient, boxShaded, boxOutlined, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;
const SEED = 250;

export const TERRACE = Object.freeze({
  skyTop: '#F8E4C6', skyLow: '#EFCFA4', brick: '#B8845E', brickDark: '#8E6446', mortar: '#D9C39A', stone: '#C4B49A', stoneDark: '#9C8E76',
  earth: '#7A6249', earthDark: '#5E4A38', gravel: '#C9B48E', gravelDark: '#A8956F', pot: '#B07A5A', potDark: '#8A5A3E',
  plum: PLUM.shadow,
});
export const ROWS = Object.freeze({ wall: 90, wallFoot: 176, step: 182, ground: 200, bed: 236, band: 290, bandBot: 328, fringe: 332, bottom: VIEW_H });
/** Where the six clumps stand (centre x of each), 100 px apart. */
export const CLUMP_X = Object.freeze([70, 170, 270, 370, 470, 570]);

function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, ROWS.wall, [[0, TERRACE.skyTop], [1, TERRACE.skyLow]]);
  // the brick wall along the back, with a gate in the middle
  g.fillStyle = INK; g.fillRect(0, ROWS.wall - 2, w, ROWS.wallFoot - ROWS.wall + 2);
  g.fillStyle = TERRACE.brick; g.fillRect(0, ROWS.wall, w, ROWS.wallFoot - ROWS.wall);
  g.fillStyle = TERRACE.mortar;
  for (let y = ROWS.wall + 6; y < ROWS.wallFoot; y += 8) { g.fillRect(0, y, w, 1); for (let x = ((y >> 3) & 1) * 12; x < w; x += 24) g.fillRect(x, y - 7, 1, 7); }
  g.fillStyle = TERRACE.brickDark; for (let i = 0; i < 40; i++) g.fillRect(R(rnd() * w), ROWS.wall + 8 + R(rnd() * 60), 11, 3);
  g.fillStyle = mix(TERRACE.brick, TERRACE.skyTop, 0.3); g.fillRect(0, ROWS.wall, w, 3);   // the coping's light
  boxShaded(g, 296, ROWS.wall + 20, 48, ROWS.wallFoot - ROWS.wall - 20, '#6B4E3A', '#4A3628');
  g.fillStyle = INK; for (let k = 0; k < 4; k++) g.fillRect(302 + k * 11, ROWS.wall + 24, 2, ROWS.wallFoot - ROWS.wall - 28);
  // the upper terrace's stone edge
  g.fillStyle = INK; g.fillRect(0, ROWS.wallFoot, w, 3);
  boxShaded(g, -2, ROWS.step, w + 4, ROWS.ground - ROWS.step, TERRACE.stone, TERRACE.stoneDark);
  g.fillStyle = TERRACE.stoneDark; for (let x = 20; x < w; x += 46) g.fillRect(x, ROWS.step + 2, 1, ROWS.ground - ROWS.step - 4);
}

function paintGround(g, w, h, rnd) {
  const y0 = ROWS.ground;
  g.fillStyle = TERRACE.earth; g.fillRect(0, 0, w, h);
  g.fillStyle = TERRACE.earthDark; for (let i = 0; i < 160; i++) g.fillRect(R(rnd() * w), R(rnd() * (ROWS.band - y0 - 8)), 3, 1);
  // the bed's front stone edge, then the gravel walk
  const top = ROWS.band - y0, bot = ROWS.bandBot - y0;
  g.fillStyle = INK; g.fillRect(0, top - 9, w, 3);
  boxShaded(g, -2, top - 8, w + 4, 6, TERRACE.stone, TERRACE.stoneDark);
  g.fillStyle = TERRACE.gravel; g.fillRect(0, top - 2, w, bot - top + 4 + 6);
  g.fillStyle = TERRACE.gravelDark; for (let i = 0; i < 220; i++) g.fillRect(R(rnd() * w), top - 2 + R(rnd() * (bot - top + 8)), 2, 1);
  g.fillStyle = mix(TERRACE.gravel, TERRACE.plum, 0.25); g.fillRect(0, top + 2, w, bot - top - 4);
  // the scuffed spot on the walk under each clump: its width is the reach
  for (let i = 0; i < CLUMP_X.length; i++) { g.fillStyle = mix(TERRACE.gravel, TERRACE.plum, 0.4); g.beginPath(); g.ellipse(CLUMP_X[i], R((top + bot) / 2), 17, 8, 0, 0, TAU); g.fill(); }
}

function paintNear(g, w, h, rnd) {
  g.fillStyle = INK; g.fillRect(0, 0, w, h);
  boxShaded(g, -2, 2, w + 4, h - 2, TERRACE.stone, TERRACE.stoneDark, INK, 1, 0.3);
  for (let x = 30; x < w; x += 110) {
    boxOutlined(g, x - 9, -8, 18, 12, TERRACE.pot); g.fillStyle = TERRACE.potDark; g.fillRect(x - 8, 0, 16, 2);
    g.fillStyle = INK; g.fillRect(x - 7, -14, 14, 7); g.fillStyle = '#7FA850'; g.fillRect(x - 6, -13, 12, 5);
  }
  void rnd;
}

let LAYERS = null;
export function terraceLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.ground, paintFar, SEED), y: 0 },
    ground: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.ground, paintGround, SEED + 1), y: ROWS.ground },
    near: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.fringe, paintNear, SEED + 2), y: ROWS.fringe },
  };
  return LAYERS;
}
