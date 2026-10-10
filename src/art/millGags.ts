// The mill's two jokes, drawn (docs/GDD.md section 5 "Every mini-game has two jokes"; docs/ART_STYLE.md sections
// 0, 3, 4 and 7). The beats belong to game/screens/millGags.ts; this file is what they LOOK like, and nothing in it
// reads the simulation - every draw is handed plain numbers the screen has already worked out from its sim fields:
//   * the CLOG on its chute: the bulge that slides down the spout a notch at a time, the column coughing out in
//     slugs instead of a stream, the plug choking the mouth, and the lump that drops out of it;
//   * the HEAP it lands as - over a critter, slumping until the ears and the eyes are out of the top, or on the bare
//     planks - and the grains a rice visit leaves stuck to whoever climbs out of it;
//   * the visit's joke tones (gagTonesFor), one record per GRAINS record (art/millProps.ts), so a rice visit buries
//     its miller in rice and its sneeze goes up in chaff, the way the pour and the sacks already change.
// Screen space, integer coordinates, no allocation per call, the room's own palette (backgrounds/mill.ts) and the
// warm ink round every object. Neither joke paints SIGNAL.mill (gold means "flour is falling HERE") or SIGNAL.hot
// (there is nothing in a mill that can hurt you): a clog is a pillow and a sneeze is a sneeze.
import { PLUM } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { MILL, RICE, ROWS } from './backgrounds/mill.ts';
import { GRAINS, BEAM_DARK, BEAM_LIT, drawPour } from './millProps.ts';

const R = Math.round, TAU = Math.PI * 2;

// ---------------------------------------------------------------- the visit's joke tones
/**
 * What the jokes are made of on one visit, built once per GRAINS record and never mixed inside a draw.
 *   heap / heapSh / heapLit  the clog's heap: the uncaught pour's heap tone (millProps.ts drawPile; lifted for
 *                            flour, HEAP_LIFT) for its body, a plum-cooled step under it for the one shadow band down
 *                            its right side, and the ingredient's lit tone for the one cap on its top left;
 *   grains / grain           1 where the ingredient is loose grain (rice, oats): grains in their own lit tone dot the
 *                            heap's face, and stick to the critter that climbs out of it (drawStuckGrains);
 *   dusty                    the sneeze's coat (game/gags.ts `coat`): the visit's own dust settled back on the critter
 *                            that blew it up - flour's dust, rice's chaff, the oats' meal. Muted, and a value step
 *                            under COAT.flour, so a sneezed-on critter never reads as the clog's ghost;
 *   cloud                    what goes up when either joke lands (a smoke-kind particle's colour): lit flour, or a
 *                            haze of chaff on a rice day.
 */
export interface MillGagTones {
  heap: string;
  heapSh: string;
  heapLit: string;
  grains: number;
  grain: string;
  dusty: string;
  cloud: string;
}

/** The fields of a GRAINS record the jokes read: the lit tone and whether it pours as loose grain. */
interface JokeGrain { lit: string; grains: number }
/** The fields of a GRAINS record millProps.ts drawPour reads, which drawSputter hands straight on. */
interface PourGrain { grains: number; lit: string; core: string; edge: string }

/** One record, from a GRAINS entry, the heap's body tone and the two tones a pour does not already carry. */
function tonesOf(g: JokeGrain, heap: string, dusty: string, cloud: string): MillGagTones {
  return Object.freeze({ heap, heapSh: mix(heap, PLUM.shadow, 0.3), heapLit: g.lit, grains: g.grains, grain: g.lit, dusty, cloud });
}
/**
 * The flour heap is the pour's heap tone stepped HEAP_LIFT toward the lit flour: a clog's heap is fresh flour and
 * the size of a critter, and in the pour-pile's own dust tone it read as a giant hessian sack. Rice and oats keep
 * their GRAINS heap: loose grain on it says what it is.
 */
const HEAP_LIFT = 0.45;
const TONES: Readonly<Record<string, MillGagTones>> = Object.freeze({
  flour: tonesOf(GRAINS.flour, mix(MILL.dust, MILL.flour, HEAP_LIFT), MILL.dust, MILL.flour),
  rice: tonesOf(GRAINS.rice, GRAINS.rice.heap, mix(RICE.husk, RICE.grain, 0.4), mix(RICE.straw, RICE.grain, 0.55)),
  oats: tonesOf(GRAINS.oats, GRAINS.oats.heap, mix(GRAINS.oats.heap, MILL.dust, 0.3), GRAINS.oats.lit),
});
/** The tones for a visit's GRAINS id; anything the table does not name is flour, as grainFor does. */
export function gagTonesFor(id: string): MillGagTones { return TONES[id] || TONES.flour; }

/** One ellipse as a subpath of its own: a bare ellipse() joins the last one with a straight edge, and a fill sees it. */
function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
}

// ---------------------------------------------------------------- the clog on its chute
/**
 * The bulge: a ROUND lump in the spout, 30 x 20 - a snake that has swallowed an egg - so it reads as the wood
 * swelling round something stuck in it rather than as a fourth hoop or a knot. Oak like the spout (its shadow side
 * right, its lit edge left, one stretched-shiny spot on its upper left: ART_STYLE section 3's one highlight). While
 * the spout shakes, flour spurts from the joints either side of it in light dashes - dark ink strain marks would be
 * lost on the dark wall, and a dash of the lit tone reads as motion on it.
 */
const BULGE_RX = 15, BULGE_RY = 10;
/**
 * Where the bulge rides: from the lower half of the hopper head down to the spout just over the lip, its foot on
 * the lip's top row (ROWS.mouth 170 less the lip's 7), so the plug under the lip is never behind it.
 */
export const BULGE_Y0 = ROWS.chuteTop + 18, BULGE_Y1 = ROWS.mouth - 7 - BULGE_RY;

/** The bulge at row `y` on the chute whose centre is `x` (already shaken: the lump shakes with its spout). */
export function drawClogBulge(ctx: CanvasRenderingContext2D, x: number, y: number, strain: boolean, t: MillGagTones): void {
  const cx = R(x), cy = R(y);
  ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, cx, cy, BULGE_RX + 1, BULGE_RY + 1); ctx.fill();
  ctx.fillStyle = MILL.beam; ctx.beginPath(); ell(ctx, cx, cy, BULGE_RX, BULGE_RY); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = BEAM_DARK; ctx.beginPath(); ell(ctx, cx + 9, cy + 3, BULGE_RX - 3, BULGE_RY + 2); ctx.fill();
  ctx.fillStyle = BEAM_LIT; ctx.fillRect(cx - BULGE_RX, cy - BULGE_RY, 3, BULGE_RY * 2);
  ctx.restore();
  ctx.fillStyle = BEAM_LIT; ctx.fillRect(cx - 9, cy - 6, 4, 3);
  if (!strain) return;
  ctx.fillStyle = t.heapLit;
  ctx.fillRect(cx - BULGE_RX - 6, cy - 5, 4, 2); ctx.fillRect(cx - BULGE_RX - 7, cy + 1, 5, 2);
  ctx.fillRect(cx + BULGE_RX + 2, cy - 6, 4, 2); ctx.fillRect(cx + BULGE_RX + 2, cy, 5, 2);
}

/**
 * The plug: through the shudder the clog has reached the lip and the mouth is stopped with it - a lump of the heap
 * bulging out of the opening under the lip, inked, lit on its top left. Nothing falls past it, which is the other
 * half of the warning: the gold mouth says this spout is pouring, and nothing is.
 */
const PLUG_RX = 10, PLUG_RY = 6, PLUG_DY = 5;
export function drawClogPlug(ctx: CanvasRenderingContext2D, x: number, t: MillGagTones): void {
  const cx = R(x), cy = ROWS.mouth + PLUG_DY;
  ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, cx, cy, PLUG_RX + 1, PLUG_RY + 1); ctx.fill();
  ctx.fillStyle = t.heap; ctx.beginPath(); ell(ctx, cx, cy, PLUG_RX, PLUG_RY); ctx.fill();
  ctx.fillStyle = t.heapSh; ctx.fillRect(cx + 2, cy - 1, PLUG_RX - 3, PLUG_RY);
  ctx.fillStyle = t.heapLit; ctx.fillRect(cx - PLUG_RX + 3, cy - PLUG_RY + 2, 7, 2);
}

/**
 * The column while the clog is in the spout: the same stream (millProps.ts drawPour, the lean and the taper
 * included) broken into SPUT_ON-row slugs with SPUT_OFF rows of nothing between them, the pattern sliding down at
 * SPUT_V a frame. Each slug is its own short pour, so each carries its own ink line round it - a slug is a clump,
 * and a clump is an object. A stream that coughs reads as "something is wrong with THAT one" from across the room,
 * and it still fills the sack under it: the clog costs nothing until it lands.
 */
const SPUT_ON = 22, SPUT_OFF = 12, SPUT_V = 3, SPUT_MIN = 4;
export function drawSputter(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, frame: number, g: PourGrain): void {
  const h = y1 - y0, per = SPUT_ON + SPUT_OFF;
  if (h <= SPUT_MIN) return;
  for (let a = y0 - per + ((frame * SPUT_V) % per); a < y1; a += per) {
    const ya = a < y0 ? y0 : a, yb = a + SPUT_ON > y1 ? y1 : a + SPUT_ON;
    if (yb - ya < SPUT_MIN) continue;
    drawPour(ctx, R(x0 + ((x1 - x0) * (ya - y0)) / h), ya, R(x0 + ((x1 - x0) * (yb - y0)) / h), yb, frame, 1, g);
  }
}

/** The lump on its way down: a clump of the heap 30 across, the top of it lit, the far side in shadow. */
const LUMP_RX = 15, LUMP_RY = 12, LUMP_TOP_RX = 10, LUMP_TOP_RY = 8, LUMP_TOP_DX = -4, LUMP_TOP_DY = -9;
export function drawClogLump(ctx: CanvasRenderingContext2D, x: number, y: number, t: MillGagTones): void {
  const cx = R(x), cy = R(y), tx = cx + LUMP_TOP_DX, ty = cy + LUMP_TOP_DY;
  ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, cx, cy, LUMP_RX + 1, LUMP_RY + 1); ell(ctx, tx, ty, LUMP_TOP_RX + 1, LUMP_TOP_RY + 1); ctx.fill();
  ctx.fillStyle = t.heap; ctx.beginPath(); ell(ctx, cx, cy, LUMP_RX, LUMP_RY); ell(ctx, tx, ty, LUMP_TOP_RX, LUMP_TOP_RY); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = t.heapSh; ctx.beginPath(); ell(ctx, cx + 10, cy + 4, LUMP_RX - 2, LUMP_RY + 2); ctx.fill();
  ctx.fillStyle = t.heapLit; ctx.beginPath(); ell(ctx, tx - 2, ty - 3, 5, 3); ctx.fill();
  ctx.restore();
  // flecks trailing it, so it is FALLING and not hanging there
  ctx.fillStyle = t.grains ? t.grain : t.heapLit;
  ctx.fillRect(cx - 6, cy - 26, 3, 3); ctx.fillRect(cx + 5, cy - 34, 2, 3); ctx.fillRect(cx - 1, cy - 44, 2, 2);
}

// ---------------------------------------------------------------- the heap
/**
 * The heap a clog lands as is drawn in two parts with the critter BETWEEN them (game/screens/millGags.ts):
 *   the DOME, behind: one round mound standing FOOT_W either side on the planks, its sides leaning in as they rise
 *     (pulled out to DOME_SIDE of the foot at DOME_K of its height) and rounding over into its top (DOME_TOP of the
 *     foot either side of it), its foot on a shallow curve FOOT rows proud;
 *   the critter, drawn only ABOVE the flour line, so whatever is under the flour is simply never drawn;
 *   the LIP, in front: a ridge of flour across that line, which is what turns a head cut off by a straight edge into
 *     a head poking OUT of something.
 * A single outline cannot do it: a heap whose top is wide enough to hide a head's lower half is flat-topped, and
 * three stacked ellipses read as a clay pot with a rim and a path cut to fit read as a lampshade. Drawn this way the
 * dome can be round, the flour can stand up higher than the face behind it, and slumping it - lowering the dome and
 * the flour line together - shows the ears first, then the eyes. FOOT_W 38 is a body and a held sack wide, and
 * the broad top is what stands the heap's shoulders up beside even Barley's wool (a narrow top hid behind the head
 * and left only the lower flanks showing, which read as a lampshade with a sheep on it).
 */
const FOOT_W = 38, FOOT = 4, DOME_SIDE = 0.96, DOME_K = 0.5, DOME_TOP = 0.62;
/** The lip: LIP_PAD wider than the head either side, LIP_RY rows deep, its top edge on the flour line. */
const LIP_PAD = 4, LIP_RY = 3;
/** The grains a rice heap is dotted with: across its face (dx from the centre) and up it (hundredths of its height). */
const HEAP_GX = Int8Array.of(-15, -7, 3, 12, -21, 8, -2, 18, -11, 5, -26, 24);
const HEAP_GY = Uint8Array.of(14, 30, 20, 9, 6, 42, 55, 26, 48, 70, 12, 8);

/** The dome's outline: up the left side, over the top, down the right side and back along the foot. */
function domePath(ctx: CanvasRenderingContext2D, x: number, y: number, top: number): void {
  const h = y - top, sx = FOOT_W * DOME_SIDE, sy = y - h * DOME_K, tw = FOOT_W * DOME_TOP;
  ctx.beginPath();
  ctx.moveTo(x - FOOT_W, y);
  ctx.bezierCurveTo(x - sx, sy, x - tw, top, x, top);
  ctx.bezierCurveTo(x + tw, top, x + sx, sy, x + FOOT_W, y);
  ctx.quadraticCurveTo(x, y + FOOT * 2, x - FOOT_W, y);
  ctx.closePath();
}

/**
 * The dome of a heap standing on row `y`, centred on `x`, its top on row `top`: drawn BEFORE the critter it is
 * burying. Its shadow is the right of the mound under a curved terminator, its one lit cap the top left
 * (ART_STYLE section 3); a rice heap is dotted with grains; two flecks kicked out at its foot say it LANDED.
 */
export function drawHeapDome(ctx: CanvasRenderingContext2D, x: number, y: number, top: number, t: MillGagTones): void {
  const h = y - top;
  domePath(ctx, x, y, top);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = t.heap; ctx.fill();
  ctx.save(); ctx.clip();                                            // every band below stays inside the heap's own line
  ctx.fillStyle = t.heapSh; ctx.beginPath(); ell(ctx, x + FOOT_W * 0.66, y - h * 0.32, FOOT_W * 0.62, h * 0.9); ctx.fill();
  ctx.fillStyle = t.heapLit; ctx.beginPath(); ell(ctx, x - R(FOOT_W * 0.28), top + 6, R(FOOT_W * 0.36), 4); ctx.fill();
  if (t.grains) {
    ctx.fillStyle = t.grain;
    for (let i = 0; i < HEAP_GX.length; i++) ctx.fillRect(x + HEAP_GX[i], R(y - 5 - ((h - 8) * HEAP_GY[i]) / 100), 2, 3);
  }
  ctx.restore();
  ctx.fillStyle = t.grains ? t.grain : t.heapLit;
  ctx.fillRect(x - FOOT_W - 6, y - 4, 3, 3); ctx.fillRect(x + FOOT_W + 3, y - 5, 3, 3);
}

/**
 * The lip: the ridge of flour in front of whatever pokes out of the heap, its top edge on the flour line `y`, wide
 * enough to hide the cut across a head of radius `r`. Lit along its top (it is the heap's top surface), the heap's
 * own tone under that, inked like the dome it belongs to.
 */
export function drawHeapLip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: MillGagTones): void {
  const rx = r + LIP_PAD, cy = y + LIP_RY;
  ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, x, cy, rx + 1, LIP_RY + 1); ctx.fill();
  ctx.fillStyle = t.heap; ctx.beginPath(); ell(ctx, x, cy, rx, LIP_RY); ctx.fill();
  ctx.fillStyle = t.heapLit; ctx.beginPath(); ell(ctx, x - 1, cy - 1, rx - 2, LIP_RY - 1); ctx.fill();
}

/**
 * The grains a rice (or oat) heap leaves stuck to the critter that climbs out of it, drawn over the coat after the
 * rig: three on the crown and the cheeks round the head's centre (hx, hy), two on the belly round (bx, by). 2x3, the
 * same grain the pour is made of (ART_STYLE 0.8's smallest oval that still reads at 1x), inked, and in the HEAP's
 * tone rather than the grain's own: the coat they sit on is the clog's ghost-white, and a white grain on it was a
 * white tile with a line round it. They go when it shakes.
 */
const STUCK_HX = Float32Array.of(-0.5, 0.15, 0.6), STUCK_HY = Float32Array.of(-0.75, -0.95, 0.1);
const STUCK_BX = Int8Array.of(-5, 4), STUCK_BY = Int8Array.of(-4, 3);
export function drawStuckGrains(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, bx: number, by: number, facing: number, t: MillGagTones): void {
  if (!t.grains) return;
  ctx.fillStyle = INK;
  for (let i = 0; i < STUCK_HX.length; i++) ctx.fillRect(R(hx + STUCK_HX[i] * r * facing) - 2, R(hy + STUCK_HY[i] * r) - 2, 4, 5);
  for (let i = 0; i < STUCK_BX.length; i++) ctx.fillRect(R(bx + STUCK_BX[i] * facing) - 2, R(by + STUCK_BY[i]) - 2, 4, 5);
  ctx.fillStyle = t.heap;
  for (let i = 0; i < STUCK_HX.length; i++) ctx.fillRect(R(hx + STUCK_HX[i] * r * facing) - 1, R(hy + STUCK_HY[i] * r) - 1, 2, 3);
  for (let i = 0; i < STUCK_BX.length; i++) ctx.fillRect(R(bx + STUCK_BX[i] * facing) - 1, R(by + STUCK_BY[i]) - 1, 2, 3);
}
