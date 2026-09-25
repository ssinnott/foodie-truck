// THE GARAGE (docs/GDD.md section 13): where the truck is parked for the night. An INTERIOR, so it inverts the
// way the kitchen does (docs/ART_STYLE.md section 7): a dark plank room and a dark floor, with the truck and the
// paper and the chalk the lightest and warmest things in it. One bulb hangs over the truck and throws a pool of
// warm light on the floor under it; the pegboard, the shelf of paint tins and the tyre stack say "garage" and
// stay dim, so nothing in the room competes with the paint job.
//
// Painted ONCE into one layer and blitted at the origin; seed block 260..269.
import { makeLayer, blitAt, INK, VIEW_W, VIEW_H } from './layers.ts';
import { UI } from '../constants.ts';
import { pathRR } from '../lib/art/shading.ts';
import { PAINTS, TRUCK } from './truck.ts';

const R = Math.round, TAU = Math.PI * 2;
const SEED = 260;

/** The room's muted constants: plum-brown planks, a slate floor, and the bulb's one warm pool. */
export const GARAGE = Object.freeze({
  plank: '#4A3A34', plankDark: '#3A2D28', plankLine: '#2F2420',
  floor: '#5C5450', floorDark: '#4A4340', floorLine: '#3E3835',
  peg: '#6B5646', pegHole: '#4A3A30', tool: '#8C7A6A',
  pool: 'rgba(255,214,140,0.16)', glow: 'rgba(255,214,140,0.10)',
  bulb: '#FFE4A8', cord: '#2A1F1A',
});

/** Where the back wall meets the floor, and where the parked truck's tyres sit. */
export const GARAGE_FLOOR_Y = 250, GARAGE_TRUCK_Y = 282;
/** The bulb hangs over the truck. */
export const BULB_X = 184, BULB_Y = 50;

function paintGarage(g, w, h, rnd) {
  // the back wall: horizontal planks, each with a darker lower edge and the odd knot
  g.fillStyle = GARAGE.plank; g.fillRect(0, 0, w, GARAGE_FLOOR_Y);
  for (let y = 0; y < GARAGE_FLOOR_Y; y += 18) {
    g.fillStyle = GARAGE.plankDark; g.fillRect(0, y + 14, w, 3);
    g.fillStyle = GARAGE.plankLine; g.fillRect(0, y + 17, w, 1);
    for (let k = 0; k < 3; k++) { const kx = R(rnd() * w); g.fillStyle = GARAGE.plankDark; g.fillRect(kx, y + 6, 4, 2); }
    // the butt joints, staggered plank to plank
    const off = (y / 18) & 1 ? 60 : 0;
    for (let x = off; x < w; x += 120) { g.fillStyle = GARAGE.plankLine; g.fillRect(x, y, 1, 17); }
  }
  // the pegboard behind the truck's tail, with the tools hung on it as dim silhouettes
  const px = 22, py = 70, pw = 96, ph = 92;
  pathRR(g, px, py, pw, ph, 2); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = GARAGE.peg; g.fill();
  g.fillStyle = GARAGE.pegHole;
  for (let yy = py + 6; yy < py + ph - 3; yy += 8) for (let xx = px + 6; xx < px + pw - 3; xx += 8) g.fillRect(xx, yy, 2, 2);
  g.fillStyle = GARAGE.tool;
  // a spanner, a hammer and a paintbrush
  g.fillRect(px + 14, py + 14, 4, 40); g.beginPath(); g.arc(px + 16, py + 12, 7, 0, TAU); g.fill();
  g.fillStyle = GARAGE.peg; g.fillRect(px + 14, py + 4, 4, 8);
  g.fillStyle = GARAGE.tool; g.fillRect(px + 40, py + 16, 4, 44); g.fillRect(px + 32, py + 12, 20, 8);
  g.fillRect(px + 66, py + 20, 4, 34); g.fillRect(px + 62, py + 54, 12, 14);
  // the shelf of paint tins over the slate's corner: one tin per paint the garage sells, lids in the paint
  const sy = 58, sx = 452;
  g.fillStyle = INK; g.fillRect(sx - 2, sy + 1, 150, 6);
  g.fillStyle = UI.woodDark; g.fillRect(sx, sy + 2, 146, 4);
  const paints = Object.keys(PAINTS);
  for (let i = 0; i < paints.length; i++) {
    const tx = sx + 12 + i * 44, p = PAINTS[paints[i]];
    pathRR(g, tx, sy - 22, 26, 23, 2); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = TRUCK.chalk; g.fill();
    g.fillStyle = p.body; g.fillRect(tx + 1, sy - 21, 24, 5); g.fillRect(tx + 5, sy - 12, 16, 8);
    g.fillStyle = p.shade; g.fillRect(tx + 1, sy - 17, 24, 1);
  }
  // the floor: slate with seams, a painted bay line, and an oil stain where the truck always parks
  g.fillStyle = INK; g.fillRect(0, GARAGE_FLOOR_Y - 1, w, 2);
  g.fillStyle = GARAGE.floor; g.fillRect(0, GARAGE_FLOOR_Y + 1, w, h - GARAGE_FLOOR_Y);
  g.fillStyle = GARAGE.floorDark; g.fillRect(0, GARAGE_FLOOR_Y + 1, w, 6);
  for (let x = 0; x < w; x += 80) { g.fillStyle = GARAGE.floorLine; g.fillRect(x + ((x / 80) & 1) * 20, GARAGE_FLOOR_Y + 8, 1, h - GARAGE_FLOOR_Y); }
  g.fillStyle = GARAGE.floorLine; g.fillRect(0, 316, w, 1);
  g.fillStyle = UI.paperDark; g.globalAlpha = 0.5; g.fillRect(40, 300, 290, 3); g.globalAlpha = 1;
  g.fillStyle = GARAGE.floorDark; g.beginPath(); g.ellipse(210, 294, 34, 6, 0, 0, TAU); g.fill();
  // the tyre stack by the wall, right of the truck's nose
  for (let i = 0; i < 3; i++) {
    const ty = GARAGE_FLOOR_Y + 4 - i * 12;
    pathRR(g, 318, ty - 12, 34, 12, 5); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = '#34302E'; g.fill();
    g.fillStyle = '#4A4543'; g.fillRect(322, ty - 10, 26, 2);
  }
  // the bulb's pool of light on the floor and the wall, under everything the screen draws per frame
  g.fillStyle = GARAGE.glow; g.beginPath(); g.ellipse(BULB_X, 150, 150, 120, 0, 0, TAU); g.fill();
  g.fillStyle = GARAGE.pool; g.beginPath(); g.ellipse(BULB_X + 6, 290, 150, 20, 0, 0, TAU); g.fill();
  // the cord and the shade
  g.fillStyle = GARAGE.cord; g.fillRect(BULB_X - 1, 0, 2, BULB_Y - 8);
  g.beginPath(); g.moveTo(BULB_X - 12, BULB_Y); g.lineTo(BULB_X - 5, BULB_Y - 10); g.lineTo(BULB_X + 5, BULB_Y - 10); g.lineTo(BULB_X + 12, BULB_Y); g.closePath();
  g.fillStyle = INK; g.fill();
  g.fillStyle = GARAGE.bulb; g.beginPath(); g.arc(BULB_X, BULB_Y + 2, 4, 0, TAU); g.fill();
}

let layer = null;
/** Blit the garage at the origin. */
export function drawGarage(ctx) {
  if (!layer) layer = makeLayer(VIEW_W, VIEW_H, paintGarage, SEED);
  blitAt(ctx, layer, 0, 0);
}
