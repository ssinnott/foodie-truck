// Mini-game furniture shared by the orchard screen (docs/GDD.md section 5 common rules): the seats (one rig +
// AnimPlayer per party member, built in enter(), never in draw()), the name plates above the tallest head part, the
// paper clock, the wooden sign that drops in on ropes to end the round, and the basket wrapper that adds the seat's
// ribbon and the catch squash to content/critters/items.js ITEMS.basket without touching it.
//
// Everything simulated here (the clock, the sign's frame counter) is plain integers driven by update(); every
// Math.sin/atan2 lives in a draw helper. The basket's catch box is computed ONCE per seat in enter() from the rig's
// proportions with dsin/dcos, so the sim never reads joints back from a draw (headless peers step without drawing).
import { PLAYER_COLORS, UI, SIGNAL, VIEW_W } from '../constants.js';
import { critterRig } from '../content/critters/common.js';
import { getCritter } from '../content/critters/index.js';
import { ITEMS } from '../content/critters/items.js';
import { AnimPlayer } from './animation.js';
import { drawRig, jointScreen } from '../art/rig.js';
import { drawShadow } from '../art/fx.js';
import { LIGHT_X, LIGHT_Y } from '../art/shading.js';
import { dsin, dcos } from '../engine/trig.js';
import { drawText } from '../engine/text.js';
import { drawTicket, drawBar, drawSign, drawNamePlate } from './ui.js';

const R = Math.round;
const DEG = Math.PI / 180;
/** GDD section 5: a mini-game lasts 40 seconds. */
export const ROUND_FRAMES = 2400;
/** The end sign slams in over 6 frames and is held 60 (GDD section 5). */
export const SIGN_SLAM = 6, SIGN_HOLD = 60;
/**
 * Extra rows a critter's tallest head part reaches above its skull (ears, toque, sunhat), measured off the rigs: the
 * plate sits above whatever is tallest, so the plate row is ragged and that is fine (docs/ART_STYLE.md section 12).
 */
const CROWN = { barley: 6, sorrel: 20, chicory: 22, cress: 18 };
const SCRATCH = { x: 0, y: 0 };
/** Option objects the draw helpers mutate instead of allocating per frame. */
const COUNT_TEXT = { size: 1, color: UI.ink, shadow: false };
const CLOCK_OPTS = { title: '', rules: false }, BAR_OPTS = { color: SIGNAL.good }, SIGN_OPTS = { swing: 0, rope: 96, size: 3 };

/**
 * Basket with the seat's ribbon: the same willow basket every critter carries, plus a 6x4 bow in the apron colour on
 * its rim (the apron IS the slot colour, so the bow needs no extra field) and a squash about the rim while
 * `rig.basketSquash` is above 1 (the catch beat). Drawn in hand space like every item; `upright` is the same
 * counter-rotation items.js uses, so the bow sits on the rim whatever the arm is doing.
 */
export const RIBBON_BASKET = { attach: 'handR', length: 14, draw(ctx, rig) {
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  const k = rig.basketSquash || 1;
  if (k !== 1) { ctx.save(); ctx.rotate(a); ctx.translate(0, 8); ctx.scale(k, 1 / k); ctx.translate(0, -8); ctx.rotate(-a); }
  ITEMS.basket.draw(ctx, rig);
  if (k !== 1) ctx.restore();
  if (rig.override) return;
  ctx.save(); ctx.rotate(a);
  ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(3, 5, 8, 6);
  ctx.fillStyle = rig.col(rig.palette.primary); ctx.fillRect(4, 6, 6, 4);
  ctx.restore();
} };

/**
 * Root-space position of the near paw for a torso lean and arm angles (degrees), the same chain as
 * art/rig.js computeJoints but through the deterministic trig, so a catch box built from it is bit-identical on
 * every peer. y is down-positive with the feet at 0 (so the paw's y is negative).
 */
export function pawRoot(rig, torsoRot, upper, lower, out = SCRATCH) {
  const p = rig.p, hipY = rig.hipY;
  const c = dcos(torsoRot * DEG), s = dsin(torsoRot * DEG), shY = -(p.torsoH - 5);
  const sx = p.shoulderX * c - shY * s, sy = hipY + p.shoulderX * s + shY * c;
  const u = (torsoRot + upper) * DEG, l = (torsoRot + upper + lower) * DEG;
  const ex = sx + dsin(u) * p.upperArm, ey = sy + dcos(u) * p.upperArm;
  const wx = ex + dsin(l) * p.lowerArm, wy = ey + dcos(l) * p.lowerArm;
  out.x = wx + dsin(l) * p.handR * 0.6; out.y = wy + dcos(l) * p.handR * 0.6;
  return out;
}

/**
 * One seat per party member. `floorY(i)` gives the feet line for party index i. Each seat carries its own draw
 * options object so draw() mutates instead of allocating.
 */
export function makeSeats(game, floorY) {
  const party = game.run ? game.run.party : [{ slot: 0, critter: 'barley' }];
  const seats = [];
  for (let i = 0; i < party.length; i++) {
    const p = party[i], def = getCritter(p.critter), rig = critterRig(def, p.slot);
    rig.weapon = RIBBON_BASKET; rig.basketFill = 0; rig.basketSquash = 1;
    const player = new AnimPlayer(def.anims);
    seats.push({
      index: i, slot: p.slot, critter: def.id, name: def.name, rig, player, colour: PLAYER_COLORS[p.slot] || UI.paperDark,
      x: 0, y: floorY(i), facing: 1, moving: false, count: 0, bumpT: 0, catchT: 0, anim: '',
      crown: CROWN[def.id] != null ? CROWN[def.id] : 8,
      opts: { x: 0, y: 0, facing: 1, scale: 1 },
    });
  }
  return seats;
}

/** Play `name` on a seat unless it is already playing (so loops keep their phase). */
export function seatAnim(seat, name, restart = false) {
  if (seat.anim !== name || restart) { seat.anim = name; seat.player.play(name, { restart, fallback: 'idle' }); }
}

/** The ground-contact ellipse every sprite draws before the sorted pass. */
export function drawSeatShadow(ctx, seat) { drawShadow(ctx, seat.x, seat.y, seat.rig.width + 6, 0.4, 0); }

/** Draw one seat's critter at its feet position with its held basket state. */
export function drawSeat(ctx, seat, fill) {
  const rig = seat.rig, o = seat.opts;
  rig.basketFill = fill; rig.basketSquash = seat.catchT > 0 ? 1.15 : 1;
  o.x = seat.x; o.y = seat.y; o.facing = seat.facing;
  drawRig(ctx, rig, seat.player.pose, o);
}

/** Name plate above the tallest head part, read from the joints of the last draw of that seat. */
export function drawSeatPlate(ctx, seat) {
  const j = jointScreen(seat.rig, 'head', SCRATCH);
  const top = j.y - seat.rig.p.headR * seat.rig.scale - seat.crown;
  drawNamePlate(ctx, seat.slot, seat.name, R(j.x), R(top) - 14);
}

/** The round's clock and ending, plain data: frames left, the phase (0 play, 1 sign), and the sign's frame counter. */
export function makeClock() { return { timer: ROUND_FRAMES, phase: 0, signT: 0, signText: '' }; }

/** Tick the clock; returns true on the frame the timer runs out (the caller ends the round). */
export function tickClock(clock) {
  if (clock.phase !== 0) { clock.signT++; return false; }
  if (clock.timer > 0) clock.timer--;
  return clock.timer === 0;
}
/** Start the sign-drop ending with the words on the board (one string, built once). */
export function endRound(clock, text) { clock.phase = 1; clock.signT = 0; clock.signText = text; }
/** True once the sign has slammed in and been held its 60 frames. */
export function roundOver(clock) { return clock.phase === 1 && clock.signT >= SIGN_SLAM + SIGN_HOLD; }

/**
 * The paper clock: a small perforated ticket at the top centre with the ingredient icon, the party's `countStr`
 * ("3/4", built by the screen when it changes) and a bar draining as the 40 seconds go.
 */
export function drawClock(ctx, clock, countStr, drawIcon, title) {
  const w = 132, h = 40, x = R(VIEW_W / 2 - w / 2), y = 6;
  CLOCK_OPTS.title = title;
  const top = drawTicket(ctx, x, y, w, h, CLOCK_OPTS);
  if (drawIcon) drawIcon(ctx, x + 14, top + 9);
  drawText(ctx, countStr, x + 26, top + 5, COUNT_TEXT);
  drawBar(ctx, x + 62, top + 7, 62, 6, clock.timer / ROUND_FRAMES, BAR_OPTS);
}

/**
 * The wooden end sign: drops from above the frame over SIGN_SLAM frames with a 2-frame overshoot, then hangs with a
 * slow swing. `frame` is any counter for the swing (draw-only sin).
 */
export function drawEndSign(ctx, clock, frame) {
  if (clock.phase !== 1) return;
  const t = clock.signT, restY = 96;
  let y;
  if (t < SIGN_SLAM) y = -110 + (restY + 110) * (t / SIGN_SLAM) + 6 * (t / SIGN_SLAM);
  else if (t < SIGN_SLAM + 4) y = restY + 6 - 6 * ((t - SIGN_SLAM) / 4);
  else y = restY;
  SIGN_OPTS.swing = t >= SIGN_SLAM ? Math.sin(frame * 0.04) * 0.02 : 0;
  drawSign(ctx, VIEW_W / 2, R(y) - SIGN_OPTS.rope, 220, 52, clock.signText, SIGN_OPTS);
}
