// THE COOP'S TWO JOKES (docs/GDD.md section 5): what can happen to a seat that reaches for an egg, each built the
// orchard bomb's way - a TELL dealt onto the egg by the rng inside update(), a WIND-UP the seat stands in with the
// stick locked, the BANG, and a LOOK that stays on it afterwards - with game/gags.ts for the words. coop.ts owns the
// round and calls in here; this file owns the deal, the two beats, their poses, and the chick's life after its seat
// lets go of it.
//
//   THE SURPRISE CHICK  one egg in CHICK_ODDS, nest or floor, wobbles every so often and wears a zigzag crack.
//                       Plucked, it hops into the near paw (the basket set down) and is held up to the face: it
//                       wobbles harder, crack... crack... ('?'), then POP - the top of the shell flies off and a
//                       chick wearing the other half on its head pops up, CHEEP! It looks at its new mum, hops up
//                       onto her head, and the seat is a player again, HATCH_TOTAL frames after the pluck. The egg
//                       scores nothing: it hatched. From there the chick is cosmetic - it rides the head for
//                       RIDE_FRAMES, cheeps whenever its critter plucks another egg, then hops down and scurries off
//                       to trot after a hen for the rest of the round.
//   THE BROODY HEN      one nest egg in BROODY_ODDS of the rest is laid with a hen sat on it for BROODY_FRAMES, the
//                       egg peeking out from under her. A reach at it: she puffs up to twice her size and glares
//                       ('!' over the critter), then a flurry of pecks - OW! - feathers burst out of the box and
//                       drift down, and the critter hops round on one foot shaking its paw, PECK_TOTAL frames in all.
//                       She sits on, smug, for a moment and then flounces off the nest (one temper per hen), and the
//                       egg is there for the next reach.
//
// Determinism (docs/ARCHITECTURE.md section 0): the deal reads the rng singleton from updateEggs; the beats are
// countdowns on the seat (`hatchT`, `peckT`) and on the egg (`fury`), every one in checksumFields(). Everything else
// the eye gets - the cards, the feathers, the flying shell, the riding chick and the chicks trotting after the hens -
// is cosmetic: stepped from update(), never read back by the sim, no rng, out of the checksum.
import { UI, PLUM } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { ringAt, burstDust, burstCrumbs, drawShadow } from '../../art/fx.ts';
import { mix } from '../../art/palettes.ts';
import { jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F } from '../../content/critters/common.ts';
import { RIBBON_BASKET, seatAnim } from '../minigame.ts';
import { gagBurst, gagBubble, overHead } from '../gags.ts';
import { eggGlyph, crackedEgg, shellHalf, SHELL, EGG_S, SURPRISE_S } from '../../art/coopProps.ts';
import { drawHen, drawPuffedHen, drawChick, CHICK_H } from '../../art/hens.ts';
import type { CoopScreen, CoopSeat, Egg } from './coop.ts';

const R = Math.round;
/** The deal: one egg in CHICK_ODDS hatches (nest or floor); one NEST egg in BROODY_ODDS of the rest is sat on for BROODY_FRAMES. */
export const CHICK_ODDS = 6, BROODY_ODDS = 4, BROODY_FRAMES = 210;
/**
 * The hatch, one countdown on the seat (`hatchT`, HATCH_TOTAL down to 0):
 *   70..61  '?' - the egg hops from where it lay into the near paw (HATCH_IN), the basket set down
 *   60..27  held up in front of the face, wobbling harder and harder: a crack at CRACK_1, another at CRACK_2
 *   26      POP (POP_AT): the shell's top flies off, the chick pops up wearing the other half, CHEEP!
 *   26..13  it looks up at its new mum from the paw (HATCH_LOOK)
 *   12..1   it hops up onto her head (HATCH_UP); at 0 the basket is back and the seat is a player again
 * The '?' goes up on the pluck so it has had its 44 frames (game/gags.ts) by the pop: a bubble still shrinking under
 * the CHEEP! card showed round its edges while the burst popped in.
 */
const HATCH_IN = 10, HATCH_HOLD = 34, HATCH_LOOK = 14, HATCH_UP = 12;
export const HATCH_TOTAL = HATCH_IN + HATCH_HOLD + HATCH_LOOK + HATCH_UP;
const HOLD_AT = HATCH_TOTAL - HATCH_IN, POP_AT = HATCH_LOOK + HATCH_UP, UP_AT = HATCH_UP;
const CRACK_1 = HOLD_AT - 10, CRACK_2 = HOLD_AT - 24;
/**
 * The broody hen, one countdown on the seat (`peckT`, PECK_TOTAL down to 0) and one on her egg (`fury`, HEN_FURY
 * down to 0) started on the same frame:
 *   seat 90..76  GLARE: frozen mid-reach, '!', while the hen pops up to twice her size and glares down at it
 *   seat 75      the FLURRY (FLURRY_AT): OW!, feathers out of the box, the paw yanked back; the hen pecks on to 61
 *   seat 60..1   it hops round on one foot (a turn every HOP_TURN frames) shaking the paw; at 0 it can move again
 *   hen  40..26 puffed and glaring, 25..11 pecking, 10..1 going down again (DEFLATE), then sat on her egg, smug,
 *        for SMUG frames, and off the nest in a huff (her `broody` cut to HEN_FURY + SMUG on the reach) 20 frames
 *        before the critter can reach again
 */
const GLARE = 15, FLURRY = 15, HOP_ROUND = 60, HOP_TURN = 12, DEFLATE = 10;
export const PECK_TOTAL = GLARE + FLURRY + HOP_ROUND, HEN_FURY = GLARE + FLURRY + DEFLATE;
const FLURRY_AT = FLURRY + HOP_ROUND, HOP_AT = HOP_ROUND;
/** The hen's pop: she swells over PUFF_IN frames. And after her temper she sits on, smug, SMUG frames, then leaves the nest. */
const PUFF_IN = 3, SMUG = 30;
/** Feathers: a burst out of the box at the flurry, and FLURRY_PUFF more every FLURRY_EVERY frames while it lasts. */
const FEATHERS = 10, FLURRY_PUFF = 2, FLURRY_EVERY = 4;
/**
 * The feathers are her cream down, turning over as they fall (a leaf particle's two sides): burst out of the box, then
 * drifting down at a terminal 0.66 px/frame (gravity * drag / (1 - drag)), about a box's height a second, so they are
 * still coming down past the nest's shelf onto the floor while the critter hops round under them.
 */
const FEATHER = '#F1E4C8';
const FEATHER_OPTS = { speed: 2.6, up: 0.4, color: FEATHER, color2: mix(FEATHER, PLUM.shadow, 0.18), size: 5, gravity: 0.05, drag: 0.93, life: 150, screen: true };
/** The words: size-2 cards (game/gags.ts), the burst centred BURST_UP rows over the bubble's point so the face stays clear. */
const QUERY = '?', BANG = '!', CHEEP = 'CHEEP!', OW = 'OW!', BURST_UP = 16;
/** The surprise egg's tell: a WOBBLE_FRAMES rock every WOBBLE_EVERY frames (index-hashed), WOBBLE radians each way; held, it rocks every frame pair and harder. */
const WOBBLE_EVERY = 52, WOBBLE_FRAMES = 12, WOBBLE = 0.32, HELD_WOBBLE0 = 0.14, HELD_WOBBLE1 = 0.42;
/** The held egg sits in the paw: its base HELD_SINK rows over the paw joint, so the paw's lower half shows under it. */
const HELD_SINK = 1;
/** A surprise egg's centre sits this much higher than a laid egg's, so its bigger shell stands on the same row. */
const SURPRISE_LIFT = SURPRISE_S - EGG_S;
/** The egg peeking out from under a settled broody hen: this far forward of her (along her facing) and down. */
const PEEK_X = 6, PEEK_Y = 3;
/** The egg's hop into the paw, and the chick's onto the head: px of arc at the top. */
const HOP_ARC = 10, UP_ARC = 14;
/** The pop, in screen terms from the seat (update() has no rig joints to read): the held egg is about this far in front and up. */
const POP_DX = 14, POP_RISE = 0.66;

/**
 * The jokes' poses, merged into the coop's overlay table (coop.ts COOP_ANIMS):
 *   liftEgg   the near paw comes up empty (the basket is down) to meet the egg hopping into it
 *   holdEgg   the egg held out at arm's length in front of the face, the elbow nearly straight, so the shell stands
 *             clear of the muzzle (the orchard's holdBomb arm, [96, 30], put it on Barley's nose: ART_STYLE 0.7), the
 *             head tipped down to look at it, trembling with it every three frames
 *   hatched   POP: thrown back with the mouth open, then a smile down at the chick in the paw, then the head up to
 *             watch it hop onto the crown
 *   glared    the reach frozen, far paw still up at the nest, the head up at the hen: 'shout'
 *   yanked    the paw whipped back down and shaken, the near foot up, `hurt`
 *   hopRound  a hop on the far foot every HOP_TURN frames with the near foot tucked up and the far paw shaken out
 *             behind the head; the screen turns the seat round at every landing, so it hops in a circle
 * The basket stays upright on the near arm (`weapon: 90`) through the hen's beat, as in reachNest.
 */
export const GAG_ANIMS = Object.freeze({
  liftEgg: { loop: false, frames: [
    F(5, { armR: [80, 30], armL: [-16, 8], torso: 2, head: 6, root: [0, 0], face: 'neutral' }, { ease: 'out' }),
    F(5, { armR: [100, 8], armL: [-16, 8], torso: -2, head: 10, root: [0, 0], face: 'neutral' }),
  ] },
  holdEgg: { loop: true, frames: [
    F(3, { armR: [100, 8], armL: [-16, 8], torso: -2, head: 11, root: [0, 0], face: 'neutral' }),
    F(3, { armR: [103, 5], armL: [-14, 9], torso: -3, head: 13, root: [0, 0], face: 'neutral' }),
  ] },
  hatched: { loop: false, frames: [
    F(5, { armR: [104, 24], armL: [-34, 22], torso: -8, head: -4, root: [0, -2], squash: 0.97, face: 'shout' }, { ease: 'out' }),
    F(9, { armR: [100, 26], armL: [-20, 12], torso: -4, head: 8, root: [0, 0], face: 'happy' }),
    F(12, { armR: [84, 40], armL: [-18, 8], torso: -4, head: -12, root: [0, 0], face: 'happy' }),
  ] },
  glared: { loop: false, frames: [
    F(4, { armL: [-158, -14], armR: [56, 44], weapon: 90, torso: -6, head: -14, root: [0, -2], stretch: 1.04, face: 'neutral' }),
    F(11, { armL: [-156, -12], armR: [56, 44], weapon: 90, torso: -4, head: -16, root: [0, -1], stretch: 1.02, face: 'shout' }),
  ] },
  yanked: { loop: false, frames: [
    F(3, { armL: [-40, -70], armR: [56, 44], weapon: 90, legR: [30, -40], torso: 12, head: 10, root: [-3, -5], squash: 0.94, face: 'hurt' }, { ease: 'out' }),
    F(4, { armL: [-70, -40], armR: [56, 44], weapon: 90, legR: [40, -60], torso: 8, head: 6, root: [-2, -1], squash: 1.04, face: 'hurt' }),
    F(4, { armL: [-40, -70], armR: [56, 44], weapon: 90, legR: [40, -60], torso: 10, head: 8, root: [-1, -4], squash: 0.96, face: 'hurt' }),
    F(4, { armL: [-70, -40], armR: [56, 44], weapon: 90, legR: [40, -60], torso: 8, head: 6, root: [0, 0], squash: 1.04, face: 'hurt' }),
  ] },
  hopRound: { loop: true, frames: [
    F(3, { armL: [-120, -40], armR: [56, 44], weapon: 90, legR: [40, -70], legL: [6, 4], torso: 6, head: 4, root: [0, 1], squash: 1.06, face: 'hurt' }, { ease: 'in' }),
    F(5, { armL: [-96, -64], armR: [56, 44], weapon: 90, legR: [50, -80], legL: [-4, 10], torso: 2, head: 0, root: [0, -7], stretch: 1.04, face: 'hurt' }, { ease: 'out' }),
    F(4, { armL: [-120, -40], armR: [56, 44], weapon: 90, legR: [40, -70], legL: [6, 4], torso: 6, head: 4, root: [0, 0], squash: 1.04, face: 'hurt' }),
  ] },
});

// ---------------------------------------------------------------- the deal

/** Deal the jokes onto a freshly laid egg: the chick first, then - a nest egg that is not one - the hen. Sim: rng, in update(). */
export function dealEgg(e: Egg): void {
  e.chick = rng.int(1, CHICK_ODDS) === 1 ? 1 : 0;
  e.broody = e.nest >= 0 && e.chick === 0 && rng.int(1, BROODY_ODDS) === 1 ? BROODY_FRAMES : 0;
  e.fury = 0;
}

// ---------------------------------------------------------------- the surprise chick (sim)

/** A surprise egg plucked: off the nest or the floor and into the near paw, the basket down, the stick locked. No +1. */
export function startHatch(sc: CoopScreen, s: CoopSeat, e: Egg): void {
  e.active = false;
  if (e.nest >= 0) { sc.nestFull[e.nest] = 0; burstDust(e.x, e.y + 4, 3, 1, true); }
  s.hatchT = HATCH_TOTAL; s.moving = false;
  s.facing = e.x >= s.x ? 1 : -1;
  s.eggX = e.x; s.eggY = e.y;
  s.rig.weapon = null;
  seatAnim(s, 'liftEgg', true);
  gagBubble(s.x, overHead(s), QUERY, s.colour);
}

/** One frame of the hatch: the hold and its two cracks, the pop on the one frame it lands, the hop up, the let-go. */
export function stepHatch(sc: CoopScreen, s: CoopSeat): void {
  const t = --s.hatchT;
  if (t === HOLD_AT) seatAnim(s, 'holdEgg', true);
  else if (t === CRACK_1 || t === CRACK_2) {
    burstCrumbs(s.x + s.facing * POP_DX, popY(s), s.y, SHELL, 2, true);
    sc.game.audio.play('coop_crack');
  } else if (t === POP_AT) pop(sc, s);
  else if (t === UP_AT) lift(s);
  else if (t === 0) { s.rig.weapon = RIBBON_BASKET; seatAnim(s, 'carry', true); ride(sc, s); }
}

/** The row the held egg is at, from the seat alone: the shell bits and the ring are aimed at it from update(). */
function popY(s: CoopSeat): number { return s.y - R(s.rig.height * s.rig.scale * POP_RISE); }

/** POP: the top of the shell flies off backwards, a ring and a spit of shell, CHEEP!, and the critter is thrown back. */
function pop(sc: CoopScreen, s: CoopSeat): void {
  const px = s.x + s.facing * POP_DX, py = popY(s);
  sc.hatches++;
  launchShell(sc, px, py - SURPRISE_S * 2, -s.facing, s.y + 2);
  burstCrumbs(px, py, s.y, SHELL, 5, true);
  ringAt(px, py - SURPRISE_S, 4, 22, UI.cream, 2, 12, false, true);
  gagBurst(s.x, overHead(s) - BURST_UP, CHEEP, s.colour);
  seatAnim(s, 'hatched', true);
  sc.game.audio.play('coop_hatch');
}

// ---------------------------------------------------------------- the broody hen (sim)

/** A reach at a sat-on nest: she puffs up and glares, the seat freezes under her with '!', and the stick locks. */
export function startPeck(sc: CoopScreen, s: CoopSeat, e: Egg): void {
  sc.pecks++;
  s.peckT = PECK_TOTAL; s.moving = false;
  s.facing = e.x >= s.x ? 1 : -1;
  s.henX = e.x; s.henY = e.y;
  e.fury = HEN_FURY;
  // ONE temper per hen: she sees it through on the nest, sits on a moment, smug, and then flounces off whatever her
  // countdown said - before the critter has finished hopping, so the egg is free when it can reach again. Left to
  // her countdown, a player who went straight back for the egg was pecked again, and again (a bot playing whole
  // rounds took 26 pecks in 24 four-egg rounds).
  e.broody = HEN_FURY + SMUG;
  seatAnim(s, 'glared', true);
  gagBubble(s.x, overHead(s), BANG, s.colour);
  sc.game.audio.play('coop_puff');
}

/** One frame of the hen's beat on the seat: the flurry when it lands, feathers while it lasts, the hop round, the let-go. */
export function stepPeck(sc: CoopScreen, s: CoopSeat): void {
  const t = --s.peckT;
  if (t === FLURRY_AT) {
    gagBurst(s.x, overHead(s) - BURST_UP, OW, s.colour);
    particles.burst('leaf', s.henX, s.henY - 6, FEATHERS, FEATHER_OPTS);
    ringAt(s.henX, s.henY - 4, 4, 24, UI.cream, 2, 12, false, true);
    seatAnim(s, 'yanked', true);
    sc.game.audio.play('coop_flurry');
  } else if (t > HOP_AT && t < FLURRY_AT && t % FLURRY_EVERY === 0) particles.burst('leaf', s.henX, s.henY - 6, FLURRY_PUFF, FEATHER_OPTS);
  else if (t === HOP_AT) seatAnim(s, 'hopRound', true);
  else if (t === 0) seatAnim(s, 'carry', true);
  // hopping ROUND: a turn at every landing, an even number of them, so it comes back to face the way it was
  if (t > 0 && t < HOP_AT && t % HOP_TURN === 0) s.facing = -s.facing;
}

/**
 * The round ended mid-joke (coop.ts finish): the beats stop where they are and the basket comes back. A chick that
 * has already popped out gets its ride (the cheer is better with it); an egg still in the paw is just put away.
 */
export function endJokes(sc: CoopScreen, s: CoopSeat): void {
  if (s.hatchT > 0) {
    if (s.hatchT <= POP_AT) ride(sc, s);
    s.hatchT = 0; s.rig.weapon = RIBBON_BASKET;
  }
  s.peckT = 0;
}

// ---------------------------------------------------------------- the chick, after its seat lets go (cosmetic)

/** The states of a chick's cosmetic life. */
export const CH_FREE = 0, CH_RIDE = 1, CH_DOWN = 2, CH_RUN = 3;
/** The pool, how long it rides, its hop down, its run to a hen (px/frame), and how far behind her it trots (a step further per slot, so two chicks that adopt one hen trot in a line). */
const MAX_CHICKS = 4, RIDE_FRAMES = 360, DOWN_FRAMES = 14, DOWN_ARC = 12, CHICK_SPEED = 1.5, TAG_GAP = 13, TAG_STEP = 9;
/** Frames the beak stays open on a cheep. */
const CHEEP_FRAMES = 8;
/**
 * Where a chick sits on each head: [rows above the top of the skull to its feet, px forward of the head joint along
 * `facing`], measured off the coop's shots of the cast at rest. Barley sinks into his wool, Sorrel rides the top of
 * her toque, Chicory sits on the cap between her ears, Cress on the crown of the sunhat, Rowan on the grand toque.
 */
const PERCH: Readonly<Record<string, readonly number[]>> = Object.freeze({
  barley: [-2, -1], sorrel: [16, 2], chicory: [3, -3], cress: [14, 1], rowan: [18, 1],
});
const PERCH_ANY = [0, 0];
function perchOf(s: CoopSeat): readonly number[] { return PERCH[s.critter] || PERCH_ANY; }

/** A chick of the cosmetic pool. */
export interface Chick {
  /** CH_FREE, CH_RIDE (on its seat's head), CH_DOWN (hopping off it), CH_RUN (off to a hen and trotting after her). */
  state: number;
  /** Frames in the current state. */
  t: number;
  /** The party index of the seat it rides (`Seat.index`). */
  seat: number;
  /** Where it stands once it is off the head (feet). */
  x: number;
  y: number;
  /** The hop down: from the head (x0, y0) to the floor in front of its critter (x1, y1). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The hen it has adopted (an index into the screen's hens). */
  hen: number;
  facing: number;
  /** Frames left of an open beak. */
  cheep: number;
  /** True while it is on the move (its feet step). */
  moving: boolean;
}

/** A shell top in flight: off the egg at the pop, spinning back over the critter's shoulder onto the floor (cosmetic). */
export interface ShellBit {
  /** Frames since the pop; BIT_LIFE means the slot is free. */
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  /** The floor row it lands on. */
  floor: number;
}
const MAX_BITS = 4, BIT_LIFE = 80, BIT_G = 0.24, BIT_VX = 1.3, BIT_VY = -3.4, BIT_SPIN = 0.32;

/** The two cosmetic pools, built once per round by coop.ts enter(). */
export function makeChicks(): Chick[] {
  const out: Chick[] = [];
  for (let i = 0; i < MAX_CHICKS; i++) out.push({ state: CH_FREE, t: 0, seat: 0, x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0, hen: 0, facing: 1, cheep: 0, moving: false });
  return out;
}
export function makeBits(): ShellBit[] {
  const out: ShellBit[] = [];
  for (let i = 0; i < MAX_BITS; i++) out.push({ t: BIT_LIFE, x: 0, y: 0, vx: 0, vy: 0, rot: 0, floor: 0 });
  return out;
}

function launchShell(sc: CoopScreen, x: number, y: number, dir: number, floor: number): void {
  const b = sc.bits[sc.bitCursor]; sc.bitCursor = (sc.bitCursor + 1) % sc.bits.length;
  b.t = 0; b.x = x; b.y = y; b.vx = dir * BIT_VX; b.vy = BIT_VY; b.rot = 0; b.floor = floor;
}

/** The chick is going up: the plate over that head climbs out of its way (a head part's crown is what a plate clears). */
function lift(s: CoopSeat): void { s.crown = Math.max(s.baseCrown, perchOf(s)[0] + CHICK_H + 1); }

/** On the head it goes: a free slot (or the oldest chick trotting after a hen); a chick already up there hops off to make room. */
function ride(sc: CoopScreen, s: CoopSeat): void {
  let slot = -1;
  for (let i = 0; i < sc.chicks.length; i++) {
    const c = sc.chicks[i];
    if (c.state === CH_RIDE && c.seat === s.index) hopDown(sc, c);
    if (slot < 0 && c.state === CH_FREE) slot = i;
  }
  if (slot < 0) { let old = -1; for (let i = 0; i < sc.chicks.length; i++) if (sc.chicks[i].state === CH_RUN && (old < 0 || sc.chicks[i].t > sc.chicks[old].t)) old = i; slot = old; }
  if (slot < 0) return;
  const c = sc.chicks[slot];
  c.state = CH_RIDE; c.t = 0; c.seat = s.index; c.facing = s.facing; c.cheep = 0;
  lift(s);
}

/** Off the head and onto the floor in front of its critter, cheeping goodbye; the plate comes back down. */
function hopDown(sc: CoopScreen, c: Chick): void {
  const s = sc.seats[c.seat], pr = perchOf(s);
  c.state = CH_DOWN; c.t = 0; c.cheep = CHEEP_FRAMES;
  c.x0 = s.x + s.facing * pr[1]; c.y0 = s.y - R(s.rig.height * s.rig.scale) - pr[0];
  c.x1 = s.x + s.facing * 16; c.y1 = s.y + 5;
  c.x = c.x1; c.y = c.y1; c.facing = s.facing;
  s.crown = s.baseCrown;
  sc.game.audio.play('coop_cheep');
}

/** The chick riding this seat's head cheeps: its critter has just plucked an egg (coop.ts tryPluck). */
export function cheepRider(sc: CoopScreen, s: CoopSeat): void {
  for (let i = 0; i < sc.chicks.length; i++) {
    const c = sc.chicks[i];
    if (c.state !== CH_RIDE || c.seat !== s.index) continue;
    c.cheep = CHEEP_FRAMES;
    gagBubble(s.x, overHead(s), CHEEP, s.colour);
    sc.game.audio.play('coop_cheep');
  }
}

/** Every chick and every flying shell, one frame on (from update(), in both phases: a chick rides the cheer too). */
export function stepChicks(sc: CoopScreen): void {
  for (let i = 0; i < sc.chicks.length; i++) {
    const c = sc.chicks[i];
    if (c.state === CH_FREE) continue;
    c.t++;
    if (c.cheep > 0) c.cheep--;
    if (c.state === CH_RIDE) { c.facing = sc.seats[c.seat].facing; if (c.t >= RIDE_FRAMES) hopDown(sc, c); }
    else if (c.state === CH_DOWN) { if (c.t >= DOWN_FRAMES) { c.state = CH_RUN; c.t = 0; c.hen = nearestHen(sc, c.x); } }
    else {
      // off to its hen and then trotting after her: aim a little behind her, wherever she has wandered to
      const h = sc.hens[c.hen], tx = h.x - h.facing * (TAG_GAP + i * TAG_STEP), ty = h.y + 1, dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
      c.moving = d > CHICK_SPEED;
      if (c.moving) { c.x += (dx / d) * CHICK_SPEED; c.y += (dy / d) * CHICK_SPEED; if (dx > 0.5 || dx < -0.5) c.facing = dx < 0 ? -1 : 1; }
      else { c.x = tx; c.y = ty; c.facing = h.facing; }
    }
  }
  for (let i = 0; i < sc.bits.length; i++) {
    const b = sc.bits[i];
    if (b.t >= BIT_LIFE) continue;
    b.t++;
    if (b.y < b.floor) {
      b.vy += BIT_G; b.x += b.vx; b.y += b.vy; b.rot += b.vx > 0 ? BIT_SPIN : -BIT_SPIN;
      if (b.y >= b.floor) { b.y = b.floor; b.rot = Math.PI; }
    }
  }
}

function nearestHen(sc: CoopScreen, x: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < sc.hens.length; i++) { const d = Math.abs(sc.hens[i].x - x); if (d < bd) { bd = d; best = i; } }
  return best;
}

/** True while this chick is off its critter and on the floor: the coop's y-sorted pass draws it (drawFloorChick). */
export function onFloor(c: Chick): boolean { return c.state === CH_DOWN || c.state === CH_RUN; }
/** The row a floor chick sorts on: where it is, or where it will land. */
export function floorY(c: Chick): number { return c.state === CH_DOWN ? c.y1 : c.y; }

// ---------------------------------------------------------------- drawing (draw-only, zero allocation)

/** Rig points read after drawRig, reused. */
const PAW: Point = { x: 0, y: 0 }, HEAD: Point = { x: 0, y: 0 };

/** Where a chick's feet go on this seat's head this frame: off the head joint of the drawRig that just ran. */
function perchPoint(s: CoopSeat, out: Point): Point {
  const pr = perchOf(s), j = jointScreen(s.rig, 'head', HEAD);
  out.x = R(j.x + s.facing * pr[1]); out.y = R(j.y - s.rig.p.headR * s.rig.scale - pr[0]);
  return out;
}

/**
 * What a seat holds through the hatch, read off its own paw after drawRig (the orchard's drawHeld): the egg hopping
 * in, held and wobbling harder with its crack running further, then the chick on the paw looking up at its new mum,
 * then the chick on its hop up to the head.
 */
export function drawHatch(ctx: CanvasRenderingContext2D, s: CoopSeat): void {
  const t = s.hatchT;
  if (t <= 0) return;
  const p = jointScreen(s.rig, 'handN', PAW), px = R(p.x), py = R(p.y);
  const hy = py - HELD_SINK - SURPRISE_S, ey = s.eggY - SURPRISE_LIFT;
  if (t > HOLD_AT) {
    const k = (HATCH_TOTAL - t) / HATCH_IN;
    crackedEgg(ctx, R(s.eggX + (px - s.eggX) * k), R(ey + (hy - ey) * k - Math.sin(k * Math.PI) * HOP_ARC), SURPRISE_S, 0, 0, true);
  } else if (t > POP_AT) {
    const k = (HOLD_AT - t) / HATCH_HOLD, rock = HELD_WOBBLE0 + (HELD_WOBBLE1 - HELD_WOBBLE0) * k;
    crackedEgg(ctx, px, hy, SURPRISE_S, (t >> 1) & 1 ? rock : -rock, t <= CRACK_2 ? 2 : t <= CRACK_1 ? 1 : 0, true);
  } else if (t > UP_AT) {
    // on the paw, facing its new mum; the beak goes on the pop and twice more while it looks
    drawChick(ctx, px, py - 1, -s.facing, 0, t > POP_AT - 6 || (t >> 2) % 3 === 0 ? 1 : 0, 1);
  } else {
    const k = (UP_AT - t) / HATCH_UP, to = perchPoint(s, HEAD);
    drawChick(ctx, R(px + (to.x - px) * k), R(py - 1 + (to.y - py + 1) * k - Math.sin(k * Math.PI) * UP_ARC), s.facing, 1, 0, 1);
  }
}

/** The chick riding this seat's head, if one is: on the perch of the drawRig that just ran, so it bobs with the head. */
export function drawRider(ctx: CanvasRenderingContext2D, sc: CoopScreen, s: CoopSeat): void {
  for (let i = 0; i < sc.chicks.length; i++) {
    const c = sc.chicks[i];
    if (c.state !== CH_RIDE || c.seat !== s.index) continue;
    const at = perchPoint(s, HEAD);
    drawChick(ctx, at.x, at.y, s.facing, 0, c.cheep > 0 ? 1 : 0, 1);
  }
}

/** A chick off the head: the hop down to the floor, then the run and the trot after its hen (the sorted pass draws it). */
export function drawFloorChick(ctx: CanvasRenderingContext2D, c: Chick, f: number): void {
  if (c.state === CH_DOWN) {
    const k = c.t / DOWN_FRAMES;
    drawChick(ctx, R(c.x0 + (c.x1 - c.x0) * k), R(c.y0 + (c.y1 - c.y0) * k - Math.sin(k * Math.PI) * DOWN_ARC), c.facing, 1, c.cheep > 0 ? 1 : 0, 1);
    return;
  }
  drawChick(ctx, R(c.x), R(c.y), c.facing, c.moving ? (f >> 2) & 1 : 0, c.cheep > 0 ? 1 : 0, 1);
}

/** The floor chicks' contact shadows, drawn with the others before the sorted pass. */
export function drawChickShadows(ctx: CanvasRenderingContext2D, sc: CoopScreen): void {
  for (let i = 0; i < sc.chicks.length; i++) { const c = sc.chicks[i]; if (onFloor(c)) drawShadow(ctx, c.state === CH_DOWN ? c.x1 : c.x, floorY(c), 11, 0.3, 0); }
}

/** The flying shell tops: spinning in flight, then a cup on the floor until they go. */
export function drawBits(ctx: CanvasRenderingContext2D, sc: CoopScreen): void {
  for (let i = 0; i < sc.bits.length; i++) {
    const b = sc.bits[i];
    if (b.t >= BIT_LIFE) continue;
    ctx.save(); ctx.translate(R(b.x), R(b.y) - (b.y >= b.floor ? 2 : 0)); ctx.rotate(b.rot);
    shellHalf(ctx, 0, 0, 9, 4);
    ctx.restore();
  }
}

/**
 * The broody hen on her nest. Settled, she SITS - legs tucked, body down in the straw, a slow bob - with the egg
 * peeking out from under her breast: the tell that there IS an egg in there, and that somebody is sat on it. In the
 * last 20 frames of her countdown she is up on her feet over it and about to go. In a temper (`fury`) she pops up to
 * twice her size and glares, pecks like a sewing machine with her whole body rocking, and goes down again
 * (drawPuffedHen).
 */
export function drawBroody(ctx: CanvasRenderingContext2D, e: Egg, f: number): void {
  const kind = e.nest & 1, facing = kind ? -1 : 1, x = R(e.x), y = R(e.y) + 5;
  if (e.fury > 0) {
    const into = HEN_FURY - e.fury, pecking = e.fury > DEFLATE && e.fury <= DEFLATE + FLURRY ? 1 : 0;
    const puff = into < PUFF_IN ? (into + 1) / PUFF_IN : e.fury <= DEFLATE ? e.fury / DEFLATE : 1;
    const jab = pecking ? (e.fury >> 1) & 1 : 0;
    drawPuffedHen(ctx, x + (pecking ? (jab ? 1 : -1) : 0), y, kind, facing, puff, jab);
    return;
  }
  const up = e.broody <= 20 ? 3 : 0, bob = up ? 0 : (f >> 4) & 1;
  eggGlyph(ctx, x + facing * PEEK_X, R(e.y) + PEEK_Y, EGG_S);
  drawHen(ctx, x, y - up + bob, kind, facing, 0, up ? 0 : ((f >> 5) & 1), up === 0);
}

/** A surprise egg at rest, in a nest or on the floor: a size up, its crack, and a rock on its base every so often (index-hashed). */
export function drawSurpriseEgg(ctx: CanvasRenderingContext2D, x: number, y: number, i: number, f: number): void {
  const w = (f + i * 23) % WOBBLE_EVERY;
  crackedEgg(ctx, x, y - SURPRISE_LIFT, SURPRISE_S, w < WOBBLE_FRAMES ? ((w >> 1) & 1 ? WOBBLE : -WOBBLE) : 0, 0, false);
}
