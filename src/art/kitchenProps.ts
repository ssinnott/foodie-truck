// The kitchen's six stations (docs/GDD.md section 6; docs/ART_STYLE.md section 1 "Kitchen"): what stands at
// FRIDGE / CHOP / MIX / STOVE / OVEN / PLATE, drawn in the rig's ink and three tones from the kitchen palette.
// `paintStations(g)` paints the static bodies ONCE into the room layer (art/backgrounds/kitchen.js); the exported
// draw* helpers are the few per-frame marks: the flame glow, the steam, the oven window's heat, the ingredient on the
// board, the bowl's and the pot's contents, the plate, the food on its way between stations (`intake`,
// `drawFlight`) and the paper timing widgets. Every helper is allocation-free; glow sprites are pre-rendered on
// first use and alpha-modulated (ART_STYLE section 5). Screen coordinates throughout.
import { INK, boxOutlined, polyOutlined, discShaded, makeGlowSprite, pulse } from './layers.ts';
import { UI, SIGNAL, PLUM, PLAYER_COLORS } from '../constants.ts';
import { drawFood, foodTones } from './food.ts';
import { drawDish } from './dishes.ts';
import { steamPuff } from './fx.ts';
import { pathRR } from '../lib/art/shading.ts';
import { drawText } from '../engine/text.ts';
import type { DrawTextOptions } from '../engine/text.ts';
import { KITCHEN, ROWS, HATCH, PROP_X, TAG_POS, TAG_W, TAG_H, TAG_NAME, WIDGET_POS, PLATE_I } from './backgrounds/kitchen.ts';

const R = Math.round, TAU = Math.PI * 2;
/** Station indices, in content/places.js STATIONS order. */
const FRIDGE_I = 0, CHOP_I = 1, MIX_I = 2, STOVE_I = 3, OVEN_I = 4;
/** The warm things in the room: wood, copper, enamel, brass, paper. Heat is SIGNAL.hot and the #FFD27A core, nowhere else. */
export const PROPS = Object.freeze({
  maple: '#C9A05C', mapleEnd: '#6B4E3A', copper: '#B87333', copperSh: '#8A5220', copperHi: '#D9935A', hob: '#2A2428',
  // enamelware is duck-egg, not cream: #F1E4C8 is Barley's fleece, and furniture may not wear a fur's own hex.
  // The RANGE's enamel is a step darker again (L .16, was .30): the oven is the room's biggest object and as the
  // lightest mass in it, it pulled the eye off whichever station was being worked (director's note 14).
  enamel: '#9DB5B2', enamelSh: '#76908C', range: '#5A7570', rangeSh: '#425854', steel: '#B8C4C9', steelSh: '#8A9AA2', brass: KITCHEN.brass, brassSh: KITCHEN.brassSh,
  bowlIn: PLUM.shadow, plate: '#FFF6E0', plateRim: '#D8C093', core: '#FFD27A', burnt: '#3A2430', dough: '#EBDCC0',
});
const TOP = ROWS.counterTop;
/** The floor-standing fridge at the left end of the counter: a tall enamel box from the wall's clear band down to
 *  the floor, breaking the counter line like the range does; its door swings open for a beat on every pull. */
export const FRIDGE = Object.freeze({ x: PROP_X[FRIDGE_I] - 22, y: 146, w: 44, h: 110, doorY: 172 });
/**
 * The pile beside the chopping board: the board is the one station that is a flat surface rather than a vessel,
 * so what waits there is laid out on the counter to its RIGHT - past the round board, short of the bowl - in two
 * rows of PILE_COLS on PILE_PITCH. To the left it stood exactly where the cook chopping stands, behind their
 * head for the whole step; on the right only a second cook waiting at the bowl can cover it. Everywhere else the
 * batch goes INTO the prop (`intake`).
 */
export const PILE_X = PROP_X[CHOP_I] + 30;
const PILE_COLS = 4, PILE_PITCH = 9;
/** How high a flying item arcs over the counter between two stations, and the size it is drawn at on its way. */
export const FLY_ARC = 44, FLY_S = 4;
/** The chopping board: 48x11 on the counter top, with the big round board leaning behind it (the station's
 *  vertical, and what tells CHOP from MIX at 1x over a cook's head) and the knife rack on the wall above it. */
export const BOARD = Object.freeze({ x: PROP_X[CHOP_I] - 24, y: TOP - 11, w: 48, h: 11 });
const RACK = Object.freeze({ x: PROP_X[CHOP_I] - 20, y: 70, w: 40, h: 6 });
/** The mixing bowl: 40x26 on the counter top, with the wooden spoon standing in it. */
export const BOWL = Object.freeze({ x: PROP_X[MIX_I] - 20, y: TOP - 26, w: 40, h: 26 });
/** The hob (60x6 on the counter top) and the copper pot standing on it (44x30). */
export const HOB = Object.freeze({ x: PROP_X[STOVE_I] - 30, y: TOP - 6, w: 60, h: 6 });
export const POT = Object.freeze({ x: PROP_X[STOVE_I] - 22, y: TOP - 36, w: 44, h: 30 });
/** The floor-standing oven: 48x70 from above the counter top to the floor, so it breaks the counter line. */
export const OVEN = Object.freeze({ x: PROP_X[OVEN_I] - 24, y: TOP - 14, w: 48, h: 70, winX: PROP_X[OVEN_I] - 20, winY: TOP + 6, winW: 40, winH: 14 });
/** The enamel kettle on the range's back ring - the one thing in the room that is on whatever the cast is doing. */
export const KETTLE = Object.freeze({ x: OVEN.x + 26, y: OVEN.y - 16 });
/** The plate on the hatch shelf (26x8) and the brass bell beside it (20x14 on its post). */
export const PLATE = Object.freeze({ x: PROP_X[PLATE_I] - 13, y: HATCH.shelfY - 8, w: 26, h: 8 });
export const BELL = Object.freeze({ x: PROP_X[PLATE_I] + 22, y: HATCH.shelfY - 16, w: 20, h: 14 });

let glowFlame = null, glowOven = null, glowSoft = null, glowWork = null;
function sprites() {
  if (!glowFlame) {
    glowFlame = makeGlowSprite(14, PROPS.core, SIGNAL.hot);
    glowOven = makeGlowSprite(22, PROPS.core, SIGNAL.hot);
    // the work light over the station being cooked at: wide enough (r 52) to light the wall, the sign and the
    // counter top together, so the current step is the brightest place in a deliberately dark room
    glowSoft = makeGlowSprite(52, 'rgba(255,210,122,0.62)', 'rgba(255,210,122,0.2)');
    glowWork = makeGlowSprite(20, 'rgba(255,210,122,0.75)', 'rgba(255,210,122,0.22)');
  }
}

// ---------------------------------------------------------------- static bodies (into the room layer)
/** The fridge's carcass: the door is a per-frame mark (drawFridge), since it opens. */
function paintFridge(g) {
  const F = FRIDGE;
  g.fillStyle = INK; g.fillRect(F.x - 2, F.y - 2, F.w + 4, F.h + 4);
  g.fillStyle = PROPS.range; g.fillRect(F.x, F.y, F.w, F.h);
  g.fillStyle = PROPS.rangeSh; g.fillRect(F.x + F.w - 5, F.y, 5, F.h); g.fillRect(F.x, F.y + F.h - 8, F.w, 8);
  g.fillStyle = INK; g.fillRect(F.x, F.y + F.h - 6, F.w, 6);                          // the plinth
  g.fillRect(F.x + 4, F.y + F.h, 6, 3); g.fillRect(F.x + F.w - 10, F.y + F.h, 6, 3);   // two feet
  g.fillStyle = UI.cream; g.fillRect(F.x + 3, F.y + 3, 2, 14);                          // the one highlight, top-left
}

function paintBoard(g) {
  const B = BOARD;
  g.fillStyle = INK; g.fillRect(B.x + 2, B.y + B.h, B.w - 4, 2);              // the shadow line under the board
  // the big round board, leaning against the wall behind the work board: a 24 px maple paddle with its hanging
  // hole, standing 32 px off the counter. This is the CHOP station's silhouette at 1x - a knife stood in the
  // board, which is what was here first, read as a bottle at the size a cook's head leaves it
  const rx = B.x + 38, ry = B.y - 11;
  g.fillStyle = INK; g.fillRect(rx - 4, ry - 22, 8, 12);
  g.fillStyle = UI.wood; g.fillRect(rx - 3, ry - 21, 6, 11);
  g.fillStyle = UI.woodDark; g.fillRect(rx, ry - 21, 3, 11);
  g.fillStyle = INK; g.fillRect(rx - 2, ry - 19, 4, 4);                       // the hanging hole
  // dark wood, not the work board's maple: two boards of one tone stacked read as a single tan lump
  discShaded(g, rx, ry, 12, UI.wood, UI.woodDark, INK, 1);
  boxOutlined(g, B.x, B.y, B.w, B.h, PROPS.maple);
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x, B.y, 2, B.h); g.fillRect(B.x + B.w - 2, B.y, 2, B.h);   // end-grain bands
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x + 3, B.y + B.h - 4, B.w - 6, 3);   // the board's own shade band
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
  // the wooden spoon standing in it, drawn first so the bowl's rim closes over the shaft: a 4 px shaft (the 2 px
  // whisk wire it replaces vanished at 1x) leaning out to the left, and the spoon's own bowl on top of it
  polyOutlined(g, [B.x + 13, B.y + 8, B.x + 17, B.y + 8, B.x + 8, B.y - 20, B.x + 4, B.y - 20], UI.wood, INK, 1);
  g.fillStyle = UI.woodDark; g.fillRect(B.x + 12, B.y - 6, 3, 13);
  g.beginPath(); g.ellipse(B.x + 5, B.y - 22, 5, 6, -0.2, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = UI.woodLight; g.fill();
  g.fillStyle = UI.wood; g.fillRect(B.x + 4, B.y - 20, 5, 4);
  // the bowl: a ROUNDED belly on a narrow foot with the rim lip overhanging both sides. The straight taper it
  // replaces read as a flower pot at 1x; a mixing bowl is wide at the lip and curves in to a small base
  g.beginPath();
  g.moveTo(B.x + 2, B.y + 4); g.lineTo(B.x + B.w - 2, B.y + 4);
  g.quadraticCurveTo(B.x + B.w - 3, B.y + B.h, B.x + B.w - 13, B.y + B.h);
  g.lineTo(B.x + 13, B.y + B.h);
  g.quadraticCurveTo(B.x + 3, B.y + B.h, B.x + 2, B.y + 4);
  g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.fillStyle = PROPS.enamel; g.fill();
  g.save(); g.clip();
  g.fillStyle = PROPS.enamelSh; g.fillRect(B.x, B.y + B.h - 10, B.w, 10);              // the lower shade band
  g.fillStyle = PROPS.mapleEnd; g.fillRect(B.x, B.y + 10, B.w, 3);                     // the 3 px stoneware band
  g.restore();
  g.fillStyle = INK; g.fillRect(B.x - 1, B.y - 1, B.w + 2, 7);                         // the rim, inked and overhanging
  g.fillStyle = PROPS.enamel; g.fillRect(B.x, B.y, B.w, 5);
  g.fillStyle = PROPS.bowlIn; g.fillRect(B.x + 2, B.y + 1, B.w - 4, 4);                // the inside, seen over the rim
}

function paintHob(g) {
  const H = HOB;
  boxOutlined(g, H.x, H.y, H.w, H.h, PROPS.hob);
  // the burner: a steel ring with three grate bars across it, so the hob is a hob and not a black stripe
  g.fillStyle = PROPS.steelSh; g.fillRect(H.x + R(H.w / 2) - 13, H.y + 1, 26, 3);
  g.fillStyle = PROPS.hob; for (let i = 0; i < 3; i++) g.fillRect(H.x + R(H.w / 2) - 9 + i * 8, H.y + 1, 3, 3);
  boxOutlined(g, H.x + 4, H.y - 5, 6, 5, PROPS.steel);                                 // a control knob
}

function paintOven(g) {
  const O = OVEN;
  g.fillStyle = INK; g.fillRect(O.x - 2, O.y - 2, O.w + 4, O.h + 4);
  g.fillStyle = PROPS.range; g.fillRect(O.x, O.y, O.w, O.h);                          // duck-egg enamel: a hue family off every fur
  g.fillStyle = PROPS.rangeSh; g.fillRect(O.x + O.w - 6, O.y, 6, O.h); g.fillRect(O.x, O.y + O.h - 8, O.w, 8);   // shade: right edge and foot
  g.fillStyle = PROPS.hob; g.fillRect(O.x, O.y, O.w, 6);                              // the dark hob plate on top
  g.fillStyle = PROPS.steelSh;                                                        // two burner rings: a RANGE
  g.fillRect(O.x + 6, O.y + 1, 14, 3); g.fillRect(O.x + 28, O.y + 1, 14, 3);
  g.fillStyle = PROPS.hob; g.fillRect(O.x + 12, O.y + 1, 2, 3); g.fillRect(O.x + 34, O.y + 1, 2, 3);
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
  paintKettle(g, KETTLE.x, KETTLE.y);
}

/** The enamel kettle on the range's back ring: the OVEN's one silhouette ABOVE the counter line, where the door,
 *  the window and the handle all sit below it behind whoever is cooking. Spout and lid knob, so it is never the
 *  copper pot at a squint. */
function paintKettle(g, x, y) {
  // the strap handle first, as an OPEN arc with the wall showing under it (a filled dome read as a radio)
  g.lineCap = 'butt'; g.lineJoin = 'round';
  g.strokeStyle = INK; g.lineWidth = 4;
  g.beginPath(); g.arc(x + 10, y + 4, 9, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  g.strokeStyle = PROPS.steelSh; g.lineWidth = 2;
  g.beginPath(); g.arc(x + 10, y + 4, 9, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  polyOutlined(g, [x + 3, y + 6, x - 7, y + 1, x - 7, y + 6, x + 3, y + 12], PROPS.enamel, INK, 1);   // the spout
  polyOutlined(g, [x + 3, y + 3, x + 17, y + 3, x + 20, y + 16, x, y + 16], PROPS.enamel, INK, 1);    // the body
  g.save(); g.clip();
  g.fillStyle = PROPS.enamelSh; g.fillRect(x + 12, y, 10, 20); g.fillRect(x - 2, y + 12, 24, 6);
  g.fillStyle = UI.cream; g.fillRect(x + 5, y + 5, 3, 6);                              // the one highlight, top-left
  g.restore();
  boxOutlined(g, x + 5, y, 10, 4, PROPS.enamel);                                       // the lid
  g.fillStyle = INK; g.fillRect(x + 8, y - 4, 5, 4);
  g.fillStyle = PROPS.brass; g.fillRect(x + 9, y - 3, 3, 3);                            // the lid's brass knob
}

function paintShelfProps(g) {
  // the counter bell: an ink base, a brass dome with its shade crescent and a knob. Nothing else stands on the
  // shelf: its left half is where the dish is plated, its right half is where the customer leans in.
  const B = BELL;
  g.fillStyle = INK; g.fillRect(B.x + 2, B.y + B.h - 2, B.w - 4, 3);
  g.beginPath(); g.moveTo(B.x, B.y + B.h - 2); g.arc(B.x + B.w / 2, B.y + B.h - 2, B.w / 2, Math.PI, 0); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = PROPS.brass; g.fill();
  g.save(); g.clip(); g.fillStyle = PROPS.brassSh; g.fillRect(B.x + B.w / 2 + 2, B.y, B.w, B.h); g.restore();
  g.fillStyle = UI.cream; g.fillRect(B.x + 4, B.y + 5, 3, 5);                  // the dome's one highlight, top-left
  boxOutlined(g, B.x + B.w / 2 - 2, B.y - 4, 4, 4, PROPS.brass);
}

/** Paint every station's static body into the room layer (called once by the backdrop). */
export function paintStations(g) {
  paintFridge(g); paintBoard(g); paintBowl(g); paintHob(g); paintOven(g); paintShelfProps(g);
}

/**
 * The fridge door, per frame: shut, it is an enamel slab with a brass handle and the freezer seam; open (`openT`
 * frames left of the swing), it stands out to the left as a thin slab and the dark inside shows three shelves with
 * whatever is still to come out (`icons`/`hexes` from `next` on, at most six of them).
 */
export function drawFridge(ctx, openT, icons, hexes, next) {
  const F = FRIDGE, dy = F.doorY, dh = F.y + F.h - 6 - dy;
  if (openT <= 0) {
    ctx.fillStyle = INK; ctx.fillRect(F.x, F.y + 22, F.w, 1); ctx.fillRect(F.x, dy - 1, F.w, 1);      // the freezer seam and the door's top
    ctx.fillStyle = PROPS.brass; ctx.fillRect(F.x + 5, F.y + 8, 3, 10); ctx.fillRect(F.x + 5, dy + 8, 3, 22);   // the two handles
    ctx.fillStyle = PROPS.brassSh; ctx.fillRect(F.x + 7, F.y + 8, 1, 10); ctx.fillRect(F.x + 7, dy + 8, 1, 22);
    return;
  }
  // open: the inside, the shelves, what is left on them, and the door out on its hinge
  ctx.fillStyle = INK; ctx.fillRect(F.x, dy - 1, F.w, dh + 1);
  ctx.fillStyle = PLUM.deep; ctx.fillRect(F.x + 2, dy + 1, F.w - 7, dh - 3);
  ctx.fillStyle = PROPS.steelSh;
  for (let k = 1; k <= 3; k++) ctx.fillRect(F.x + 2, dy + k * R(dh / 3.5), F.w - 7, 2);
  for (let i = next, k = 0; i < icons.length && k < 6; i++, k++) {
    drawFood(ctx, icons[i], F.x + 9 + (k % 2) * 16, dy + 4 + ((k / 2) | 0) * R(dh / 3.5), 3, hexes[i]);
  }
  ctx.fillStyle = INK; ctx.fillRect(F.x - 9, dy - 1, 9, dh + 1);
  ctx.fillStyle = PROPS.range; ctx.fillRect(F.x - 8, dy, 7, dh - 1);
  ctx.fillStyle = PROPS.rangeSh; ctx.fillRect(F.x - 3, dy, 2, dh - 1);
  ctx.fillStyle = PROPS.brass; ctx.fillRect(F.x - 7, dy + 8, 2, 22);
}

/** Slot `i` of the pile beside the board: two rows of PILE_COLS on the counter, the second behind and above the first. */
export function pileSlotX(i) { return PILE_X + (i % PILE_COLS) * PILE_PITCH; }
export function pileSlotY(i) { return TOP - 5 - ((i / PILE_COLS) | 0) * 7; }
/** Where component `j` of the dish sits on a plate drawn at (x, y): three across, the third up on the first two. */
export function plateSlotX(x, j) { return x - 6 + j * 7 + (j > 1 ? 1 : 0); }
export function plateSlotY(y, j) { return y - 3 - (j > 1 ? 5 : 0); }

/**
 * WHERE THE FOOD GOES at each station: the point unit `unit` of the order's batch flies to when it arrives there,
 * and flies out of when the step is done. The board is a surface, so its first unit lands on the board itself
 * (where drawChopItem draws it) and the rest pile up beside it; the bowl, the pot and the oven window are
 * vessels, so everything drops in at one point; the plate stacks by DISH component (`dish`, the unit's index in
 * the order's `needs`) where drawPlate stacks it; the fridge's is the open door, where a pull comes out. Written
 * into `out` so the caller's flight table is filled without allocating.
 */
export function intake(station, unit, dish, out) {
  switch (station) {
    case CHOP_I: if (unit === 0) { out.x = PROP_X[CHOP_I]; out.y = BOARD.y - 6; } else { out.x = pileSlotX(unit - 1); out.y = pileSlotY(unit - 1); } break;
    case MIX_I: out.x = BOWL.x + BOWL.w / 2; out.y = BOWL.y + 2; break;
    case STOVE_I: out.x = POT.x + POT.w / 2; out.y = POT.y + 2; break;
    case OVEN_I: out.x = OVEN.winX + OVEN.winW / 2; out.y = OVEN.winY + OVEN.winH / 2; break;
    case PLATE_I: out.x = plateSlotX(PLATE.x + 13, dish); out.y = plateSlotY(PLATE.y, dish); break;
    default: out.x = FRIDGE.x + FRIDGE.w / 2; out.y = FRIDGE.doorY + 20; break;   // FRIDGE_I
  }
}

/** The pile beside the board: units 1..n-1 of the batch (unit 0 is ON the board, drawChopItem's). Nothing for n <= 1. */
export function drawPile(ctx, icons, hexes, n) {
  for (let i = 1; i < n && i < icons.length; i++) drawFood(ctx, icons[i], pileSlotX(i - 1), pileSlotY(i - 1), FLY_S, hexes[i]);
}

/**
 * One item on its arc from (x0, y0) to (x1, y1), `k` (0..1) of the way there: a straight line between the two
 * points lifted by a FLY_ARC sine hump, so a hop from the board to the bowl and a drop from the oven window
 * to the plate both read as a toss. Math.sin is fine here: draw only, `k` comes off an integer frame counter.
 */
export function drawFlight(ctx, icon, hex, x0, y0, x1, y1, k) {
  const x = R(x0 + (x1 - x0) * k), y = R(y0 + (y1 - y0) * k - FLY_ARC * Math.sin(k * Math.PI));
  drawFood(ctx, icon, x, y, FLY_S, hex);
}

// ---------------------------------------------------------------- per-frame marks
/**
 * THE CURRENT STEP, made the most obvious thing on the screen: the work light on the wall behind its station
 * (breathing on a 90-frame pulse), its paper sign repainted in bright stock with a doubled ink line while every
 * other sign stays in paper-dark, and a paper chevron under the timing card pointing down at the station. Nothing
 * else in the room is lit like this, so the eye lands on the step before it reads a word.
 */
export function drawStationFocus(ctx, station, frame) {
  sprites();
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (0.62 + 0.18 * pulse(frame, 90));
  ctx.drawImage(glowSoft.canvas, PROP_X[station] - 52, TOP - 40 - 52);
  ctx.globalAlpha = a * (0.5 + 0.14 * pulse(frame, 90));
  ctx.drawImage(glowWork.canvas, PROP_X[station] - 20, TOP - 10 - 20);   // a tighter pool on the counter itself
  ctx.globalAlpha = a;
  const x = TAG_POS[station][0], y = TAG_POS[station][1];
  ctx.fillStyle = UI.ink; ctx.fillRect(x - 2, y - 2, TAG_W + 4, TAG_H + 4);
  ctx.fillStyle = UI.paper; ctx.fillRect(x, y, TAG_W, TAG_H);
  ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 1, y + 1, TAG_W - 2, 4);
  drawText(ctx, TAG_NAME[station], x + R(TAG_W / 2), y + 6, WIDGET_TEXT);
  // the chevron sits under the timing card, which grew 2 rows (CHOP, STOVE) / 6 rows (PLATE) for its owner strip
  const cx = PROP_X[station], cy = WIDGET_POS[station][1] + (station === PLATE_I ? 26 : 28) + ((frame >> 3) & 1);
  ctx.fillStyle = UI.ink;
  ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = UI.paper;
  ctx.beginPath(); ctx.moveTo(cx - 4, cy + 1); ctx.lineTo(cx + 4, cy + 1); ctx.lineTo(cx, cy + 5); ctx.closePath(); ctx.fill();
}

/**
 * THE ROOM'S PILOT LIGHT: the kettle's plume, drawn every frame whatever the cast is doing. The pot's steam is
 * gated behind a station being actively worked, so for most of a round the kitchen held not one soft mark and the
 * climax scene of a cooking game read as shut for the night. A kettle is always on, so this is honest, it is one
 * call site, and it makes the room read as occupied from the first frame. Cosmetic: `frame` drives it, no state.
 */
export function drawKettleSteam(ctx, frame) {
  // three wisps off the spout on one 30-frame period, a third of it apart, so the column is never empty; each is
  // laid down twice because one pass of steamPuff's own 0.6..0.1 alpha over a plum wall is a smudge, not steam
  for (let i = 0; i < 2; i++) {
    steamPuff(ctx, KETTLE.x - 7, KETTLE.y - 1, frame, 30, PROPS.plate, 18);
    steamPuff(ctx, KETTLE.x - 9, KETTLE.y - 6, frame + 10, 30, PROPS.plate, 18);
    steamPuff(ctx, KETTLE.x - 5, KETTLE.y - 11, frame + 20, 30, PROPS.plate, 18);
  }
}

/**
 * The ingredient on the board: `cut` 0 whole, 1 halves, 2 dice; `wobble` shifts the whole thing (an off-beat press
 * shakes the board); `tak` flashes a 2 px cream spark on a hit.
 */
export function drawChopItem(ctx, icon, hex, cut, wobble, tak) {
  const cx = PROP_X[CHOP_I] + wobble, cy = BOARD.y - 6;
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

/** The stove: the flame glow under the pot when lit (alpha by heat and pulse), the copper pot, steam over it.
 *  `hex` is what is IN the pot, seen over the rim in that ingredient's tones (null = an empty pot). */
export function drawStove(ctx, lit, heat, frame, hex = null) {
  sprites();
  const P = POT, a = ctx.globalAlpha;
  if (lit) {
    ctx.globalAlpha = a * (0.55 + 0.45 * pulse(frame, 40)) * Math.max(0.35, heat);
    ctx.drawImage(glowFlame.canvas, PROP_X[STOVE_I] - 14, HOB.y - 14);
    ctx.globalAlpha = a;
  }
  // the pot: two ink-looped handles, a tapered body, the overhanging rim last so it reads as a lip
  const body = PROPS.copper, shade = PROPS.copperSh;
  ctx.fillStyle = INK; ctx.fillRect(P.x - 7, P.y + 3, 7, 5); ctx.fillRect(P.x + P.w, P.y + 3, 7, 5);
  ctx.fillStyle = body; ctx.fillRect(P.x - 6, P.y + 4, 6, 3); ctx.fillRect(P.x + P.w, P.y + 4, 6, 3);
  ctx.beginPath();
  ctx.moveTo(P.x + 1, P.y + 6); ctx.lineTo(P.x + P.w - 1, P.y + 6); ctx.lineTo(P.x + P.w - 5, P.y + P.h); ctx.lineTo(P.x + 5, P.y + P.h); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = shade; ctx.fillRect(P.x, P.y + P.h - 11, P.w, 11);
  ctx.fillStyle = PROPS.copperHi; ctx.fillRect(P.x + 4, P.y + 9, 3, 10);   // one highlight, top-left
  ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(P.x - 3, P.y, P.w + 6, 7);                              // the rim, inked
  ctx.fillStyle = body; ctx.fillRect(P.x - 2, P.y + 1, P.w + 4, 5);
  ctx.fillStyle = PLUM.deep; ctx.fillRect(P.x + 1, P.y + 1, P.w - 2, 3);                    // the dark inside over the rim
  if (hex) {
    // what is cooking: the ingredient's own base over its shade, so a carrot soup reads orange over the copper
    const t = foodTones(hex);
    ctx.fillStyle = t.sh; ctx.fillRect(P.x + 3, P.y + 1, P.w - 6, 3);
    ctx.fillStyle = t.base; ctx.fillRect(P.x + 4, P.y + 1, P.w - 8, 2);
  }
  if (lit && heat > 0.15) { steamPuff(ctx, PROP_X[STOVE_I] - 6, P.y - 2, frame, 20); steamPuff(ctx, PROP_X[STOVE_I] + 7, P.y - 4, frame + 9, 24); }
}

/** The oven window: the interior glows by `heat` (0..1), with a tray of dough (pale, then golden) inside. */
export function drawOvenWindow(ctx, heat, tray) {
  sprites();
  const O = OVEN, a = ctx.globalAlpha;
  ctx.save(); ctx.beginPath(); ctx.rect(O.winX, O.winY, O.winW, O.winH); ctx.clip();
  if (heat > 0) { ctx.globalAlpha = a * heat; ctx.drawImage(glowOven.canvas, PROP_X[OVEN_I] - 22, O.winY + O.winH - 22); ctx.globalAlpha = a; }
  if (tray) {
    ctx.fillStyle = INK; ctx.fillRect(O.winX + 7, O.winY + 6, 26, 6);
    ctx.fillStyle = heat > 0.7 ? PROPS.maple : PROPS.dough; ctx.fillRect(O.winX + 8, O.winY + 7, 24, 4);
  }
  ctx.restore();
}

/** The finished dish's size on the plate: 14 px wide inside the plate's 26, standing on its rim. */
const DISH_S = 7, DISH_DY = -5;
/**
 * The plate on the shelf. With `dish` (an ORDERS id, art/dishes.ts) it carries the FINISHED DISH, `bites` of it
 * eaten; without, `n` of the order's components stacked on it in recipe order (`icons` / `hexes` are the order's
 * ingredient glyph ids and colours) while they are still arriving. `squash` > 1 is the landing beat.
 */
export function drawPlate(ctx, x, y, icons, hexes, n, squash, dish = null, bites = 0) {
  ctx.fillStyle = INK; ctx.fillRect(x - 14, y - 1, 28, 8);
  ctx.fillStyle = PROPS.plate; ctx.fillRect(x - 13, y, 26, 6);
  ctx.fillStyle = PROPS.plateRim; ctx.fillRect(x - 12, y + 4, 24, 2);
  if (dish) {
    if (squash !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(squash, 1 / squash); ctx.translate(-x, -y); }
    drawDish(ctx, dish, x, y + DISH_DY, DISH_S, bites);
    if (squash !== 1) ctx.restore();
    return;
  }
  for (let i = 0; i < n && i < icons.length; i++) {
    const last = i === n - 1, k = last ? squash : 1;
    const cx = plateSlotX(x, i), cy = plateSlotY(y, i);
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
// Typed as the library's own options rather than left to widen: a bare literal infers `align: string`, and
// lib/engine/text.ts takes the 'left' | 'right' | 'center' union.
const WIDGET_TEXT: DrawTextOptions = { size: 1, color: UI.ink, shadow: false, align: 'center' };
/**
 * A small paper card behind a widget (the same ticket recipe at 1 px: paper, ink, r2) with an owner strip across
 * its head. The live timing card used to be the fifth identical cream rectangle on a screen that already carried
 * the order ticket, the recipe card and the station signs, and the one rectangle the player must act on every
 * beat carried no player colour at all. `slot >= 0` fills the strip with that seat's colour (the same hex as its
 * name plate), so the only COLOURED paper in the kitchen is the tag that is live and whose station it is.
 */
function card(ctx, x, y, w, h, slot) {
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x + 2, y + 3, w, h, 2); ctx.fill();
  pathRR(ctx, x, y, w, h, 2); ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = UI.paper; ctx.fill();
  ctx.fillStyle = slot >= 0 ? (PLAYER_COLORS[slot] || UI.paperDark) : UI.paperLine;
  ctx.fillRect(x + 2, y + 2, w - 4, 4);
  ctx.fillStyle = UI.ink; ctx.fillRect(x + 2, y + 6, w - 4, 1);
}
/** A paper disc behind a round widget. */
function disc(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 3, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = UI.paper; ctx.fill();
}
/** The owner mark at the hub of a round widget: the recipe card's own slot ring (ink, the seat's colour, a pip),
 *  because a dial has no head to carry a strip. Unowned, the hub stays the plain ink needle boss. */
function hub(ctx, cx, cy, slot) {
  if (slot < 0) { ctx.fillStyle = UI.ink; ctx.fillRect(cx - 2, cy - 2, 4, 4); return; }
  ctx.fillStyle = UI.ink; ctx.fillRect(cx - 4, cy - 4, 8, 8);
  ctx.fillStyle = PLAYER_COLORS[slot] || UI.paperDark; ctx.fillRect(cx - 3, cy - 3, 6, 6);
  ctx.fillStyle = UI.paper; ctx.fillRect(cx - 1, cy - 1, 2, 2);
}

/** A tally card: a row of `total` pips, one lit green per hit landed - a tally, not a beat. Over six go on a 4 px pitch. */
function pips(ctx, station, hits, total, slot) {
  // more than PIP_ROW pips (a whole line's fridge) wrap onto rows of their own, so the row never outgrows the card
  const rows = Math.ceil(total / PIP_ROW) || 1, cols = Math.ceil(total / rows);
  const x = WIDGET_POS[station][0], y = WIDGET_POS[station][1], pitch = cols > 6 ? 4 : 7, w = pitch - 1, bx = x + 24 - R((cols * pitch - 1) / 2), by = y + 13 - (rows - 1) * 2;
  card(ctx, x, y, 48, 26, slot);
  for (let i = 0; i < total; i++) {
    const px = bx + (i % cols) * pitch, py = by + ((i / cols) | 0) * pitch;
    ctx.fillStyle = UI.ink; ctx.fillRect(px, py, w, w); ctx.fillStyle = i < hits ? SIGNAL.good : UI.paperDark; ctx.fillRect(px + 1, py + 1, w - 2, w - 2);
  }
}
/** The most pips one row of a timing card holds (ten fit the card's 48 px on a 4 px pitch). */
const PIP_ROW = 10;
/** FRIDGE: one pip per item the order wants out of it. */
export function drawPullBar(ctx, pulls, total, slot) { pips(ctx, FRIDGE_I, pulls, total, slot); }
/** CHOP: one pip per chop landed. Ten pips go on a 4 px pitch. */
export function drawChopBar(ctx, hits, total, slot) { pips(ctx, CHOP_I, hits, total, slot); }

/** MIX: a round paper dial filling clockwise in green; the needle greys out while the hold is released. */
export function drawDial(ctx, fill, paused, slot) {
  const cx = WIDGET_POS[MIX_I][0] + 24, cy = WIDGET_POS[MIX_I][1] + 12;
  disc(ctx, cx, cy, 12);
  if (fill > 0) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, fill)); ctx.closePath();
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = SIGNAL.good; ctx.fill();
  }
  // the boss keeps its shape either way: the seat's colour while the stir runs, grey paper the moment it is let go
  if (paused) { ctx.fillStyle = UI.ink; ctx.fillRect(cx - 4, cy - 4, 8, 8); ctx.fillStyle = UI.paperDark; ctx.fillRect(cx - 3, cy - 3, 6, 6); } else hub(ctx, cx, cy, slot);
}

/** STOVE: a bar that fills green while held, and is done when it is full. */
export function drawStoveBar(ctx, fill, slot) {
  const x = WIDGET_POS[STOVE_I][0], y = WIDGET_POS[STOVE_I][1], bx = x + 6, by = y + 13, w = 36, h = 6;
  card(ctx, x, y, 48, 26, slot);
  ctx.fillStyle = UI.ink; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = UI.paperLine; ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx, by, R(w * Math.min(1, fill)), h);
}

/** OVEN: a round paper timer; a green arc sweeps round as the bake runs, and the bake is done when it closes. */
export function drawOvenTimer(ctx, k, slot) {
  const cx = WIDGET_POS[OVEN_I][0] + 24, cy = WIDGET_POS[OVEN_I][1] + 12;
  disc(ctx, cx, cy, 12);
  if (k > 0) {
    ctx.beginPath(); ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k));
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 6; ctx.stroke();                 // UI.green on paper is always inked
    ctx.strokeStyle = SIGNAL.good; ctx.lineWidth = 4; ctx.stroke();
  }
  hub(ctx, cx, cy, slot);
}

/** PLATE: a paper card above the hatch telling whoever is there to ring the bell. */
export function drawPlatePrompt(ctx, text, slot) {
  const x = WIDGET_POS[PLATE_I][0], y = WIDGET_POS[PLATE_I][1];
  card(ctx, x, y, 60, 24, slot);
  drawText(ctx, text, x + 30, y + 11, WIDGET_TEXT);
}

/**
 * The station sign's owner band: the moment a seat claims the step, the 4 px trough across the sign's head fills
 * with that seat's colour, and the band's LENGTH is the step's progress (`filled` of `segs`). The band never washes
 * over the lettering, because the sign has to go on saying which station it is while somebody owns it.
 */
export function drawTag(ctx, station, slot, segs, filled) {
  if (slot < 0) return;
  const x = TAG_POS[station][0] + 1, y = TAG_POS[station][1] + 1, w = TAG_W - 2;
  const k = segs > 0 ? Math.min(1, filled / segs) : 0;
  ctx.fillStyle = PLAYER_COLORS[slot] || UI.paperDark;
  ctx.fillRect(x, y, Math.max(5, R(w * k)), 4);
}
