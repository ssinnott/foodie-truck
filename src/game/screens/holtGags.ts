// HAZEL HOLT'S TWO JOKES - the squirrel and the avalanche (docs/GDD.md section 5): the deal, the beats with their
// cards and sounds, and the drawing of what a beat puts on a seat (art/holtGags.ts draws the pieces). Out of
// holt.ts so the screen keeps the rules of the shake and stays one file's length.
//
// Both jokes are DEALT to a tree's crop the moment it fills - when the truck pulls up, and every time a bare tree
// comes back - one deal per crop, so one shake can never bring both, and each is drawn on its tree before anyone
// touches it:
//   HEAVY     one crop in AVALANCHE_ODDS.
//             TELL     the branches sag low under a second crop, clusters of nuts dangle under the leaves, and the
//                      tree creaks now and then (and under the shake).
//             WIND-UP  the last WINDUP frames of its bar: the tree groans, louder each time, and the shaker leans
//                      back off the trunk to stare up at it ('!'). Letting go here is the dodge - the bar keeps.
//             BANG     at the top the whole crop lets go at once: AV_FALL frames of nuts in the air, then CRASH!,
//                      the world bumps, and the shaker is gone under a heap of nuts.
//             LOOK     only its ears poke out of the heap (AV_BURIED); then it pops up out of it dazed, the stars
//                      going round and one nut balanced on its head (AV_DAZED), and shakes it off (AV_OFF). Barley
//                      eats the evidence instead: he flips the nut up off his head into his mouth, MMM!
//   SQUIRREL  one of the other crops in SQUIRREL_ODDS.
//             TELL     a bushy tail hangs out of the leaves, flicking now and then (and twitching under the shake).
//             WIND-UP  the squirrel comes down with the nuts onto the shaker's head ('!') and chatters at it
//                      furiously, stamping, for SQ_SCOLD frames.
//             BANG     it brings a nut down on the head: BONK!
//             LOOK     the critter stands seeing stars while the squirrel sits a beat with its nut and then leaps
//                      off the head with a flick of its tail and bounds away along the lane with the nut, off the
//                      edge of the grove; then the critter shakes it off.
// Neither costs anything: under each is an ordinary shower, 1..3 nuts falling into the shaker's basket, +1 each and
// never past the target, all through the beat. The avalanche's extra crop is cosmetic - it falls, heaps, and rolls
// away when the critter bursts out - and the squirrel's nut is its own.
//
// Determinism (docs/ARCHITECTURE.md section 0): the deal is the rng singleton, called from enter() and update()
// only; a beat is one integer countdown on its seat (`avalancheT`, `squirrelT`), both in the screen's checksum, and
// every card, sound, particle, rolling nut and fleeing squirrel is spawned on a frame of that countdown. The rolling
// nuts and the fleeing squirrels are cosmetic pools on fixed tables (no rng), stepped from update() like the
// particles and never read back.
import { VIEW_W, UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { ringAt, burstCrumbs, burstDust, drawShadow } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { HOLT, TREE_X } from '../../art/backgrounds/holt.ts';
import { TREE_Y, TRUNK_H, SAG } from '../../art/holtProps.ts';
import { drawSquirrel, drawSquirrelTail, drawNutHeap, drawFallingCrop, drawTurnedNut, SQUIRREL_POSE } from '../../art/holtGags.ts';
import { gagBurst, gagBubble, gagBump, overHead, drawDizzy } from '../gags.ts';
import { seatAnim } from '../minigame.ts';
import type { HoltScreen, HoltSeat, Tree } from './holt.ts';

const R = Math.round;

/** What a crop was dealt as it filled: nothing, the HEAVY one (the avalanche), or the SQUIRREL's. */
export const PLAIN = 0, HEAVY = 1, SQUIRREL = 2;
/**
 * The deal: one crop in AVALANCHE_ODDS comes in heavy, and one of the others in SQUIRREL_ODDS has the squirrel in
 * it - three crops in ten carry a joke. A round is only a handful of shakes (a shower is two nuts on average, so
 * an order of six is about three), and three in ten is what makes a round of three show one about two times in
 * three without the grove being a joke every other tree; the squirrel was one shake in six of every tree before
 * the avalanche joined it.
 */
const AVALANCHE_ODDS = 5, SQUIRREL_ODDS = 8;

/** The avalanche's wind-up: the last WINDUP frames of a heavy tree's bar; it groans every GROAN_EVERY of them. */
const WINDUP = 30;
const GROAN_EVERY = 10;
/**
 * A heavy tree creaks every CREAK_EVERY frames while it stands full and untouched (phased by CREAK_PHASE per tree,
 * so two heavy trees never creak as one), its canopy dipping CREAK_SAG rows for CREAK_DIP frames with it and a
 * couple of leaves shaken loose; and every CREAK_HELD frames of a shake before the wind-up.
 */
const CREAK_EVERY = 150, CREAK_PHASE = 47, CREAK_DIP = 8, CREAK_SAG = 2, CREAK_HELD = 24;
/** The wind-up pulls an overloaded canopy down by up to WIND_SAG rows more as the bar climbs. */
const WIND_SAG = 6;
/** The squirrel's tail flicks for TAIL_FLICK frames in every TAIL_EVERY (phased per tree), and twitches while held. */
const TAIL_EVERY = 96, TAIL_FLICK = 12;
/** Where the tail hangs out of each canopy layout: [dx, dy] about the crown, the root inside the leaves. */
const TAIL_AT = Int8Array.of(26, 20, 26, 16);

/**
 * The avalanche, as one countdown on the seat (`avalancheT`, AVALANCHE_FRAMES down to 0):
 *   AV_FALL    the crop in the air, the shaker staring up at it (`lookUp`);
 *   AV_BURIED  CRASH! and under the heap, only the ears out (`buried`);
 *   AV_DAZED   out of the heap with a jump (`popUp`), then swaying, stars going round, a nut on its head (`dizzy`);
 *   AV_OFF     the nut shaken off (`shakeOff`), or Barley's flip and chew (`flipNut`, `chomp`).
 */
const AV_FALL = 12, AV_BURIED = 44, AV_DAZED = 44, AV_OFF = 30;
const AVALANCHE_FRAMES = AV_FALL + AV_BURIED + AV_DAZED + AV_OFF;
/** The countdown values the avalanche's beats land on: the crash, and the pop out of the heap. */
const AV_LAND = AVALANCHE_FRAMES - AV_FALL, AV_POP = AV_DAZED + AV_OFF;
/** The pop's jump (the `popUp` anim's length) before the dizzy sway. */
const POP_JUMP = 10;
/** Barley's flip: the dip before the nut leaves his head, then the frames it is in the air; it lands at AV_CHOMP. */
const FLIP_DIP = 4, FLIP_AIR = 8;
const AV_CHOMP = AV_OFF - FLIP_DIP - FLIP_AIR;
/** ...on an arc FLIP_UP rows over the straight line, into his mouth, which is (MOUTH_X, MOUTH_Y) head radii off the head joint with the head thrown back. */
const FLIP_UP = 14, MOUTH_X = 0.8, MOUTH_Y = 0.3;
/**
 * The heap: built up over HEAP_GROW frames from the landing, standing HEAP_FOOT rows under the feet (the crouched
 * critter's toes and basket hang that low), its half-width HEAP_W of its height and never under HEAP_W_MIN.
 */
const HEAP_GROW = 4, HEAP_FOOT = 4, HEAP_W = 0.75, HEAP_W_MIN = 32;
/** The buried crouch takes about HEAP_SINK rows off the critter's height, which is where the falling crop lands. */
const HEAP_SINK = 9;
/** The heap stops HEAP_DIP rows under the crown of the skull: the top of the head shows with whatever stands on it. */
const HEAP_DIP = 3;
/**
 * Rows over the crown of the skull that a balanced nut sits on: the top of Barley's wool, of a toque, of the frog's
 * boater - and between a hare's ears it is the skull itself (any critter not named).
 */
const NUT_SEAT: Readonly<Record<string, number>> = Object.freeze({ barley: 5, sorrel: 19, cress: 9, rowan: 17 });
/** The falling crop is drawn for CROP_FRAMES after it lets go: the last of it is in the heap by then. */
const CROP_FRAMES = 24;

/**
 * The squirrel, as one countdown on the seat (`squirrelT`, SQUIRREL_FRAMES down to 0):
 *   SQ_DROP   it tumbles out of the canopy onto the head, the critter staring up (`lookUp`);
 *   SQ_SCOLD  it lands ('!') and chatters, stamping (`squirrelHat`), the last RAISE frames with its nut held up;
 *   SQ_GLOAT  BONK! and it sits a beat on the head with the nut (`bonked`, then `dizzy`);
 *   SQ_LEAP   it leaps off the head with a flick of its tail and makes off (a cosmetic runner from here, so it can
 *             bound right off the screen whatever the seat is doing), the critter still seeing stars;
 *   SQ_STARS  the stars;
 *   SQ_OFF    and the critter shakes it off (`shakeOff`).
 * Everything over the head - the BONK! card above all - stands where the trunk is, so the squirrel's getaway goes
 * down and sideways along the lane, where it can be seen.
 */
const SQ_DROP = 10, SQ_SCOLD = 36, SQ_GLOAT = 8, SQ_LEAP = 16, SQ_STARS = 10, SQ_OFF = 12;
const SQUIRREL_FRAMES = SQ_DROP + SQ_SCOLD + SQ_GLOAT + SQ_LEAP + SQ_STARS + SQ_OFF;
/** The countdown values the squirrel's beats land on: on the head, the bonk, and off it. */
const SQ_LAND = SQUIRREL_FRAMES - SQ_DROP, SQ_BONK_AT = SQ_LAND - SQ_SCOLD, SQ_JUMP = SQ_BONK_AT - SQ_GLOAT;
/** It holds the nut up for RAISE frames before the bonk and brings it down over BONK_HIT; it chatters every CHATTER_EVERY until the raise. */
const RAISE = 8, BONK_HIT = 4, CHATTER_EVERY = 16;
/** The `bonked` anim's length, after which the critter sways. */
const BONK_DUCK = 11;

/** The plate climbs over what a joke puts on a head (rows): the squirrel, a balanced nut, the stars, Barley's flip. */
const SQUIRREL_TALL = 24, NUT_TALL = 9, STARS_TALL = 6, FLIP_TALL = 20;
/** A burst's centre sits BURST_UP rows over the bubble row, so the card clears the face. */
const BURST_UP = 16;
const NOTICE = '!', CRASH = 'CRASH!', BONK = 'BONK!', MMM = 'MMM!', BARLEY = 'barley';

/** Sounds and particles, built once. */
const CREAK_SOFT = { volume: 0.6 }, GROAN = { volume: 1 }, LETGO = { volume: 1.6, pitch: 0.7 }, TAIL_SWISH = { volume: 0.6, pitch: 1.3 };
const LET_GO_LEAVES = { speed: 2, up: 0.4, color: HOLT.leaf, color2: HOLT.leafDark, size: 3, life: 70, gravity: 0.06, screen: true };
const POP_LEAVES = { speed: 2.2, up: 1.4, color: HOLT.leaf, color2: HOLT.leafDark, size: 3, life: 50, gravity: 0.08, screen: true };
const CREAK_LEAVES = { speed: 0.6, up: 0, color: HOLT.leaf, color2: HOLT.leafDark, size: 3, life: 90, gravity: 0.03, screen: true };

/** Deal a crop that has just filled: what it is, from the rng singleton (enter() and update() only). */
export function dealCrop(t: Tree): void {
  t.gag = rng.int(1, AVALANCHE_ODDS) === 1 ? HEAVY : rng.int(1, SQUIRREL_ODDS) === 1 ? SQUIRREL : PLAIN;
}

/** Where tree `i`'s creak is in its cycle on frame `f`: 0 is the creak, under CREAK_DIP its canopy is dipped. */
function creakPhase(f: number, i: number): number { return (f + i * CREAK_PHASE) % CREAK_EVERY; }

/** A heavy tree standing full and untouched creaks now and then, and a leaf or two comes down: the tell, from update(). */
export function creakNowAndThen(sc: HoltScreen, i: number): void {
  if (creakPhase(sc.frame, i) !== 0) return;
  sc.game.audio.play('holt_creak', CREAK_SOFT);
  particles.burst('leaf', TREE_X[i], TREE_Y - TRUNK_H + 24, 2, CREAK_LEAVES);
}

/**
 * One held frame on a HEAVY tree, `left` frames of the bar still to go: a creak under the shake, then the wind-up -
 * the frame the bar crosses into the last WINDUP, the shaker leans back to stare up ('!'); a grab of a tree that is
 * already groaning stares up at once; and the groans come every GROAN_EVERY frames, louder as the top nears.
 */
export function heavyShake(sc: HoltScreen, s: HoltSeat, left: number): void {
  if (left <= 0) return;
  const audio = sc.game.audio;
  if (left > WINDUP) { if (left % CREAK_HELD === 0) audio.play('holt_creak'); return; }
  if (left === WINDUP) { seatAnim(s, 'shakeLook', true); gagBubble(s.x, overHead(s), NOTICE, s.colour); }
  else seatAnim(s, 'shakeLook');
  if ((WINDUP - left) % GROAN_EVERY === 0) { GROAN.volume = 0.7 + (0.8 * (WINDUP - left)) / WINDUP; audio.play('holt_groan', GROAN); }
}

/**
 * The shower has just started on `s` from tree `i`: whatever its crop was dealt comes down with it, and the deal
 * is spent. Returns true when a joke has the seat (the screen leaves its anim alone).
 */
export function startJoke(sc: HoltScreen, s: HoltSeat, t: Tree, i: number): boolean {
  const gag = t.gag;
  t.gag = PLAIN;
  if (gag === HEAVY) {
    // the whole crop lets go: the canopy throws its leaves, and the shaker has a moment to look up
    s.avalancheT = AVALANCHE_FRAMES; sc.avalanches++;
    seatAnim(s, 'lookUp', true);
    particles.burst('leaf', TREE_X[i], TREE_Y - TRUNK_H, 18, LET_GO_LEAVES);
    sc.game.audio.play('shake', LETGO);
    return true;
  }
  if (gag === SQUIRREL) {
    s.squirrelT = SQUIRREL_FRAMES; sc.squirrels++;
    seatAnim(s, 'lookUp', true);
    sc.game.audio.play('chitter');
    return true;
  }
  return false;
}

/** One frame of the avalanche on its seat: the crash, the pop out of the heap, the shake-off (or the flip), the chew. */
export function stepAvalanche(sc: HoltScreen, s: HoltSeat): void {
  const T = --s.avalancheT, audio = sc.game.audio;
  if (T === AV_LAND) {
    seatAnim(s, 'buried', true);
    gagBurst(s.x, overHead(s) - BURST_UP, CRASH, s.colour);
    gagBump(3);
    burstDust(s.x, s.y, 10, 2.4, true);
    ringAt(s.x, s.y - 24, 10, 52, UI.cream, 3, 16, false, true);
    audio.play('holt_avalanche');
  } else if (T === AV_POP) {
    // out of it with a jump, and the heap goes everywhere: its nuts roll away along the lane
    seatAnim(s, 'popUp', true);
    for (let j = 0; j < SCATTER.length; j += 4) spawnRoll(sc.rolls, s.x + SCATTER[j], s.y - SCATTER[j + 1], SCATTER[j + 2] / 10, SCATTER[j + 3] / 10, s.y + 1);
    particles.burst('leaf', s.x, s.y - 30, 8, POP_LEAVES);
    audio.play('holt_pop');
  } else if (T === AV_POP - POP_JUMP) seatAnim(s, 'dizzy', true);
  else if (T === AV_OFF) {
    if (s.critter === BARLEY) { seatAnim(s, 'flipNut', true); return; }   // he has other plans for that nut
    seatAnim(s, 'shakeOff', true);
    spawnRoll(sc.rolls, s.x, skullTop(s) - 3, -s.facing * 1.4, -3.4, s.y + 1);   // off the head, and away it rolls
  } else if (T === AV_CHOMP && s.critter === BARLEY) {
    // it landed in his mouth: a scored nut is never touched - this one was the avalanche's, so it is his
    seatAnim(s, 'chomp', true);
    burstCrumbs(s.x + s.facing * 10, skullTop(s) + 14, s.y, sc.hex, 6, true);
    gagBubble(s.x, overHead(s), MMM, s.colour);
    audio.play('nom');
  } else if (T === 0) seatAnim(s, 'carry', true);
}

/** One frame of the squirrel on its seat: the landing, the chatter, the bonk, the leap, the shake-off. */
export function stepSquirrel(sc: HoltScreen, s: HoltSeat): void {
  const T = --s.squirrelT, audio = sc.game.audio;
  if (T === SQ_LAND) { seatAnim(s, 'squirrelHat', true); gagBubble(s.x, overHead(s) - SQUIRREL_TALL, NOTICE, s.colour); }
  else if (T > SQ_BONK_AT + RAISE && T < SQ_LAND && (SQ_LAND - T) % CHATTER_EVERY === 2) audio.play('holt_chatter');
  else if (T === SQ_BONK_AT) {
    seatAnim(s, 'bonked', true);
    gagBurst(s.x, overHead(s) - SQUIRREL_TALL - BURST_UP, BONK, s.colour);
    audio.play('holt_bonk');
  } else if (T === SQ_BONK_AT - BONK_DUCK) seatAnim(s, 'dizzy', true);
  else if (T === SQ_JUMP) {
    // off the head with a flick of its tail, and away along the lane to the nearer edge of the grove
    spawnRun(sc.runs, s.x, skullTop(s) + 1, s.x < VIEW_W / 2 ? -1 : 1, s.y + 1);
    audio.play('swish', TAIL_SWISH);
  } else if (T === SQ_OFF) seatAnim(s, 'shakeOff', true);
  else if (T === 0) seatAnim(s, 'carry', true);
}

/**
 * True while any seat is in a joke. The shake that completes the order brings a shower like any other, so its joke
 * starts on the round's last frames: the screen holds the end sign until the beat has played out (at most
 * AVALANCHE_FRAMES), or the last shake's avalanche would vanish in mid-air under the sign.
 */
export function jokeOn(seats: HoltSeat[]): boolean {
  for (let i = 0; i < seats.length; i++) if (seats[i].squirrelT > 0 || seats[i].avalancheT > 0) return true;
  return false;
}

/** The round ended mid-joke: every beat is dropped where it stands (the screen sets the cheer). */
export function endJokes(s: HoltSeat): void { s.squirrelT = 0; s.avalancheT = 0; }

/** The skull's crown, standing, from the rig's own proportions: safe in update() (the draw reads the joint instead). */
function skullTop(s: HoltSeat): number { return s.y - R(s.rig.height * s.rig.scale); }

/** The tree nearest x: the one a seat in a beat shook (it stands within reach of it, and the trees are 160 apart). */
function nearestTree(x: number): number {
  let best = 0;
  for (let i = 1; i < TREE_X.length; i++) if (Math.abs(TREE_X[i] - x) < Math.abs(TREE_X[best] - x)) best = i;
  return best;
}

// ---------------------------------------------------------------- the rolling nuts and the fleeing squirrels (cosmetic)

/** A nut rolling away along the litter: the heap's when it bursts, the one shaken off a head. A slot is free at t >= ROLL_LIFE. */
export interface NutRoll { t: number; x: number; y: number; vx: number; vy: number; floor: number; rot: number; }
const MAX_ROLLS = 16;
/** Frames a nut rolls, the last ROLL_SHRINK of them stepping its size down (nothing in the grove fades); its fall, its bounce and its rolling friction. */
const ROLL_LIFE = 54, ROLL_SHRINK = 12, ROLL_G = 0.35, ROLL_BOUNCE = 0.35, ROLL_DRAG = 0.94;
/** The heap bursting: [dx, rows up, vx * 10, vy * 10] per nut, outward from where it lay on the heap. */
const SCATTER = Int8Array.of(-26, 6, -28, -22, -16, 18, -22, -34, -8, 30, -12, -42, 0, 40, 6, -46, 8, 28, 14, -40, 18, 16, 24, -30, 26, 6, 30, -20, -20, 10, -16, -26, 14, 10, 18, -24);

export function makeRolls(): NutRoll[] {
  const out: NutRoll[] = [];
  for (let i = 0; i < MAX_ROLLS; i++) out.push({ t: ROLL_LIFE, x: 0, y: 0, vx: 0, vy: 0, floor: 0, rot: 0 });
  return out;
}

/** Start a nut rolling: the first free slot, or the one nearest its end. */
function spawnRoll(rolls: NutRoll[], x: number, y: number, vx: number, vy: number, floor: number): void {
  let k = 0;
  for (let i = 0; i < rolls.length; i++) { if (rolls[i].t >= ROLL_LIFE) { k = i; break; } if (rolls[i].t > rolls[k].t) k = i; }
  const r = rolls[k];
  r.t = 0; r.x = x; r.y = y; r.vx = vx; r.vy = vy; r.floor = floor; r.rot = 0;
}

/** Step every rolling nut: falling, bouncing low on its lane's row, rolling to a stop. */
export function stepRolls(rolls: NutRoll[]): void {
  for (let i = 0; i < rolls.length; i++) {
    const r = rolls[i];
    if (r.t >= ROLL_LIFE) continue;
    r.t++; r.vy += ROLL_G; r.x += r.vx; r.y += r.vy; r.rot += r.vx * 0.3;
    if (r.y >= r.floor) { r.y = r.floor; r.vy = r.vy > 1 ? -r.vy * ROLL_BOUNCE : 0; r.vx *= ROLL_DRAG; }
  }
}

export function drawRolls(ctx: CanvasRenderingContext2D, rolls: NutRoll[], icon: string, hex: string): void {
  for (let i = 0; i < rolls.length; i++) {
    const r = rolls[i];
    if (r.t >= ROLL_LIFE) continue;
    const left = ROLL_LIFE - r.t, s = left > ROLL_SHRINK ? 4 : left > ROLL_SHRINK / 2 ? 3 : 2;
    drawTurnedNut(ctx, r.x, r.y - s, r.rot, s, icon, hex);
  }
}

/**
 * The squirrel making off after its bonk: a hop down off the head onto the litter beside it (RUN_HOP frames, an
 * arc HOP_UP rows high and HOP_DX across), then bounding along the lane at RUN_SPEED px/frame with the nut in its
 * mouth until it is off the edge of the screen. `dir` is the way it runs; free when `on` is false. Cosmetic, like the
 * particles: the Math.sin of its arc never reaches the sim.
 */
export interface SquirrelRun { on: boolean; t: number; x0: number; y0: number; x: number; y: number; dir: number; floor: number; }
const MAX_RUNS = 4;
const RUN_HOP = 12, HOP_UP = 16, HOP_DX = 30, RUN_SPEED = 4.5, RUN_OFF = 30;

export function makeRuns(): SquirrelRun[] {
  const out: SquirrelRun[] = [];
  for (let i = 0; i < MAX_RUNS; i++) out.push({ on: false, t: 0, x0: 0, y0: 0, x: 0, y: 0, dir: 1, floor: 0 });
  return out;
}

function spawnRun(runs: SquirrelRun[], x: number, y: number, dir: number, floor: number): void {
  let k = 0;
  for (let i = 0; i < runs.length; i++) if (!runs[i].on) { k = i; break; }
  const r = runs[k];
  r.on = true; r.t = 0; r.x0 = x; r.y0 = y; r.x = x; r.y = y; r.dir = dir; r.floor = floor;
}

/** Step every fleeing squirrel: the hop down, then the bound along the lane, gone off the edge. */
export function stepRuns(runs: SquirrelRun[]): void {
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!r.on) continue;
    if (++r.t <= RUN_HOP) {
      const e = r.t / RUN_HOP;
      r.x = r.x0 + r.dir * HOP_DX * e; r.y = r.y0 + (r.floor - r.y0) * e - Math.sin(e * Math.PI) * HOP_UP;
    } else { r.x += r.dir * RUN_SPEED; r.y = r.floor; }
    if (r.x < -RUN_OFF || r.x > VIEW_W + RUN_OFF) r.on = false;
  }
}

/** The fleeing squirrels: stretched out in the leap, then bounding - the stride lifts it two rows every other four frames. */
export function drawRuns(ctx: CanvasRenderingContext2D, runs: SquirrelRun[], icon: string, hex: string): void {
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!r.on) continue;
    const bound = r.t > RUN_HOP && ((r.t >> 2) & 1) ? 2 : 0;
    drawSquirrel(ctx, r.x, r.y - bound, r.dir, SQUIRREL_POSE.leap, r.t, true, icon, hex);
  }
}

// ---------------------------------------------------------------- drawing what a joke puts on the grove

const HEAD: Point = { x: 0, y: 0 };

/**
 * A heavy tree's droop this frame (0 for any other): SAG at rest, CREAK_SAG more while it creaks, and up to
 * WIND_SAG more as the wind-up pulls on it - read off the bar, which a tree keeps between holds, so `left` is
 * SHAKE_HOLD minus its shake.
 */
export function heavySag(t: Tree, i: number, f: number, left: number): number {
  if (t.gag !== HEAVY) return 0;
  const pull = left < WINDUP ? R((WIND_SAG * (WINDUP - left)) / WINDUP) : 0;
  return SAG + pull + (!t.held && creakPhase(f, i) < CREAK_DIP ? CREAK_SAG : 0);
}

/** The squirrel's tail hanging out of a SQUIRREL tree's leaves (before the tree, so the canopy covers its root). */
export function drawTailTell(ctx: CanvasRenderingContext2D, t: Tree, i: number, cx: number, cy: number, f: number): void {
  if (t.gag !== SQUIRREL) return;
  const k = (i & 1) * 2, ph = (f + i * 31) % TAIL_EVERY;
  const flick = t.held ? (f >> 2) & 1 : ph < TAIL_FLICK ? (ph >> 2) & 1 : 0;
  drawSquirrelTail(ctx, cx + TAIL_AT[k], cy + TAIL_AT[k + 1], flick);
}

/** The plate climbs over what is on a seat's head this frame (rows): the screen adds it to the crown for the plate. */
export function crownLift(s: HoltSeat): number {
  const S = s.squirrelT, A = s.avalancheT;
  if (S > 0) return S <= SQ_LAND && S > SQ_JUMP ? SQUIRREL_TALL : S <= SQ_BONK_AT && S > SQ_OFF ? STARS_TALL : 0;
  if (A <= 0) return 0;
  if (A <= AV_POP && A > AV_OFF) return NUT_TALL;
  return A <= AV_OFF && A > AV_CHOMP && s.critter === BARLEY ? FLIP_TALL : 0;
}

/**
 * What a beat puts on a seat, drawn straight after its rig (so the lanes in front still cover it): the heap over a
 * buried critter, the nut balanced on a dazed one (and Barley's flip of it), the squirrel tumbling down and on the
 * head, and the stars. Positions come off the rig's head joint from the draw that just ran.
 */
export function drawSeatJoke(ctx: CanvasRenderingContext2D, sc: HoltScreen, s: HoltSeat, f: number): void {
  if (s.avalancheT <= 0 && s.squirrelT <= 0) return;
  const rig = s.rig, r = rig.p.headR * rig.scale, h = jointScreen(rig, 'head', HEAD), top = h.y - r;
  if (s.avalancheT > 0) {
    const T = s.avalancheT, seat = top - (NUT_SEAT[s.critter] || 0);
    if (T <= AV_LAND && T > AV_POP) {
      // buried: the heap stands to just under the crown of the skull, so what is above that pokes out of it
      const foot = s.y + HEAP_FOOT, hTop = top + HEAP_DIP, w = Math.max(HEAP_W_MIN, R((foot - hTop) * HEAP_W));
      drawShadow(ctx, s.x, foot, 2 * w + 12, 0.4, 0);
      drawNutHeap(ctx, s.x, foot, hTop, w, Math.min(1, (AV_LAND - T + 1) / HEAP_GROW), sc.icon, sc.hex);
    } else if (T <= AV_POP && T > AV_OFF) {
      nutOnHead(ctx, sc, h.x, seat, f);
      if (T <= AV_POP - POP_JUMP) drawDizzy(ctx, R(h.x), R(top - 4), f);
    } else if (T <= AV_OFF && T > AV_CHOMP && s.critter === BARLEY) {
      const k = AV_OFF - T;
      if (k < FLIP_DIP) nutOnHead(ctx, sc, h.x, seat, f);
      else {
        const e = (k - FLIP_DIP) / FLIP_AIR, mx = h.x + s.facing * MOUTH_X * r, my = h.y + MOUTH_Y * r;
        drawFood(ctx, sc.icon, R(h.x + (mx - h.x) * e), R(seat - 3 + (my - seat + 3) * e - Math.sin(e * Math.PI) * FLIP_UP), 4, sc.hex);
      }
    }
    return;
  }
  const T = s.squirrelT;
  if (T > SQ_LAND) {
    // tumbling out of the canopy onto the head, faster as it falls
    const i = nearestTree(s.x), e = (SQUIRREL_FRAMES - T) / SQ_DROP, x0 = TREE_X[i] + 12, y0 = TREE_Y - TRUNK_H + 24;
    drawSquirrel(ctx, x0 + (h.x - x0) * e, y0 + (top - y0) * e * e, s.facing, SQUIRREL_POSE.tumble, f, false, sc.icon, sc.hex);
  } else if (T > SQ_JUMP) {
    const pose = T > SQ_BONK_AT + RAISE ? SQUIRREL_POSE.chatter : T > SQ_BONK_AT ? SQUIRREL_POSE.raise : T > SQ_BONK_AT - BONK_HIT ? SQUIRREL_POSE.bonk : SQUIRREL_POSE.sit;
    drawSquirrel(ctx, h.x, top + 1, s.facing, pose, f, true, sc.icon, sc.hex);
  }
  if (T <= SQ_BONK_AT && T > SQ_OFF) drawDizzy(ctx, R(h.x), R(top - 4), f);
}

/** A nut balanced on a head (`y` is what it sits on), rocking a pixel each way. */
function nutOnHead(ctx: CanvasRenderingContext2D, sc: HoltScreen, x: number, y: number, f: number): void {
  drawFood(ctx, sc.icon, R(x) + ((f >> 3) & 1 ? 1 : -1), R(y) - 3, 4, sc.hex);
}

/** The crops in the air, over every seat (the screen calls it after the sorted pass, with the shower's flights). */
export function drawFallingCrops(ctx: CanvasRenderingContext2D, sc: HoltScreen): void {
  for (let n = 0; n < sc.seats.length; n++) {
    const s = sc.seats[n], k = AVALANCHE_FRAMES - s.avalancheT;
    if (s.avalancheT <= 0 || k >= CROP_FRAMES) continue;
    const i = nearestTree(s.x);
    drawFallingCrop(ctx, TREE_X[i], TREE_Y - TRUNK_H, s.x, skullTop(s) + HEAP_SINK, k, sc.icon, sc.hex);
  }
}
