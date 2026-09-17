// Clucket Coop, painted once (docs/ART_STYLE.md section 1 "Coop", section 7; docs/GDD.md section 5). An interior in
// daylight, side view with a deep floor band: the arena is the floor, so the layers are stacked by row band rather
// than by parallax (an interior has no far plane; the window's sky is painted into the wall). Four layers with seeds
// from the coop block 120..129, every one blitted at offset 0 by the screen:
//   wall    rows 0..190     grey-green boards with 1 px seams, the open window at x 520, six nesting boxes on a shelf
//   floor   rows 190..340   packed earth (cool blue-grey, L .32) with a darker back strip and cream straw scatter kept
//                           OUT of every row from 250 down - the whole walk lane, where the feet and the floor eggs are
//   near    rows 340..360   the straw-and-plank lip in front of everything (below the feet clamp, so never solid at
//                           critter height)
//   rafter  rows 0..40      the beam and two hanging lanterns pinned to the top edge, drawn over the crew's plates
// Nothing here animates: the egg sparkles, the hens, the crew and the dust are the screen's per-frame marks.
import { makeLayer, vGradient, boxShaded, boxOutlined, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;

/** The coop's muted constants (eight). The one saturated colour in the scene is SIGNAL.coop, the fresh-egg sparkle. */
export const COOP = Object.freeze({
  boards: '#55665A', seam: '#3F4D44', wood: '#6B4E3A',
  /** Nest straw, darker than the eggs (the judges' correction); the scatter on the floor is the paler strawLight. */
  straw: '#C9A05C', strawLight: '#E3C68F',
  /** Packed earth, cool so the hare's peat fur and every dark apron clear it by hue or value; the back strip darker. */
  floor: '#48526A', floorBack: '#3E4550',
  sky: '#FBE3C4',
});
/** Seed block 120..129 belongs to the coop (ART_STYLE section 7). */
const SEED = 120;

/** Row bands (screen y). */
export const ROWS = Object.freeze({ wall: 0, shelf: 132, floor: 190, backStrip: 202, laneTop: 250, laneBot: 290, lip: 340, bottom: VIEW_H });
/** The open window: 40x30 at x 520 (rows 40..70). */
export const WINDOW = Object.freeze({ x: 520, y: 40, w: 40, h: 30 });
/** Six 48x36 nesting boxes on the shelf (rows 132..168, so the name plates of the back row pass under them), by centre x; an egg laid in one sits at NEST_EGG_Y. */
export const NEST_X = Object.freeze([64, 166, 268, 370, 472, 574]);
export const NEST_W = 48, NEST_H = 36, NEST_EGG_Y = 158;
/** Where the two lanterns hang (centre x, bottom of the glass). */
export const LANTERN_X = Object.freeze([150, 490]);
export const LANTERN_Y = 34;
/** The roost perch's top row (a prop on the wall, above the row the name plates ride). */
const PERCH_Y = 100;

function paintWall(g, w, h, rnd) {
  g.fillStyle = COOP.boards; g.fillRect(0, 0, w, h);
  // 1 px seams every 10 rows, and the weathering: a board end (1 px, one seam tall) every 50..120 px along each
  // course and a knot here and there, all in the seam colour so the wall stays one quiet plane behind the crew
  g.fillStyle = COOP.seam;
  for (let y = 9; y < h; y += 10) g.fillRect(0, y, w, 1);
  for (let y = 0; y < h; y += 10) {
    for (let x = R(rnd() * 60); x < w; x += 50 + R(rnd() * 70)) g.fillRect(x, y, 1, 9);
    if (rnd() < 0.5) { const kx = R(rnd() * w); g.beginPath(); g.ellipse(kx, y + 4, 2, 1.5, 0, 0, TAU); g.fill(); }
  }
  // daylight: a soft shaft from the window down-left across the boards, one flat paler tone (no gradient, no line)
  const W = WINDOW;
  g.fillStyle = mix(COOP.boards, COOP.sky, 0.09);
  g.beginPath(); g.moveTo(W.x, W.y + 4); g.lineTo(W.x + W.w, W.y); g.lineTo(W.x + W.w - 30, ROWS.shelf); g.lineTo(W.x - 110, ROWS.shelf); g.closePath(); g.fill();
  // the roost perch: a 6 px wood pole on three brackets, left of the window, above the plates' row
  const dark0 = mix(COOP.wood, PLUM.deep, 0.5);
  for (let x = 40; x < 480; x += 200) boxOutlined(g, x, PERCH_Y + 4, 6, 10, dark0, INK, 1);
  boxShaded(g, 16, PERCH_Y, 470, 6, COOP.wood, dark0, INK, 1, 0.4);
  // a broom and a feed scoop hung on pegs by the window, a tin bucket on a hook at the far left
  boxOutlined(g, 592, 30, 4, 60, COOP.wood, INK, 1);
  g.fillStyle = INK; g.fillRect(586, 88, 16, 16);
  g.fillStyle = COOP.straw; g.fillRect(587, 89, 14, 14);
  g.fillStyle = mix(COOP.straw, PLUM.shadow, 0.35); g.fillRect(587, 99, 14, 4); for (let k = 0; k < 4; k++) g.fillRect(589 + k * 3, 89, 1, 10);
  boxOutlined(g, 500, 82, 4, 22, COOP.wood, INK, 1);
  boxShaded(g, 492, 102, 20, 10, '#8C8A93', mix('#8C8A93', PLUM.shadow, 0.4), INK, 1, 0.4);
  g.fillStyle = INK; g.fillRect(27, 44, 2, 8);
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(28, 58, 7, Math.PI, 0); g.stroke();
  boxShaded(g, 19, 58, 18, 14, '#8C8A93', mix('#8C8A93', PLUM.shadow, 0.4), INK, 1, 0.35);
  // the window: a 2 px ink frame, daylight sky over a strip of meadow, one ink mullion, a wood sill
  g.fillStyle = INK; g.fillRect(W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  vGradient(g, W.x, W.y, W.w, W.h, [[0, COOP.sky], [1, '#F4C9A0']]);
  g.fillStyle = '#8FA05A'; g.fillRect(W.x, W.y + W.h - 7, W.w, 7);
  g.fillStyle = mix('#8FA05A', PLUM.shadow, 0.35); g.fillRect(W.x, W.y + W.h - 7, W.w, 2);
  g.fillStyle = INK; g.fillRect(W.x + W.w / 2 - 1, W.y, 2, W.h);
  boxShaded(g, W.x - 4, W.y + W.h + 2, W.w + 8, 4, COOP.wood, mix(COOP.wood, PLUM.deep, 0.4), INK, 1, 0.5);
  // the shelf the nests sit on, then every box as one inked object: a wood frame, a dark cavity, the straw heap
  const dark = mix(COOP.wood, PLUM.deep, 0.5), cavity = mix(COOP.boards, PLUM.deep, 0.55);
  boxShaded(g, -2, ROWS.shelf + NEST_H, w + 4, 6, COOP.wood, dark, INK, 1, 0.5);
  for (let i = 0; i < NEST_X.length; i++) {
    const x = NEST_X[i] - NEST_W / 2, y = ROWS.shelf;
    boxOutlined(g, x, y, NEST_W, NEST_H, COOP.wood, INK, 1);
    g.fillStyle = dark; g.fillRect(x + NEST_W - 4, y, 4, NEST_H); g.fillRect(x, y + NEST_H - 3, NEST_W, 3);   // the frame's shadow side
    g.fillStyle = cavity; g.fillRect(x + 4, y + 4, NEST_W - 8, NEST_H - 8);
    // straw: a heap with three bumps on top, its shade in the lower rows, a few pale wisps on the surface
    g.fillStyle = COOP.straw;
    g.fillRect(x + 4, y + 20, NEST_W - 8, NEST_H - 24);
    for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + 11 + k * 13 + R(rnd() * 3), y + 21, 8, 4, 0, 0, TAU); g.fill(); }
    g.fillStyle = mix(COOP.straw, PLUM.shadow, 0.35); g.fillRect(x + 4, y + 27, NEST_W - 8, 5);
    g.fillStyle = COOP.strawLight;
    for (let k = 0; k < 5; k++) g.fillRect(x + 6 + R(rnd() * (NEST_W - 14)), y + 19 + R(rnd() * 6), 2, 1);
  }
}

/** One flat step of the window's light on the floor: a quad, top edge x0t..x1t, bottom edge x0b..x1b. */
function pool(g, fill, yTop, yBot, x0t, x1t, x0b, x1b) {
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(x0t, yTop); g.lineTo(x1t, yTop); g.lineTo(x1b, yBot); g.lineTo(x0b, yBot); g.closePath(); g.fill();
}

function paintFloor(g, w, h, rnd) {
  g.fillStyle = COOP.floor; g.fillRect(0, 0, w, h);
  g.fillStyle = COOP.floorBack; g.fillRect(0, 0, w, ROWS.backStrip - ROWS.floor);
  g.fillStyle = INK; g.fillRect(0, 0, w, 2);
  // The window's daylight reaches the floor. The wall already carries the shaft down to the shelf; the floor
  // continues it in two flat steps (no gradient, no line, same as the wall) so the game's one cool slab has warm
  // light lying across it instead of being 640x150 of nothing. The `floor` hex itself is untouched - the judges set
  // it at #48526A for the sheep's wool and the dark hooves (ART_STYLE section 1 "Coop").
  const bs = ROWS.backStrip - ROWS.floor;
  pool(g, mix(COOP.floor, COOP.straw, 0.24), bs, h, 352, 528, 228, 468);
  pool(g, mix(COOP.floor, COOP.straw, 0.40), bs, h, 392, 500, 284, 436);
  // Trodden earth: warm scuffs a shade off the wood, and chaff ground into the surface. Both are 1 px marks well
  // under the eggs' cream in value and nowhere near it in hue, so the lane keeps a clean read of the feet and the
  // floor eggs (ART_PRINCIPLES 26) while the earth stops being one flat colour.
  const scuff = mix(COOP.floor, COOP.wood, 0.34), chaff = mix(COOP.straw, COOP.floor, 0.42);
  g.fillStyle = scuff;
  for (let i = 0; i < 70; i++) g.fillRect(R(rnd() * w), bs + 2 + R(rnd() * (h - bs - 4)), 5 + R(rnd() * 9), 1);
  g.fillStyle = chaff;
  for (let i = 0; i < 46; i++) g.fillRect(R(rnd() * w), bs + 2 + R(rnd() * (h - bs - 4)), 3, 1);
  // straw scatter: 2x1 cream (a few in the nest straw tone), never below laneTop. The WALK LANE is not the old
  // laneTop..laneBot strip: the seats' feet clamp runs from y 262 to the bottom of the band and the floor eggs land
  // in it, so every row from laneTop down is lane and stays bare (ART_STYLE section 7) - cream specks down there read
  // in the egg's own family and a clump can be mistaken for an egg. The count stays, so the back band keeps its texture.
  const top = ROWS.laneTop - ROWS.floor;
  for (let i = 0; i < 130; i++) {
    const x = R(rnd() * w), y = 14 + R(rnd() * (h - 16));
    if (y >= top - 2) continue;
    g.fillStyle = rnd() < 0.75 ? COOP.strawLight : COOP.straw; g.fillRect(x, y, 2, 1);
  }
  // a few small clumps, back band only (the front edge is walkable floor now)
  for (let i = 0; i < 14; i++) {
    const x = R(rnd() * w), y = 14 + R(rnd() * 30);
    g.fillStyle = COOP.straw; g.fillRect(x, y, 4, 2); g.fillRect(x + 2, y - 1, 2, 1);
    g.fillStyle = COOP.strawLight; g.fillRect(x + 1, y, 2, 1);
  }
  // The floor's two warm objects, both parked in the back band above the seats' feet clamp (y 262), so nothing solid
  // stands in the walk lane: a wooden feed trough heaped with grain on the left, a bound straw bale on the right.
  const dark = mix(COOP.wood, PLUM.deep, 0.5), rim = mix(COOP.wood, COOP.straw, 0.3);
  const grain = mix(COOP.straw, COOP.wood, 0.28), floorSh = mix(COOP.floor, PLUM.deep, 0.3);
  g.fillStyle = floorSh;                                                             // contact shadow
  g.beginPath(); g.ellipse(72, 46, 46, 4, 0, 0, TAU); g.fill();
  boxOutlined(g, 36, 38, 7, 7, dark, INK, 1); boxOutlined(g, 101, 38, 7, 7, dark, INK, 1);   // the trough's two legs
  boxShaded(g, 30, 26, 84, 14, COOP.wood, dark, INK, 1, 0.45);                       // the trough body
  boxOutlined(g, 26, 21, 92, 6, rim, INK, 1);                                        // its rim
  g.fillStyle = grain;                                                               // the grain heaped over the rim
  for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(42 + k * 18, 23, 11, 4, 0, 0, TAU); g.fill(); }
  g.fillStyle = mix(grain, PLUM.shadow, 0.3); g.fillRect(32, 24, 78, 2);
  g.fillStyle = COOP.straw;
  for (let k = 0; k < 6; k++) g.fillRect(34 + R(rnd() * 72), 19 + R(rnd() * 4), 2, 1);
  // the bale: a face, a lighter top so it is a block and not a poster, straw striations, two twine bands
  const face = mix(COOP.straw, COOP.wood, 0.18), lit = mix(COOP.straw, COOP.strawLight, 0.55);
  g.fillStyle = floorSh; g.beginPath(); g.ellipse(570, 41, 36, 4, 0, 0, TAU); g.fill();
  boxOutlined(g, 536, 14, 68, 26, face, INK, 1);
  g.fillStyle = lit; g.fillRect(537, 15, 66, 5);
  g.fillStyle = mix(face, PLUM.shadow, 0.35); g.fillRect(536, 33, 68, 7);
  g.fillStyle = mix(face, PLUM.shadow, 0.28);
  for (let k = 0; k < 9; k++) g.fillRect(538 + R(rnd() * 40), 22 + R(rnd() * 15), 8 + R(rnd() * 14), 1);
  g.fillStyle = COOP.strawLight;
  for (let k = 0; k < 8; k++) g.fillRect(538 + R(rnd() * 56), 21 + R(rnd() * 14), 4, 1);
  g.fillStyle = dark; g.fillRect(552, 14, 3, 26); g.fillRect(584, 14, 3, 26);        // the twine bands
  for (let k = 0; k < 9; k++) {                                                      // straw shed round its foot
    const x = 528 + R(rnd() * 84), y = 41 + R(rnd() * 8);
    g.fillStyle = COOP.straw; g.fillRect(x, y, 4, 1);
    g.fillStyle = COOP.strawLight; g.fillRect(x + 1, y, 2, 1);
  }
}

/** The lip: a straw fringe of inked half-discs with the plank in front of it. */
function paintNear(g, w, h, rnd) {
  const dark = mix(COOP.wood, PLUM.deep, 0.45);
  g.fillStyle = INK;
  for (let x = -4; x < w + 8; x += 12) { g.beginPath(); g.arc(x, 10, 7 + R(rnd() * 3), 0, TAU); g.fill(); }
  g.fillStyle = COOP.straw;
  for (let x = -4; x < w + 8; x += 12) { g.beginPath(); g.arc(x, 10, 6 + R(rnd() * 3), 0, TAU); g.fill(); }
  g.fillStyle = COOP.strawLight;
  for (let i = 0; i < 60; i++) g.fillRect(R(rnd() * w), 2 + R(rnd() * 8), 2, 1);
  boxShaded(g, -2, 9, w + 4, h - 7, COOP.wood, dark, INK, 1, 0.35);
  g.fillStyle = dark; for (let x = 60; x < w; x += 120) g.fillRect(x, 10, 1, h - 10);   // plank ends
}

/** The rafter beam along the top edge and the two lanterns hanging off it on 2 px chains. */
function paintRafter(g, w) {
  const dark = mix(COOP.wood, PLUM.deep, 0.45);
  boxShaded(g, -2, -4, w + 4, 12, COOP.wood, dark, INK, 2, 0.4);
  for (let i = 0; i < LANTERN_X.length; i++) {
    const x = LANTERN_X[i], y = LANTERN_Y;
    g.fillStyle = INK; g.fillRect(x - 1, 8, 2, 8);
    boxOutlined(g, x - 5, y - 20, 10, 3, dark, INK, 1);        // cap
    boxOutlined(g, x - 4, y - 16, 8, 12, '#F1E4C8', INK, 1);   // glass
    g.fillStyle = mix('#F1E4C8', PLUM.shadow, 0.3); g.fillRect(x + 1, y - 16, 3, 12);
    g.fillStyle = '#FFD27A'; g.fillRect(x - 2, y - 11, 2, 4);   // the flame core (the one glow mark)
    boxOutlined(g, x - 5, y - 3, 10, 3, dark, INK, 1);         // base
  }
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { wall, floor, near, rafter } with the y each is blitted at. */
export function coopLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    wall: { L: makeLayer(VIEW_W, ROWS.floor, paintWall, SEED), y: 0 },
    floor: { L: makeLayer(VIEW_W, ROWS.lip - ROWS.floor, paintFloor, SEED + 1), y: ROWS.floor },
    near: { L: makeLayer(VIEW_W, VIEW_H - ROWS.lip, paintNear, SEED + 2), y: ROWS.lip },
    rafter: { L: makeLayer(VIEW_W, 40, paintRafter, SEED + 3), y: 0 },
  };
  return LAYERS;
}
