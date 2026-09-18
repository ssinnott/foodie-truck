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
//
// The wall's furniture is laid out around ONE rule: at these proportions the counter top is at the cast's head
// height, so nothing a critter needs to read may sit in the band their heads and name plates occupy. Everything
// hung on the WALL lives above row 156 - the knife rack and the window sill end by 100, the station signs take
// 104..121 and the timing widgets 122..146. The props that STAND on the counter (the round board's handle at 156,
// the kettle at 163, the pot at 164, the bowl's rim at 173, the ingredient on the board at ~177, the mixing
// spoon at 146) cannot, so the two are kept apart instead: every prop stands PROP_DX px to the right of its
// cook's spot, clear of a seven-letter name plate, and the screen clamps the plate's top row to 160
// (kitchen.js PLATE_Y_MAX) so a short crown can never drop it onto the pot's rim. Each station's own silhouette
// carries 26..34 px above the counter (round board, spoon, pot, kettle) so a cook standing at it cannot hide
// what it is, and the sign over it letters the name for the squint that still misses.
import { makeLayer, boxOutlined, boxShaded, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { PLUM, UI } from '../../constants.ts';
import { STATIONS } from '../../content/places.ts';
import { drawText } from '../../engine/text.ts';

const R = Math.round;

/** The kitchen's muted constants: the room's seven cool tones plus the one warm wood. Heat is SIGNAL.hot, nowhere else. */
export const KITCHEN = Object.freeze({
  wall: PLUM.shadow, seam: '#3A2430', counterTop: '#4F5A62', counterHi: '#6B7880', counterFront: '#3E4A55',
  tileA: '#4E4450', tileB: '#5A4E5C', skirting: PLUM.deep, wood: UI.wood,
  // the one warm metal in the room: the rail, the bell and the oven's trim are the same brass as the truck's
  // headlamp. SIGNAL gold (#F2C14E) means "the thing you want" on the map and in the coop and is banned here.
  brass: '#E2B44A', brassSh: '#B08A30',
});
/** The lane beyond the window and the hatch: the map's own sky, hedge and lane tones, so outside is outside. */
const OUT = Object.freeze({ skyHi: '#FBE3C4', sky: '#F4C9A0', far: PLUM.shadow, hedge: '#4F6B3A', hedgeHi: '#6E8A48', lane: '#C9AE78', laneEdge: '#B99A6A' });
/** Seed block 130..139 belongs to the kitchen (ART_STYLE section 7). */
export const SEED = 130;

/** Row bands (screen y). */
export const ROWS = Object.freeze({
  rail: 8, pans: 42, counterTop: 200, counterFront: 206, floor: 246, laneBot: 300, skirting: 340, bottom: 360,
  feet: 252,
});
/** The serving hatch: an opening in the wall at the right, and the plating shelf across its foot. */
export const HATCH = Object.freeze({ x: 500, y: 90, w: 140, h: 140, shelfY: 230, shelfH: 14 });
/** Where the customer's bust leans in: the RIGHT half of the opening, so the cook plating at the shelf's left
 *  half is never drawn on top of them (the review's fused-critters defect). Both screens draw the bust here.
 *  `scale` is the CAST'S OWN 1x kitchen draw scale (ART_STYLE section 2 "Draw scales"): the customer used to be
 *  blown up to 1.7x, which put two sizes of the same face kit - whites 6x5, pupils 3x3, fixed by ART_STYLE
 *  section 0.6 - in one flat side-on shot, so it read as a zoom artifact rather than a bigger animal. Species
 *  proportions (the owl's headR 13 against Barley's 15) carry the size difference now. `margin` then stands the
 *  customer on the strip of lane seen through the opening: their silhouette's top row is y + margin. */
export const BUST = Object.freeze({ x: 548, y: 94, w: 92, h: 136, scale: 1, margin: 86 });
/** The window onto the lane, high on the wall so the cast's name plates never collide with it; it sits right of
 *  the knife rack now that the FRIDGE has pushed the chopping board along the counter. */
export const WINDOW = Object.freeze({ x: 196, y: 44, w: 80, h: 50 });
/** The order ticket is PINNED flush under the rail at its left end, full width, with its perforated top: it is the
 *  screen's one big paper. The recipe card is the smaller checklist and HANGS below the rail on two visible pegs at
 *  the other end, narrower and un-perforated, so the two papers never read as a symmetric pair of UI slabs. */
export const TICKET = Object.freeze({ x: 8, y: 12, w: 124 });   // wide enough for STRAWBERRY and its count on one row
export const RECIPE = Object.freeze({ x: 396, y: 16, w: 92 });
/** Where each station's critter stands (feet centre) for STATIONS fridge / chop / mix / stove / oven / plate, left
 *  to right: six spots, every pair at least 86 px apart so no x is "at" two of them (AT_RANGE). */
export const STATION_X = Object.freeze([36, 122, 214, 306, 398, 490]);
/** How far right of its standing spot each station's prop sits: far enough that the cook's head never hides it,
 *  and (MIX, STOVE) far enough that a seven-letter name plate clears the bowl and the pot. */
export const PROP_DX = Object.freeze([40, 46, 52, 56, 34, 26]);
/** Prop centres on the counter (and, for the plate, on the hatch shelf). */
export const PROP_X = Object.freeze(STATION_X.map((x, i) => x + PROP_DX[i]));
/** A seat is "at" a station within this many px of its standing spot: 40, so any part of the critter over the station counts (the closest two spots are 86 apart). */
/** The plate is the last station: its sign and widget hang in the hatch opening rather than on the wall. */
export const PLATE_I = STATIONS.length - 1;
export const AT_RANGE = 40;
/** The walk lane's ends: half a body in from the edges. */
export const X_MIN = 30, X_MAX = 606;
/** The hand-lettered paper sign over each station - 36x15, wide enough for the station's NAME in ink at size 1, so
 *  a five-letter word reads at 1x over a critter's head. The owner's colour is a 4 px band across its head (the
 *  judge panel's per-station progress tag: the band's length is the step's progress), never a wash over the word. */
export const TAG_W = 36, TAG_H = 15;
/** The sign hangs over its own station's prop, the timing widget's card under it; the plate's pair hangs in the
 *  hatch opening instead, which is not wall. Rows 104..146 is the wall's clear band: under the knife rack, the
 *  window sill and the pans, and above the props that stand on the counter (156..200). */
export const TAG_POS = Object.freeze(PROP_X.map((x, i) => [x - R(TAG_W / 2), i === PLATE_I ? 30 : 104]));
export const WIDGET_POS = Object.freeze(PROP_X.map((x, i) => [x - 24, i === PLATE_I ? 50 : 122]));
/** The station names as the signs letter them (content/places.js owns the strings). */
export const TAG_NAME = Object.freeze(STATIONS.map((s) => s.name));

/** The panelled wall, a seam every 16 px, and its foot where the counter meets it. */
function paintWall(g, w) {
  g.fillStyle = KITCHEN.wall; g.fillRect(0, 0, w, ROWS.counterTop);
  g.fillStyle = KITCHEN.seam;
  for (let x = 16; x < w; x += 16) g.fillRect(x, 0, 1, ROWS.counterTop);
  g.fillRect(0, ROWS.counterTop - 2, w, 2);
}

/** The ticket rail: a 2 px brass rod across the whole wall on ink brackets, with a peg under each hanging paper. */
function paintRail(g, w) {
  g.fillStyle = INK; g.fillRect(0, ROWS.rail + 1, w, 4);
  g.fillStyle = KITCHEN.brass; g.fillRect(0, ROWS.rail + 2, w, 2);
  g.fillStyle = KITCHEN.brassSh; g.fillRect(0, ROWS.rail + 4, w, 1);
  for (let x = 40; x < w; x += 80) { g.fillStyle = INK; g.fillRect(x, ROWS.rail - 4, 3, 5); }   // brackets to the ceiling
  // the order ticket is pinned flush to the rail (its pegs sit under it); the recipe card hangs below on two
  // 2 px ink strings off its own pegs, which is the whole reason the two papers do not read as one UI band
  for (const x of [TICKET.x + 20, TICKET.x + TICKET.w - 24]) boxOutlined(g, x, ROWS.rail + 4, 4, 6, KITCHEN.wood);
  for (const x of [RECIPE.x + 18, RECIPE.x + RECIPE.w - 22]) {
    boxOutlined(g, x, ROWS.rail + 4, 4, 6, KITCHEN.wood);
    g.fillStyle = INK; g.fillRect(x + 1, ROWS.rail + 10, 2, RECIPE.y - ROWS.rail - 10);
  }
}

/** A view of the lane outside: dusk sky, a plum tree-line, the hedge, a strip of lane. Shared by window and hatch. */
function paintOutside(g, x, y, w, h, rnd, hedgeY) {
  g.fillStyle = OUT.sky; g.fillRect(x, y, w, h);
  g.fillStyle = OUT.skyHi; g.fillRect(x, y, w, R(h * 0.34));
  // the far tree-line: one plum band of low crowns behind the hedge
  g.fillStyle = OUT.far;
  for (let cx = x - 8; cx < x + w + 10; cx += 18) { g.beginPath(); g.arc(cx, y + hedgeY - 4, 9 + rnd() * 4, 0, Math.PI * 2); g.fill(); }
  g.fillRect(x, y + hedgeY - 4, w, 6);
  // the hedge itself: green crowns with lit caps, solid to the lane
  g.fillStyle = OUT.hedge;
  for (let cx = x - 6; cx < x + w + 8; cx += 13) { g.beginPath(); g.arc(cx, y + hedgeY + 4, 8 + rnd() * 4, 0, Math.PI * 2); g.fill(); }
  const laneY = y + h - R(h * 0.24);
  g.fillRect(x, y + hedgeY + 4, w, laneY - (y + hedgeY + 4));
  g.fillStyle = OUT.hedgeHi;
  for (let cx = x + 3; cx < x + w; cx += 13) { g.beginPath(); g.arc(cx + R(rnd() * 4), y + hedgeY, 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = OUT.lane; g.fillRect(x, laneY, w, h - (laneY - y));
  g.fillStyle = OUT.laneEdge; g.fillRect(x, laneY, w, 2);
}

/** The window: a 2 px ink frame, the lane outside, one cross bar, a wooden sill. */
function paintWindow(g, rnd) {
  const W = WINDOW;
  g.fillStyle = INK; g.fillRect(W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  paintOutside(g, W.x, W.y, W.w, W.h, rnd, 30);
  g.fillStyle = INK; g.fillRect(W.x + R(W.w / 2) - 1, W.y, 2, W.h); g.fillRect(W.x, W.y + R(W.h / 2) - 1, W.w, 2);
  boxOutlined(g, W.x - 4, W.y + W.h + 2, W.w + 8, 4, KITCHEN.wood);
  g.fillStyle = UI.woodDark; g.fillRect(W.x - 4, W.y + W.h + 4, W.w + 8, 2);
}

/** Hanging pans and a ladle: open shapes on a 2 px rod, rows 42..80, between the window and the recipe card. */
function paintPans(g) {
  const rod = ROWS.pans, x0 = 282;
  g.fillStyle = INK; g.fillRect(x0 - 4, rod, 116, 2);
  const steel = '#B8C4C9', steelSh = '#8A9AA2', copper = '#B87333', copperSh = '#8A5220';
  for (let i = 0; i < 2; i++) {
    const px = x0 + 16 + i * 50, fill = i ? steel : copper, sh = i ? steelSh : copperSh;
    g.fillStyle = INK; g.fillRect(px - 2, rod + 2, 4, 9);                       // the hook and the handle's shank
    g.fillStyle = i ? steelSh : UI.woodDark; g.fillRect(px - 1, rod + 3, 2, 8);
    // the pan body: a shallow inked bowl, flat rim on top, one shade band below
    g.beginPath(); g.moveTo(px - 15, rod + 11); g.lineTo(px + 15, rod + 11); g.lineTo(px + 11, rod + 26); g.lineTo(px - 11, rod + 26); g.closePath();
    g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.fillStyle = fill; g.fill();
    g.save(); g.clip(); g.fillStyle = sh; g.fillRect(px - 16, rod + 19, 32, 10); g.restore();
    g.fillStyle = INK; g.fillRect(px - 15, rod + 11, 30, 2);                    // the rim, inked
  }
  g.fillStyle = INK; g.fillRect(x0 + 104, rod + 2, 4, 22);                      // the ladle
  g.fillStyle = steel; g.fillRect(x0 + 105, rod + 3, 2, 20);
  g.beginPath(); g.arc(x0 + 106, rod + 24, 6, 0, Math.PI); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = steel; g.fill();
  g.fillStyle = steelSh; g.fillRect(x0 + 101, rod + 25, 10, 3);
}

/** The serving hatch: an opening with the lane beyond, a 2 px frame, and the plating shelf across its foot. */
function paintHatch(g, rnd) {
  const H = HATCH;
  g.fillStyle = INK; g.fillRect(H.x - 2, H.y - 2, H.w + 2, H.h + 4);
  paintOutside(g, H.x, H.y, H.w, H.h, rnd, 52);
  // the truck's own awning hangs over this hatch (ART_STYLE section 1 "The truck"), so its shade falls across the
  // opening - heaviest on the sky band at the top. Without it the 140x140 of near-white lane sky was the lightest
  // mass in a room whose whole job is to make the station being cooked at the brightest thing in it
  g.globalAlpha = 0.34; g.fillStyle = PLUM.deep; g.fillRect(H.x, H.y, H.w, 42);
  g.globalAlpha = 0.16; g.fillRect(H.x, H.y + 42, H.w, H.h - 42);
  g.globalAlpha = 1;
  // the whole band from the shelf down to the floor is the counter's own front FIRST, so no pixel of the page
  // shows through at the screen edge, and the shelf then spans the full opening on top of it
  g.fillStyle = KITCHEN.counterFront; g.fillRect(H.x, H.shelfY, VIEW_W - H.x, ROWS.floor - H.shelfY);
  boxOutlined(g, H.x, H.shelfY, H.w, H.shelfH, KITCHEN.wood, INK, 2);
  g.fillStyle = UI.woodLight; g.fillRect(H.x + 1, H.shelfY + 1, H.w - 2, 2);
  g.fillStyle = UI.woodDark; g.fillRect(H.x, H.shelfY + H.shelfH - 5, H.w, 5);
}

/** The counter: the slate top with its 1 px highlight, the steel front with a seam every 80 px. */
function paintCounter(g) {
  const w = HATCH.x;
  g.fillStyle = INK; g.fillRect(0, ROWS.counterTop - 1, w, 1);
  g.fillStyle = KITCHEN.counterTop; g.fillRect(0, ROWS.counterTop, w, ROWS.counterFront - ROWS.counterTop);
  g.fillStyle = KITCHEN.counterHi; g.fillRect(0, ROWS.counterTop, w, 2);
  g.fillStyle = INK; g.fillRect(0, ROWS.counterFront, w, 1);
  g.fillStyle = KITCHEN.counterFront; g.fillRect(0, ROWS.counterFront + 1, w, ROWS.floor - ROWS.counterFront - 1);
  g.fillStyle = '#35404A';
  for (let x = 80; x < w; x += 80) g.fillRect(x, ROWS.counterFront + 3, 1, ROWS.floor - ROWS.counterFront - 5);
  g.fillStyle = INK; g.fillRect(0, ROWS.floor - 1, VIEW_W, 1);
}

/** The floor: a 12 px checker from row 246, the counter's shadow along its top, nothing at all in the walk lane. */
function paintFloor(g) {
  const T = 12;
  for (let y = ROWS.floor, row = 0; y < ROWS.skirting; y += T, row++) {
    const h = Math.min(T, ROWS.skirting - y);
    for (let x = 0, col = 0; x < VIEW_W; x += T, col++) { g.fillStyle = (row + col) & 1 ? KITCHEN.tileB : KITCHEN.tileA; g.fillRect(x, y, T, h); }
  }
  // the counter's shadow grounds it against its OWN front, above the floor line: rows 246..252 are where the
  // cast's dark hooves land and the verdict pinned them at L >= .30
  g.globalAlpha = 0.45; g.fillStyle = PLUM.deep; g.fillRect(0, ROWS.floor - 6, VIEW_W, 6); g.globalAlpha = 1;
  // two pools of afternoon light off the window and the hatch: the only marks on the floor, so the walk lane
  // stays clear of scatter while the empty foot of the room still reads as a lit floor (ART_STYLE section 7)
  g.globalAlpha = 0.09; g.fillStyle = OUT.skyHi;
  lightPool(g, WINDOW.x + 30, WINDOW.x + WINDOW.w + 34, 48);
  lightPool(g, HATCH.x + 4, VIEW_W, 84);
  g.globalAlpha = 1;
  g.fillStyle = INK; g.fillRect(0, ROWS.skirting, VIEW_W, 1);
  g.fillStyle = KITCHEN.skirting; g.fillRect(0, ROWS.skirting + 1, VIEW_W, VIEW_H - ROWS.skirting - 1);
}

/** A slanted pool of light on the floor: the top edge under the opening, the foot spread `spread` px further in. */
function lightPool(g, x0, x1, spread) {
  g.beginPath();
  g.moveTo(x0, ROWS.floor); g.lineTo(x1, ROWS.floor); g.lineTo(x1 - spread, ROWS.skirting); g.lineTo(x0 - spread, ROWS.skirting);
  g.closePath(); g.fill();
}

/** One crate of stores in the near corner, below the walk lane, so the empty foot of the room has a weight in it. */
function paintCrate(g) {
  const x = 12, y = 306, w = 46, h = 36;
  boxShaded(g, x, y, w, h, KITCHEN.wood, UI.woodDark, INK, 2, 0.34);
  g.fillStyle = UI.woodLight; g.fillRect(x + 3, y + 3, w - 6, 3);
  g.fillStyle = UI.woodDark; g.fillRect(x + 3, y + 15, w - 6, 3);
  boxOutlined(g, x + 30, y - 6, 22, 14, '#E3C68F');                     // a flour sack leaning on it
  g.fillStyle = '#C9B58E'; g.fillRect(x + 32, y + 2, 18, 4);
}

/**
 * The hand-lettered station signs on the wall: a paper card on a 2 px string carrying the station's NAME in ink,
 * one over each station. Painted into the layer because the lettering never changes; the screen adds the owner's
 * colour band and (for the step being worked) a brighter repaint on top, per frame.
 */
function paintTags(g) {
  for (let i = 0; i < TAG_POS.length; i++) {
    const x = TAG_POS[i][0], y = TAG_POS[i][1];
    g.fillStyle = INK; g.fillRect(x + R(TAG_W / 2) - 1, y - 6, 2, 6);   // the string it hangs by
    boxOutlined(g, x, y, TAG_W, TAG_H, UI.paperDark);
    g.fillStyle = UI.paperLine; g.fillRect(x + 1, y + 1, TAG_W - 2, 4); // the head band's empty trough
    drawText(g, TAG_NAME[i], x + R(TAG_W / 2), y + 6, { size: 1, color: UI.ink, align: 'center', shadow: false });
  }
}

/** The room without its furniture; `paintProps(g)` (art/kitchenProps.js paintStations) adds the station bodies. */
function paintRoom(g, w, h, rnd, paintProps) {
  paintWall(g, w);
  paintRail(g, w);
  paintWindow(g, rnd);
  paintPans(g);
  paintHatch(g, rnd);
  paintCounter(g);
  paintFloor(g);
  paintCrate(g);
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
