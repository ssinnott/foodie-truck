// THE FARM'S JOKES (docs/GDD.md section 5): the two things a top in Furrow Farm's bed can be besides a plain root,
// and everything that happens once one of them is out of the ground. game/screens/garden.ts deals them, grips them
// and tugs them like any other top; at the twelfth tug it hands the seat here (startGag), steps the beat here every
// frame (stepGag) and asks here what to draw. Each has the four beats every joke in this game has (game/gags.ts; the
// orchard's bomb apple is the pattern):
//
//   THE ROCKET ROOT - one top in DEAL_ODDS.
//     TELL     the top shivers over a heave of cracked soil (art/gardenGags.ts drawHeave). A sharp eye sees it
//              coming, and a child who has seen it once goes looking for the next one.
//     WIND-UP  every tug heaves the bed higher and opens the critter's eyes wider (gripWary); four tugs from the end
//              its mouth falls open and a '!' goes up (gripAlarm).
//     BANG     the twelfth fires it out of the ground like a cork - POP! - nose first, off the top of the screen.
//     LOOK     the trug goes down and the critter stares at the sky, a paw pointing after it: '?'. Nothing. A
//              whistle, falling. Then it comes down on the head - BONK!, the world thumps, stars go round - and
//              bounces into the trug: +1. The stars go, a shake of the head, and the seat is a player again.
//     BARLEY   catches it in his mouth instead (the game's oldest joke: the big hungry one eats the evidence): CHOMP!,
//              and the root goes into the trug with a bite out of it - still +1 - MMM!
//   THE WHOPPER - one top in DEAL_ODDS, and nothing above ground gives it away.
//     BANG     the root tears out with a huge pop and flings its puller backwards, head over heels...
//     LOOK     ...flat on its back with the giant root on top of it, legs kicking - WHOA!, a cloud of dust, the world
//              thumps - until it shoves the root off; the root rolls into the trug (+1) and it gets up.
//
// A joke costs a moment and never a point. Its root is counted when it LANDS in the trug, so the +1 on the ticket is
// the one the player just watched arrive; a round that ends while one is still on its way (another seat's pull hit
// the target) banks it anyway in endGags, before the sign is written, so a joke root is never lost. Counting it at the
// pull instead was the other way to bank it, and it would have dropped the sign on the POP whenever the joke's root
// was the round's last: counted on landing, that round ends on the landing, with the bang and the bonk played out
// and the sign coming down over the stars. One beat per seat at a time; one roll per top, so a top is never both.
//
// Determinism (docs/ARCHITECTURE.md section 0): the deal is ONE rng roll per planted top, made where the top is
// planted, inside update(); everything after it is a frame count on the seat (`gt` up, `t` down in garden.ts), so the
// joke plays identically on four machines. Every card, crumb, star and flying root is cosmetic - drawn from those
// counts, out of the checksum, and none of it reads rng.
import { UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { burstCrumbs, burstDust, burstSparkle, floatText, ringAt } from '../../art/fx.ts';
import { jointScreen } from '../../lib/art/rig.ts';
import type { RigWeapon } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { seatAnim } from '../minigame.ts';
import { gagBurst, gagBubble, gagBump, gagHush, overHead, drawDizzy } from '../gags.ts';
import type { GagCard } from '../gags.ts';
import { CROP, GARDEN_TRUG, GAUGE_UNITS, TAG_H } from '../../art/gardenProps.ts';
import { ROWS } from '../../art/backgrounds/garden.ts';
import {
  ROCKET_S, GIANT_S, TRUG_H, POP_FRAMES, BONK_FRAMES, CHOMP_FRAMES, ROLL_FRAMES, SHAKE_FRAMES, FLIP_FRAMES,
  drawRootAt, drawStreak, drawHeave, heaveLift, drawTrugDown, drawBitten,
} from '../../art/gardenGags.ts';
import type { GardenScreen, GardenSeat, CropTop } from './garden.ts';

const R = Math.round, PI = Math.PI;

/**
 * The deal: ONE roll per planted top, rng.int(1, DEAL_ODDS) - WHOPPER_ROLL is the whopper, ROCKET_ROLL the rocket
 * root, anything else a plain root - so a top is at most one joke. One top in eight each and one in four a joke: a
 * round of four roots shows one about two times in three, a round of eight nine times in ten, and it is still nowhere
 * near every other pull. The whopper keeps the one in eight and the very roll it always had (a seed that grew a
 * whopper still grows it); the rocket takes the next face of the same die.
 */
export const DEAL_ODDS = 8, WHOPPER_ROLL = 1, ROCKET_ROLL = 2;
/** Which joke a seat's beat is playing (GardenSeat.gag). */
export const NO_GAG = 0, WHOPPER = 1, ROCKET = 2;
/** The same, by name, for summary(). */
export const GAG_NAMES = Object.freeze(['none', 'whopper', 'rocket']);
/** The big hungry one (content/critters/barley.ts): the one who eats the evidence. */
const BARLEY = 'barley';

/** What a seat carries for a joke, on top of garden.ts's pull state (GardenSeat extends it). */
export interface GagSeat {
  /** The joke this seat's PULL beat is playing: NO_GAG for a plain pull, or WHOPPER / ROCKET. */
  gag: number;
  /** Frames since the joke's root came out of the ground (0 on the twelfth tug): every beat of the joke keys off it. */
  gt: number;
  /** 1 while the joke's root is out of the ground and not yet in the trug: counted when it lands, banked by endGags if the round ends first. */
  owed: number;
  /** Where the joke's root came out (its top's x): the rocket goes straight up from here, the trug goes down by it. */
  jx: number;
  /** The joke's word card that is up now (game/gags.ts), so the next one can take it down (say). Cosmetic: never in the checksum. */
  card: GagCard | null;
}

/**
 * The rocket root's wind-up: the tug that opens the mouth and puts the '!' up - the eighth of twelve, so the alarm
 * has four tugs to sit over the gauge before the bang.
 */
const ALARM_PRESSES = 8;
/**
 * The rocket root's beat, in frames from the POP (the twelfth tug, `gt` 0):
 *   0           POP!: the root leaves the ground nose first and is off the top of the screen in UP_FRAMES; the
 *               critter is thrown back off its heels (rocketPop) and the trug goes down on the soil
 *   LOOK_AT     staring up at the sky, a paw pointing after it (lookUp)
 *   HUH_AT      '?' - in the POP!'s place, once that has been read
 *   WHISTLE_AT  the whistle starts to fall; it runs out on the bonk
 *   FALL_AT     the root comes back in at the top of the screen, nose down, onto the head (Barley opens wide: gape)
 *   BONK_AT     BONK! (bonked, then the stars and a sway from DIZZY_AT) - or Barley's CHOMP!
 *   LAND_AT     the bounce lands it in the trug: +1 (Barley's, bitten, leaves his mouth at HOP_AT; MMM! at MMM_AT)
 *   SHAKE_AT    forty frames of stars, then shakeOff
 *   ROCKET_FRAMES  the trug back in the paw, the stick live. Barley is done at CHOMP_DONE, when the chewing is.
 * About two and a quarter seconds, the bomb apple's length; Barley's is shorter by the stars he never sees.
 */
const UP_FRAMES = 14, LOOK_AT = POP_FRAMES, HUH_AT = 36, WHISTLE_AT = 30, FALL_AT = 54, BONK_AT = 70;
const DIZZY_AT = BONK_AT + BONK_FRAMES, LAND_AT = BONK_AT + 18, SHAKE_AT = BONK_AT + 40, ROCKET_FRAMES = SHAKE_AT + SHAKE_FRAMES;
const HOP_AT = BONK_AT + 9, MMM_AT = BONK_AT + 30, CHOMP_DONE = BONK_AT + CHOMP_FRAMES;
/**
 * The whopper's beat, in frames from the twelfth tug:
 *   0              the huge pop: the somersault (whopperFlip), the first FLING frames flinging it a pixel a frame
 *                  back along the row, the giant root arcing up over it
 *   FLIP_FRAMES    down on its back: WHOA!, dust, the world thumps; pinned, legs kicking, the root on its belly
 *   ROLL_AT        it shoves the root off (rollOff): the root rolls ROLL_PX along the soil for ROLLING frames...
 *   W_LAND_AT      ...and hops into the trug: +1
 *   WHOPPER_FRAMES on its feet, the stick live. A second and a half, fifty frames of it pinned.
 */
const FLING = 12, PINNED_FRAMES = 50, ROLL_AT = FLIP_FRAMES + PINNED_FRAMES, ROLLING = 10, W_LAND_AT = ROLL_AT + 16;
const WHOPPER_FRAMES = ROLL_AT + ROLL_FRAMES;

/** The words. Uppercase, short: a card's word is size 2, twelve pixels a letter (game/gags.ts). */
const POP = 'POP!', BONK = 'BONK!', CHOMP = 'CHOMP!', WHOA = 'WHOA!', ALARM = '!', HUH = '?', MMM = 'MMM!', PLUS_ONE = '+1';
/** A bang's card is centred this many rows over the row above the name plate (game/gags.ts overHead): over the plate, clear of the face. */
const CARD_LIFT = 16;
/** The bonk and the flump are the heaviest things that happen on the row: a two-row thump of the world. */
const BUMP_ROWS = 2;
/** Soil thrown up by a joke coming out (a plain pull throws eight crumbs). */
const BIG_CRUMBS = 22;
/**
 * The trug is put down on the soil for the whole of either joke - a paw is about to point at the sky, or the whole
 * critter is about to go head over heels, and a trug swinging round on a paw through a somersault was clutter - this
 * far past the hole the root came out of (where the pulled plant stood, so no leaf covers it). The joke's root ends in
 * it, and it goes back in the paw when the beat ends.
 */
const TRUG_DX = 8;
/** The grip leans the head this far back behind the feet: the '!' goes over the head, not over the plant. */
const LEAN = 16;
/** The rocket's climb (rows a frame, plus its acceleration) and how high it bounces back up off the head. */
const RISE_V = 8, RISE_A = 1.2, BOUNCE_LIFT = 60;
/** The giant root's arc up out of its hole and onto the belly, how far it rolls when shoved off, and its hop into the trug. */
const GIANT_ARC = 64, ROLL_PX = 22, HOP_LIFT = 30;
/** A tell's crumbs: two hop off the heave every TELL_EVERY frames (index-hashed, so two heaves never hop as one). */
const TELL_EVERY = 36, TELL_CRUMBS = 2;
/**
 * The shiver: alternate pixels for SHIVER_ON frames of every SHIVER_CYCLE - a shudder, then still, then again - and
 * through the shudder the plant is knocked up a row every other HOP_STEP frames, from below.
 */
const SHIVER_CYCLE = 40, SHIVER_ON = 18, HOP_STEP = 3;

/** Scratch joints, refilled from a seat's last drawRig: nothing in a draw allocates (ARCHITECTURE section 8). */
const HEAD: Point = { x: 0, y: 0 }, HIP: Point = { x: 0, y: 0 };

// ---------------------------------------------------------------- the deal and the wind-up (update)
/** Deal a freshly planted top its joke, or none (from update(), or enter() for the opening bed). */
export function dealTop(t: CropTop): void {
  const roll = rng.int(1, DEAL_ODDS);
  t.whopper = roll === WHOPPER_ROLL ? 1 : 0;
  t.rocket = roll === ROCKET_ROLL ? 1 : 0;
}

/** The grip pose for a top after `presses` tugs: the plain grip, or the rocket root's wary and then alarmed one. */
export function gripAnim(t: CropTop, presses: number): string { return !t.rocket ? 'grip' : presses >= ALARM_PRESSES ? 'gripAlarm' : 'gripWary'; }

/** One tug on a rocket root's top: the heave spits soil, and the ALARM_PRESSES-th puts the '!' up over the gauge. */
export function windUp(s: GardenSeat, t: CropTop, presses: number): void {
  burstCrumbs(t.x, ROWS.root - 6, ROWS.root + 2, CROP.soil, 3, true);
  // over the GAUGE, not the plate: the gauge is the one thing on the row a player is reading through a pull
  if (presses === ALARM_PRESSES) say(s, gagBubble(s.x - s.facing * LEAN, overHead(s) - TAG_H - 2, ALARM, s.colour));
}

/**
 * Put a joke's next word up over its seat, taking the last one down: a joke says one thing at a time. The cards
 * live their own lives in game/gags.ts (a burst is up for nearly a second), and the rocket root says four things
 * in two seconds - '!', POP!, '?', BONK! - so left to themselves they stacked into one unreadable heap of paper;
 * each now takes the one before it down, in the frame it pops in over the same spot. The pool is shared and reused
 * in turn, so the old card is only taken down while it is still this seat's (gagHush's owner check, the seat's
 * colour) and never when the pool has just handed its slot to the new word. `card` is cosmetic - it never reaches
 * the sim, the checksum or the rng.
 */
function say(s: GardenSeat, card: GagCard): void {
  if (s.card !== card) gagHush(s.card, s.colour);
  s.card = card;
}

/** Crumbs hopping off every heave that is still in the bed: the tell, in motion. Cosmetic. */
export function stepTells(sc: GardenScreen): void {
  for (let i = 0; i < sc.tops.length; i++) {
    const t = sc.tops[i];
    if (t.active && t.rocket && (sc.frame + i * 11) % TELL_EVERY === 0) burstCrumbs(t.x, ROWS.root - 4, ROWS.root + 2, CROP.soil, TELL_CRUMBS, true);
  }
}

// ---------------------------------------------------------------- the beats (update)
/** The top of a standing seat's head, from the rig's proportions (update() may call it; no draw has to have run). */
function headTop(s: GardenSeat): number { return R(s.y - s.rig.height * s.rig.scale); }
/** Where a joke's trug stands: by the hole, wherever the joke throws the seat. */
function trugX(s: GardenSeat): number { return R(s.jx + s.facing * TRUG_DX); }

/**
 * The twelfth tug on a joke top: the bang. garden.ts has already freed the top, opened the hole and put the seat in
 * its PULL state; this deals out the beat (`t`, which garden.ts counts down) and its first frame. Nothing is
 * counted yet: the root is OWED until it lands in the trug.
 */
export function startGag(sc: GardenScreen, s: GardenSeat, t: CropTop): void {
  s.gag = t.rocket ? ROCKET : WHOPPER; s.gt = 0; s.owed = 1; s.jx = t.x;
  s.rig.weapon = null;   // the trug goes down on the soil by the hole (TRUG_DX)
  burstCrumbs(t.x, ROWS.root - 2, ROWS.root + 6, CROP.soil, BIG_CRUMBS, true);
  ringAt(t.x, ROWS.root - 4, 4, 26, UI.cream, 2, 14, true, true);
  if (s.gag === ROCKET) {
    sc.rockets++;
    s.t = s.critter === BARLEY ? CHOMP_DONE : ROCKET_FRAMES;
    seatAnim(s, 'rocketPop', true);
    say(s, gagBurst(s.x, overHead(s) - CARD_LIFT, POP, s.colour));
    burstDust(t.x, ROWS.root - 2, 6, 2, true);
    sc.game.audio.play('garden_pop');
  } else {
    sc.whoppers++;
    s.t = WHOPPER_FRAMES;
    seatAnim(s, 'whopperFlip', true);
    sc.game.audio.play('garden_uproot');
  }
}

/** One frame of a joke beat (garden.ts counts `t` down and calls endGag when it runs out). */
export function stepGag(sc: GardenScreen, s: GardenSeat): void {
  const e = ++s.gt;
  if (s.gag === ROCKET) stepRocket(sc, s, e); else stepWhopper(sc, s, e);
}

function stepRocket(sc: GardenScreen, s: GardenSeat, e: number): void {
  const barley = s.critter === BARLEY;
  if (e === LOOK_AT) seatAnim(s, 'lookUp', true);
  else if (e === WHISTLE_AT) sc.game.audio.play('garden_whistle');
  else if (e === HUH_AT) say(s, gagBubble(s.x, overHead(s), HUH, s.colour));
  else if (e === FALL_AT) { if (barley) seatAnim(s, 'gape', true); }
  else if (e === BONK_AT) { if (barley) chomp(sc, s); else bonk(sc, s); }
  else if (e === DIZZY_AT) { if (!barley) seatAnim(s, 'dizzy', true); }
  else if (e === LAND_AT) land(sc, s, trugX(s), s.y - TRUG_H);
  else if (e === MMM_AT) { if (barley) say(s, gagBubble(s.x, overHead(s), MMM, s.colour)); }
  else if (e === SHAKE_AT) { if (!barley) seatAnim(s, 'shakeOff', true); }
}

/** It comes down on the head: the bang of the LOOK. */
function bonk(sc: GardenScreen, s: GardenSeat): void {
  const top = headTop(s);
  say(s, gagBurst(s.x, overHead(s) - CARD_LIFT, BONK, s.colour));
  gagBump(BUMP_ROWS);
  ringAt(s.x, top, 3, 18, UI.cream, 2, 12, false, true);
  burstSparkle(s.x, top, 5, UI.cream, true);
  seatAnim(s, 'bonked', true);
  sc.game.audio.play('garden_bonk');
}

/** Barley: it comes down into his mouth. */
function chomp(sc: GardenScreen, s: GardenSeat): void {
  say(s, gagBurst(s.x, overHead(s) - CARD_LIFT, CHOMP, s.colour));
  burstCrumbs(s.x + s.facing * 8, headTop(s) + 12, s.y, sc.hex, 8, true);
  seatAnim(s, 'chomp', true);
  sc.game.audio.play('nom');
}

function stepWhopper(sc: GardenScreen, s: GardenSeat, e: number): void {
  // flung back along the row through the throw (garden.ts keeps the seat inside the row's ends)
  if (e <= FLING) s.x -= s.facing;
  if (e === FLIP_FRAMES) flump(sc, s);
  else if (e === ROLL_AT) seatAnim(s, 'rollOff', true);
  else if (e === W_LAND_AT) land(sc, s, trugX(s), s.y - TRUG_H);
}

/** Down on its back with the whopper on top. */
function flump(sc: GardenScreen, s: GardenSeat): void {
  say(s, gagBurst(s.x, overHead(s) - CARD_LIFT, WHOA, s.colour));
  gagBump(BUMP_ROWS);
  burstDust(s.x - s.facing * 10, s.y, 12, 2.4, true);
  seatAnim(s, 'pinned', true);
  sc.game.audio.play('garden_flump');
}

/** The joke's root lands in the trug at (x, y): NOW it counts. */
function land(sc: GardenScreen, s: GardenSeat, x: number, y: number): void {
  if (!s.owed) return;
  s.owed = 0; s.count++; sc.setTotal(sc.total + 1);
  floatText(x, y - 18, PLUS_ONE, s.colour, 1, true);
  ringAt(x, y, 3, 13, UI.cream, 2, 12, true, true);
  burstSparkle(x, y - 4, 4, UI.cream, true);
  sc.game.audio.play('catch');
}

/** The beat is over (or the round is): the trug back in the paw, the seat a plain seat again. */
export function endGag(s: GardenSeat): void {
  if (s.gag !== NO_GAG) s.rig.weapon = GARDEN_TRUG as RigWeapon;   // `as`: garden.ts says why over its own
  s.gag = NO_GAG; s.gt = 0; s.owed = 0;
}

/**
 * The round is ending (garden.ts finish, before the sign is written): a joke root still on its way to a trug is
 * banked now - the seat's count, and the party's total, even when that takes the total one past the target (the
 * sign says what was pulled, and run.gather clamps the pantry to the order) - and every joke is cleared.
 */
export function endGags(sc: GardenScreen): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.owed) { s.owed = 0; s.count++; sc.setTotal(sc.total + 1); }
    endGag(s);
  }
}

// ---------------------------------------------------------------- drawing (draw only: no rng, no state written)
/** The shiver a rocket root's top stands in, this frame: a shudder, then still, then again. */
export function shiver(f: number, i: number): number { return (f + i * 29) % SHIVER_CYCLE < SHIVER_ON ? (f & 1 ? 1 : -1) : 0; }
/** ...and the knock from under it through the shudder: the rows the plant is lifted by this frame (0 or 1). */
export function shiverLift(f: number, i: number): number { return (f + i * 29) % SHIVER_CYCLE < SHIVER_ON && ((f / HOP_STEP) | 0) & 1 ? 1 : 0; }

/**
 * The tell under top `i`: the heave, grown with the gauge of whoever has hold of it. Returns how far the plant rides
 * up on it, for the screen to lift the plant by.
 */
export function drawTell(sc: GardenScreen, ctx: CanvasRenderingContext2D, t: CropTop, i: number): number {
  let k = 0;
  for (let j = 0; j < sc.seats.length; j++) { const s = sc.seats[j]; if (s.top === i) k = s.pull / GAUGE_UNITS; }
  drawHeave(ctx, t.x, ROWS.root, k);
  return heaveLift(k);
}

/**
 * What a joke draws ON its seat, straight after that seat's drawRig (so it reads the joints the rig was just drawn
 * with): the trug on the soil, the stars, the root in Barley's mouth; the whopper's giant root, wherever it is.
 */
export function drawGagSeat(sc: GardenScreen, ctx: CanvasRenderingContext2D, s: GardenSeat): void {
  const e = s.gt;
  drawTrugDown(ctx, trugX(s), s.y, s.count, sc.icon, sc.hex, s.colour);
  if (s.gag === WHOPPER) { drawGiant(sc, ctx, s, e); return; }
  const h = jointScreen(s.rig, 'head', HEAD), r = s.rig.p.headR * s.rig.scale;
  if (s.critter === BARLEY) {
    // CHOMP: clamped in his jaws, a bite already gone, until it hops out for the trug
    if (e >= BONK_AT && e < HOP_AT) drawBitten(ctx, sc.bitten, h.x + s.facing * r, h.y + R(r * 0.5));
  } else if (e >= BONK_AT && e < SHAKE_AT) drawDizzy(ctx, h.x, h.y - r - 4, sc.frame);
}

/**
 * The rocket root wherever it is in the air: drawn over everything in the world and over the word cards too (garden.ts
 * draw), so it leaves the ground in front of the leaves, bursts up through its own POP! and comes down through the
 * '?'. Falling, it aims at the head (or Barley's open mouth) as the rig was last drawn, so it lands where the head IS
 * whatever the pose did to it.
 */
export function drawGagRoots(sc: GardenScreen, ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.gag !== ROCKET) continue;
    const e = s.gt;
    if (e < UP_FRAMES) {
      // up: nose first out of the hole, faster every frame, a trail under it
      const v = RISE_V + RISE_A * 2 * e, y = ROWS.root - 12 - (RISE_V * e + RISE_A * e * e);
      drawStreak(ctx, s.jx, y + ROCKET_S + 2, Math.min(28, v * 1.4), -1);
      drawRootAt(ctx, s.jx, y, sc.icon, sc.hex, ROCKET_S, PI);
    } else if (e >= FALL_AT && e < BONK_AT) {
      // down: in at the top of the screen, gathering speed, onto the head (or into the mouth)
      const h = jointScreen(s.rig, 'head', HEAD), r = s.rig.p.headR * s.rig.scale, barley = s.critter === BARLEY;
      const tx = barley ? h.x + s.facing * r : h.x, ty = barley ? h.y + R(r * 0.5) - ROCKET_S : h.y - r - ROCKET_S;
      const k = (e - FALL_AT) / (BONK_AT - FALL_AT), y = -2 * ROCKET_S + (ty + 2 * ROCKET_S) * k * k;
      drawStreak(ctx, tx, y - ROCKET_S - 2, 8 + 30 * k, 1);
      drawRootAt(ctx, tx, y, sc.icon, sc.hex, ROCKET_S, Math.sin(e * 0.6) * 0.25);
    } else if (e >= BONK_AT && e < LAND_AT) {
      const barley = s.critter === BARLEY;
      if (barley && e < HOP_AT) continue;
      // off the head (or out of Barley's mouth, bitten) in a spinning arc into the trug
      const h = jointScreen(s.rig, 'head', HEAD), r = s.rig.p.headR * s.rig.scale;
      const x0 = barley ? h.x + s.facing * r : h.x, y0 = barley ? h.y + R(r * 0.5) : h.y - r - ROCKET_S;
      const from = barley ? HOP_AT : BONK_AT, k = (e - from) / (LAND_AT - from);
      const x1 = trugX(s), y1 = s.y - TRUG_H - 4;
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(PI * k) * BOUNCE_LIFT;
      if (barley) drawBitten(ctx, sc.bitten, x, y);
      else drawRootAt(ctx, x, y, sc.icon, sc.hex, ROCKET_S, k * PI * 3);
    }
  }
}

/**
 * The whopper's root, after the flung seat is drawn: out of its hole in an arc onto the belly of the tumbling
 * critter (aimed at the joints as they were just drawn, so it lands ON the belly however the somersault went),
 * balanced there while the legs kick, shoved off and rolled along the soil, and hopped into the trug - shrinking from
 * GIANT_S to a root the trug can hold as it goes.
 *
 * On the belly it STANDS, tip down on the tummy and its top in the air, leaning a little toward the legs, with the
 * paws up round it: the face on one side of it, the kicking legs on the other, and all three read at once. Laid
 * along the body it covered one or the other whichever way round it went - the leaves buried the face, or the body
 * of it buried the legs - and the critter under it was the joke.
 */
const STAND_TILT = 0.18, BELLY_AT = 0.25, BELLY_UP = 10;
function drawGiant(sc: GardenScreen, ctx: CanvasRenderingContext2D, s: GardenSeat, e: number): void {
  if (e >= W_LAND_AT) return;
  const hip = jointScreen(s.rig, 'torso', HIP), head = jointScreen(s.rig, 'head', HEAD);
  // the belly: nearer the hips than the head, its tip resting on top of the body
  const bx = hip.x + (head.x - hip.x) * BELLY_AT, by = Math.min(hip.y, head.y) - BELLY_UP - GIANT_S * 0.8;
  const lean = s.facing * STAND_TILT;
  if (e < FLIP_FRAMES) {
    // up out of the hole in a whole turn of its own, and down onto the belly
    const k = e / FLIP_FRAMES, x0 = s.jx, y0 = ROWS.root - GIANT_S;
    drawRootAt(ctx, x0 + (bx - x0) * k, y0 + (by - y0) * k - Math.sin(PI * k) * GIANT_ARC, sc.icon, sc.hex, GIANT_S, lean * k - s.facing * 2 * PI * k);
  } else if (e < ROLL_AT) {
    // balanced on the belly, rocked by every kick
    drawRootAt(ctx, bx, by + ((sc.frame >> 2) & 1), sc.icon, sc.hex, GIANT_S, lean + Math.sin(sc.frame * 0.3) * 0.08);
  } else if (e < ROLL_AT + ROLLING) {
    // shoved off: it topples forward and rolls along the soil toward the trug
    const k = (e - ROLL_AT) / ROLLING, gx = s.x + s.facing * ROLL_PX, gy = s.y - GIANT_S * 0.6;
    drawRootAt(ctx, bx + (gx - bx) * k, by + (gy - by) * k, sc.icon, sc.hex, GIANT_S, lean + s.facing * k * PI * 1.5);
  } else {
    const k = (e - ROLL_AT - ROLLING) / (W_LAND_AT - ROLL_AT - ROLLING);
    const x0 = s.x + s.facing * ROLL_PX, y0 = s.y - GIANT_S * 0.6, x1 = trugX(s), y1 = s.y - TRUG_H - 4;
    const size = GIANT_S + (ROCKET_S * 0.5 - GIANT_S) * k;
    drawRootAt(ctx, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - Math.sin(PI * k) * HOP_LIFT, sc.icon, sc.hex, size, lean + s.facing * PI * (1.5 + 0.5 * k));
  }
}
