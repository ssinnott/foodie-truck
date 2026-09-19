// The farm's props (docs/ART_STYLE.md section 1, section 5; docs/GDD.md section 5): the PLANTS standing in the crop
// ridge - one per vegetable the bed can grow, from the carrot's fern to the pumpkin under its vine - the hole a
// pulled root leaves, the root itself once it is out of the ground, the trug every seat carries, the wheelbarrow the
// party's total piles up in, the PULL GAUGE the whole mini-game is read from, and the grip stances the crew plays on
// top of the shared table.
//
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each sprite first.
// Everything here is drawn in the rig's own style: 1 px warm ink round each OBJECT, a base and one shadow band
// inside that ink, nothing under 2 px. Nothing in this file decides WHEN anything is drawn - the screen owns the
// simulation and passes in every number, including the sparkle's blink, so a headless peer steps without drawing.
import { UI, PLUM, SIGNAL } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood, foodTones } from './food.ts';
import { celPoly, LIGHT_X, LIGHT_Y } from '../lib/art/shading.ts';
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
 */
export const CROP = Object.freeze({
  leaf: '#7FA850', leafSh: '#55763A', leafHi: '#A6C877',
  /**
   * The other crops' foliage, so eight plants of one green is not what a row of leeks looks like. All of them sit
   * between the fern's green and the hedge's, with the same top-left highlight in `leafHi`: a potato's haulm is a
   * step darker and bluer than a carrot top, an onion's and a leek's tubes are blue-green, a beetroot's leaves are
   * the darkest green in the bed under their crimson stems. Saturation stays under the 0.65 ceiling throughout.
   */
  haulm: '#6C9448', blade: '#6FA07E', beetLeaf: '#5E7F3E',
  /** A potato flower: pale lilac-white, 3 px, never a block (P3's lavender apron is 60 rows above the bed). */
  bloom: '#EAE0F0',
  /** A leek's blanched shank, the same cream the leek glyph wears (art/food.js). */
  shank: '#F1E4C8',
  /** Dark willow, the same basket wood the whole cast carries (content/critters/items.js). */
  willow: '#6B4E3A',
  soil: '#4A3C32',
});
/**
 * Every tone this file derives from another one is mixed ONCE, here. `mix` is two `hexToRgb` array literals plus
 * four padded strings and a concatenation per call (art/palettes.js), and ARCHITECTURE section 8 allows no
 * allocation inside a draw: `drawBarrow` runs unconditionally on every frame of the round, so a `mix()` left in its
 * body costs that forever. art/millProps.js's BEAM_DARK block and art/hens.js's RUST_SH are the shipped precedent.
 */
const HOLE_SH = mix(CROP.soil, PLUM.deep, 0.5);
const BARROW_DARK = mix(UI.wood, PLUM.deep, 0.45), BARROW_RIM = mix(UI.wood, UI.woodLight, 0.6);
const WHEEL_HUB = mix(UI.wood, UI.woodLight, 0.4);
const HAULM_SH = mix(CROP.haulm, CROP.leafSh, 0.6), BLADE_SH = mix(CROP.blade, CROP.leafSh, 0.55);
const BEET_LEAF_SH = mix(CROP.beetLeaf, PLUM.deep, 0.3), SHANK_SH = mix(CROP.shank, CROP.soil, 0.3);
/**
 * The root's own orange is the INGREDIENT's hex - the same one the HUD ticket, the map sign and the kitchen use, so
 * a player learns one carrot. It is an EMITTER and never decor: it exists only on a root that is out of the ground
 * (in the air, in a trug, in the barrow, on the ticket), exactly as the orchard's signal red only ever exists on
 * fruit. Nothing in backgrounds/garden.js is painted in it.
 *
 * The same rule, read for the crops that grow IN VIEW: a pumpkin sits on the soil, a cabbage hearts up above it, an
 * onion and a beetroot show their shoulders. Their hex is painted on
 * exactly that - the vegetable itself, standing in the bed, the way the orchard's red hangs in its canopy on the
 * fruit - and never on a leaf, a stem or the soil.
 */
const ROOT_HEX = INGREDIENTS.carrot.hex;

/**
 * The fern, in px from the soil line: the height the plant is actually DRAWN to, which is what a call site hanging
 * something over it needs. It read 34 here for a while, which is the maximum of the frond TIP tables and 3 px short
 * of the plant: `leaflets()` centres its ellipses ON those tips, so the ink pass (LEAF_R[3] + 1 = 3.6 by 3.0)
 * carries the tallest tip, FROND_A's (0, -34), three rows past it. Measured over both tables at every sway the
 * screen hands in: 37. Every other plant's height is in PLANTS below, measured the same way.
 */
export const FERN_H = 37;

// ---------------------------------------------------------------- the ripe carrot's fern
/**
 * Five fronds, as (tipX, tipY) from the crown. A fan: wide and low at the outside, tall and near-vertical in the
 * middle, which is the silhouette a carrot top actually makes.
 *
 * TWO tables, picked by the top's own index, because seven identical plants in a row is a stamp and a farm row is
 * a row of things that grew. Mirroring one table was tried instead and lost: it puts the single highlight on the
 * shaded side, and ART_STYLE section 3 fixes the light at top-left for the whole world. (The leaf-mass plants
 * below DO mirror, because they pick their shaded leaves and place their highlight AFTER the mirror - see
 * `leafMass`.)
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

// ---------------------------------------------------------------- the other crops
/**
 * Every plant here is drawn the fern's way: the whole thing inked first as ONE object, then filled, then one shadow
 * band on the shaded (right) side and one 2 px highlight top-left (ART_STYLE 0.5), and the produce - where the
 * vegetable grows in view - in the ingredient's own hex on top. `sway` is the fern's 1 px breeze or 2 px shake and
 * moves the foliage above SWAY_DY only, so a pumpkin on the ground never slides while its leaves do. `variant` is
 * the top's own index parity and MIRRORS the layout: the shaded leaves are picked by where they land after the
 * mirror and the highlight sits on a centred part, so the light stays top-left whichever way the plant grew.
 *
 * A leaf-mass table is flat [dx, dy, rx, ry, rot] per leaf, from the crown, and it is walked in place: nothing here
 * allocates per call (ARCHITECTURE section 8), because eight of these draw on every frame of the round.
 */
const SWAY_DY = -10;
/** Draw every leaf of `T` (from entry `from`), mirrored by `m`, grown by `grow`, offset by (ox, oy). `side` > 0 draws only the leaves right of centre after the mirror. */
function leafMass(ctx, x, y, T, m, sway, grow, ox, oy, side) {
  for (let i = 0; i < T.length; i += 5) {
    const dx = m * T[i], dy = T[i + 1];
    if (side && dx < 3) continue;
    const sx = dy <= SWAY_DY ? sway : 0;
    ctx.beginPath(); ctx.ellipse(x + dx + sx + ox, y + dy + oy, T[i + 2] + grow, T[i + 3] + grow, m * T[i + 4], 0, TAU); ctx.fill();
  }
}
/** The three passes of a leaf mass: ink, fill, and the shadow band on the mirrored-right leaves. */
function leafMass3(ctx, x, y, T, m, sway, fill, sh) {
  ctx.fillStyle = INK; leafMass(ctx, x, y, T, m, sway, 1, 0, 0, 0);
  ctx.fillStyle = fill; leafMass(ctx, x, y, T, m, sway, 0, 0, 0, 0);
  ctx.fillStyle = sh; leafMass(ctx, x, y, T, m, sway, -1.4, 1, 1, 1);
}
/** A stem from the crown (x, y - 2) to (x + m * dx + sway, y + dy): 4 px ink under 2 px `colour`. */
function stem(ctx, x, y, dx, dy, m, sway, colour) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + m * dx + sway, y + dy);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.stroke();
}
/** The 2 px highlight cap every plant carries once. */
function cap(ctx, x, y) { ctx.fillStyle = CROP.leafHi; ctx.fillRect(x, y, 2, 2); }
/**
 * A vegetable's shoulder breaking the soil: the upper half of a disc in the ingredient's hex, inked, with the
 * shadow tone in its right half. `(x, y)` is the soil line; the dome rises `r` above it.
 */
function shoulder(ctx, x, y, r, hex) {
  const t = foodTones(hex);
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = t.base; ctx.fill();
  ctx.fillStyle = t.sh; ctx.beginPath(); ctx.arc(x, y, r - 1, -Math.PI * 0.35, 0); ctx.lineTo(x + 2, y - 1); ctx.closePath(); ctx.fill();
}

// the potato's haulm: a low bushy mound of round leaves with three flowers on top
const POTATO_T = Float32Array.of(-9, -8, 6, 4.5, -0.5, 9, -8, 6, 4.5, 0.5, -5, -15, 5.5, 4.5, -0.3, 5, -15, 5.5, 4.5, 0.3, 0, -20, 5, 4, 0, 0, -9, 5, 4, 0);
const POTATO_BLOOM = Int8Array.of(-7, -21, 4, -25, 8, -18);
function drawPotato(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const m = variant ? -1 : 1;
  stem(ctx, x, y, 0, -18, m, sway, CROP.leafSh);
  leafMass3(ctx, x, y, POTATO_T, m, sway, CROP.haulm, HAULM_SH);
  cap(ctx, x - 3 + sway, y - 23);
  for (let i = 0; i < POTATO_BLOOM.length; i += 2) {
    const bx = x + m * POTATO_BLOOM[i] + sway, by = y + POTATO_BLOOM[i + 1];
    ctx.fillStyle = INK; ctx.fillRect(bx - 2, by - 2, 5, 5);
    ctx.fillStyle = CROP.bloom; ctx.fillRect(bx - 1, by - 1, 3, 3);
  }
}

// the onion: hollow tubular tops standing straight up, one flopped over, and the bulb's shoulder in the soil
const ONION_A = Int8Array.of(-9, -24, -4, -31, 1, -34, 5, -30, 10, -22);
const ONION_B = Int8Array.of(-10, -21, -5, -32, 0, -33, 6, -29, 11, -24);
function onionPath(ctx, x, y, sway, T, flop) {
  ctx.beginPath();
  for (let i = 0; i < T.length; i += 2) { ctx.moveTo(x, y - 2); ctx.lineTo(x + T[i] + sway, y + T[i + 1]); }
  // the flopped one: a tube that has bent over at the top, the mark that says "onion" rather than "grass"
  ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + flop * 6, y - 26, x + flop * 15 + sway, y - 13);
}
function drawOnion(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const T = variant ? ONION_B : ONION_A, flop = variant ? 1 : -1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  onionPath(ctx, x, y, sway, T, flop);
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = CROP.blade; ctx.lineWidth = 3; ctx.stroke();
  // the shadow band: the two right-hand tubes, a step darker
  ctx.beginPath();
  for (let i = 6; i < T.length; i += 2) { ctx.moveTo(x + 1, y - 2); ctx.lineTo(x + T[i] + sway + 1, y + T[i + 1] + 2); }
  ctx.strokeStyle = BLADE_SH; ctx.lineWidth = 2; ctx.stroke();
  cap(ctx, x + T[2] + sway - 1, y + T[3] + 1);
  shoulder(ctx, x, y, 6, INGREDIENTS.onion.hex);
}

// the leek: a blanched shank standing out of the soil with five flat blades fanning and arching off it
const LEEK_T = Int8Array.of(-14, -22, -7, -31, 0, -34, 7, -30, 14, -20);
function leekPath(ctx, x, y, sway, m) {
  ctx.beginPath();
  for (let i = 0; i < LEEK_T.length; i += 2) {
    const tx = m * LEEK_T[i], ty = LEEK_T[i + 1];
    ctx.moveTo(x, y - 8); ctx.quadraticCurveTo(x + tx * 0.35, y - 20, x + tx + sway, y + ty);
  }
}
function drawLeek(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const m = variant ? -1 : 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  leekPath(ctx, x, y, sway, m); ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
  leekPath(ctx, x, y, sway, m); ctx.strokeStyle = CROP.blade; ctx.lineWidth = 4; ctx.stroke();
  // the shadow band: the two blades that land right of centre after the mirror
  ctx.beginPath();
  for (let i = 0; i < LEEK_T.length; i += 2) {
    const tx = m * LEEK_T[i], ty = LEEK_T[i + 1];
    if (tx < 3) continue;
    ctx.moveTo(x + 1, y - 7); ctx.quadraticCurveTo(x + tx * 0.35 + 1, y - 19, x + tx + sway + 1, y + ty + 1);
  }
  ctx.strokeStyle = BLADE_SH; ctx.lineWidth = 2; ctx.stroke();
  cap(ctx, x - 1 + sway, y - 33);
  // the shank, in front of where the blades leave it
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y - 11, 10, 13);
  ctx.fillStyle = CROP.shank; ctx.fillRect(x - 4, y - 10, 8, 11);
  ctx.fillStyle = SHANK_SH; ctx.fillRect(x + 1, y - 9, 3, 10);
}

// the beetroot: a rosette of upright leaves on crimson stems, and the crimson shoulder of the root in the soil
const BEET_T = Float32Array.of(-10, -14, 4, 6, -0.6, -5, -20, 4, 6.5, -0.3, 0, -23, 4, 6.5, 0, 5, -20, 4, 6.5, 0.3, 10, -14, 4, 6, 0.6);
function drawBeetroot(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const m = variant ? -1 : 1, hex = INGREDIENTS.beetroot.hex, stemHex = foodTones(hex).hi;
  for (let i = 0; i < BEET_T.length; i += 5) stem(ctx, x, y, BEET_T[i], BEET_T[i + 1] + 3, m, BEET_T[i + 1] <= SWAY_DY ? sway : 0, stemHex);
  leafMass3(ctx, x, y, BEET_T, m, sway, CROP.beetLeaf, BEET_LEAF_SH);
  cap(ctx, x - 2 + sway, y - 28);
  shoulder(ctx, x, y, 6, hex);
}

// the pumpkin: two broad leaves on a vine behind, and the fruit itself sitting on the soil in front of them
const PUMPKIN_T = Float32Array.of(-11, -16, 7, 6, -0.4, 10, -18, 7, 6, 0.4);
function drawPumpkin(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const m = variant ? -1 : 1, hex = INGREDIENTS.pumpkin.hex, t = foodTones(hex);
  // the vine along the soil, and the two leaf stems
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - m * 16, y - 1); ctx.quadraticCurveTo(x, y - 6, x + m * 14, y - 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = CROP.leafSh; ctx.lineWidth = 2; ctx.stroke();
  stem(ctx, x, y, -11, -12, m, sway, CROP.leafSh); stem(ctx, x, y, 10, -14, m, sway, CROP.leafSh);
  leafMass3(ctx, x, y, PUMPKIN_T, m, sway, CROP.leaf, CROP.leafSh);
  // the fruit: one inked body, its ribs and lower shadow clipped inside, the stalk on top
  ctx.beginPath(); ctx.ellipse(x, y - 6, 9, 7, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = t.sh; ctx.fillRect(x - 4, y - 14, 2, 16); ctx.fillRect(x + 3, y - 14, 2, 16); ctx.fillRect(x - 10, y - 3, 20, 5);
  ctx.fillStyle = t.hi; ctx.fillRect(x - 5, y - 11, 2, 2);
  ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 16, 5, 5);
  ctx.fillStyle = CROP.leafSh; ctx.fillRect(x - 1, y - 15, 3, 3);
}

// the cabbage: five outer leaves splayed on the soil round a hearted head
const CABBAGE_T = Float32Array.of(-11, -6, 6, 4, -0.4, 11, -6, 6, 4, 0.4, -7, -12, 5, 4, -0.6, 7, -12, 5, 4, 0.6, 0, -14, 5, 4, 0);
function drawCabbage(ctx, x, y, sway, variant) {
  x = R(x); y = R(y);
  const m = variant ? -1 : 1, hex = INGREDIENTS.cabbage.hex, t = foodTones(hex);
  leafMass3(ctx, x, y, CABBAGE_T, m, sway, CROP.leaf, CROP.leafSh);
  const cx = x + sway, cy = y - 9;
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = t.sh; ctx.beginPath(); ctx.arc(cx + 3, cy + 3, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = t.sh; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx - 2, cy + 1, 4, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();   // the outer leaf's vein
  ctx.restore();
  ctx.fillStyle = t.hi; ctx.fillRect(cx - 4, cy - 4, 2, 2);
}

/**
 * THE PLANTS, by INGREDIENTS icon id: what stands in the crop ridge when the bed grows that vegetable, and how tall
 * it is drawn (px above the soil line, ink included, at the widest sway the screen hands in) so the ripe sparkle
 * can stand clear of it. `plantFor` falls back to the carrot's fern for anything not listed, so a new ingredient
 * pointed at this screen grows SOMETHING on its first day. The berries are not here: Bramble Bank picks them off
 * its own bushes (art/brambleProps.js), and a strawberry plant in a farm row was the visit that said it should.
 */
export const PLANTS = Object.freeze({
  carrot: { h: FERN_H, draw: drawFern },
  potato: { h: 28, draw: drawPotato },
  onion: { h: 37, draw: drawOnion },
  leek: { h: 38, draw: drawLeek },
  beetroot: { h: 31, draw: drawBeetroot },
  pumpkin: { h: 25, draw: drawPumpkin },
  cabbage: { h: 19, draw: drawCabbage },
});
export function plantFor(icon) { return PLANTS[icon] || PLANTS.carrot; }

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

// ---------------------------------------------------------------- what a pull leaves behind
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
 * A root in the air - just out of the ground, on its way to a trug. The root is art/food.js's own glyph so the shape
 * is the one the ticket and the kitchen use; a carrot and a beetroot get their leaves added on top here, because a
 * root with its top still on is the whole difference between "pulled" and "an ingredient icon flying past". The
 * others carry their own tops in the glyph (a leek, an onion, a pumpkin's stalk) or come out of the ground bare.
 */
export function drawPulledRoot(ctx, x, y, icon = 'carrot', hex = ROOT_HEX) {
  x = R(x); y = R(y);
  if (icon === 'carrot' || icon === 'beetroot') {
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 4); ctx.lineTo(x - 6, y - 13);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y - 15);
    ctx.moveTo(x + 1, y - 4); ctx.lineTo(x + 6, y - 12);
    ctx.stroke();
    ctx.strokeStyle = icon === 'carrot' ? CROP.leaf : CROP.beetLeaf; ctx.lineWidth = 2; ctx.stroke();
  }
  drawFood(ctx, icon, x, y, 6, hex);
}

// ---------------------------------------------------------------- the pull gauge
/**
 * THE PULL GAUGE: a paper tag that opens over the seat that has hold of a top, and the one thing in this scene a
 * first-time player has to read instantly.
 *
 * It is the mill's fill tag's sibling on purpose - the same paper with the same 6 px tab in the seat's own colour,
 * a step larger at 48x16 against the mill's 44x12 - because a player who has already played one of the seven
 * mini-games should not have to learn a second kind of paper. The trough fills a step per press, in the seat's own
 * colour up to the last quarter and UI.green (= SIGNAL.good) through it: ART_STYLE section 4 is explicit that
 * "nearly there" on paper UI is green with an ink outline and never gold, so the fill can never be confused with
 * the ripe root's gold sparkle two rows below it. The trough is always the same width, so four gauges open at
 * once are four identical rulers at four different fills, which is what stops them reading as one wall of UI.
 */
export const TAG_W = 48, TAG_H = 16;
const TAG_TAB = 6, TROUGH_X = 11, TROUGH_W = 32, TROUGH_Y = 5, TROUGH_H = 6;
/** The trough's width in the units the screen keeps the pull in: a whole number of steps for any press count that divides it. */
export const GAUGE_UNITS = 120;
/** Where the fill turns green: the last quarter of the trough. */
const GAUGE_GREEN_AT = 0.75;

/**
 * @param {number} fill 0..GAUGE_UNITS across the trough
 * @param {string} colour the seat's player colour
 */
export function drawPullGauge(ctx, cx, y, fill, colour) {
  const x = R(cx) - (TAG_W >> 1), ty = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x, ty, TAG_W, TAG_H);
  ctx.fillStyle = UI.paper; ctx.fillRect(x + 1, ty + 1, TAG_W - 2, TAG_H - 2);
  ctx.fillStyle = colour; ctx.fillRect(x + 1, ty + 1, TAG_TAB, TAG_H - 2);
  ctx.fillStyle = INK; ctx.fillRect(x + 1 + TAG_TAB, ty + 1, 2, TAG_H - 2);
  const tx = x + TROUGH_X, tyy = ty + TROUGH_Y;
  ctx.fillStyle = INK; ctx.fillRect(tx - 1, tyy - 1, TROUGH_W + 2, TROUGH_H + 2);   // the ink line every fill on paper carries
  ctx.fillStyle = UI.paperLine; ctx.fillRect(tx, tyy, TROUGH_W, TROUGH_H);
  const greenX = R(TROUGH_W * GAUGE_GREEN_AT), w = R(TROUGH_W * (fill < GAUGE_UNITS ? fill / GAUGE_UNITS : 1));
  if (w > 0) {
    ctx.fillStyle = colour; ctx.fillRect(tx, tyy, w < greenX ? w : greenX, TROUGH_H);
    if (w > greenX) { ctx.fillStyle = SIGNAL.good; ctx.fillRect(tx + greenX, tyy, w - greenX, TROUGH_H); }
  }
  ctx.fillStyle = INK; ctx.fillRect(tx + TROUGH_W - 1, tyy - 1, 2, TROUGH_H + 2);   // the post the fill is pulling toward
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
  // the roots in it are whatever the bed grows this visit: the screen sets rig.basketIcon/basketHex (game/minigame.js)
  const n = rig.trugCount > 4 ? 4 : (rig.trugCount | 0);
  for (let i = 0; i < n; i++) drawFood(ctx, rig.basketIcon || 'carrot', -6 + i * 4, 7, 3.5, rig.basketHex || ROOT_HEX);
  ctx.restore();
} };

/**
 * The barrow the party's carrots go into, its wheel's ground contact at (x, y), 52 wide and facing right. It is the
 * party's TOTAL made physical - the clock ticket says "3/4" and this says the same thing in roots - so it fills
 * from everybody's pulls and never from one seat's. Five roots are drawn, then it is a heap.
 */
export function drawBarrow(ctx, x, y, n, icon = 'carrot', hex = ROOT_HEX) {
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
  for (let i = 0; i < k; i++) drawFood(ctx, icon, -20 + i * 8, -26, 5, hex);
  if (n > 5) { ctx.fillStyle = INK; ctx.fillRect(-24, -38, 42, 5); ctx.fillStyle = hex; ctx.fillRect(-23, -37, 40, 3); }
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
 *
 * Every key sets both legs and both arms (ART_STYLE section 8), and `weapon: 90` on every one of them keeps the
 * trug upright through both.
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
  /**
   * The whopper (the farm's joke, game/screens/garden.ts): the root comes out so big the puller goes over
   * backwards - the heave, then flat on the back with the legs in the air and the arms out, `dazed`, then a
   * scramble back up onto the carry stance. Thirty frames, none of them lost.
   */
  overBackwards: { loop: false, frames: [
    F(4, { armR: [104, 18], armL: [88, 24], weapon: 90, torso: -30, head: -14, legR: [32, 6], legL: [-32, 32], root: [-6, -3], stretch: 1.06, face: 'shout' }, { ease: 'out' }),
    F(5, { armR: [-60, -30], armL: [-70, -30], weapon: 90, torso: -84, head: -20, legR: [-70, 40], legL: [-80, 40], root: [-14, 10], squash: 1.1, face: 'dazed' }, { ease: 'in', smear: { from: -20, to: -90, a: 0.35 } }),
    F(14, { armR: [-64, -30], armL: [-74, -30], weapon: 90, torso: -86, head: -22, legR: [-66, 44], legL: [-84, 36], root: [-14, 12], squash: 1.1, face: 'dazed' }),
    F(7, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
});
