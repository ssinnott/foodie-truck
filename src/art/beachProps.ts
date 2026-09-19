// Cockle Cove's props (docs/ART_STYLE.md section 1, section 5; docs/GDD.md section 5): the QUARRY the crew chases
// along the strand line - a crab, a clump of washed-up weed, a salt pan on a rock - the burrow a crab comes out of
// and goes back down, the quarry in the air on its way to a basket, and the pounce the crew plays on top of the
// shared table.
//
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each sprite first.
// Everything here is drawn in the rig's own style: 1 px warm ink round each OBJECT, a base and one shadow band
// inside that ink, nothing under 2 px. Nothing in this file decides WHERE a crab runs or WHEN a pan crusts - the
// screen owns the simulation and passes in every number, including the leg beat and the sparkle's blink, so a
// headless peer steps without drawing.
import { SIGNAL, PLUM } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood, foodTones } from './food.ts';
import { F } from '../content/critters/common.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { BEACH } from './backgrounds/beach.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The quarry's own colours. The crab is the ingredient's hex (a red the cast never wears, a hue step off the
 * orchard's signal red and a value darker, and it is the ONE object in the scene that carries it - a crab is an
 * emitter, like a root out of the ground). Its underside is that red toward plum; its eyes are ink on cream.
 */
const CRAB_HEX = INGREDIENTS.crab.hex;
const CRAB_SH = foodTones(CRAB_HEX).sh, CRAB_HI = foodTones(CRAB_HEX).hi;
/** The burrow: a hole in the sand, plum inside its own ink, the farm's pulled-root hole a size down. */
const HOLE_SH = mix(BEACH.sandDark, PLUM.deep, 0.5);
/** A salt pan's crust: pure white over the sea salt's own pale hex, on the rock's grey. */
const CRUST = INGREDIENTS.salt.hex, CRUST_HI = '#FFFFFF';

// ---------------------------------------------------------------- the crab
/**
 * A crab with its feet on (x, y), facing `dir` (1 right, -1 left). `legs` is the scuttle beat, 0 or 1 (the screen
 * hashes it off the frame counter while the crab moves); `up` raises the claws - a crab that has stopped puts its
 * claws up, which is what a crab does, and it is also the tell that says "pounce now".
 *
 * Twenty-two pixels wide: one inked shell (a rounded trapezoid, wider at the back), four legs a side as 2 px ink
 * strokes that swap between two sets on the beat, two claws on 3 px arms, and two eyes on stalks. Drawn in ONE
 * ink pass under the fills so the legs, the claws and the shell read as one animal (the fern's rule).
 */
const SHELL = [-9, -10, 9, -10, 11, -4, 8, 0, -8, 0, -11, -4];
export function drawCrab(ctx, x, y, dir, legs, up) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y); if (dir < 0) ctx.scale(-1, 1);
  // the legs, four a side, on two sets so the beat is a scuttle and not a slide
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const lx = -7 + i * 5, k = (i + legs) & 1 ? 1 : -1;
    ctx.moveTo(lx, -4); ctx.lineTo(lx - 5 + k * 2, 2);
    ctx.moveTo(lx + 2, -4); ctx.lineTo(lx + 7 - k * 2, 2);
  }
  ctx.stroke();
  ctx.strokeStyle = CRAB_SH; ctx.lineWidth = 2; ctx.stroke();
  // the claw arms: forward and down when running, up in front of the eyes when stopped
  const ay = up ? -14 : -6, ax = up ? 12 : 14;
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(ax, ay); ctx.moveTo(-8, -6); ctx.lineTo(-ax, ay); ctx.stroke();
  ctx.strokeStyle = CRAB_HEX; ctx.lineWidth = 3; ctx.stroke();
  // the claws: two inked lobes on each arm's end, open a pixel
  for (let s = -1; s <= 1; s += 2) {
    const cx = s * ax, cy = ay - 2;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx, cy, 4.5, 3.5, s * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = CRAB_HEX; ctx.beginPath(); ctx.ellipse(cx, cy, 3.5, 2.5, s * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(cx + s * 2, cy - 1, 2, 2);
  }
  // the shell: one inked body, its shadow band low and its highlight top-left
  ctx.beginPath(); ctx.moveTo(SHELL[0], SHELL[1]); for (let i = 2; i < SHELL.length; i += 2) ctx.lineTo(SHELL[i], SHELL[i + 1]); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = CRAB_HEX; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = CRAB_SH; ctx.fillRect(-12, -4, 24, 5); ctx.fillStyle = CRAB_HI; ctx.fillRect(-6, -9, 3, 2); ctx.restore();
  // the eyes on their stalks
  ctx.fillStyle = INK; ctx.fillRect(-5, -15, 2, 6); ctx.fillRect(3, -15, 2, 6);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -15, 3, 0, TAU); ctx.arc(4, -15, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = BEACH.shell; ctx.beginPath(); ctx.arc(-4, -15, 2, 0, TAU); ctx.arc(4, -15, 2, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(-4, -16, 1, 2); ctx.fillRect(4, -16, 1, 2);
  ctx.restore();
}

// ---------------------------------------------------------------- the weed and the pan
/**
 * A clump of washed-up weed lying on the strand with its holdfast at (x, y): art/food.js's own seaweed glyph laid
 * on its side and a size up, with a wet gleam on it, so the thing in the basket is the thing that was on the sand.
 */
export function drawWeed(ctx, x, y, dir) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir * 0.55);
  drawFood(ctx, 'seaweed', 0, -6, 7, INGREDIENTS.seaweed.hex);
  ctx.restore();
  ctx.fillStyle = BEACH.wetGloss; ctx.fillRect(x - dir * 4 - 1, y - 6, 2, 2);
}

/**
 * A salt pan: a flat grey rock on the strand with a hollow in its top that the tide filled, crusting white as it
 * dries. `crust` is 0..1 and is what the screen simulates: the pan can be scraped once it is full (the sparkle
 * says so), and a pan still filling shows a wet hollow. Two rocks, by `variant`.
 */
export function drawPan(ctx, x, y, variant, crust) {
  x = R(x); y = R(y);
  const w = variant ? 22 : 26, h = variant ? 9 : 11;
  ctx.beginPath(); ctx.ellipse(x, y - 3, w / 2, h / 2, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = BEACH.rock; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = BEACH.rockDark; ctx.fillRect(x - 14, y - 2, 28, 6); ctx.restore();
  // the hollow: an inked dish in the rock's top, wet plum until the crust takes, then white to the rim
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y - 5, w / 2 - 4, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = crust >= 1 ? CRUST : mix(BEACH.seaNear, PLUM.deep, 0.35);
  ctx.beginPath(); ctx.ellipse(x, y - 5, w / 2 - 5, 2, 0, 0, TAU); ctx.fill();
  if (crust > 0 && crust < 1) { ctx.fillStyle = CRUST; ctx.fillRect(x - R((w / 2 - 6) * crust), y - 6, R((w - 12) * crust), 2); }
  if (crust >= 1) { ctx.fillStyle = CRUST_HI; ctx.fillRect(x - 5, y - 6, 4, 1); ctx.fillRect(x + 2, y - 6, 3, 1); }
}

// ---------------------------------------------------------------- the burrow, the sparkle, the flight
/** A crab's burrow: an inked hole in the sand, opening over three steps and closing over the same three. */
const HOLE_RX = Int8Array.of(3, 5, 7), HOLE_RY = Int8Array.of(2, 3, 4);
export function drawBurrow(ctx, x, y, step) {
  if (step < 0 || step >= HOLE_RX.length) return;
  x = R(x); y = R(y);
  ctx.fillStyle = HOLE_SH; ctx.beginPath(); ctx.ellipse(x, y, HOLE_RX[step] + 1, HOLE_RY[step] + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = PLUM.deep; ctx.beginPath(); ctx.ellipse(x, y - 1, HOLE_RX[step], HOLE_RY[step], 0, 0, TAU); ctx.fill();
  // the sand it threw up: two clods either side
  ctx.fillStyle = BEACH.sandDark; ctx.fillRect(x - HOLE_RX[step] - 3, y - 1, 3, 2); ctx.fillRect(x + HOLE_RX[step] + 1, y - 2, 3, 2);
}

/**
 * The cove's sparkle: SIGNAL.pond mint, the four-armed mark the farm's ripe root wears in gold, over a pan that has
 * crusted (the one quarry that does not move, so it needs the mark the coop's egg has) and over a crab that has
 * stopped with its claws up. Mint and not gold because this is the pond's scene by sign colour (content/places.js:
 * the cove keeps the pond's accent), and section 4 gives a scene one signal. Its own 1 px ink, for the farm's
 * reason: it sits at apron height in front of the crew.
 */
export function drawCatchSpark(ctx, x, y) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 2, y - 4, 4, 8);
  ctx.fillRect(x - 4, y - 2, 8, 4);
  ctx.fillStyle = SIGNAL.pond;
  ctx.fillRect(x - 1, y - 3, 2, 6);
  ctx.fillRect(x - 3, y - 1, 6, 2);
}

/** The catch in the air, on its way to the basket: the ingredient's glyph inside a second ink line (the coop's airborne egg set the rule). */
export function drawFlyingCatch(ctx, x, y, icon, hex) {
  x = R(x); y = R(y);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
  drawFood(ctx, icon, x, y, 6, hex);
}

/**
 * The pounce, on top of the shared table (content/critters/common.js makeCritterAnims), installed per seat with
 * `player.setOverlay`: the coop's crouch to a floor egg, kept for the same reason - the basket dips to the ground
 * and comes back up with both paws on it, `weapon: 90` keeping it upright, the face and the apron open
 * (ART_STYLE 0.7). 12 frames, the screen's POUNCE_FRAMES. A crab is grabbed from above, which is a crouch.
 */
export const BEACH_ANIMS = Object.freeze({
  pounce: { loop: false, frames: [
    F(5, { armR: [44, 36], armL: [40, 40], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1, face: 'shout' }, { ease: 'in' }),
    F(7, { armR: [60, 50], armL: [56, 54], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
});
