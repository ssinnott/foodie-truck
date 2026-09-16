// The front-of-house art: the dusk lane every menu screen is painted on, and the FOODIE TRUCK sign that hangs
// over the title (docs/ART_STYLE.md sections 1 and 7, the winning proposal's "## UI" logo paragraph).
//
// Both are PRE-RENDERED once into offscreen layers and blitted at integer offsets: the only per-frame marks the
// menus make are the swing of the sign (one rotated drawImage), the critters, the cursors and the paper. The lane
// is shared by title / select / lobby on purpose - three screens of one place, painted once - so its row bands are
// exported and the screens stand everything on them.
//
// Seed block 160..169, which docs/ART_STYLE.md section 7 now lists beside the scene blocks.
import { makeLayer, vGradient, blitAt, INK, VIEW_W, VIEW_H } from './layers.js';
import { UI, PLUM } from '../constants.js';
import { drawText, drawTextOutlined, measureText } from '../engine/text.js';
import { pathRR } from './shading.js';
import { drawFood } from './food.js';
import { TRUCK } from './truck.js';

const R = Math.round, TAU = Math.PI * 2;
const SEED = 160;

/**
 * The lane's muted constants: eight, and not one of them saturated. The scene's ONE signal colour is the ripe
 * red of the logo's apple (SIGNAL.orchard = UI.red, the panel's ruling that the apple is red, never lime); the
 * gold on the sign is the truck's own mustard, not the map's lantern gold, so no signal colour is used as decor.
 */
export const TITLE = Object.freeze({
  skyTop: '#F9D7B0', skyLow: '#F4C9A0', ridge: PLUM.shadow,
  hedge: '#4F6B3A', hedgeCap: '#6E8A48',
  meadow: '#8FA05A', lane: '#C9AE78', laneEdge: '#B99A6A',
});

/** Row bands of the lane (screen y). Everything the menus stand on comes from here. */
export const SKY_H = 150, HEDGE_Y = 150, MEADOW_Y = 214, LANE_Y = 258;
/** Where the parked truck's tyres and the crew's feet sit: both on the lane, the crew a few rows nearer. */
export const TRUCK_Y = 268, CREW_Y = 292;

// ---------------------------------------------------------------- the lane

/** One hedge mass: an ink pass, a fill pass, then caps toward the top-left light - never a heap of outlined discs. */
function hedgeMass(g, blobs, fill, cap) {
  g.fillStyle = INK;
  for (let i = 0; i < blobs.length; i += 3) { g.beginPath(); g.arc(blobs[i], blobs[i + 1], blobs[i + 2] + 2, 0, TAU); g.fill(); }
  g.fillStyle = fill;
  for (let i = 0; i < blobs.length; i += 3) { g.beginPath(); g.arc(blobs[i], blobs[i + 1], blobs[i + 2], 0, TAU); g.fill(); }
  for (let i = 0; i < blobs.length; i += 3) {
    const cx = blobs[i], cy = blobs[i + 1], r = blobs[i + 2];
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    g.fillStyle = cap; g.beginPath(); g.arc(cx - r * 0.24, cy - r * 0.3, r * 0.6, 0, TAU); g.fill();
    g.restore();
  }
}

function paintLane(g, w, h, rnd) {
  // sky: warm dusk peach, lightest at the top where the light comes from
  vGradient(g, 0, 0, w, SKY_H + 2, [[0, TITLE.skyTop], [1, TITLE.skyLow]]);
  // two clouds, painted once: the sky is where the eye rests while the sign swings
  for (let c = 0; c < 2; c++) {
    const cx = c === 0 ? 62 : 566, cy = 46 + c * 14, cr = 13 + c * 2;
    g.beginPath();
    g.arc(cx, cy, cr, 0, TAU);
    g.moveTo(cx + cr * 1.6, cy + 3); g.arc(cx + cr * 0.9, cy + 4, cr * 0.7, 0, TAU);
    g.moveTo(cx - cr * 0.4, cy + 6); g.arc(cx - cr * 1.1, cy + 4, cr * 0.62, 0, TAU);
    g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = UI.cream; g.fill();
    g.save(); g.clip(); g.fillStyle = UI.paperDark; g.fillRect(cx - cr * 2, cy + cr * 0.4, cr * 4, cr); g.restore();
  }
  // the far plum tree-line along the sky's foot: one hue family from everything in front of it
  g.fillStyle = TITLE.ridge;
  for (let x = -16; x < w + 40; x += 30) { g.beginPath(); g.arc(x + rnd() * 12, HEDGE_Y - 8, 12 + rnd() * 10, 0, TAU); g.fill(); }
  g.fillRect(0, HEDGE_Y - 10, w, 12);
  // the hedge: one mass of blobs with a 2 px ink line, running the width of the picture
  const blobs = [];
  for (let x = -20; x < w + 40; x += 26) blobs.push(x + R(rnd() * 8), HEDGE_Y + 14 + R(rnd() * 8), 18 + R(rnd() * 8));
  hedgeMass(g, blobs, TITLE.hedge, TITLE.hedgeCap);
  g.fillStyle = TITLE.hedge; g.fillRect(0, HEDGE_Y + 16, w, MEADOW_Y - HEDGE_Y - 14);
  g.fillStyle = INK; g.fillRect(0, MEADOW_Y - 1, w, 1);
  // the meadow strip between the hedge's foot and the lane, with tufts kept out of the lane itself
  g.fillStyle = TITLE.meadow; g.fillRect(0, MEADOW_Y, w, LANE_Y - MEADOW_Y);
  g.fillStyle = TITLE.hedgeCap;
  for (let i = 0; i < 40; i++) { const tx = R(rnd() * w), ty = MEADOW_Y + 6 + R(rnd() * (LANE_Y - MEADOW_Y - 12)); g.fillRect(tx, ty, 3, 3); g.fillRect(tx + 3, ty - 2, 2, 4); }
  // the lane: L .62 so the cream truck roof and the pale furs still read against it
  g.fillStyle = INK; g.fillRect(0, LANE_Y - 1, w, 1);
  g.fillStyle = TITLE.lane; g.fillRect(0, LANE_Y, w, h - LANE_Y);
  g.fillStyle = TITLE.laneEdge; g.fillRect(0, LANE_Y, w, 3);
  // ruts and pebbles, and NOTHING in the band the crew stands on (rows 276..312): a clean walk lane
  for (let i = 0; i < 26; i++) {
    const px = R(rnd() * w), py = LANE_Y + 6 + R(rnd() * (h - LANE_Y - 10));
    if (py > 274 && py < 314) continue;
    g.fillStyle = TITLE.laneEdge; g.fillRect(px, py, 3 + R(rnd() * 4), 2);
  }
  g.fillStyle = TITLE.laneEdge; g.fillRect(0, h - 10, w, 2);
}

let laneLayer = null;
/** The dusk lane, painted once. Shared by title, select and lobby. */
export function titleLayer() {
  if (!laneLayer) laneLayer = makeLayer(VIEW_W, VIEW_H, paintLane, SEED);
  return laneLayer;
}
/** Blit the lane at the origin. */
export function drawLane(ctx) { blitAt(ctx, titleLayer(), 0, 0); }

// ---------------------------------------------------------------- the card porthole

/**
 * The doily porthole a select card's bust sits in: a cream ring scalloped with paper-dark dots, one ink line and
 * the plum disc the pale furs read against. Nothing in it ever changes, so it is painted ONCE and blitted four
 * times a frame instead of costing 64 arcs (docs/ART_STYLE.md section 7).
 */
export const PORT_R = 40;
const PORT_PAD = 7;

function paintPorthole(g) {
  const c = PORT_R + PORT_PAD;
  g.beginPath(); g.arc(c, c, PORT_R + 3, 0, TAU); g.fillStyle = UI.cream; g.fill();
  g.fillStyle = UI.paperDark;
  for (let k = 0; k < 16; k++) {
    const a = k * TAU / 16;
    g.beginPath(); g.arc(c + Math.cos(a) * (PORT_R + 3), c + Math.sin(a) * (PORT_R + 3), 3, 0, TAU); g.fill();
  }
  g.beginPath(); g.arc(c, c, PORT_R + 1, 0, TAU); g.fillStyle = INK; g.fill();
  g.beginPath(); g.arc(c, c, PORT_R, 0, TAU); g.fillStyle = PLUM.shadow; g.fill();
}

let portLayer = null;
/** Blit the porthole centred on (cx, cy). The bust is drawn live on top, clipped to the same circle. */
export function drawPorthole(ctx, cx, cy) {
  if (!portLayer) portLayer = makeLayer((PORT_R + PORT_PAD) * 2, (PORT_R + PORT_PAD) * 2, paintPorthole, SEED + 2);
  blitAt(ctx, portLayer, cx - (PORT_R + PORT_PAD), cy - (PORT_R + PORT_PAD));
}

// ---------------------------------------------------------------- the logo

/** The hanging board: 300x92, two rows of size-5 carved letters. */
export const LOGO_W = 300, LOGO_H = 92;
/** How far the board hangs below the point it swings about. */
const ROPE = 14;
/** Letters at size 5 advance 30 px; the two fruit that stand in for FOODIE's Os are 20 px wide and advance 26. */
const LETTER_ADV = 30, FRUIT = 26, FRUIT_ADV = 30;
const ROW1_Y = 8, ROW2_Y = 48;

/**
 * One carved word: the outline pass in wood-dark at thickness 2, a cream highlight pass toward the light at
 * (-1,-1), then the paper-pale base. Three passes is what makes the letters look cut into the board rather
 * than printed on it.
 */
function carve(g, text, x, y) {
  drawTextOutlined(g, text, x, y, { size: 5, color: UI.woodDark, outline: UI.woodDark, thickness: 2, shadow: false });
  drawText(g, text, x - 1, y - 1, { size: 5, color: UI.cream, shadow: false });
  drawText(g, text, x, y, { size: 5, color: UI.paper, shadow: false });
}

/** A fried egg the size of a letter: a wobbly cream white under one ink line, a mustard yolk with a lit core. */
function friedEgg(g, cx, cy, s) {
  g.beginPath();
  g.ellipse(cx, cy, s * 0.48, s * 0.42, 0, 0, TAU);
  g.moveTo(cx + s * 0.5, cy + s * 0.04); g.arc(cx + s * 0.28, cy + s * 0.22, s * 0.22, 0, TAU);
  g.moveTo(cx - s * 0.16, cy - s * 0.44); g.arc(cx - s * 0.32, cy - s * 0.2, s * 0.2, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = UI.cream; g.fill();
  g.beginPath(); g.arc(cx, cy, s * 0.22, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = TRUCK.mustard; g.fill();
  g.fillStyle = TRUCK.lamp; g.fillRect(R(cx - s * 0.16), R(cy - s * 0.16), 3, 3);
}

/** The board itself, painted once: wood, its highlight cap and shadow band, then FOODIE / TRUCK carved into it. */
function paintBoard(g) {
  pathRR(g, 1, 1, LOGO_W - 2, LOGO_H - 2, 4);
  g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = UI.wood; g.fill();
  g.save(); pathRR(g, 1, 1, LOGO_W - 2, LOGO_H - 2, 4); g.clip();
  g.fillStyle = UI.woodLight; g.fillRect(3, 3, LOGO_W - 6, 3);
  g.fillStyle = UI.woodDark; g.fillRect(3, LOGO_H - 26, LOGO_W - 6, 23);
  // two plank seams, wide enough to clear the 2 px floor
  g.fillStyle = UI.woodDark; g.fillRect(3, 44, LOGO_W - 6, 2);
  g.restore();
  // FOODIE, with a fried egg and a red apple where the two Os belong
  const dieW = measureText('DIE', 5);
  const rowW = LETTER_ADV + FRUIT_ADV * 2 + dieW;
  let x = R(LOGO_W / 2 - rowW / 2);
  carve(g, 'F', x, ROW1_Y);
  x += LETTER_ADV;
  friedEgg(g, x + FRUIT / 2, ROW1_Y + 18, FRUIT);
  x += FRUIT_ADV;
  drawFood(g, 'apple', x + FRUIT / 2, ROW1_Y + 18, FRUIT / 2, UI.red);
  x += FRUIT_ADV;
  carve(g, 'DIE', x, ROW1_Y);
  carve(g, 'TRUCK', R(LOGO_W / 2 - measureText('TRUCK', 5) / 2), ROW2_Y);
  // two 3x3 ink nail dots at the top corners, where the ropes meet the board
  g.fillStyle = INK; g.fillRect(R(LOGO_W * 0.15), 5, 3, 3); g.fillRect(R(LOGO_W * 0.85) - 3, 5, 3, 3);
}

let boardLayer = null;
function board() {
  if (!boardLayer) boardLayer = makeLayer(LOGO_W, LOGO_H, paintBoard, SEED + 1);
  return boardLayer;
}

/**
 * Hang the logo from (cx, top) and swing it by `swing` radians about that point (+-0.02 looks right). The board
 * is one pre-rendered bitmap, so a frame of this is two rope rects and one rotated drawImage.
 */
export function drawLogoSign(ctx, cx, top, swing) {
  const L = board();
  ctx.save();
  ctx.translate(R(cx), R(top));
  if (swing) ctx.rotate(swing);
  ctx.fillStyle = UI.woodDark;
  ctx.fillRect(-R(LOGO_W * 0.35) - 1, 0, 2, ROPE + 2);
  ctx.fillRect(R(LOGO_W * 0.35) - 1, 0, 2, ROPE + 2);
  ctx.drawImage(L.canvas, -R(LOGO_W / 2), ROPE);
  ctx.restore();
}

/** Total height of the hung sign, for a screen that wants to know what it is standing clear of. */
export const LOGO_HANG = ROPE + LOGO_H;
