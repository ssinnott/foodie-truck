// The millpond's backdrop (docs/ART_STYLE.md section 1 "Pond", section 7; docs/GDD.md section 5): golden hour, side
// view. Four layers painted ONCE with the pond's seed block (110..119) and blitted at integer offsets by the screen:
//   far    sky gradient, a low sun disc, two hill tiers              (rows 0..200)
//   mid    the plum tree-line behind the critters, its foot strip     (rows 90..200)
//   ground the near bank the crew stands on, the lip, the water, the pre-painted ripples, lily pads, the jetty (200..360)
//   near   reeds at the far right and a turf edge along the bottom    (rows 300..360)
// There is no camera on the pond, so the parallax factors are recorded (PARALLAX_OF) for a scene that adds one, and
// every blit lands at offset 0. Nothing here animates: the 24 glints (GLINTS) are the screen's only per-frame marks
// on the water, index-hashed twinkles at positions this module seeds.
import { makeLayer, vGradient, INK } from '../layers.js';
import { makeRng } from '../../engine/rng.js';
import { VIEW_W, PLUM } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;

/** The pond's muted constants (six ground tones + the sky). The one saturated colour on the pond is SIGNAL.pond. */
export const POND = Object.freeze({
  skyTop: '#FBE3C4', skyLow: '#F4C9A0', sun: '#FDF0CC', hillFar: '#C9AE9A', hillNear: '#A89C82',
  plum: PLUM.shadow, foot: '#4F5A40', reflection: '#F1E4C8',
  turf: '#6E7A5A', turfShade: '#5C684C', tuft: '#8A9B4E',
  water: '#4E7A8C', surface: '#6F9FB0', lily: '#7FA36A', lilyShade: '#5F8A50',
  jetty: '#9A6234', jettyDark: '#5E3A1B', reed: '#8A9B4E', reedHead: '#6B4E3A', glint: '#F1E4C8',
});
/** Seed block 110..119 belongs to the pond (ART_STYLE section 7). */
const SEED0 = 110;
/** Parallax each layer would move by if the pond ever got a camera (ART_STYLE section 7). */
export const PARALLAX_OF = Object.freeze({ far: 0.2, mid: 0.5, ground: 1, near: 1.2 });

/** Row bands (screen y). */
export const ROWS = Object.freeze({
  sky: 110, trees: 90, bank: 200, lip: 235, feet: 236, water: 237, surface: 249, near: 300, edge: 350, bottom: 360,
});
/** Where each seat stands (x of the feet centre) and the float column it owns; both in seat order, left to right. */
export const SEAT_X = Object.freeze([56, 120, 184, 248]);
export const FLOAT_X = Object.freeze([340, 410, 480, 550]);
/** The float's resting y: on the surface band. */
export const SURFACE_Y = 243;
/** The jetty deck: x 280..316, rows 230..242, so it juts off the bank over the water. */
export const JETTY = Object.freeze({ x: 280, y: 230, w: 36, h: 12 });
/** Half-width of a float column that ripples and lily pads keep out of. */
const COLUMN_HALF = 16;
function inColumn(x, w) { for (let i = 0; i < FLOAT_X.length; i++) if (x + w > FLOAT_X[i] - COLUMN_HALF && x < FLOAT_X[i] + COLUMN_HALF) return true; return false; }

/** 24 glint positions on the deep water (screen coords), seeded so every machine twinkles the same pixels. */
export const GLINTS = (() => {
  const r = makeRng(SEED0 + 5), out = [];
  for (let i = 0; i < 24; i++) out.push([r.int(20, VIEW_W - 60), r.int(ROWS.surface + 4, ROWS.edge - 12)]);
  return out;
})();

/** One inked ellipse: the 2 px line of a big backdrop block (ART_STYLE section 3). */
function inkEllipse(g, cx, cy, rx, ry, fill, lw = 2) {
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = lw * 2; g.stroke();
  g.fillStyle = fill; g.fill();
}

function paintFar(g, w, h) {
  vGradient(g, 0, 0, w, ROWS.sky, [[0, POND.skyTop], [1, POND.skyLow]]);
  g.fillStyle = POND.skyLow; g.fillRect(0, ROWS.sky, w, h - ROWS.sky);
  // the low sun: a pale disc with the scene's 1 px ink, sitting just above the tree-line
  g.beginPath(); g.arc(508, 78, 15, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = POND.sun; g.fill();
  // two hill tiers: the far one dusty rose, the near one olive-tan, both cresting where the tree-line dips
  inkEllipse(g, 150, 150, 260, 62, POND.hillFar); inkEllipse(g, 560, 156, 300, 68, POND.hillFar);
  inkEllipse(g, 330, 178, 250, 74, POND.hillNear); inkEllipse(g, 40, 176, 160, 66, POND.hillNear);
  g.fillStyle = POND.hillNear; g.fillRect(0, 176, w, h - 176);
}

/** The plum tree-line: one path of crowns along the top, dropped to the far bank's foot, inked 2 px and filled. */
function paintMid(g, w, h, rnd) {
  const foot = ROWS.bank - 6;
  g.beginPath(); g.moveTo(-8, foot);
  let x = -8;
  while (x < w + 8) {
    const r = 10 + Math.floor(rnd() * 12), top = ROWS.trees + 6 + Math.floor(rnd() * 18);
    g.lineTo(x, top + r); g.arc(x + r, top + r, r, Math.PI, 0); x += r * 2 - 4;
  }
  g.lineTo(w + 8, foot); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = POND.plum; g.fill();
  // the far bank's foot: a dark olive strip and the 2 px cream reflection line where it meets the water behind
  g.fillStyle = POND.foot; g.fillRect(0, foot, w, 4);
  g.fillStyle = POND.reflection; g.fillRect(0, foot + 4, w, 2);
}

function paintGround(g, w, h, rnd) {
  const y0 = ROWS.bank;   // this layer is blitted at ROWS.bank
  // the near bank: 2 px ink top edge, a tree-shadow band under the tree-line, turf, tufts, the 2 px ink lip
  g.fillStyle = INK; g.fillRect(0, 0, w, 2);
  g.fillStyle = POND.turfShade; g.fillRect(0, 2, w, 10);
  g.fillStyle = POND.turf; g.fillRect(0, 12, w, ROWS.lip - y0 - 12);
  g.fillStyle = POND.tuft;
  for (let i = 0; i < 46; i++) { const tx = R(rnd() * w), ty = 6 + R(rnd() * 20); g.fillRect(tx, ty, 2, 3); }
  g.fillStyle = INK; g.fillRect(0, ROWS.lip - y0, w, ROWS.water - ROWS.lip);
  // the water: one flat fill with a lighter surface band, then 8 pre-painted 20x1 ripples off the float columns
  g.fillStyle = POND.water; g.fillRect(0, ROWS.water - y0, w, h - (ROWS.water - y0));
  g.fillStyle = POND.surface; g.fillRect(0, ROWS.water - y0, w, ROWS.surface - ROWS.water);
  let n = 0, guard = 0;
  while (n < 8 && guard++ < 80) {
    const rx = R(rnd() * (w - 40)), ry = ROWS.surface + 8 + R(rnd() * 84);
    if (inColumn(rx, 20)) continue;
    g.fillRect(rx, ry - y0, 20, 1); n++;
  }
  // three lily pads off the float columns: an inked disc, a shade crescent, a 2 px notch toward the viewer
  const pads = [[372, 292], [508, 318], [598, 262]];
  for (let i = 0; i < pads.length; i++) {
    const px = pads[i][0], py = pads[i][1] - y0;
    g.beginPath(); g.ellipse(px, py, 7, 5, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = POND.lily; g.fill();
    g.save(); g.beginPath(); g.ellipse(px, py, 7, 5, 0, 0, TAU); g.clip(); g.fillStyle = POND.lilyShade; g.fillRect(px - 8, py + 1, 16, 5); g.restore();
    g.fillStyle = POND.water; g.fillRect(px + 3, py + 1, 2, 5);
  }
  // the jetty: two dark posts into the water, then the deck with its lower shade band and three plank seams
  const J = JETTY, jy = J.y - y0;
  g.fillStyle = INK; g.fillRect(J.x + 3, jy + J.h, 6, 16); g.fillRect(J.x + J.w - 9, jy + J.h, 6, 16);
  g.fillStyle = POND.jettyDark; g.fillRect(J.x + 4, jy + J.h, 4, 15); g.fillRect(J.x + J.w - 8, jy + J.h, 4, 15);
  g.fillStyle = INK; g.fillRect(J.x - 2, jy - 2, J.w + 4, J.h + 4);
  g.fillStyle = POND.jetty; g.fillRect(J.x, jy, J.w, J.h);
  g.fillStyle = POND.jettyDark; g.fillRect(J.x, jy + J.h - 4, J.w, 4);
  for (let i = 1; i < 4; i++) g.fillRect(J.x + i * 9 - 1, jy, 2, J.h - 4);
}

/** Reeds pinned to the far right (x >= 600) and a 10-row turf edge along the bottom; blitted at ROWS.near. */
function paintNear(g, w, h, rnd) {
  const y0 = ROWS.near;
  g.fillStyle = INK; g.fillRect(0, ROWS.edge - y0, w, 2);
  g.fillStyle = POND.turf; g.fillRect(0, ROWS.edge - y0 + 2, w, h);
  for (let i = 0; i < 7; i++) {
    const rx = 602 + i * 5 + R(rnd() * 3), top = 2 + R(rnd() * 22), bottom = ROWS.edge - y0 + 2;
    g.fillStyle = INK; g.fillRect(rx - 1, top - 1, 4, bottom - top + 1);
    g.fillStyle = POND.reed; g.fillRect(rx, top, 2, bottom - top);
    if (i & 1) { g.fillStyle = INK; g.fillRect(rx - 2, top - 4, 6, 8); g.fillStyle = POND.reedHead; g.fillRect(rx - 1, top - 3, 4, 6); }
  }
}

let layers = null;
/** The four pre-rendered layers, painted on first use: { far, mid, ground, near } with the y each blits at. */
export function pondLayers() {
  if (layers) return layers;
  layers = {
    far: { L: makeLayer(VIEW_W, ROWS.bank, paintFar, SEED0), y: 0 },
    mid: { L: makeLayer(VIEW_W, ROWS.bank, paintMid, SEED0 + 1), y: 0 },
    ground: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.bank, paintGround, SEED0 + 2), y: ROWS.bank },
    near: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.near, paintNear, SEED0 + 3), y: ROWS.near },
  };
  return layers;
}
