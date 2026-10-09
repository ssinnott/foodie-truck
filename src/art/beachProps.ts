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
 * A cockle in the wet sand: a low bump of darker sand with the ribbed edge of the shell showing, and every so often
 * (an index hash on `f`) a spit of water out of the top, which is what gives it away.
 */
export function drawCockle(ctx, x, y, i, f) {
  x = R(x); y = R(y);
  ctx.fillStyle = BEACH.wet; ctx.beginPath(); ctx.ellipse(x, y, 11, 4, 0, 0, TAU); ctx.fill();
  drawFood(ctx, 'cockle', x, y - 3, 5, INGREDIENTS.cockle.hex);
  ctx.fillStyle = BEACH.wet; ctx.fillRect(x - 8, y - 1, 16, 3);   // half-buried: the sand over the hinge
  if ((((f + i * 11) >> 4) & 3) === 0) { ctx.fillStyle = BEACH.wetGloss; ctx.fillRect(x - 1, y - 12, 2, 6); ctx.fillRect(x - 2, y - 14, 1, 2); ctx.fillRect(x + 1, y - 14, 1, 2); }
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
 *
 * ...and the cove's three jokes (game/screens/beachGags.ts), on the same table. Raised paws go up FORWARD with the
 * elbow open (upper 110-125, lower 14-22) so the paw - and whatever is in it - clears the muzzle; a key's length is
 * the screen's beat where the screen switches on `done`.
 *   THE GULL   scoop      down to the strand and up with the catch held high (the basket is set down for it);
 *              holdUp     admiring it, smiling, while a shadow comes across the sand;
 *              startle    the '!': head snapped up at the gull coming, mouth open, the catch still up;
 *              spun       the downdraft: arms flung wide, on one foot (the screen swaps the facing every few frames);
 *              shakeFist  glaring up at the gull with the basket shaken at the sky;
 *              bonked     the catch lands on the head: squashed down, then `dazed`, a slow sway with the basket out;
 *              shakeOff   a shake of the whole body, and back to work.
 *   THE PINCH  clamped    frozen with the crab on the paw, the paw thrust out, OW; then
 *              pinchRun   running round in a panic with that paw held out and the far one flailing.
 *   THE WAVE   lookOut    up on tiptoe, staring out at the sea going out;
 *              splooshed  flung back flat onto the bottom, then `sitWet`, sat in the wet with the legs out (the
 *                         shared `sit`'s legs and lap), dazed; then `getUp` off the sand.
 */
const BASKET = { armR: [60, 50], armL: [-18, 8], weapon: 90 };
const SIT = { armR: [44, 40], armL: [30, 40], weapon: 90, legR: [80, 0], legL: [70, 4] };
export const BEACH_ANIMS = Object.freeze({
  pounce: { loop: false, frames: [
    F(5, { armR: [44, 36], armL: [40, 40], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1, face: 'shout' }, { ease: 'in' }),
    F(7, { armR: [60, 50], armL: [56, 54], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  scoop: { loop: false, frames: [
    F(4, { armR: [40, 40], armL: [-20, 20], legR: [20, 30], legL: [-14, 30], torso: 16, head: 10, root: [0, 4], squash: 1.1, face: 'shout' }, { ease: 'in' }),
    F(6, { armR: [114, 18], armL: [-18, 10], torso: -4, head: 4, root: [0, -1], face: 'happy' }, { ease: 'overshoot' }),
  ] },
  holdUp: { loop: true, frames: [
    F(10, { armR: [114, 18], armL: [-18, 8], torso: -4, head: 6, root: [0, 0], face: 'happy' }),
    F(10, { armR: [118, 16], armL: [-16, 10], torso: -5, head: 8, root: [0, -1], face: 'happy' }),
  ] },
  startle: { loop: false, frames: [
    F(3, { armR: [120, 14], armL: [-36, 24], torso: -10, head: -16, root: [0, -3], stretch: 1.05, face: 'shout' }, { ease: 'out' }),
    F(15, { armR: [118, 16], armL: [-40, 26], torso: -8, head: -18, root: [0, -2], stretch: 1.03, face: 'shout' }),
  ] },
  spun: { loop: true, frames: [
    F(3, { armR: [80, 10], armL: [-80, 10], weapon: 90, legR: [30, 30], legL: [-6, 4], torso: -6, head: -8, root: [0, -4], face: 'dazed' }),
    F(3, { armR: [96, 6], armL: [-96, 6], weapon: 90, legR: [-6, 4], legL: [30, 30], torso: 4, head: -2, root: [0, -2], face: 'dazed' }),
  ] },
  shakeFist: { loop: true, frames: [
    F(5, { armR: [114, 14], armL: [-20, 10], weapon: 60, torso: -6, head: -16, root: [0, 0], face: 'angry' }),
    F(5, { armR: [124, 22], armL: [-22, 10], weapon: 40, torso: -8, head: -18, root: [0, -1], face: 'angry' }),
  ] },
  bonked: { loop: false, frames: [
    F(3, { armR: [50, 40], armL: [-40, 20], weapon: 90, legR: [16, 20], legL: [-12, 20], torso: 12, head: 20, root: [0, 4], squash: 1.14, face: 'dazed' }, { ease: 'out' }),
    F(9, { ...BASKET, armL: [-24, 10], torso: 4, head: 6, root: [0, 1], face: 'dazed' }, { ease: 'inout' }),
  ] },
  dazed: { loop: true, frames: [
    F(10, { ...BASKET, torso: 4, head: 8, root: [-1, 0, -5], face: 'dazed' }, { ease: 'inout' }),
    F(10, { ...BASKET, armL: [-14, 10], torso: 4, head: 6, root: [1, 0, 5], face: 'dazed' }, { ease: 'inout' }),
  ] },
  shakeOff: { loop: false, frames: [
    F(3, { ...BASKET, head: -8, root: [0, -1, -7], face: 'closed' }),
    F(3, { ...BASKET, head: 8, root: [0, -1, 7], face: 'closed' }),
    F(4, { ...BASKET, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  clamped: { loop: false, frames: [
    F(2, { armR: [96, 4], armL: [-40, 20], weapon: 90, torso: -12, head: -8, root: [0, -3], stretch: 1.06, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [100, 0], armL: [-46, 24], weapon: 90, torso: -10, head: -6, root: [0, -2], stretch: 1.04, face: 'hurt' }),
  ] },
  pinchRun: { loop: true, frames: [
    F(4, { legR: [50, 20], legL: [-40, 55], armR: [100, 6], armL: [-110, 20], weapon: 90, torso: 14, head: -6, root: [0, -3], face: 'shout' }),
    F(4, { legR: [10, 40], legL: [-10, 10], armR: [108, 14], armL: [-70, 30], weapon: 90, torso: 14, head: -4, root: [0, 0], squash: 1.04, face: 'shout' }),
    F(4, { legR: [-40, 55], legL: [50, 20], armR: [100, 6], armL: [-110, 20], weapon: 90, torso: 14, head: -6, root: [0, -3], face: 'shout' }),
    F(4, { legR: [-10, 10], legL: [10, 40], armR: [108, 14], armL: [-70, 30], weapon: 90, torso: 14, head: -4, root: [0, 0], squash: 1.04, face: 'shout' }),
  ] },
  lookOut: { loop: true, frames: [
    F(12, { ...BASKET, armL: [-30, 16], torso: -6, head: -14, root: [0, -2], stretch: 1.05, face: 'shout' }, { ease: 'inout' }),
    F(12, { ...BASKET, armL: [-34, 18], torso: -7, head: -16, root: [0, -3], stretch: 1.06, face: 'shout' }, { ease: 'inout' }),
  ] },
  splooshed: { loop: false, frames: [
    F(4, { armR: [-70, -20], armL: [-90, -10], weapon: 90, legR: [70, 10], legL: [50, 20], torso: -30, head: -24, root: [-6, -6, -18], face: 'hurt' }, { ease: 'out' }),
    F(5, { ...SIT, legR: [86, 0], legL: [76, 4], torso: -14, head: -2, root: [-3, 10, -6], squash: 1.12, face: 'dazed' }, { ease: 'in' }),
    F(6, { ...SIT, torso: -6, head: 4, root: [-2, 9], face: 'dazed' }, { ease: 'out' }),
  ] },
  sitWet: { loop: true, frames: [
    F(16, { ...SIT, torso: -6, head: 6, root: [-2, 9], face: 'dazed' }),
    F(16, { ...SIT, armR: [46, 42], armL: [32, 40], torso: -4, head: 8, root: [-2, 10], face: 'hurt' }),
  ] },
  getUp: { loop: false, frames: [
    F(6, { armR: [50, 40], armL: [20, 30], weapon: 90, legR: [50, 70], legL: [40, 70], torso: 24, head: 6, root: [0, 6], face: 'closed' }, { ease: 'inout' }),
    F(6, { ...BASKET, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
});
