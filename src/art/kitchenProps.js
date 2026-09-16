// The kitchen's five stations (docs/GDD.md section 6; docs/ART_STYLE.md section 1 "Kitchen"): what sits on the
// counter at CHOP / MIX / STOVE / OVEN / PLATE, drawn in the rig's ink and three tones from the kitchen palette.
// `paintStations(g)` paints the static bodies ONCE into the room layer (art/backgrounds/kitchen.js); the exported
// draw* helpers are the few per-frame marks: the flame glow, the steam, the oven window's heat, the ingredient on the
// board, the bowl's contents, the plate and the paper timing widgets. Every helper is allocation-free; glow sprites
// are pre-rendered on first use and alpha-modulated (ART_STYLE section 5). Screen coordinates throughout.
import { INK, boxOutlined, makeGlowSprite, pulse } from './layers.js';
import { UI, SIGNAL, PLUM, PLAYER_COLORS } from '../constants.js';
import { drawFood, foodTones } from './food.js';
import { steamPuff } from './fx.js';
import { pathRR } from './shading.js';
import { drawText } from '../engine/text.js';
import { ROWS, HATCH, STATION_X, PROP_DX, TAG_Y, TAG_W, TAG_H } from './backgrounds/kitchen.js';

const R = Math.round, TAU = Math.PI * 2;
/** The warm things in the room: wood, copper, enamel, brass, paper. Heat is SIGNAL.hot and the #FFD27A core, nowhere else. */
export const PROPS = Object.freeze({
  maple: '#C9A05C', mapleEnd: '#6B4E3A', copper: '#B87333', copperSh: '#8A5220', copperHi: '#D9935A', hob: '#2A2428',
  enamel: '#F1E4C8', enamelSh: '#C9B58E', steel: '#B8C4C9', steelSh: '#8A9AA2', brass: '#E2B44A', brassSh: '#B08A30',
  bowlIn: PLUM.shadow, plate: '#FFF6E0', plateRim: '#D8C093', core: '#FFD27A', burnt: '#3A2430', dough: '#EBDCC0',
});
/** Station prop centres (x) and the counter top they stand on. */
export const PROP_X = Object.freeze(STATION_X.map((x) => x + PROP_DX));
const TOP = ROWS.counterTop;
/** The chopping board: 56x8 on the counter top. */
export const BOARD = Object.freeze({ x: PROP_X[0] - 28, y: TOP - 8, w: 56, h: 8 });
/** The bowl: 40x22 on the counter top. */
export const BOWL = Object.freeze({ x: PROP_X[1] - 20, y: TOP - 22, w: 40, h: 22 });
/** The hob (60x6 on the counter top) and the pot over it (44x30). */
export const HOB = Object.freeze({ x: PROP_X[2] - 30, y: TOP - 6, w: 60, h: 6 });
export const POT = Object.freeze({ x: PROP_X[2] - 22, y: TOP - 38, w: 44, h: 30 });
/** The floor-standing oven: 48x70 from above the counter top to the floor, so it breaks the counter line. */
export const OVEN = Object.freeze({ x: PROP_X[3] - 24, y: TOP - 14, w: 48, h: 70, winX: PROP_X[3] - 20, winY: TOP + 6, winW: 40, winH: 14 });
/** The plate on the hatch shelf (26x8) and the brass bell beside it (20x14 on its post). */
export const PLATE = Object.freeze({ x: PROP_X[4] - 13, y: HATCH.shelfY - 8, w: 26, h: 8 });
export const BELL = Object.freeze({ x: PROP_X[4] + 22, y: HATCH.shelfY - 16, w: 20, h: 14 });
/** Where the timing widget of a station hangs: above the prop, clear of the tallest head. */
export const WIDGET_Y = 132;

let glowFlame = null, glowOven = null, glowSoft = null;
function sprites() {
  if (!glowFlame) {
    glowFlame = makeGlowSprite(14, PROPS.core, SIGNAL.hot);
    glowOven = makeGlowSprite(22, PROPS.core, SIGNAL.hot);
    glowSoft = makeGlowSprite(34, 'rgba(255,210,122,0.55)', 'rgba(255,210,122,0.2)');
  }
}

// ---------------------------------------------------------------- static bodies (into the room layer)
function paintBoard(g) {
  const B = BOARD;
  g.fillStyle = INK; g.fillRect(B.x, B.y + B.h, B.w, 3);                      // the shadow line under the board
  boxOutlined(g, B.x, B.y, B.w, B.h, PROPS.maple);
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x, B.y, 2, B.h); g.fillRect(B.x + B.w - 2, B.y, 2, B.h);   // end-grain bands
  g.fillStyle = PROPS.enamelSh; g.fillRect(B.x + 3, B.y + 1, B.w - 6, 1);
  // the knife rack: a wooden bar on the wall with three knives hanging point down, open silhouettes
  const rx = B.x + 8, ry = 96;
  boxOutlined(g, rx, ry, 40, 6, UI.wood);
  for (let i = 0; i < 3; i++) {
    const kx = rx + 6 + i * 13;
    boxOutlined(g, kx, ry + 6, 4, 6, UI.woodDark);
    g.fillStyle = INK; g.fillRect(kx - 1, ry + 12, 6, 15);
    g.fillStyle = PROPS.steel; g.fillRect(kx, ry + 13, 4, 12); g.fillRect(kx + 1, ry + 25, 2, 1);
    g.fillStyle = PROPS.steelSh; g.fillRect(kx + 2, ry + 13, 2, 12);
  }
}

function paintBowl(g) {
  const B = BOWL;
  g.beginPath(); g.moveTo(B.x, B.y); g.lineTo(B.x + B.w, B.y); g.lineTo(B.x + B.w - 6, B.y + B.h); g.lineTo(B.x + 6, B.y + B.h); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.fillStyle = PROPS.enamel; g.fill();
  g.fillStyle = PROPS.enamelSh; g.fillRect(B.x + 6, B.y + B.h - 6, B.w - 12, 4);       // the lower shade band
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x + 2, B.y + 5, B.w - 4, 3);               // the 3 px stoneware band
  g.fillStyle = PROPS.bowlIn; g.fillRect(B.x + 2, B.y + 1, B.w - 4, 3);                 // the inside, seen over the rim
  // a whisk leaning in it: a 2 px wooden handle and a loop of 2 px arcs
  g.fillStyle = INK; g.fillRect(B.x + B.w - 6, B.y - 14, 4, 14);
  g.fillStyle = UI.wood; g.fillRect(B.x + B.w - 5, B.y - 13, 2, 12);
  g.beginPath(); g.ellipse(B.x + B.w - 4, B.y - 18, 3, 5, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.strokeStyle = PROPS.steel; g.lineWidth = 2; g.stroke();
}

function paintHob(g) {
  const H = HOB;
  boxOutlined(g, H.x, H.y, H.w, H.h, PROPS.hob);
  g.fillStyle = PROPS.steelSh; g.fillRect(H.x + H.w / 2 - 10, H.y + 1, 20, 2);          // the burner ring's rim
  boxOutlined(g, H.x + 4, H.y - 5, 6, 5, PROPS.steel);                                 // a control knob
}

function paintOven(g) {
  const O = OVEN;
  g.fillStyle = INK; g.fillRect(O.x - 2, O.y - 2, O.w + 4, O.h + 4);
  g.fillStyle = PROPS.enamel; g.fillRect(O.x, O.y, O.w, O.h);
  g.fillStyle = PROPS.enamelSh; g.fillRect(O.x + O.w - 6, O.y, 6, O.h); g.fillRect(O.x, O.y + O.h - 8, O.w, 8);   // shade: right edge and foot
  g.fillStyle = INK; g.fillRect(O.x, O.y + 6, O.w, 1);                                  // the top plate's edge
  g.fillStyle = '#4F5A62'; g.fillRect(O.x, O.y, O.w, 6);                                // a slate top plate
  g.fillStyle = INK; g.fillRect(O.x, O.y + 12, O.w, 1); g.fillRect(O.x, O.y + 44, O.w, 1);   // the door's top and bottom seams
  // the window: a steel frame round the dark interior (the glow is drawn per frame, clipped to it)
  g.fillStyle = INK; g.fillRect(O.winX - 2, O.winY - 2, O.winW + 4, O.winH + 4);
  g.fillStyle = PROPS.steel; g.fillRect(O.winX - 1, O.winY - 1, O.winW + 2, O.winH + 2);
  g.fillStyle = PLUM.deep; g.fillRect(O.winX, O.winY, O.winW, O.winH);
  boxOutlined(g, O.winX + 10, O.winY + O.winH + 6, 20, 4, PROPS.steel);                 // the handle bar
  boxOutlined(g, O.x + 6, O.y + 50, 6, 6, PROPS.steel);                                 // the dial
  g.fillStyle = INK; g.fillRect(O.x + 8, O.y + 51, 2, 2);
  g.fillStyle = INK; g.fillRect(O.x + 4, O.y + O.h, 6, 2); g.fillRect(O.x + O.w - 10, O.y + O.h, 6, 2);   // two feet
}

function paintShelfProps(g) {
  // a stack of three plates at the shelf's left end
  for (let i = 0; i < 3; i++) boxOutlined(g, HATCH.x + 8, HATCH.shelfY - 4 - i * 4, 26, 3, i & 1 ? PROPS.plateRim : PROPS.plate);
  // the counter bell: an ink post and base, a brass dome with its shade crescent and a knob
  const B = BELL;
  g.fillStyle = INK; g.fillRect(B.x + 2, B.y + B.h - 2, B.w - 4, 3);
  g.beginPath(); g.moveTo(B.x, B.y + B.h - 2); g.arc(B.x + B.w / 2, B.y + B.h - 2, B.w / 2, Math.PI, 0); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = PROPS.brass; g.fill();
  g.save(); g.clip(); g.fillStyle = PROPS.brassSh; g.fillRect(B.x + B.w / 2 + 2, B.y, B.w, B.h); g.restore();
  boxOutlined(g, B.x + B.w / 2 - 2, B.y - 4, 4, 4, PROPS.brass);
}

/** Paint every station's static body into the room layer (called once by the backdrop). */
export function paintStations(g) {
  paintBoard(g); paintBowl(g); paintHob(g); paintOven(g); paintShelfProps(g);
}

// ---------------------------------------------------------------- per-frame marks
/** The soft warm glow on the wall behind the current step's station, breathing on a 90-frame pulse. */
export function drawStationGlow(ctx, station, frame) {
  sprites();
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (0.35 + 0.15 * pulse(frame, 90));
  ctx.drawImage(glowSoft.canvas, PROP_X[station] - 34, TOP - 30 - 34);
  ctx.globalAlpha = a;
}

/**
 * The ingredient on the board: `cut` 0 whole, 1 halves, 2 dice; `wobble` shifts the whole thing (an off-beat press
 * shakes the board); `tak` flashes a 2 px cream spark on a hit.
 */
export function drawChopItem(ctx, icon, hex, cut, wobble, tak) {
  const cx = PROP_X[0] + wobble, cy = BOARD.y - 5;
  if (cut === 0) drawFood(ctx, icon, cx, cy, 6, hex);
  else if (cut === 1) { drawFood(ctx, icon, cx - 7, cy + 1, 4, hex); drawFood(ctx, icon, cx + 7, cy + 1, 4, hex); }
  else {
    const t = foodTones(hex || '#C8C0B0');
    for (let i = 0; i < 5; i++) { const dx = -12 + i * 6; ctx.fillStyle = INK; ctx.fillRect(cx + dx - 1, cy - 1, 6, 6); ctx.fillStyle = i & 1 ? t.sh : t.base; ctx.fillRect(cx + dx, cy, 4, 4); }
  }
  if (tak) { ctx.fillStyle = UI.cream; ctx.fillRect(cx + 8, cy - 12, 2, 4); ctx.fillRect(cx + 12, cy - 10, 4, 2); }
}

/** The bowl's contents, a 24x6 fill over the rim: lumps, then a ribbon, then smooth cream as `fill` grows. */
export function drawBowlContents(ctx, fill) {
  const B = BOWL, x = B.x + 8, y = B.y + 1;
  ctx.fillStyle = PROPS.dough;
  if (fill < 0.34) { for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 6 + (i & 1), y + (i & 1), 4, 3); }
  else if (fill < 0.67) { ctx.fillRect(x, y, 24, 3); ctx.fillStyle = PROPS.enamelSh; ctx.fillRect(x + 4, y + 1, 8, 2); }
  else ctx.fillRect(x, y, 24, 3);
}

/** The stove: the flame glow under the pot when lit (alpha by heat and pulse), the copper pot, steam over it. */
export function drawStove(ctx, lit, heat, frame, burnt) {
  sprites();
  const P = POT, a = ctx.globalAlpha;
  if (lit) {
    ctx.globalAlpha = a * (0.55 + 0.45 * pulse(frame, 40)) * Math.max(0.35, heat);
    ctx.drawImage(glowFlame.canvas, PROP_X[2] - 14, HOB.y - 12);
    ctx.globalAlpha = a;
  }
  // the pot: one inked body, its shade band, the 1 px rim highlight, two ink handles
  ctx.fillStyle = INK; ctx.fillRect(P.x - 6, P.y + 6, 6, 4); ctx.fillRect(P.x + P.w, P.y + 6, 6, 4);
  pathRR(ctx, P.x, P.y, P.w, P.h, 3);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = burnt ? PROPS.burnt : PROPS.copper; ctx.fill();
  ctx.fillStyle = burnt ? PLUM.deep : PROPS.copperSh; ctx.fillRect(P.x + 1, P.y + P.h - 10, P.w - 2, 8);
  ctx.fillStyle = burnt ? PROPS.copperSh : PROPS.copperHi; ctx.fillRect(P.x + 3, P.y + 1, P.w - 6, 1);
  ctx.fillStyle = PLUM.deep; ctx.fillRect(P.x + 2, P.y + 3, P.w - 4, 3);   // the dark inside, seen over the rim
  if (lit && heat > 0.15 && !burnt) { steamPuff(ctx, PROP_X[2] - 6, P.y - 2, frame, 20); steamPuff(ctx, PROP_X[2] + 7, P.y - 4, frame + 9, 24); }
}

/** The oven window: the interior glows by `heat` (0..1), with a tray of dough (pale, then golden, then burnt) inside. */
export function drawOvenWindow(ctx, heat, tray, burnt) {
  sprites();
  const O = OVEN;
  ctx.save(); ctx.beginPath(); ctx.rect(O.winX, O.winY, O.winW, O.winH); ctx.clip();
  if (heat > 0) { ctx.globalAlpha *= heat; ctx.drawImage(glowOven.canvas, PROP_X[3] - 22, O.winY + O.winH - 22); ctx.globalAlpha = 1; }
  if (tray) {
    ctx.fillStyle = INK; ctx.fillRect(O.winX + 7, O.winY + 6, 26, 6);
    ctx.fillStyle = burnt ? PROPS.burnt : heat > 0.7 ? PROPS.maple : PROPS.dough; ctx.fillRect(O.winX + 8, O.winY + 7, 24, 4);
    if (burnt) { ctx.fillStyle = SIGNAL.hot; ctx.fillRect(O.winX + 12, O.winY + 8, 2, 2); ctx.fillRect(O.winX + 24, O.winY + 9, 2, 2); }
  }
  ctx.restore();
}

/**
 * The plate on the shelf with `n` of the order's components stacked on it in recipe order; `squash` > 1 is the
 * landing beat of the last one. `icons` / `hexes` are the order's ingredient glyph ids and colours.
 */
export function drawPlate(ctx, x, y, icons, hexes, n, squash) {
  ctx.fillStyle = INK; ctx.fillRect(x - 14, y - 1, 28, 8);
  ctx.fillStyle = PROPS.plate; ctx.fillRect(x - 13, y, 26, 6);
  ctx.fillStyle = PROPS.plateRim; ctx.fillRect(x - 12, y + 4, 24, 1);
  for (let i = 0; i < n && i < icons.length; i++) {
    const last = i === n - 1, k = last ? squash : 1;
    const cx = x - 6 + i * 6 + (i > 1 ? 2 : 0), cy = y - 3 - (i > 1 ? 4 : 0);
    if (k !== 1) { ctx.save(); ctx.translate(cx, cy + 3); ctx.scale(k, 1 / k); ctx.translate(-cx, -cy - 3); }
    drawFood(ctx, icons[i], cx, cy, 3.5, hexes[i]);
    if (k !== 1) ctx.restore();
  }
}

/** The bell: a squash on the dome while `ringT` (frames since the ring) is small; the body lives in the layer. */
export function drawBellRing(ctx, ringT) {
  if (ringT < 0 || ringT > 8) return;
  const B = BELL, k = 1 + 0.15 * (1 - ringT / 8);
  ctx.save(); ctx.translate(B.x + B.w / 2, B.y + B.h); ctx.scale(k, 1 / k);
  ctx.beginPath(); ctx.moveTo(-B.w / 2, -2); ctx.arc(0, -2, B.w / 2, Math.PI, 0); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.brass; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- the paper timing widgets
const WIDGET_TEXT = { size: 1, color: UI.ink, shadow: false, align: 'center' };
/** A small paper card behind a widget (the same ticket recipe at 1 px: paper, ink, r2). */
function card(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x + 2, y + 3, w, h, 2); ctx.fill();
  pathRR(ctx, x, y, w, h, 2); ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = UI.paper; ctx.fill();
}

/** CHOP: the 36x5 sliding bar; `t` in 0..39 is the marker's sweep, the beat is the ink-outlined green window at its centre. */
export function drawChopBar(ctx, t, hits, total) {
  const x = PROP_X[0] - 24, y = WIDGET_Y, bx = x + 6, by = y + 6, w = 36, h = 5;
  card(ctx, x, y, 48, 22);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = UI.paperLine; ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx + 12, by, 12, h);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx + R(t * (w - 2) / 39) - 1, by - 2, 2, h + 4);   // the marker
  // one 4x4 pip per chop, filled as they land
  for (let i = 0; i < total; i++) { ctx.fillStyle = UI.ink; ctx.fillRect(bx + i * 7, by + 8, 4, 4); ctx.fillStyle = i < hits ? SIGNAL.good : UI.paperDark; ctx.fillRect(bx + i * 7 + 1, by + 9, 2, 2); }
}

/** MIX: a round paper dial filling clockwise in green; the needle stays put while the hold is released. */
export function drawDial(ctx, fill, paused) {
  const cx = PROP_X[1], cy = WIDGET_Y + 11;
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 3, 11, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU); ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = UI.paper; ctx.fill();
  if (fill > 0) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, fill)); ctx.closePath();
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = SIGNAL.good; ctx.fill();
  }
  ctx.fillStyle = paused ? UI.paperDark : UI.ink; ctx.fillRect(cx - 1, cy - 1, 3, 3);
}

/** STOVE: a bar that fills while held; the hot band is the last 20 %. */
export function drawStoveBar(ctx, fill) {
  const x = PROP_X[2] - 24, y = WIDGET_Y, bx = x + 6, by = y + 6;
  card(ctx, x, y, 48, 18);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx - 1, by - 1, 38, 7);
  ctx.fillStyle = UI.paperLine; ctx.fillRect(bx, by, 36, 5);
  ctx.fillStyle = SIGNAL.hot; ctx.fillRect(bx + 29, by, 7, 5);
  ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx, by, R(36 * Math.min(1, fill)), 5);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx + 28, by - 1, 1, 7);
}

/** OVEN: a 20x20 paper timer; a HOT arc sweeps as the bake runs, the green notch is the last 40 frames. */
export function drawOvenTimer(ctx, k, windowK) {
  const cx = PROP_X[3], cy = WIDGET_Y + 11;
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 3, 11, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU); ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = UI.paper; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 8, -Math.PI / 2 + TAU * (1 - windowK), -Math.PI / 2 + TAU); ctx.strokeStyle = SIGNAL.good; ctx.lineWidth = 3; ctx.stroke();
  if (k > 0) { ctx.beginPath(); ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k)); ctx.strokeStyle = SIGNAL.hot; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = UI.ink; ctx.fillRect(cx - 1, cy - 1, 3, 3);
}

/** PLATE: a 'RING' prompt card over the bell. */
export function drawPlatePrompt(ctx, text) {
  const x = PROP_X[4] - 24, y = WIDGET_Y;
  card(ctx, x, y, 48, 14);
  drawText(ctx, text, x + 24, y + 3, WIDGET_TEXT);
}

/** The station's paper tag: `segs` segments, `filled` of them in the owner's slot colour (all paper when unowned). */
export function drawTag(ctx, station, slot, segs, filled) {
  if (slot < 0 || segs <= 0) return;
  const x = STATION_X[station] + PROP_DX - R(TAG_W / 2) + 1, y = TAG_Y + 1, w = TAG_W - 2, sw = Math.floor(w / segs);
  ctx.fillStyle = PLAYER_COLORS[slot];
  for (let i = 0; i < filled && i < segs; i++) ctx.fillRect(x + i * sw, y, sw - 1, TAG_H - 2);
}
