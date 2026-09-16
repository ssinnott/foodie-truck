// The truck's kitchen, painted once (docs/ART_STYLE.md section 1 "Kitchen", section 7; docs/GDD.md section 6).
//
// One room layer with the kitchen's seed block (130..139), camera locked, no parallax: a plum-brown panelled wall
// carrying the ticket rail, a window onto the lane, hanging pans and the serving hatch; a slate counter top with a
// steel front; a checker floor with the walk lane clean; a dark skirting. Interiors invert the outdoor rule: the room
// is dark and cool so the cast, the food, the flame and the paper are the warm, light things (ART_STYLE section 7).
// The static bodies of the stations are painted here too through kitchenProps.paintStations, so the per-frame draw
// is one blit plus the few things that move: the flame, the steam, the glow in the oven window and the critters.
//
// Row bands are the contract the screen stands its critters on (the judge panel's kitchen geometry, binding):
// counter top rows 200..206, counter front 206..246, floor 246..340 with the lane 246..300 clean, skirting 340..360,
// feet line y 252 so torsos read on the counter front and heads on the wall.
import { makeLayer, boxOutlined, INK, VIEW_W, VIEW_H } from '../layers.js';
import { PLUM, UI } from '../../constants.js';

const R = Math.round;

/** The kitchen's muted constants: the room's seven cool tones plus the one warm wood. Heat is SIGNAL.hot, nowhere else. */
export const KITCHEN = Object.freeze({
  wall: PLUM.shadow, seam: '#3A2430', counterTop: '#4F5A62', counterHi: '#6B7880', counterFront: '#3E4A55',
  tileA: '#4E4450', tileB: '#5A4E5C', skirting: PLUM.deep, wood: UI.wood,
});
/** Seed block 130..139 belongs to the kitchen (ART_STYLE section 7). */
export const SEED = 130;

/** Row bands (screen y). */
export const ROWS = Object.freeze({
  rail: 8, railBot: 40, pans: 40, pansBot: 80, counterTop: 200, counterFront: 206, floor: 246, laneBot: 300, skirting: 340, bottom: 360,
  feet: 252,
});
/** The serving hatch: an opening in the wall at the right, and the plating shelf under it. */
export const HATCH = Object.freeze({ x: 500, y: 90, w: 140, h: 140, shelfY: 230, shelfH: 14, shelfW: 130 });
/** The window onto the lane (moved right of the order ticket, which hangs at the rail's left end at its natural size). */
export const WINDOW = Object.freeze({ x: 140, y: 60, w: 90, h: 50 });
/** Where each station's critter stands (feet centre) for STATIONS chop / mix / stove / oven / plate, left to right. */
export const STATION_X = Object.freeze([80, 200, 320, 440, 560]);
/** The station's prop sits this far to the right of its standing spot, so the critter's body never hides it. */
export const PROP_DX = 26;
/** A seat is "at" a station within this many px of its standing spot. */
export const AT_RANGE = 24;
/** The walk lane's ends: half a body in from the edges. */
export const X_MIN = 30, X_MAX = 606;
/** The paper progress tag over each station: 20x8 on the wall, above the tallest head part. */
export const TAG_Y = 162, TAG_W = 20, TAG_H = 8;

/** The panelled wall, a seam every 16 px, darker under the rail. */
function paintWall(g, w) {
  g.fillStyle = KITCHEN.wall; g.fillRect(0, 0, w, ROWS.counterTop);
  g.fillStyle = KITCHEN.seam;
  for (let x = 16; x < w; x += 16) g.fillRect(x, 0, 1, ROWS.counterTop);
  g.fillRect(0, ROWS.counterTop - 2, w, 2);   // the wall's foot, in the seam tone, where the counter meets it
}

/** The ticket rail: a 2 px brass rod across the wall with wooden pegs, the order ticket's peg at the left. */
function paintRail(g) {
  g.fillStyle = INK; g.fillRect(0, ROWS.rail + 1, HATCH.x, 4);
  g.fillStyle = '#E2B44A'; g.fillRect(0, ROWS.rail + 2, HATCH.x, 2);
  for (let x = 60; x < HATCH.x - 20; x += 100) boxOutlined(g, x, ROWS.rail + 4, 4, 6, KITCHEN.wood);
  for (const x of [20, 80, 396, 456]) boxOutlined(g, x, ROWS.rail + 4, 4, 6, KITCHEN.wood);   // the two tickets' pegs
}

/** A view of the lane outside: dusk sky, the plum hedge, a strip of lane. Used by the window and the hatch. */
function paintOutside(g, x, y, w, h, rnd, hedgeY) {
  g.fillStyle = '#F4C9A0'; g.fillRect(x, y, w, h);
  g.fillStyle = '#FBE3C4'; g.fillRect(x, y, w, R(h * 0.3));
  // the hedge: one row of plum crowns along the sky's foot, solid below
  g.fillStyle = PLUM.shadow;
  for (let cx = x - 6; cx < x + w + 8; cx += 14) { const r = 8 + rnd() * 6; g.beginPath(); g.arc(cx, y + hedgeY + 2, r, 0, Math.PI * 2); g.fill(); }
  g.fillRect(x, y + hedgeY + 2, w, h - hedgeY - 2);
  // a lighter row of leaves inside the hedge, then the lane along its foot
  g.fillStyle = '#5A4048';
  for (let cx = x + 4; cx < x + w; cx += 18) { g.beginPath(); g.arc(cx + rnd() * 6, y + hedgeY + 12 + rnd() * 6, 5, 0, Math.PI * 2); g.fill(); }
  const laneY = y + h - R(h * 0.22);
  g.fillStyle = '#C9AE78'; g.fillRect(x, laneY, w, h - (laneY - y));
  g.fillStyle = '#B99A6A'; g.fillRect(x, laneY, w, 2);
}

/** The window: a 2 px ink frame, the lane outside, a cross bar, a sill. */
function paintWindow(g, rnd) {
  const W = WINDOW;
  g.fillStyle = INK; g.fillRect(W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  paintOutside(g, W.x, W.y, W.w, W.h, rnd, 22);
  g.fillStyle = INK; g.fillRect(W.x + R(W.w / 2) - 1, W.y, 2, W.h); g.fillRect(W.x, W.y + R(W.h / 2) - 1, W.w, 2);
  boxOutlined(g, W.x - 4, W.y + W.h + 2, W.w + 8, 4, KITCHEN.wood);
  g.fillStyle = UI.woodDark; g.fillRect(W.x - 4, W.y + W.h + 4, W.w + 8, 2);
}

/** Hanging pans: open shapes on a 2 px rod, rows 40..80, between the window and the recipe card. */
function paintPans(g) {
  const rod = ROWS.pans + 2, x0 = 250;
  g.fillStyle = INK; g.fillRect(x0 - 6, rod, 116, 2);
  const steel = '#B8C4C9', copper = '#B87333', copperSh = '#8A5220';
  // two pans hung by their handles: a copper one and a steel one, drawn as an outlined body with the handle up
  for (let i = 0; i < 2; i++) {
    const px = x0 + 12 + i * 52, fill = i ? steel : copper, sh = i ? '#8A9AA2' : copperSh;
    g.fillStyle = INK; g.fillRect(px + 9, rod + 2, 4, 14);            // the handle hangs from a hook
    g.fillStyle = i ? '#8A9AA2' : UI.woodDark; g.fillRect(px + 10, rod + 3, 2, 12);
    g.beginPath(); g.ellipse(px + 11, rod + 26, 15, 10, 0, 0, Math.PI * 2);
    g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = fill; g.fill();
    g.save(); g.beginPath(); g.ellipse(px + 11, rod + 26, 15, 10, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = sh; g.fillRect(px - 6, rod + 28, 36, 10); g.restore();
    g.fillStyle = INK; g.fillRect(px + 2, rod + 24, 18, 2);            // the rim line
  }
  // a ladle: a 2 px steel handle and a small cup
  g.fillStyle = INK; g.fillRect(x0 + 103, rod + 2, 4, 26);
  g.fillStyle = steel; g.fillRect(x0 + 104, rod + 3, 2, 24);
  g.beginPath(); g.arc(x0 + 105, rod + 31, 5, 0, Math.PI); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = steel; g.fill();
}

/** The serving hatch: an opening with the lane beyond, a 2 px frame, and the plating shelf across its foot. */
function paintHatch(g, rnd) {
  const H = HATCH;
  g.fillStyle = INK; g.fillRect(H.x - 2, H.y - 2, H.w + 2, H.h + 4);
  paintOutside(g, H.x, H.y, H.w, H.h, rnd, 44);
  // the shelf: a wooden board with its lower shade band and a 1 px ink underside
  boxOutlined(g, H.x, H.shelfY, H.shelfW, H.shelfH, KITCHEN.wood, INK, 2);
  g.fillStyle = UI.woodLight; g.fillRect(H.x + 1, H.shelfY + 1, H.shelfW - 2, 2);
  g.fillStyle = UI.woodDark; g.fillRect(H.x, H.shelfY + H.shelfH - 5, H.shelfW, 5);
  // the wall under the shelf down to the floor is the counter's steel
  g.fillStyle = KITCHEN.counterFront; g.fillRect(H.x, H.shelfY + H.shelfH + 2, VIEW_W - H.x, ROWS.floor - H.shelfY - H.shelfH - 2);
}

/** The counter: the slate top with its 1 px highlight, the steel front with a seam every 80 px. */
function paintCounter(g) {
  const w = HATCH.x;
  g.fillStyle = INK; g.fillRect(0, ROWS.counterTop - 1, w, 1);
  g.fillStyle = KITCHEN.counterTop; g.fillRect(0, ROWS.counterTop, w, ROWS.counterFront - ROWS.counterTop);
  g.fillStyle = KITCHEN.counterHi; g.fillRect(0, ROWS.counterTop, w, 1);
  g.fillStyle = INK; g.fillRect(0, ROWS.counterFront, w, 1);
  g.fillStyle = KITCHEN.counterFront; g.fillRect(0, ROWS.counterFront + 1, w, ROWS.floor - ROWS.counterFront - 1);
  g.fillStyle = '#35404A';
  for (let x = 80; x < w; x += 80) g.fillRect(x, ROWS.counterFront + 3, 1, ROWS.floor - ROWS.counterFront - 5);
  g.fillStyle = INK; g.fillRect(0, ROWS.floor - 1, VIEW_W, 1);
}

/** The floor: 12 px checker from row 246, nothing scattered on it (the whole band is a walk lane), then the skirting. */
function paintFloor(g) {
  const T = 12;
  for (let y = ROWS.floor, row = 0; y < ROWS.skirting; y += T, row++) {
    const h = Math.min(T, ROWS.skirting - y);
    for (let x = 0, col = 0; x < VIEW_W; x += T, col++) { g.fillStyle = (row + col) & 1 ? KITCHEN.tileB : KITCHEN.tileA; g.fillRect(x, y, T, h); }
  }
  g.fillStyle = INK; g.fillRect(0, ROWS.skirting, VIEW_W, 1);
  g.fillStyle = KITCHEN.skirting; g.fillRect(0, ROWS.skirting + 1, VIEW_W, VIEW_H - ROWS.skirting - 1);
}

/** The blank paper progress tags on the wall over every station; the screen colours their segments per frame. */
function paintTags(g) {
  for (let i = 0; i < STATION_X.length; i++) {
    const x = STATION_X[i] + PROP_DX - R(TAG_W / 2);
    g.fillStyle = INK; g.fillRect(x + R(TAG_W / 2) - 1, TAG_Y - 4, 2, 4);   // the string it hangs by
    boxOutlined(g, x, TAG_Y, TAG_W, TAG_H, UI.paper);
  }
}

/** The room without its furniture; `paintProps(g)` (art/kitchenProps.js paintStations) adds the station bodies. */
function paintRoom(g, w, h, rnd, paintProps) {
  paintWall(g, w);
  paintRail(g);
  paintWindow(g, rnd);
  paintPans(g);
  paintHatch(g, rnd);
  paintCounter(g);
  paintFloor(g);
  paintTags(g);
  if (paintProps) paintProps(g);
}

let layer = null;
/**
 * The one pre-rendered room layer, painted on first use and kept for every visit after (a pure function of its
 * seed). The station bodies come from art/kitchenProps.js, passed in so the two modules never import each other.
 */
export function kitchenLayer(paintProps) {
  if (!layer) layer = makeLayer(VIEW_W, VIEW_H, (g, w, h, rnd) => paintRoom(g, w, h, rnd, paintProps), SEED);
  return layer;
}
