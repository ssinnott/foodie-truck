// The market garden's props (docs/ART_STYLE.md section 1, section 5; docs/GDD.md section 5): the two things that
// stand in the crop ridge and must be told apart at a squint (the ripe carrot's FERN and the THISTLE), the marks a
// pulled or snapped root leaves, the root itself once it is out of the ground, the trug every seat carries, the
// wheelbarrow the party's total piles up in, the TUG GAUGE the whole mini-game is read from, and the three grip
// stances the crew plays on top of the shared table.
//
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each sprite first.
// Everything here is drawn in the rig's own style: 1 px warm ink round each OBJECT, a base and one shadow band
// inside that ink, nothing under 2 px. Nothing in this file decides WHEN anything is drawn - the screen owns the
// simulation and passes in every number, including the sparkle's blink, so a headless peer steps without drawing.
import { UI, PLUM, SIGNAL } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood } from './food.ts';
import { celPoly, LIGHT_X, LIGHT_Y } from '../lib/art/shading.ts';
import { pathStar } from '../lib/art/shapes.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { F } from '../content/critters/common.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The crop's own colours.
 *
 * `leaf` is a fresher, higher-chroma green than the backdrop's hedge (`GARDEN.leaf` #4F6B3A): the crop has to sit
 * OUT of the garden it grows in. Measured: leaf L .573 against the tilled ridge's .247 (relDiff .57) and against
 * Cress's frog green .389 (relDiff .32), so a green critter standing in a green row still reads. Saturation .52,
 * under the 0.65 ceiling ART_STYLE section 1 sets for everything that is not a player colour or a signal.
 *
 * `thistle` is the same hue family drained of chroma (saturation .16) and dropped two value steps to L .422 -
 * relDiff .26 off the crop. That is the LAST of the three tells, not the first: the thistle is 8 px taller, its
 * leaves are jagged instead of round, and it carries a dark spiked head where the fern carries nothing. Colour on
 * its own was tried and rejected exactly the way the orchard rejected a merely-brown wormy apple.
 */
export const CROP = Object.freeze({
  leaf: '#7FA850', leafSh: '#55763A', leafHi: '#A6C877',
  thistle: '#68705E', thistleSh: '#4C5244',
  /**
   * The thistle's head, and the loudest part of it: a dusty plum-grey out of the world's own shadow family
   * (saturation .22, L .395 - nowhere near P3's lavender, which is L .60 at twice the chroma). It was near-ink
   * #3A3340 first and that was a mistake twice over - under a 3 px ink line a near-ink fill is a HOLE rather than a
   * shape, so at 1x the seven spikes closed into one dark blob, and the one part of a thistle everybody can name
   * was the one part you could not see. A head at .395 against the path's .551 reads its points, and being the only
   * non-green thing growing in the bed it is what the eye lands on first.
   */
  head: '#6B5E78', headHi: '#96879F',
  /** Dark willow, the same basket wood the whole cast carries (content/critters/items.js). */
  willow: '#6B4E3A',
  soil: '#4A3C32',
});
/**
 * Every tone this file derives from another one is mixed ONCE, here. `mix` is two `hexToRgb` array literals plus
 * four padded strings and a concatenation per call (art/palettes.js), and ARCHITECTURE section 8 allows no
 * allocation inside a draw: `drawBarrow` runs unconditionally on every frame of the round and `drawThistle` once or
 * twice, so a `mix()` left in either body costs that forever. art/millProps.js's BEAM_DARK block and art/hens.js's
 * RUST_SH are the shipped precedent.
 */
const HEAD_SH = mix(CROP.head, PLUM.deep, 0.45), HOLE_SH = mix(CROP.soil, PLUM.deep, 0.5);
const BARROW_DARK = mix(UI.wood, PLUM.deep, 0.45), BARROW_RIM = mix(UI.wood, UI.woodLight, 0.6);
const WHEEL_HUB = mix(UI.wood, UI.woodLight, 0.4);
/**
 * The root's own orange is the INGREDIENT's hex - the same one the HUD ticket, the map sign and the kitchen use, so
 * a player learns one carrot. It is an EMITTER and never decor: it exists only on a root that is out of the ground
 * (in the air, in a trug, in the barrow, on the ticket), exactly as the orchard's signal red only ever exists on
 * fruit. Nothing in backgrounds/garden.js is painted in it.
 */
const ROOT_HEX = INGREDIENTS.carrot.hex;

/**
 * The fern and the thistle, in px from the soil line.
 *
 * FERN_H is the height the plant is actually DRAWN to, which is what a call site hanging something over it needs.
 * It read 34 here for a while, which is the maximum of the frond TIP tables and 3 px short of the plant: `leaflets()`
 * centres its ellipses ON those tips, so the ink pass (LEAF_R[3] + 1 = 3.6 by 3.0) carries the tallest tip,
 * FROND_A's (0, -34), three rows past it. Measured over both tables at every sway the screen hands in: 37.
 *
 * THISTLE_H is NOT that kind of number - it is the stem's own geometry and `drawThistle` builds `headY` out of it -
 * so the two do not subtract into anything a player sees. The thistle DRAWS to 50 (the star's top point at
 * headY - 2 - 12, plus its 3 px ink), which puts 13 px of clear air between the two skylines. THAT gap is the tell
 * you read at a squint, and it was a good deal tighter before the 1x screenshot: at the tighter one the fern's
 * tallest leaflets came up level with the thistle's head and the whole row had a single skyline. At 13 the
 * thistle's head stands in clear air above every fern in the bed.
 */
export const FERN_H = 37, THISTLE_H = 48;

// ---------------------------------------------------------------- the ripe carrot's fern
/**
 * Five fronds, as (tipX, tipY) from the crown. A fan: wide and low at the outside, tall and near-vertical in the
 * middle, which is the silhouette a carrot top actually makes and the opposite of the thistle's single spike.
 *
 * TWO tables, picked by the top's own index, because seven identical plants in a row is a stamp and a market
 * garden is a row of things that grew. Mirroring one table was tried instead and lost: it puts the single
 * highlight on the shaded side, and ART_STYLE section 3 fixes the light at top-left for the whole world.
 */
const FROND_A = Int8Array.of(-13, -19, -8, -29, 0, -34, 8, -28, 13, -18);
const FROND_B = Int8Array.of(-11, -23, -6, -31, 1, -33, 10, -26, 14, -15);
/**
 * Where the leaflets sit along each frond, and how big. Four small ones rather than three big: at radius 4 the
 * fronds closed into one round mass and the row read as clipped topiary, which is exactly what a carrot top is
 * not. At 2.6..3.4 the fan stays open and the fern reads feathery at 1x, which is the only place it matters.
 */
const LEAF_T = Float64Array.of(0.34, 0.58, 0.8, 1), LEAF_R = Float64Array.of(3.4, 3.2, 2.9, 2.6);

/** Trace all five fronds as quadratics bowing outward from the crown (draw-only maths). */
function fernPath(ctx, x, y, sway, T) {
  ctx.beginPath();
  for (let i = 0; i < T.length; i += 2) {
    ctx.moveTo(x, y - 2);
    ctx.quadraticCurveTo(x + T[i] * 0.3, y + T[i + 1] * 0.72, x + T[i] + sway, y + T[i + 1]);
  }
}
/** Fill every leaflet from frond `from` on, at radius + `grow`, offset by (ox, oy). */
function leaflets(ctx, x, y, sway, T, grow, from, ox, oy) {
  for (let i = from; i < T.length; i += 2) {
    const cx = x + T[i] * 0.3, cy = y + T[i + 1] * 0.72, tx = x + T[i] + sway, ty = y + T[i + 1];
    for (let k = 0; k < LEAF_T.length; k++) {
      const t = LEAF_T[k], u = 1 - t;
      const px = u * u * x + 2 * u * t * cx + t * t * tx, py = u * u * (y - 2) + 2 * u * t * cy + t * t * ty;
      ctx.beginPath(); ctx.ellipse(px + ox, py + oy, LEAF_R[k] + grow, LEAF_R[k] + grow - 0.6, 0, 0, TAU); ctx.fill();
    }
  }
}

/**
 * A ripe carrot's top, standing with its crown at (x, y). `sway` is a 1 px lean the screen hands in - the breeze
 * when nothing is holding it, a 2 px shake while a critter has hold of it - and `variant` picks one of the two
 * frond tables so no two neighbours in the row are the same plant.
 *
 * Two passes of one path (the orchard's canopy does the same): every stem and leaflet is inked first as ONE object,
 * then filled, so a reader sees one plant instead of a heap of outlined blobs. The single shadow band is the two
 * fronds on the shaded side, and the single highlight is a 2 px cap on the top-left frond's tip (ART_STYLE 0.5:
 * one of each, never two).
 */
export function drawFern(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const T = variant ? FROND_B : FROND_A;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  fernPath(ctx, x, y, sway, T); ctx.stroke();
  ctx.fillStyle = INK; leaflets(ctx, x, y, sway, T, 1, 0, 0, 0);
  ctx.strokeStyle = CROP.leaf; ctx.lineWidth = 2;
  fernPath(ctx, x, y, sway, T); ctx.stroke();
  ctx.fillStyle = CROP.leaf; leaflets(ctx, x, y, sway, T, 0, 0, 0, 0);
  ctx.fillStyle = CROP.leafSh; leaflets(ctx, x, y, sway, T, -1.4, 6, 1, 1);
  ctx.fillStyle = CROP.leafHi; ctx.fillRect(x + T[0] - 1, y + T[1] - 2, 2, 2);
  // the crown: the 6 px of stem the fronds all leave from, sitting in the soil so the plant grows out of the bed
  ctx.fillStyle = INK; ctx.fillRect(x - 4, y - 5, 8, 6);
  ctx.fillStyle = CROP.leafSh; ctx.fillRect(x - 3, y - 4, 6, 5);
}

/**
 * The fresh-root sparkle above a ripe top: SIGNAL.garden, the same four-armed mark the coop's fresh egg wears
 * (ART_STYLE section 4 - gold means "the thing you want"). It is the scene's ONLY saturated colour and it is a
 * small emitter, drawn by the screen on an index-hashed blink, never painted into the bed.
 *
 * (x, y) is the mark's CENTRE and the ink box is 8x8, so a call site standing it clear of a plant has to allow the
 * 4 px below that centre as well as the air it wants - see the screen's own offset.
 *
 * Unlike the coop's, this one carries its own 1 px ink. The coop's egg sparkle only ever sits over nest straw and
 * a cool earth floor; this one sits at row 287, which is apron height, and a critter can walk behind it. Gold is
 * .16 from P2's marmalade and .15 from P3's lavender by value - on those two aprons a bare gold cross would
 * disappear - so it gets the line every other object in this game gets (ART_STYLE 0.2).
 */
export function drawRipeSpark(ctx, x, y) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 2, y - 4, 4, 8);
  ctx.fillRect(x - 4, y - 2, 8, 4);
  ctx.fillStyle = SIGNAL.garden;
  ctx.fillRect(x - 1, y - 3, 2, 6);
  ctx.fillRect(x - 3, y - 1, 6, 2);
}

// ---------------------------------------------------------------- the thistle
/**
 * The thistle's leaves: (y from the crown, length, side). Four blades, alternating, none of them rounded.
 *
 * The third one sits at -22 and not at -25, where it was first written. At -25 its far notch tucked in under the
 * head, and the star's own 3 px ink laid a lid straight across the mouth of the V: the notch stopped being a notch
 * and became a 4x4 patch of the path tone sealed inside ink - a HOLE punched through the leaf, the same mistake
 * CROP.head warns about, and identical on every thistle in every round because the geometry is fixed. Measured at
 * every sway the screen hands in (-2..2, the held shake included): at -25 the sealed patch is 8..13 px, at -22 it is
 * gone and the V opens to the air. -21 was tried first and closes a smaller one against the blade at -9; thinning
 * the blades' ink to 2 px makes it WORSE (the mouth opens, the star's lid stays, and the patch grows to 15 px).
 */
const BLADE = Int8Array.of(-9, 14, 1, -17, 16, -1, -22, 14, 1, -32, 11, -1);

/** One jagged blade as a five-point zigzag: out, notch, out, notch, back. */
function bladePath(ctx, x, y, dy, len, dir) {
  ctx.beginPath();
  ctx.moveTo(x, y + dy + 2);
  ctx.lineTo(x + dir * len * 0.36, y + dy - 3);
  ctx.lineTo(x + dir * len * 0.58, y + dy + 1);
  ctx.lineTo(x + dir * len, y + dy - 6);
  ctx.lineTo(x + dir * len * 0.42, y + dy + 5);
  ctx.closePath();
}

/**
 * A thistle, crown at (x, y): the top that costs a carrot. Every part of it argues with the fern - it is 8 px
 * taller, its stem is dead straight where the fern's fronds bow, its four blades are spiked zigzags where the
 * fern's leaflets are round, its green is drained (see CROP.thistle), and it carries a dark 7-point head the fern
 * has no answer to. The screen never gives it a sparkle. Squint at the two and only one of them says "food".
 */
export function drawThistle(ctx, x, y, sway) {
  x = R(x); y = R(y);
  const headY = y - THISTLE_H + 14;
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  ctx.strokeStyle = INK; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + sway, headY); ctx.stroke();
  ctx.strokeStyle = CROP.thistle; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + sway, headY); ctx.stroke();
  for (let i = 0; i < BLADE.length; i += 3) {
    const dy = BLADE[i], len = BLADE[i + 1], dir = BLADE[i + 2];
    const bx = x + R(sway * (-dy / THISTLE_H));
    bladePath(ctx, bx, y, dy, len, dir);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = dir > 0 ? CROP.thistle : CROP.thistleSh; ctx.fill();
  }
  // the head: one 7-point spiked star under its own ink, with the single highlight on the lit top-left point
  const hx = x + sway;
  pathStar(ctx, hx, headY - 2, 12, 6, 7, -Math.PI / 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = CROP.head; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = HEAD_SH;
  ctx.beginPath(); ctx.ellipse(hx + 3, headY + 1, 8, 7, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = CROP.headHi; ctx.fillRect(hx - 5, headY - 6, 3, 3);
}

// ---------------------------------------------------------------- what a pull leaves behind
/**
 * The stub of a snapped-off top, while its root sits in the ground growing a new one: two cut stems in the crop's
 * shade tone under their own ink. It is the promise that REGROW_FRAMES is keeping - nothing in this garden is ever
 * permanently lost - and it is deliberately nothing like a plant, so nobody walks back to grip it.
 */
export function drawStub(ctx, x, y) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y - 6, 10, 7);
  ctx.fillStyle = CROP.leafSh; ctx.fillRect(x - 4, y - 5, 8, 6);
  ctx.fillStyle = CROP.leafHi; ctx.fillRect(x - 3, y - 5, 2, 2); ctx.fillRect(x + 1, y - 5, 2, 2);
}

/** A pulled root's hole: an inked pit that the loose soil falls back into over four steps. */
const HOLE_RX = Int8Array.of(7, 6, 5, 3), HOLE_RY = Int8Array.of(4, 3, 3, 2);
export function drawHole(ctx, x, y, step) {
  if (step < 0 || step >= HOLE_RX.length) return;
  x = R(x); y = R(y);
  const rx = HOLE_RX[step], ry = HOLE_RY[step];
  ctx.fillStyle = HOLE_SH;
  ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = PLUM.deep;
  ctx.beginPath(); ctx.ellipse(x, y - 1, rx, ry, 0, 0, TAU); ctx.fill();
}

/**
 * A carrot in the air - just out of the ground, on its way to a trug. The root is art/food.js's own carrot glyph so
 * the shape is the one the ticket and the kitchen use; the three fronds on top are added here because a root with
 * its leaves still on is the whole difference between "pulled" and "an ingredient icon flying past".
 */
export function drawPulledCarrot(ctx, x, y) {
  x = R(x); y = R(y);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1, y - 4); ctx.lineTo(x - 6, y - 13);
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y - 15);
  ctx.moveTo(x + 1, y - 4); ctx.lineTo(x + 6, y - 12);
  ctx.stroke();
  ctx.strokeStyle = CROP.leaf; ctx.lineWidth = 2; ctx.stroke();
  drawFood(ctx, 'carrot', x, y, 6, ROOT_HEX);
}

/** A thistle going over a shoulder, `spin` 0..3 quarter turns. Small, inked, unmistakably the thing that cost one. */
export function drawFlyingThistle(ctx, x, y, spin) {
  ctx.save(); ctx.translate(R(x), R(y)); ctx.rotate(spin * (Math.PI / 2));
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -2); ctx.stroke();
  ctx.strokeStyle = CROP.thistle; ctx.lineWidth = 3; ctx.stroke();
  pathStar(ctx, 0, -5, 8, 4.5, 7, -Math.PI / 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = CROP.head; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- the tug gauge
/**
 * THE TUG GAUGE: a paper tag that opens over the seat that has hold of a top, and the one thing in this scene a
 * first-time player has to read instantly.
 *
 * It is the mill's fill tag's sibling on purpose - the same paper with the same 6 px tab in the seat's own colour,
 * a step larger at 48x16 against the mill's 44x12 - because a player who has already played one of the seven
 * mini-games should not have to learn a second kind of paper. What is new is the BAND and the NEEDLE:
 *
 *   the band   is UI.green (= SIGNAL.good) inside its own 1 px ink, 22 % of the trough. ART_STYLE section 4 is
 *              explicit that "good timing" on paper UI is green with an ink outline and never gold, so the band can
 *              never be confused with the ripe root's gold sparkle two rows below it.
 *   the needle is SOLID warm ink, 4 px wide and standing 2 px proud of the trough at both ends, with a pointer
 *              head above it. It carried a 2 px paper-line core in its first cut and the 4x screenshot killed that
 *              outright: a tan core inside a 1 px line is a notch in the paper, not a needle, and at 1x the thing
 *              the whole mini-game is timed against was the faintest mark on its own tag. Solid ink reads on the
 *              paper (relDiff .90) and on the green band (.83) alike. What changes when the needle is INSIDE the
 *              band is a cream pip on its head and a cream cap along the band: the "press now" beat is carried by
 *              VALUE, not by hue, so it survives on all four player tabs - the dairy's chevrons were relit the same
 *              way after mint vanished on P3's lavender.
 *
 * Nothing here is a fill that grows: the trough is always the same width, so four gauges open at once are four
 * identical rulers with four needles in different places, which is what stops them reading as one wall of UI.
 */
export const TAG_W = 48, TAG_H = 16;
const TAG_TAB = 6, TROUGH_X = 11, TROUGH_W = 32, TROUGH_Y = 7, TROUGH_H = 7;
/**
 * The trough's width in the units the screen keeps the needle and the band in. 120, because the sweep is 40 integer
 * steps each way and 120/40 is a whole 3 units a frame - the needle never needs a fraction (see the screen's
 * SWEEP_N for why the sweep is 40 and not 20).
 */
export const GAUGE_UNITS = 120;

/**
 * @param {number} needle 0..GAUGE_UNITS across the trough
 * @param {number} lo 0..GAUGE_UNITS, the band's near edge
 * @param {number} hi 0..GAUGE_UNITS, the band's far edge
 * @param {string} colour the seat's player colour
 * @param {boolean} lit true while the needle is inside the band
 */
export function drawTugGauge(ctx, cx, y, needle, lo, hi, colour, lit) {
  const x = R(cx) - (TAG_W >> 1), ty = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x, ty, TAG_W, TAG_H);
  ctx.fillStyle = UI.paper; ctx.fillRect(x + 1, ty + 1, TAG_W - 2, TAG_H - 2);
  ctx.fillStyle = colour; ctx.fillRect(x + 1, ty + 1, TAG_TAB, TAG_H - 2);
  ctx.fillStyle = INK; ctx.fillRect(x + 1 + TAG_TAB, ty + 1, 2, TAG_H - 2);
  const tx = x + TROUGH_X, tyy = ty + TROUGH_Y;
  // everything past the tab is clipped to the paper: at either end of its sweep the needle's head would otherwise
  // hang over the slot tab or over the tag's own ink border, and a pointer that leaves its dial is not a dial
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 3 + TAG_TAB, ty + 1, TAG_W - TAG_TAB - 4, TAG_H - 2); ctx.clip();
  ctx.fillStyle = UI.paperLine; ctx.fillRect(tx, tyy, TROUGH_W, TROUGH_H);
  const bx = tx + R(TROUGH_W * lo / GAUGE_UNITS), bw = R(TROUGH_W * (hi - lo) / GAUGE_UNITS);
  ctx.fillStyle = INK; ctx.fillRect(bx - 1, tyy - 1, bw + 2, TROUGH_H + 2);
  ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx, tyy, bw, TROUGH_H);
  if (lit) { ctx.fillStyle = UI.cream; ctx.fillRect(bx, tyy, bw, 2); }
  // the needle: a bar down the trough AND a head pointing into it from the clear paper above. The head is what
  // makes it a needle - the bar alone is the same shape as the band's own 1 px ink edge, and at 1x the two merged
  // into one dark mark every time the needle came up beside the band (which is the only moment that matters).
  const nx = tx + R(TROUGH_W * needle / GAUGE_UNITS);
  ctx.fillStyle = INK;
  ctx.fillRect(nx - 2, tyy - 1, 4, TROUGH_H + 2);
  ctx.beginPath(); ctx.moveTo(nx - 5, ty + 2); ctx.lineTo(nx + 5, ty + 2); ctx.lineTo(nx, ty + 8); ctx.closePath(); ctx.fill();
  if (lit) { ctx.fillStyle = UI.cream; ctx.fillRect(nx - 2, ty + 3, 4, 2); }
  ctx.restore();
}

// ---------------------------------------------------------------- the trug and the barrow
const TRUG_BODY = [-11, 5, 11, 5, 9, 15, -9, 15];
/**
 * The garden trug every seat carries, in place of game/minigame.js's RIBBON_BASKET.
 *
 * The shared basket is 22 px deep and hangs straight down from the near paw. This scene's grip stance puts that
 * paw at about the crop's own height, which buried the basket in the bed and parked its rim on top of the fern the
 * player is reading - the one thing the scene cannot afford. A trug is 10 px deep, so the same paw carries it clear
 * of the soil line, and a flat slatted trug is what you actually carry down a row. Everything else is the shared
 * basket's contract kept: dark willow, the handle and the bands in `rig.palette.primary` (which IS the seat's
 * player colour, set by critterRig), and the fill drawn from a count the screen sets on the rig.
 */
export const GARDEN_TRUG = { attach: 'handR', length: 12, draw(ctx, rig) {
  // the same counter-rotation items.js `upright` uses, so the trug stays level whatever the arm is doing
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  ctx.save(); ctx.rotate(a);
  ctx.beginPath(); ctx.arc(0, 5, 7, Math.PI, 0);
  ctx.strokeStyle = rig.col(rig.outline); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = rig.col(rig.palette.primary); ctx.lineWidth = 2; ctx.stroke();
  celPoly(ctx, rig, TRUG_BODY, CROP.willow, 0.36, 0.2);
  if (rig.override) { ctx.restore(); return; }
  ctx.fillStyle = rig.col(rig.palette.primary); ctx.fillRect(-9, 10, 18, 3);   // the one band, below the root line
  const n = rig.trugCount > 4 ? 4 : (rig.trugCount | 0);
  for (let i = 0; i < n; i++) drawFood(ctx, 'carrot', -6 + i * 4, 7, 3.5, ROOT_HEX);
  ctx.restore();
} };

/**
 * The barrow the party's carrots go into, its wheel's ground contact at (x, y), 52 wide and facing right. It is the
 * party's TOTAL made physical - the clock ticket says "3/4" and this says the same thing in roots - so it fills
 * from everybody's pulls and never from one seat's. Five roots are drawn, then it is a heap.
 */
export function drawBarrow(ctx, x, y, n) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y);
  // the two shafts and the handles, behind the tray
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(10, -30); ctx.lineTo(34, -20); ctx.moveTo(8, -18); ctx.lineTo(32, -12); ctx.stroke();
  ctx.strokeStyle = UI.wood; ctx.lineWidth = 3; ctx.stroke();
  // the leg it rests on
  ctx.fillStyle = INK; ctx.fillRect(3, -18, 6, 18);
  ctx.fillStyle = BARROW_DARK; ctx.fillRect(4, -17, 4, 17);
  // the tray: one inked body with a lighter rim and a shadow band in its lower rows
  ctx.beginPath();
  ctx.moveTo(-27, -34); ctx.lineTo(19, -34); ctx.lineTo(13, -15); ctx.lineTo(-21, -15); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = UI.wood; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = BARROW_DARK; ctx.fillRect(-28, -23, 50, 10);
  ctx.fillStyle = BARROW_RIM; ctx.fillRect(-26, -34, 46, 3);
  ctx.restore();
  // the roots in it, drawn before the wheel so the wheel's ink reads over the tray's front edge
  const k = n > 5 ? 5 : n;
  for (let i = 0; i < k; i++) drawFood(ctx, 'carrot', -20 + i * 8, -26, 5, ROOT_HEX);
  if (n > 5) { ctx.fillStyle = INK; ctx.fillRect(-24, -38, 42, 5); ctx.fillStyle = ROOT_HEX; ctx.fillRect(-23, -37, 40, 3); }
  // the wheel
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-16, -8, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = BARROW_DARK; ctx.beginPath(); ctx.arc(-16, -8, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = WHEEL_HUB; ctx.beginPath(); ctx.arc(-16, -8, 3, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- the grip stances
/**
 * The three beats this scene adds to the shared table (content/critters/common.js makeCritterAnims), installed per
 * seat with `player.setOverlay` the way the coop installs its pluck beats.
 *
 *   grip     the tug itself, looping while the gauge is open: heels dug in, weight BACK on the root, both paws
 *            forward and low onto the top, `grit`. Both arms stay under 75 degrees so the trug the near paw carries
 *            hangs beside the shins instead of across the muzzle (ART_STYLE 0.7), and the FAR arm reaches 10
 *            degrees further forward than the near one - with the near paw and its trug in front of everything, the
 *            far paw was the one part of the pose you could not find, and two paws on the thing you are hauling is
 *            the whole pose.
 *   pullOut  the root comes free and the critter staggers a step back, arms up in front (104 degrees, so the paw
 *            lands BESIDE the muzzle, not on it), `shout` into `happy`. 14 frames, the screen's PULL_FRAMES.
 *   snap     the top comes off in its paws and it sits down on its heels: the same 14 frames, but the recovery key
 *            is `dazed` and the root is still in the ground. It is written as a pratfall, not a punishment - the
 *            second key holds the critter low and looking at its own paws, which is the joke landing.
 *
 * Every key sets both legs and both arms (ART_STYLE section 8), and `weapon: 90` on every one of them keeps the
 * trug upright through all three.
 */
export const GARDEN_ANIMS = Object.freeze({
  grip: { loop: true, frames: [
    F(9, { armR: [56, 36], armL: [64, 30], weapon: 90, torso: -10, head: -2, legR: [18, 14], legL: [-24, 22], root: [-2, 1], face: 'grit' }, { ease: 'inout' }),
    F(9, { armR: [62, 30], armL: [72, 24], weapon: 90, torso: -17, head: -8, legR: [23, 9], legL: [-29, 27], root: [-4, 0], squash: 1.03, face: 'grit' }, { ease: 'inout' }),
  ] },
  pullOut: { loop: false, frames: [
    F(4, { armR: [104, 18], armL: [88, 24], weapon: 90, torso: -24, head: -12, legR: [32, 6], legL: [-32, 32], root: [-5, -2], stretch: 1.05, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [92, 24], armL: [74, 30], weapon: 90, torso: -10, head: -4, legR: [20, 16], legL: [-20, 24], root: [-2, 2], squash: 1.05, face: 'happy' }, { ease: 'inout' }),
    F(4, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  snap: { loop: false, frames: [
    F(4, { armR: [98, 6], armL: [86, 12], weapon: 90, torso: -22, head: -14, legR: [30, 10], legL: [-30, 30], root: [-4, 1], squash: 1.06, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [76, 26], armL: [66, 30], weapon: 90, torso: -4, head: 10, legR: [18, 20], legL: [-18, 22], root: [-1, 3], face: 'dazed' }, { ease: 'inout' }),
    F(4, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'neutral' }, { ease: 'out' }),
  ] },
});
