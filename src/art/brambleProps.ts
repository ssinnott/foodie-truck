// Bramble Bank's props (docs/ART_STYLE.md section 1, section 5; docs/GDD.md section 5): the BERRY BUSH standing at
// the bank's foot with its three berry spots, the berry in the air on its way to a basket, and the picking stance
// the crew plays on top of the shared table.
//
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each bush first.
// Everything here is drawn in the rig's own style: 1 px warm ink round each OBJECT, a base and one shadow band
// inside that ink, nothing under 2 px. Nothing in this file decides WHEN a berry is ripe - the screen owns the
// simulation and passes in the ripe mask and the sparkle's blink, so a headless peer steps without drawing.
import { SIGNAL } from '../constants.ts';
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
/** The berry glyph's half-size on the bush and in the air, and the sparkle's height above a ripe one. */
export const BERRY_S = 4.5, SPARK_DY = 12;

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
 * the gold sparkle over every ripe berry this frame, and `variant` mirrors the mass.
 *
 * Two passes of the mass (the fern's own recipe): every oval is inked first as ONE object, then filled, then the
 * right-hand ovals take the single shadow band, and the lit tone goes on as two top-left caps. Two arching canes
 * with thorn ticks are laid over the mass, because a bramble is thorny canes with leaves on and without them this
 * is a box hedge.
 */
export function drawBush(ctx, x, y, variant, ripe, icon, hex, blink) {
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
  for (let k = 0; k < 3; k++) {
    const bx = x + m * SPOT[k * 2], by = y + SPOT[k * 2 + 1];
    if (ripe & (1 << k)) {
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
   * The thorn (the bank's joke, game/screens/bramble.ts): the reach up, the prick, the far paw whipped back down
   * and up to the mouth to be sucked, `hurt`, then a shake of it and back to the carry stance.
   */
  pricked: { loop: false, frames: [
    F(3, { armL: [-150, -10], armR: [56, 44], weapon: 90, torso: -4, head: -8, root: [0, -1], stretch: 1.02, face: 'happy' }, { ease: 'in' }),
    F(3, { armL: [-30, -140], armR: [56, 44], weapon: 90, torso: 6, head: 10, root: [0, 1], squash: 1.04, face: 'hurt' }, { ease: 'out', smear: { from: -150, to: -30, a: 0.3 } }),
    F(12, { armL: [-34, -142], armR: [56, 44], weapon: 90, torso: 6, head: 12, root: [0, 1], face: 'hurt' }),
    F(6, { armL: [-18, 8], armR: [56, 44], weapon: 90, torso: 2, head: 0, root: [0, 0], face: 'hurt' }, { ease: 'inout' }),
  ] },
});
