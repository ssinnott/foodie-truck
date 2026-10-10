// Bramble Bank's props (docs/ART_STYLE.md section 1, section 5; docs/GDD.md section 5): the BERRY BUSH standing at
// the bank's foot with its three berry spots, the berry in the air on its way to a basket, the picking stance the
// crew plays on top of the shared table, and the furniture of the bank's two jokes (game/screens/brambleGags.ts):
// the swollen SQUISHY berry, on the bush and in a paw, the juice it coats its picker in, the juice on the path,
// and the poses of the thorn and the squishy one.
//
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each bush first.
// Everything here is drawn in the rig's own style: 1 px warm ink round each OBJECT, a base and one shadow band
// inside that ink, nothing under 2 px. Nothing in this file decides WHEN a berry is ripe - the screen owns the
// simulation and passes in the ripe mask and the sparkle's blink, so a headless peer steps without drawing.
import { SIGNAL, UI } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood } from './food.ts';
import { F } from '../content/critters/common.ts';
import { BRAMBLE } from './backgrounds/bramble.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The bush's own colours. `leaf` is the orchard's canopy green: a step lighter than the hedgerow behind the bank
 * (BRAMBLE.hedge, L .29 against .36) so a bush sits OUT of the hedge it grows against, and a step darker than the
 * farm's crop so the two south-lane greens never twin. The canes are dark willow, the cast's basket wood.
 */
export const BUSH = Object.freeze({
  leaf: '#4F6B3A', leafLit: '#6C8A4A', leafSh: '#3B5230',
  cane: '#6B4E3A',
  /** An unripe berry: pale green, the size of a pea, so a spot that has not ripened yet still reads as a spot. */
  green: '#9DB36A',
});
const CANE_SH = mix(BUSH.cane, BRAMBLE.plum, 0.4);

/**
 * The bush's leaf mass as a flat table [dx, dy, rx, ry] from its base, walked in place (ARCHITECTURE section 8): a
 * low wide mound of overlapping ovals, biggest in the middle, so six of them along the bank read as a hedge of
 * bushes and not as six lollipops. `variant` mirrors it, and the shadow band is picked AFTER the mirror (the
 * right-hand ovals), so the light stays top-left whichever way a bush grew.
 */
const MASS = Int8Array.of(-24, -12, 13, 9, 24, -14, 13, 10, -11, -26, 14, 11, 11, -28, 15, 12, 0, -42, 13, 10, -20, -36, 10, 8, 20, -38, 10, 8, 0, -14, 16, 10);
/** The bush's drawn height above its base, ink included, at either variant. */
export const BUSH_H = 53;
/**
 * The three berry spots, as (dx, dy) from the base: one either side and one high, all in the upper half of the
 * mass where a berry hangs clear of the ground and clear of the crew's heads on the front lane (the front lane's
 * tallest head reaches 252; the lowest spot is at bushBase - 26 = 236, with the berry's 4 px above it).
 */
export const SPOT = Int8Array.of(-16, -30, 14, -26, -2, -44);
/** Berry spots per bush. */
export const SPOTS = SPOT.length / 2;
/**
 * Spot k's x offset from the base of a bush drawn at `variant`: drawBush MIRRORS the whole mass, its berry spots
 * with it, so the screen asks here for where a berry actually hangs instead of reading SPOT on its own (it once
 * did, and on every second bush the thorn was laid across the berry's mirror image - a green pea).
 */
export function spotDX(variant: number, k: number): number { return (variant ? -1 : 1) * SPOT[k * 2]; }
/** The berry glyph's half-size on the bush and in the air, and the sparkle's height above a ripe one. */
export const BERRY_S = 4.5, SPARK_DY = 12;
/**
 * The squishy one hangs at SWOLLEN times a berry's size (an 18 px berry among 9 px ones: the tell, from across a
 * room), and swells on to SWELL_MAX times in the paw before it goes. Its sparkle sits SWOLLEN_SPARK px further out.
 */
export const SWOLLEN = 2, SWELL_MAX = 2.8, SWOLLEN_SPARK = 5;
/** The wobble, a 1 px sway read four steps at a time: still, right, still, left. */
const WOBBLE = Int8Array.of(0, 1, 0, -1);
/** The squash the wobble carries on its swing (wider and shorter), so a berry ON THE MOVE reads as soft. */
const WOBBLE_SQUASH = 0.08;
/** The gloss on a swollen berry: one 3 px and one 2 px pip of white on its lit top-left, cream being the strawberry's seeds. */
const GLOSS = UI.white;

function mass(ctx, x, y, m, grow, ox, oy, side) {
  for (let i = 0; i < MASS.length; i += 4) {
    const dx = m * MASS[i];
    if (side && dx < 4) continue;
    ctx.beginPath(); ctx.ellipse(x + dx + ox, y + MASS[i + 1] + oy, MASS[i + 2] + grow, MASS[i + 3] + grow, 0, 0, TAU); ctx.fill();
  }
}

/**
 * A berry bush with its base at (x, y). `ripe` is a 3-bit mask over SPOT (bit k set = the k-th spot holds a ripe
 * berry); an unset spot shows a green one. `icon`/`hex` are the ripe berry's glyph (art/food.js), `blink` lights
 * the gold sparkle over every ripe berry this frame, and `variant` mirrors the mass. `big` is the mask of ripe
 * berries that are the SQUISHY one (the bank's joke): drawn swollen, glossy and wobbling on phase `wob`, with the
 * same sparkle a step further out - it is a ripe berry, and picking it is the joke.
 *
 * Two passes of the mass (the fern's own recipe): every oval is inked first as ONE object, then filled, then the
 * right-hand ovals take the single shadow band, and the lit tone goes on as two top-left caps. Two arching canes
 * with thorn ticks are laid over the mass, because a bramble is thorny canes with leaves on and without them this
 * is a box hedge.
 */
export function drawBush(ctx, x, y, variant, ripe, icon, hex, blink, big = 0, wob = 0) {
  x = R(x); y = R(y);
  const m = variant ? -1 : 1;
  ctx.fillStyle = INK; mass(ctx, x, y, m, 1, 0, 0, 0);
  ctx.fillStyle = BUSH.leaf; mass(ctx, x, y, m, 0, 0, 0, 0);
  ctx.fillStyle = BUSH.leafSh; mass(ctx, x, y, m, -2, 2, 2, 1);
  ctx.fillStyle = BUSH.leafLit;
  ctx.beginPath(); ctx.ellipse(x - m * 14, y - 32, 6, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x - 4, y - 46, 5, 3, 0, 0, TAU); ctx.fill();
  // the canes: two arcs from the root out over the mass, inked then filled, thorns as 2 px ticks along them
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - m * 4, y); ctx.quadraticCurveTo(x - m * 28, y - 36, x - m * 34, y - 14);
  ctx.moveTo(x + m * 2, y); ctx.quadraticCurveTo(x + m * 16, y - 50, x + m * 34, y - 28);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = BUSH.cane; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = CANE_SH;
  ctx.fillRect(x - m * 22 - 1, y - 29, 2, 2); ctx.fillRect(x + m * 12 - 1, y - 35, 2, 2); ctx.fillRect(x + m * 26 - 1, y - 32, 2, 2);
  // the berries: a ripe one in its own hex with the gold sparkle over it, else a green pea
  for (let k = 0; k < SPOTS; k++) {
    const bx = x + m * SPOT[k * 2], by = y + SPOT[k * 2 + 1];
    if (ripe & big & (1 << k)) {
      drawSwollenBerry(ctx, bx, by, icon, hex, BERRY_S * SWOLLEN, wob + k);
      if (blink) drawRipeSpark(ctx, bx + 6 + SWOLLEN_SPARK, by - SPARK_DY - SWOLLEN_SPARK);
    } else if (ripe & (1 << k)) {
      drawFood(ctx, icon, bx, by, BERRY_S, hex);
      if (blink) drawRipeSpark(ctx, bx + 6, by - SPARK_DY);
    } else {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = BUSH.green; ctx.beginPath(); ctx.arc(bx, by, 2, 0, TAU); ctx.fill();
    }
  }
}

/**
 * The ripe-berry sparkle: SIGNAL.garden, the same four-armed mark the farm's ripe root and the coop's fresh egg
 * wear (ART_STYLE section 4 - gold means "the thing you want"), with its own 1 px ink because it sits over a green
 * mass at head height where a bare gold cross would vanish against P2's marmalade. (x, y) is the mark's centre.
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

/**
 * A berry in the air, hopping from the bush into a basket: the glyph inside a second ink line, because a red
 * berry crossing Barley's cream wool on its own 1 px line was a smudge (the coop's airborne egg set the rule).
 */
export function drawFlyingBerry(ctx, x, y, icon, hex) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, BERRY_S + 1.5, 0, TAU); ctx.fill();
  drawFood(ctx, icon, x, y, BERRY_S, hex);
}

/**
 * THE SQUISHY ONE, the tell: the berry's own glyph at half-size `s`, swaying a pixel either way on `phase` (the
 * WOBBLE table, a step per call the caller decides) with a squash on the swing, and a gloss of white on its lit
 * top-left - a berry fat enough to burst looks WET. Same glyph, same hex: the only things that give it away are
 * the size, the shine and the wobble, which is exactly what a sharp eye can see coming (and a kid can go for).
 */
export function drawSwollenBerry(ctx, x, y, icon, hex, s, phase) {
  const w = WOBBLE[phase & 3], k = w * w * WOBBLE_SQUASH;
  x = R(x + w); y = R(y);
  ctx.save(); ctx.translate(x, y); ctx.scale(1 + k, 1 - k);
  drawFood(ctx, icon, 0, 0, s, hex);
  ctx.restore();
  // the glint: a 3 px pip and a 2 px one under it, on the body below every glyph's calyx line (a strawberry's top
  // edge is at -0.4 s) and inside the round ones
  ctx.fillStyle = GLOSS;
  ctx.fillRect(R(x - s * 0.5), R(y - s * 0.22), 3, 3);
  ctx.fillRect(R(x - s * 0.5) + 1, R(y - s * 0.22) + 5, 2, 2);
}

/** The held berry sits PALM_DX px forward of the paw's centre and PALM_SIT px down into it. */
const PALM_DX = 2, PALM_SIT = 3;
/**
 * The squishy berry IN THE PAW, on the palm of the near paw at (x, y) - the `handN` joint, read after drawRig - so
 * the paw shows under it holding it up: drawn over the rig (the orchard's held bomb), a half-size `s` swelling and a
 * wobble `phase` quickening as the screen counts the hold down. `facing` puts it on the paw's forward side.
 */
export function drawHeldBerry(ctx, x, y, facing, icon, hex, s, phase) {
  drawSwollenBerry(ctx, x + facing * PALM_DX, y - s + PALM_SIT, icon, hex, s, phase);
}

/**
 * The juice a squishy berry coats its picker in (game/gags.ts `coat`), one per berry the bank grows. Hand-picked
 * and MUTED, because a coat is the size of a critter: each is the fruit's own hue taken a step down and toward the
 * bank's plum shadow (saturation .41-.59, under ART_STYLE's .65 for anything that is not a signal), so it is never
 * the berry's hex, never SIGNAL.garden's gold and never SIGNAL.hot. The red ones go a deep red-pink, the dark ones
 * purple (blueberry juice stains purple, not blue). Rec-601 L .29-.38: clear of the ink (.13) by at least .54
 * relative, so the outline still reads round a coated critter, of the eye whites it blinks out of by .61, and of
 * the path (.59) and the bank's turf (.55) behind it by at least .36 and .31 (art-check's ladder is .25).
 */
export const JUICE = Object.freeze({
  strawberry: '#9E4258', raspberry: '#8E3A5E', blueberry: '#674A8A', blackberry: '#5E3A63',
});
/** The juice for an ingredient id; a berry the table does not know is its own hex pulled toward the plum shadow. */
export function juiceFor(id: string, hex: string): string { return JUICE[id] || mix(hex, BRAMBLE.plum, 0.4); }

/** The splash's lobes round its middle: six unit offsets, a little ragged (built once; ARCHITECTURE section 8). */
const LOBES = new Float32Array(12);
for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6 + (i & 1) * 0.3, d = i & 1 ? 0.95 : 0.8; LOBES[i * 2] = Math.cos(a) * d; LOBES[i * 2 + 1] = Math.sin(a) * d; }

/**
 * The squishy one going off in the paw, for the first frames of the bang (the orchard's flash, in juice): a ragged
 * blob `r` across - a disc and six lobes, inked as one object and then filled in the juice - with the berry's own
 * flesh in the middle of it.
 */
export function drawJuiceSplash(ctx, x, y, r, juice, hex) {
  x = R(x); y = R(y);
  const lr = r * 0.45;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, TAU); ctx.fill();
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + LOBES[i * 2] * r, y + LOBES[i * 2 + 1] * r, lr + 1.5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = juice;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + LOBES[i * 2] * r, y + LOBES[i * 2 + 1] * r, lr, 0, TAU); ctx.fill(); }
  ctx.fillStyle = hex;
  ctx.beginPath(); ctx.arc(x - 1, y - 1, r * 0.5, 0, TAU); ctx.fill();
}

/**
 * A burst berry's juice on the path, under the picker's feet: one inked flat ellipse `rx` wide in the juice, its
 * shade band (`sh`) toward the bottom right, and two inked drops thrown clear either side - a splat, not a disc,
 * so it never reads as a berry lying there to be picked (the orchard's splat set the rule).
 */
export function drawJuiceSplat(ctx, x, y, rx, ry, juice, sh) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
  if (rx > 6) { ctx.fillRect(x - rx - 7, y - 2, 5, 4); ctx.fillRect(x + rx + 3, y - 1, 4, 4); }
  ctx.fillStyle = juice;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  if (rx > 6) { ctx.fillRect(x - rx - 6, y - 1, 3, 2); ctx.fillRect(x + rx + 4, y, 2, 2); }
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.ellipse(x + 2, y + 1, rx - 3, ry - 1, 0, 0, TAU); ctx.fill();
}

/**
 * THE JOKES' POSES share one staging: while a joke has the NEAR paw busy - reaching for a thorn and being blown on,
 * holding the squishy berry up, licking - the basket is in the FAR paw (game/screens/brambleGags.ts FAR_BASKET), so
 * the paw the joke is about is the one in front of the body where it reads, and the basket is still there instead
 * of vanishing. A far paw cannot do the near paw's work on a chibi: from its shoulder behind the torso it never
 * reaches past the muzzle, and Barley's head hides it whole. FAR_HOLD is that far arm holding the basket up behind,
 * the carry pose's near arm turned round (common.ts CARRY [60, 50]): hung off a far arm that just hangs, a basket
 * swings below the feet.
 */
const FAR_HOLD = Object.freeze({ upper: -60, lower: -50 });
/** How far the thorn's leap goes up, in rows (the root's y at the top of it); the OW! card goes up as far. */
export const PRICK_RISE = 22;
/**
 * One hop on ONE foot (9 frames; PRICK_HOP plays it four times): the near leg tucked up behind (the coop's peck
 * hop), the root up and down, and the pricked near paw at the muzzle tip being blown on (the shared `eat` keys'
 * paw, which stops AT the muzzle) - `shout` on the way up is the round mouth blowing, `hurt` on the way down.
 */
const HOP_ON_ONE_FOOT = Object.freeze([
  F(4, { armR: [92, 42], armL: [-64, -46], legR: [76, -104], legL: [-4, 4], torso: 4, head: 8, root: [0, -6], squash: 0.96, face: 'shout' }, { ease: 'out' }),
  F(5, { armR: [88, 46], armL: FAR_HOLD, legR: [70, -98], legL: [-2, 2], torso: 6, head: 10, root: [0, 0], squash: 1.04, face: 'hurt' }, { ease: 'in' }),
]);

/**
 * The picking beat, on top of the shared table (content/critters/common.js makeCritterAnims), installed per seat
 * with `player.setOverlay`: the coop's nest reach, kept for the same reason - the FAR arm goes up and out to the
 * bush (it draws behind the head) while the near arm stays low with `weapon: 90`, so the basket hangs upright in
 * front of the belly and the face and the apron stay open (ART_STYLE 0.7). 12 frames, the screen's REACH_FRAMES.
 */
export const BRAMBLE_ANIMS = Object.freeze({
  pick: { loop: false, frames: [
    F(5, { armL: [-150, -10], armR: [56, 44], weapon: 90, torso: -4, head: -8, root: [0, -1], stretch: 1.02, face: 'happy' }, { ease: 'in' }),
    F(7, { armL: [-158, -14], armR: [50, 40], weapon: 90, torso: -6, head: -10, root: [0, -2], stretch: 1.04, face: 'happy' }, { ease: 'out' }),
  ] },
  /**
   * THE THORN (game/screens/brambleGags.ts), 70 frames - PRICK_REACH 6, PRICK_FREEZE 6, PRICK_LEAP 14 (crouch 2, the
   * air 6, the landing 6), PRICK_HOP 36, PRICK_SETTLE 8, the screen's numbers key for key: the near paw goes up into
   * the bush, the thorn goes in and the whole critter goes RIGID (`grit`, stretched tall), then the paw is yanked
   * down to the chest, a crouch and a leap straight up (root y, PRICK_RISE) with the legs tucked, the far arm and
   * the basket flung up behind and the mouth open on the OW!, a squash on landing, and four hops on ONE foot blowing
   * on the paw. The settle brings the near paw down to the carry, to take the basket back.
   */
  pricked: { loop: false, frames: [
    F(6, { armR: [122, 16], armL: FAR_HOLD, torso: -4, head: -8, root: [0, -1], stretch: 1.03, face: 'happy' }, { ease: 'in' }),
    F(6, { armR: [128, 12], armL: FAR_HOLD, legR: [2, 0], legL: [-2, 0], torso: -6, head: -10, root: [0, -2], stretch: 1.08, face: 'grit' }),
    F(2, { armR: [40, 100], armL: [-70, -40], legR: [20, 30], legL: [-14, 30], torso: 12, head: 6, root: [0, 4], squash: 1.12, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [60, 96], armL: [-130, -20], legR: [36, -60], legL: [16, -40], torso: -4, head: -12, root: [0, -PRICK_RISE], stretch: 1.08, face: 'shout' }, { ease: 'in' }),
    F(6, { armR: [80, 70], armL: [-66, -44], legR: [20, 30], legL: [-14, 30], torso: 10, head: 6, root: [0, 3], squash: 1.12, face: 'hurt' }, { ease: 'out' }),
    ...HOP_ON_ONE_FOOT, ...HOP_ON_ONE_FOOT,
    F(8, { armR: [60, 50], armL: FAR_HOLD, weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'hurt' }, { ease: 'inout' }),
  ] },
  /**
   * THE SQUISHY ONE, the wind-up (SQUISH_HOLD 30: 6 + 8 + 6 + 10): the near paw goes up for the fat berry and holds
   * it out in front at arm's length (game/screens/bramble.ts draws it on the palm), the head tipped to admire it,
   * `happy` - then it starts to wobble ('!', SQUISH_SWELL 14): a lean back from it, `shout`, and a wince with the
   * head turned away and the arm stretched as far off as it goes, `grit`, as it swells. Out past the muzzle tip on
   * every head in the cast, so the face is open to the bang.
   */
  admire: { loop: false, frames: [
    F(6, { armR: [124, 14], armL: FAR_HOLD, torso: -4, head: -8, root: [0, -1], stretch: 1.03, face: 'happy' }, { ease: 'out' }),
    F(8, { armR: [100, 6], armL: FAR_HOLD, torso: -2, head: 8, root: [0, 0], face: 'happy' }),
    F(6, { armR: [102, 4], armL: [-66, -46], torso: 6, head: 0, root: [0, 1], squash: 1.04, face: 'shout' }, { ease: 'out' }),
    F(10, { armR: [106, 2], armL: [-70, -44], torso: 10, head: -8, root: [0, 1], squash: 1.03, face: 'grit' }),
  ] },
  /**
   * The look (SQUISH_DRIP 70; Barley stands in its first GULP_SHOCK 30): coated head to toe, stood stock still with
   * the near arm held off the side the way a soaked thing holds it, the feet apart, dripping. It opens on the splash
   * (eyes shut, a squash, the head knocked back) and then BLINKS out of the juice every sixteen frames or so - the
   * coat keeps the whites and the pupils, so the blink is the one thing on the critter that moves.
   */
  drip: { loop: false, frames: [
    F(4, { armR: [40, 6], armL: [-66, -44], legR: [8, 0], legL: [-8, 0], torso: -8, head: -12, root: [0, 1], squash: 1.1, face: 'closed' }, { ease: 'out' }),
    F(14, { armR: [32, 8], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 0, head: -2, root: [0, 0], face: 'neutral' }),
    F(3, { armR: [32, 8], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 0, head: -2, root: [0, 0], face: 'closed' }),
    F(16, { armR: [30, 10], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 2, head: 2, root: [0, 1], squash: 1.02, face: 'neutral' }),
    F(3, { armR: [30, 10], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 2, head: 2, root: [0, 1], squash: 1.02, face: 'closed' }),
    F(14, { armR: [32, 8], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 0, head: -2, root: [0, 0], face: 'neutral' }),
    F(3, { armR: [32, 8], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 0, head: -2, root: [0, 0], face: 'closed' }),
    F(13, { armR: [30, 10], armL: FAR_HOLD, legR: [6, 0], legL: [-6, 0], torso: 2, head: 2, root: [0, 1], face: 'neutral' }),
  ] },
  /**
   * ...then it licks a paw (SQUISH_LICK 24): the near paw to the muzzle tip and away, twice (the shared `eat` keys'
   * paw, which stops AT the muzzle so the open mouth reads), and the face says it was good: MMM!
   */
  lick: { loop: false, frames: [
    F(5, { armR: [70, 60], armL: FAR_HOLD, torso: -2, head: 4, face: 'happy' }, { ease: 'in' }),
    F(5, { armR: [92, 42], armL: FAR_HOLD, torso: -4, head: 8, face: 'shout' }, { ease: 'overshoot' }),
    F(5, { armR: [80, 44], armL: FAR_HOLD, torso: -2, head: 4, face: 'closed' }),
    F(5, { armR: [92, 42], armL: FAR_HOLD, torso: -4, head: 8, face: 'shout' }, { ease: 'overshoot' }),
    F(4, { armR: [74, 50], armL: FAR_HOLD, torso: -2, head: 2, face: 'happy' }),
  ] },
  /** ...and shakes it off (SQUISH_SHAKE 16): a wet dog's shake, eight 2-frame swings, the juice flung off it. */
  shakeOff: { loop: true, frames: [
    F(2, { armR: [50, 20], armL: [-70, -40], legR: [8, 0], legL: [-8, 0], torso: -10, head: 14, root: [-2, 0], face: 'closed' }),
    F(2, { armR: [24, 30], armL: [-50, -60], legR: [8, 0], legL: [-8, 0], torso: 10, head: -14, root: [2, 0], face: 'closed' }),
  ] },
  /**
   * BARLEY EATS THE EVIDENCE: the hungry one licks itself clean instead (GULP_LICK 18 a lick, looped GULP_LICKS
   * times): the near paw scoops juice off the belly, goes to the mouth (nom: GULP_NOM 8 frames in) and the eyes
   * shut on it. Then `pat`: a pat of the tummy, `happy`, clean.
   */
  slurp: { loop: true, frames: [
    F(6, { armR: [50, 46], armL: FAR_HOLD, torso: 4, head: 6, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
    F(5, { armR: [92, 42], armL: FAR_HOLD, torso: -4, head: 8, root: [0, 0], face: 'shout' }, { ease: 'overshoot' }),
    F(7, { armR: [86, 40], armL: FAR_HOLD, torso: -2, head: 4, root: [0, 0], squash: 1.03, face: 'closed' }),
  ] },
  pat: { loop: true, frames: [
    F(5, { armR: [36, 40], armL: FAR_HOLD, torso: -2, head: -4, root: [0, 0], squash: 1.04, face: 'happy' }, { ease: 'inout' }),
    F(5, { armR: [40, 46], armL: FAR_HOLD, torso: -2, head: -4, root: [0, 1], squash: 1.06, face: 'happy' }, { ease: 'inout' }),
  ] },
});
