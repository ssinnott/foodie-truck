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
import { KITCHEN, ROWS, HATCH, PROP_X, TAG_POS, TAG_W, TAG_H, WIDGET_POS } from './backgrounds/kitchen.js';

const R = Math.round, TAU = Math.PI * 2;
/** The warm things in the room: wood, copper, enamel, brass, paper. Heat is SIGNAL.hot and the #FFD27A core, nowhere else. */
export const PROPS = Object.freeze({
  maple: '#C9A05C', mapleEnd: '#6B4E3A', copper: '#B87333', copperSh: '#8A5220', copperHi: '#D9935A', hob: '#2A2428',
  // enamelware is duck-egg, not cream: #F1E4C8 is Barley's fleece, and furniture may not wear a fur's own hex
  enamel: '#9DB5B2', enamelSh: '#76908C', range: '#7E9A8E', rangeSh: '#5E7A70', steel: '#B8C4C9', steelSh: '#8A9AA2', brass: KITCHEN.brass, brassSh: KITCHEN.brassSh,
  bowlIn: PLUM.shadow, plate: '#FFF6E0', plateRim: '#D8C093', core: '#FFD27A', burnt: '#3A2430', dough: '#EBDCC0',
});
const TOP = ROWS.counterTop;
/** The chopping board: 48x8 on the counter top, with the knife rack on the wall above it. */
export const BOARD = Object.freeze({ x: PROP_X[0] - 24, y: TOP - 8, w: 48, h: 8 });
const RACK = Object.freeze({ x: PROP_X[0] - 20, y: 78, w: 40, h: 6 });
/** The mixing bowl: 40x22 on the counter top. */
export const BOWL = Object.freeze({ x: PROP_X[1] - 20, y: TOP - 22, w: 40, h: 22 });
/** The hob (60x6 on the counter top) and the copper pot standing on it (44x30). */
export const HOB = Object.freeze({ x: PROP_X[2] - 30, y: TOP - 6, w: 60, h: 6 });
export const POT = Object.freeze({ x: PROP_X[2] - 22, y: TOP - 36, w: 44, h: 30 });
/** The floor-standing oven: 48x70 from above the counter top to the floor, so it breaks the counter line. */
export const OVEN = Object.freeze({ x: PROP_X[3] - 24, y: TOP - 14, w: 48, h: 70, winX: PROP_X[3] - 20, winY: TOP + 6, winW: 40, winH: 14 });
/** The plate on the hatch shelf (26x8) and the brass bell beside it (20x14 on its post). */
export const PLATE = Object.freeze({ x: PROP_X[4] - 13, y: HATCH.shelfY - 8, w: 26, h: 8 });
export const BELL = Object.freeze({ x: PROP_X[4] + 22, y: HATCH.shelfY - 16, w: 20, h: 14 });

let glowFlame = null, glowOven = null, glowSoft = null;
function sprites() {
  if (!glowFlame) {
    glowFlame = makeGlowSprite(14, PROPS.core, SIGNAL.hot);
    glowOven = makeGlowSprite(22, PROPS.core, SIGNAL.hot);
    glowSoft = makeGlowSprite(34, 'rgba(255,210,122,0.5)', 'rgba(255,210,122,0.18)');
  }
}

// ---------------------------------------------------------------- static bodies (into the room layer)
function paintBoard(g) {
  const B = BOARD;
  g.fillStyle = INK; g.fillRect(B.x + 2, B.y + B.h, B.w - 4, 2);              // the shadow line under the board
  boxOutlined(g, B.x, B.y, B.w, B.h, PROPS.maple);
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x, B.y, 2, B.h); g.fillRect(B.x + B.w - 2, B.y, 2, B.h);   // end-grain bands
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x + 3, B.y + B.h - 3, B.w - 6, 2);   // the board's own shade band
  // the knife rack: a wooden bar on the wall with three knives hanging point down, open silhouettes
  boxOutlined(g, RACK.x, RACK.y, RACK.w, RACK.h, UI.wood);
  for (let i = 0; i < 3; i++) {
    const kx = RACK.x + 6 + i * 13;
    boxOutlined(g, kx, RACK.y + RACK.h, 4, 5, UI.woodDark);
    g.fillStyle = INK; g.fillRect(kx - 1, RACK.y + RACK.h + 5, 6, 14);
    g.fillStyle = PROPS.steel; g.fillRect(kx, RACK.y + RACK.h + 6, 4, 11);
    g.fillStyle = PROPS.steelSh; g.fillRect(kx + 2, RACK.y + RACK.h + 6, 2, 11);
  }
}

function paintBowl(g) {
  const B = BOWL;
  // a whisk leaning in it, drawn first so the bowl's rim closes over its handle
  g.fillStyle = INK; g.fillRect(B.x + B.w - 9, B.y - 10, 4, 12);
  g.fillStyle = UI.wood; g.fillRect(B.x + B.w - 8, B.y - 9, 2, 10);
  g.beginPath(); g.ellipse(B.x + B.w - 7, B.y - 14, 4, 5, 0, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.strokeStyle = PROPS.steel; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(B.x, B.y); g.lineTo(B.x + B.w, B.y); g.lineTo(B.x + B.w - 6, B.y + B.h); g.lineTo(B.x + 6, B.y + B.h); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.fillStyle = PROPS.enamel; g.fill();
  g.fillStyle = PROPS.enamelSh; g.fillRect(B.x + 6, B.y + B.h - 6, B.w - 12, 4);       // the lower shade band
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x + 3, B.y + 6, B.w - 6, 3);              // the 3 px stoneware band
  g.fillStyle = PROPS.bowlIn; g.fillRect(B.x + 2, B.y + 1, B.w - 4, 4);                // the inside, seen over the rim
}

function paintHob(g) {
  const H = HOB;
  boxOutlined(g, H.x, H.y, H.w, H.h, PROPS.hob);
  g.fillStyle = PROPS.steelSh; g.fillRect(H.x + R(H.w / 2) - 10, H.y + 1, 20, 2);      // the burner ring's rim
  boxOutlined(g, H.x + 4, H.y - 5, 6, 5, PROPS.steel);                                 // a control knob
}

function paintOven(g) {
  const O = OVEN;
  g.fillStyle = INK; g.fillRect(O.x - 2, O.y - 2, O.w + 4, O.h + 4);
  g.fillStyle = PROPS.range; g.fillRect(O.x, O.y, O.w, O.h);                          // duck-egg enamel: a hue family off every fur
  g.fillStyle = PROPS.rangeSh; g.fillRect(O.x + O.w - 6, O.y, 6, O.h); g.fillRect(O.x, O.y + O.h - 8, O.w, 8);   // shade: right edge and foot
  g.fillStyle = PROPS.hob; g.fillRect(O.x, O.y, O.w, 6);                              // the dark hob plate on top
  g.fillStyle = INK; g.fillRect(O.x, O.y + 6, O.w, 1);
  // the door is the counter's own steel, dark enough that Cress's green and Barley's wool both clear it
  g.fillStyle = KITCHEN.counterFront; g.fillRect(O.x + 2, O.y + 13, O.w - 4, 35);
  g.fillStyle = INK; g.fillRect(O.x, O.y + 12, O.w, 1); g.fillRect(O.x, O.y + 48, O.w, 1);   // the door's top and bottom seams
  g.fillStyle = PROPS.brass; g.fillRect(O.x + 2, O.y + 44, O.w - 4, 4);               // a 4 px brass trim: the room's one warm metal
  g.fillStyle = PROPS.brassSh; g.fillRect(O.x + 2, O.y + 46, O.w - 4, 2);
  g.fillStyle = INK; g.fillRect(O.x, O.y + O.h - 6, O.w, 6);                          // the plinth it stands on
  // the window: a steel frame round the dark interior (the glow is drawn per frame, clipped to it)
  g.fillStyle = INK; g.fillRect(O.winX - 2, O.winY - 2, O.winW + 4, O.winH + 4);
  g.fillStyle = PROPS.steel; g.fillRect(O.winX - 1, O.winY - 1, O.winW + 2, O.winH + 2);
  g.fillStyle = PLUM.deep; g.fillRect(O.winX, O.winY, O.winW, O.winH);
  boxOutlined(g, O.winX + 10, O.winY + O.winH + 6, 20, 4, PROPS.brass);               // the handle bar
  boxOutlined(g, O.x + 6, O.y + 52, 6, 6, PROPS.steel);                               // the dial
  g.fillStyle = INK; g.fillRect(O.x + 8, O.y + 53, 2, 2);
  g.fillStyle = INK; g.fillRect(O.x + 4, O.y + O.h, 6, 3); g.fillRect(O.x + O.w - 10, O.y + O.h, 6, 3);   // two feet
}

function paintShelfProps(g) {
  // the counter bell: an ink base, a brass dome with its shade crescent and a knob. Nothing else stands on the
  // shelf: its left half is where the dish is plated, its right half is where the customer leans in.
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
  const cx = PROP_X[0] + wobble, cy = BOARD.y - 6;
  if (cut === 0) drawFood(ctx, icon, cx, cy, 6, hex);
  else if (cut === 1) { drawFood(ctx, icon, cx - 7, cy + 1, 4, hex); drawFood(ctx, icon, cx + 7, cy + 1, 4, hex); }
  else {
    const t = foodTones(hex || '#C8C0B0');
    for (let i = 0; i < 4; i++) { const dx = -11 + i * 6; ctx.fillStyle = INK; ctx.fillRect(cx + dx - 1, cy + 1, 6, 6); ctx.fillStyle = i & 1 ? t.sh : t.base; ctx.fillRect(cx + dx, cy + 2, 4, 4); }
  }
  if (tak) { ctx.fillStyle = UI.cream; ctx.fillRect(cx + 9, cy - 12, 2, 5); ctx.fillRect(cx + 13, cy - 9, 4, 2); }
}

/** The bowl's contents, a 24x4 fill over the rim: lumps, then a ribbon, then smooth cream as `fill` grows. */
export function drawBowlContents(ctx, fill) {
  const B = BOWL, x = B.x + 8, y = B.y + 1;
  if (fill <= 0) return;
  ctx.fillStyle = PROPS.dough;
  if (fill < 0.34) { for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 6 + (i & 1), y + (i & 1), 4, 3); }
  else if (fill < 0.67) { ctx.fillRect(x, y, 24, 4); ctx.fillStyle = PROPS.enamelSh; ctx.fillRect(x + 4, y + 1, 10, 2); }
  else ctx.fillRect(x, y, 24, 4);
}

/** The stove: the flame glow under the pot when lit (alpha by heat and pulse), the copper pot, steam over it. */
export function drawStove(ctx, lit, heat, frame, burnt) {
  sprites();
  const P = POT, a = ctx.globalAlpha;
  if (lit) {
    ctx.globalAlpha = a * (0.55 + 0.45 * pulse(frame, 40)) * Math.max(0.35, heat);
    ctx.drawImage(glowFlame.canvas, PROP_X[2] - 14, HOB.y - 14);
    ctx.globalAlpha = a;
  }
  // the pot: two ink-looped handles, a tapered body, the overhanging rim last so it reads as a lip
  const body = burnt ? PROPS.burnt : PROPS.copper, shade = burnt ? PLUM.deep : PROPS.copperSh;
  ctx.fillStyle = INK; ctx.fillRect(P.x - 7, P.y + 3, 7, 5); ctx.fillRect(P.x + P.w, P.y + 3, 7, 5);
  ctx.fillStyle = body; ctx.fillRect(P.x - 6, P.y + 4, 6, 3); ctx.fillRect(P.x + P.w, P.y + 4, 6, 3);
  ctx.beginPath();
  ctx.moveTo(P.x + 1, P.y + 6); ctx.lineTo(P.x + P.w - 1, P.y + 6); ctx.lineTo(P.x + P.w - 5, P.y + P.h); ctx.lineTo(P.x + 5, P.y + P.h); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = shade; ctx.fillRect(P.x, P.y + P.h - 11, P.w, 11);
  if (!burnt) { ctx.fillStyle = PROPS.copperHi; ctx.fillRect(P.x + 4, P.y + 9, 3, 10); }   // one highlight, top-left
  ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(P.x - 3, P.y, P.w + 6, 7);                              // the rim, inked
  ctx.fillStyle = body; ctx.fillRect(P.x - 2, P.y + 1, P.w + 4, 5);
  ctx.fillStyle = PLUM.deep; ctx.fillRect(P.x + 1, P.y + 1, P.w - 2, 3);                    // the dark inside over the rim
  if (lit && heat > 0.15 && !burnt) { steamPuff(ctx, PROP_X[2] - 6, P.y - 2, frame, 20); steamPuff(ctx, PROP_X[2] + 7, P.y - 4, frame + 9, 24); }
}

/** The oven window: the interior glows by `heat` (0..1), with a tray of dough (pale, then golden, then burnt) inside. */
export function drawOvenWindow(ctx, heat, tray, burnt) {
  sprites();
  const O = OVEN, a = ctx.globalAlpha;
  ctx.save(); ctx.beginPath(); ctx.rect(O.winX, O.winY, O.winW, O.winH); ctx.clip();
  if (heat > 0) { ctx.globalAlpha = a * heat; ctx.drawImage(glowOven.canvas, PROP_X[3] - 22, O.winY + O.winH - 22); ctx.globalAlpha = a; }
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
  ctx.fillStyle = PROPS.plateRim; ctx.fillRect(x - 12, y + 4, 24, 2);
  for (let i = 0; i < n && i < icons.length; i++) {
    const last = i === n - 1, k = last ? squash : 1;
    const cx = x - 6 + i * 7 + (i > 1 ? 1 : 0), cy = y - 3 - (i > 1 ? 5 : 0);
    if (k !== 1) { ctx.save(); ctx.translate(cx, cy + 3); ctx.scale(k, 1 / k); ctx.translate(-cx, -cy - 3); }
    drawFood(ctx, icons[i], cx, cy, 4, hexes[i]);
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
/** A paper disc behind a round widget. */
function disc(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 3, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = UI.paper; ctx.fill();
}

/** CHOP: the 36x5 sliding bar; `t` in 0..sweep is the marker's sweep, the beat is the green window at its centre. */
export function drawChopBar(ctx, t, sweep, hits, total) {
  const x = WIDGET_POS[0][0], y = WIDGET_POS[0][1], bx = x + 6, by = y + 6, w = 36, h = 5;
  card(ctx, x, y, 48, 24);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = UI.paperLine; ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx + 13, by, 10, h);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx + R(t * (w - 2) / (sweep - 1)) - 1, by - 3, 3, h + 6);   // the marker
  for (let i = 0; i < total; i++) { ctx.fillStyle = UI.ink; ctx.fillRect(bx + i * 7, by + 9, 5, 5); ctx.fillStyle = i < hits ? SIGNAL.good : UI.paperDark; ctx.fillRect(bx + i * 7 + 1, by + 10, 3, 3); }
}

/** MIX: a round paper dial filling clockwise in green; the needle greys out while the hold is released. */
export function drawDial(ctx, fill, paused) {
  const cx = WIDGET_POS[1][0] + 24, cy = WIDGET_POS[1][1] + 12;
  disc(ctx, cx, cy, 12);
  if (fill > 0) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, fill)); ctx.closePath();
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = SIGNAL.good; ctx.fill();
  }
  ctx.fillStyle = paused ? UI.paperDark : UI.ink; ctx.fillRect(cx - 2, cy - 2, 4, 4);
}

/** STOVE: a bar that fills while held; the hot band is an open frame over the last 20 %, so the green head runs
 *  THROUGH it instead of painting over it and the target is still there when you are standing on it. */
export function drawStoveBar(ctx, fill, hotFrom) {
  const x = WIDGET_POS[2][0], y = WIDGET_POS[2][1], bx = x + 6, by = y + 7, w = 36, h = 6;
  card(ctx, x, y, 48, 20);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = UI.paperLine; ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx, by, R(w * Math.min(1, fill)), h);
  // the band's frame: two inked hot rails above and below it, and the 2 px mark the hint tells you to pass
  const hx = bx + R(w * hotFrom), hw = w - R(w * hotFrom);
  ctx.fillStyle = UI.ink; ctx.fillRect(hx - 1, by - 5, hw + 2, 4); ctx.fillRect(hx - 1, by + h + 1, hw + 2, 4);
  ctx.fillStyle = SIGNAL.hot; ctx.fillRect(hx, by - 4, hw, 2); ctx.fillRect(hx, by + h + 2, hw, 2);
  ctx.fillStyle = UI.ink; ctx.fillRect(hx - 1, by - 2, 4, h + 4);
  ctx.fillStyle = SIGNAL.hot; ctx.fillRect(hx, by - 1, 2, h + 2);
}

/** OVEN: a round paper timer; a HOT arc sweeps as the bake runs, the green notch is its last 40 frames. */
export function drawOvenTimer(ctx, k, windowK) {
  const cx = WIDGET_POS[3][0] + 24, cy = WIDGET_POS[3][1] + 12;
  disc(ctx, cx, cy, 12);
  ctx.beginPath(); ctx.arc(cx, cy, 9, -Math.PI / 2 + TAU * (1 - windowK), -Math.PI / 2 + TAU);
  ctx.strokeStyle = UI.ink; ctx.lineWidth = 6; ctx.stroke();                 // UI.green on paper is always inked
  ctx.strokeStyle = SIGNAL.good; ctx.lineWidth = 4; ctx.stroke();
  if (k > 0) { ctx.beginPath(); ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k)); ctx.strokeStyle = SIGNAL.hot; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.fillStyle = UI.ink; ctx.fillRect(cx - 2, cy - 2, 4, 4);
}

/** PLATE: a paper card above the hatch telling whoever is there to ring the bell. */
export function drawPlatePrompt(ctx, text) {
  const x = WIDGET_POS[4][0], y = WIDGET_POS[4][1];
  card(ctx, x, y, 60, 18);
  drawText(ctx, text, x + 30, y + 5, WIDGET_TEXT);
}

/**
 * The station's paper tag: the moment a seat claims the step the tag turns SOLID in that seat's colour, because
 * the graft's whole point is that the tag says who owns the station and five 2 px ticks said nothing at a squint.
 * Progress is an ink bar eaten along the tag's foot instead (`filled` of `segs`).
 */
export function drawTag(ctx, station, slot, segs, filled) {
  if (slot < 0) return;
  const x = TAG_POS[station][0] + 1, y = TAG_POS[station][1] + 1, w = TAG_W - 2, h = TAG_H - 2;
  ctx.fillStyle = PLAYER_COLORS[slot] || UI.paperDark; ctx.fillRect(x, y, w, h);
  const done = segs > 0 ? Math.min(w, R(w * filled / segs)) : 0;
  if (done > 0) { ctx.fillStyle = UI.ink; ctx.fillRect(x, y + h - 2, done, 2); }
}
