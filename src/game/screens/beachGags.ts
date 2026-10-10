// COCKLE COVE'S JOKES (docs/GDD.md section 5; the shared kit, game/gags.ts): three things the strand and the sea do
// to the crew, each built on the orchard bomb's four beats - a TELL a sharp eye can see coming, a WIND-UP on the seat
// with the stick locked, the BANG, and a LOOK that stays on the critter - and not one of them costs a point.
//
//   THE PINCH   Always, for a crab grabbed while it is still RUNNING: the tell is the mint sparkle, which a crab only
//               wears once it has stopped. The crab grabs back - frozen with it on the paw, OW! (PINCH_CLAMP) - and
//               the critter runs round in a panic, off one way and back again with the crab swinging off its
//               outstretched paw and a trail of dust behind, OW! OW!, until the crab lets go and drops beside it,
//               tired: the easy grab next (the screen's dropCrab).
//   THE WAVE    The seventh wave, on its own timer. The tell is the SEA DRAWING BACK: the water's edge goes up the
//               beach, bare wet sand where the breakers were, a dark swell standing up behind it, and everyone on the
//               sand stops dead and stares out at it, '!' (DRAW_FRAMES). Then it rolls up over the whole beach -
//               SPLOOSH! and a thump through the world - and flings everyone back onto their bottoms, weed on every
//               head, a fish flopping on the sand, dripping (SIT_FRAMES), and then they get up.
//   THE GULL    A deal on a timer: it glides in and lands on the boat's mooring post (art/backgrounds/beach.ts POST_X)
//               and WATCHES - the tell, a big white bird turning about on its post - for up to GULL_WATCH frames,
//               then gives up and flies off. The first clean grab made while it watches is its: the catch comes up out
//               of the strand held high and admired while the gull's shadow sweeps across the sand at the critter,
//               '!', and it swoops - SQUAWK!, the catch whipped out of the paw, feathers everywhere, the critter spun
//               round in the downdraft. Up it climbs, the critter shaking its basket at the sky... and it lets go. The
//               catch drops - BONK! on the head, stars - and bounces off into the basket: +1, the very one grabbed.
//               It plays on every visit: a crab, a clump of weed, a cockle (which is what gulls drop on rocks to open
//               them), a slab of salt just scraped off a pan.
//
// Never two jokes on one seat at once: a pinch is not a grab the gull can take, a seat with a beat already playing
// sits the wave out, the wave waits while the gull is coming in or busy with a catch, a watching gull leaves its post
// when the sea draws back, and no gull lands while the wave is running; and the two timed jokes keep JOKE_GAP clear
// after each other.
//
// Determinism (docs/ARCHITECTURE.md section 0): every beat is a countdown on a seat (pinchT, snatchT, wetT) or on the
// screen (waveT, gullT), stepped in update(); every random number is the rng singleton's, drawn in update(); every
// field is in the screen's checksumFields(). What is DRAWN from those countdowns - the cards, the particles, the
// gull's flight and its shadow, the catch in the air, the fish, the sea - is cosmetic and never feeds back.
import { VIEW_W, UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { burstDust, burstDrops, ringAt } from '../../art/fx.ts';
import { RIBBON_BASKET, seatAnim } from '../minigame.ts';
import { gagBurst, gagBubble, gagBump, overHead, drawDizzy } from '../gags.ts';
import { ROWS, POST_X, POST_TOP } from '../../art/backgrounds/beach.ts';
import { drawCrab, drawWeed } from '../../art/beachProps.ts';
import { GULL, PERCH, WING_UP, WING_GLIDE, WING_DOWN, WING_DIVE, drawGull, drawGullShadow, drawCatch, drawFish, drawSeaDrawn, drawSeaRush } from '../../art/beachGags.ts';
import type { BeachScreen, BeachSeat } from './beach.ts';

const R = Math.round;
/** Rows a bang's card sits over the row above the name plate (game/gags.ts overHead): clear of the face. */
const BURST_UP = 16;
const NOTICE = '!';

// ---------------------------------------------------------------- the pinch
/**
 * The pinch's beats: the clamp (frozen, OW!) for PINCH_CLAMP frames, then the run-around - PINCH_LEG frames off one
 * way at PINCH_SPEED px/frame and PINCH_LEG back, so the critter comes back to where it was grabbed - a puff of dust
 * off its heels every PINCH_DUST frames, and the 'OW! OW!' at PINCH_YELL, as the clamp's OW! card goes (a card is
 * up 56 frames, the last 6 of them shrinking: game/gags.ts).
 */
const PINCH_CLAMP = 8, PINCH_LEG = 32, PINCH_SPEED = 1.6, PINCH_DUST = 4, PINCH_YELL = 54;
export const PINCH_FRAMES = PINCH_CLAMP + PINCH_LEG * 2;
/** The crab on the paw: how far below the paw it hangs, and how far it swings (radians) as the critter runs. */
const CRAB_HANG = 15, CRAB_SWING = 0.6;
const OW = 'OW!', OW_OW = 'OW! OW!';

/**
 * The crab at `x` grabbed back: the clamp beat on the seat (the screen has put the crab on the paw, HELD). The basket
 * is dropped for it - the crab hangs off the bare paw, not off the basket, where it read as a crab already caught.
 */
export function startPinch(sc: BeachScreen, s: BeachSeat, x: number, i: number): void {
  s.pinchT = PINCH_FRAMES; s.pinchThing = i; s.moving = false;
  s.facing = x >= s.x ? 1 : -1;
  s.rig.weapon = null;
  sc.pinches++;
  seatAnim(s, 'clamped', true);
  ringAt(x, ROWS.quarry - 4, 3, 12, UI.cream, 2, 10, true, true);
  gagBurst(s.x, overHead(s) - BURST_UP, OW, s.colour);
  sc.game.audio.play('pinch');
}

/** One frame of the pinch: the clamp, the run off and back with the dust behind it, the second OW, and the drop. */
export function stepPinch(sc: BeachScreen, s: BeachSeat): void {
  const k = PINCH_FRAMES - --s.pinchT;
  // off it goes, away from the side the crab came from; then round, and back
  if (k === PINCH_CLAMP + 1) { s.facing = -s.facing; seatAnim(s, 'pinchRun', true); }
  else if (k === PINCH_CLAMP + PINCH_LEG + 1) s.facing = -s.facing;
  if (k > PINCH_CLAMP) {
    s.x = sc.clampX(s.x + s.facing * PINCH_SPEED);
    if (k % PINCH_DUST === 0) burstDust(s.x - s.facing * 8, s.y, 2, 0.8, true);
  }
  if (k === PINCH_YELL) { gagBubble(s.x, overHead(s), OW_OW, s.colour); sc.game.audio.play('beach_yelp'); }
  s.moving = false;
  if (s.pinchT === 0) { s.rig.weapon = RIBBON_BASKET; sc.dropCrab(s); }
}

// ---------------------------------------------------------------- the seventh wave
/**
 * The deal: the first wave WAVE_FIRST_MIN..WAVE_FIRST_MAX frames into the visit (the old wave's own numbers, so a
 * typical round still meets it), then one every WAVE_MIN..WAVE_MAX frames from the last one's start - further apart
 * than it used to be, because it now holds the whole crew for WAVE_TOTAL frames, not 40.
 */
const WAVE_FIRST_MIN = 600, WAVE_FIRST_MAX = 900, WAVE_MIN = 900, WAVE_MAX = 1300;
/**
 * The beats, in frames: the sea drawing back (the TELL: everyone stops and stares); the wave's rush up the sand,
 * the crash landing on its last frame; sat in the wet (the LOOK); and getting up.
 */
const DRAW_FRAMES = 60, RUSH_FRAMES = 10, SIT_FRAMES = 60, GETUP_FRAMES = 12;
export const WAVE_TOTAL = DRAW_FRAMES + RUSH_FRAMES + SIT_FRAMES + GETUP_FRAMES;
/** waveT (frames left of the wave) on the frame the crash lands. */
const CRASH_T = SIT_FRAMES + GETUP_FRAMES;
/**
 * How far the water's edge goes back up the beach (rows), how tall the swell behind it stands, from what part of
 * the draw the swell starts to rise, and how many frames before the crash the old wave's swell sound starts (its
 * attack peaks on the crash).
 */
const RECEDE = 30, SWELL_H = 14, SWELL_FROM = 0.55, SWELL_SOUND = 22;
/** How far down the beach the wave's front reaches (over every lane, onto the strand), and how long it drains. */
const WAVE_REACH = ROWS.quarry + 8, WASH_FRAMES = 30;
/** A drip off every critter sat in the wet every DRIP_EVERY frames; a wave that finds the gull busy tries again in WAVE_WAIT. */
const DRIP_EVERY = 6, WAVE_WAIT = 30;
/** The fish: how far beside its seat it lands, how often it flops and for how many of those frames it is in the air, how high. */
const FISH_OFF = 32, FLOP_EVERY = 16, FLOP_UP = 8, FLOP_H = 9, FISH_LEAP = 70;
/** The fish's slap lands a beat after the wave's. */
const FLOP_LATE = { delay: 0.3 };
const SPLOOSH = 'SPLOOSH!';

/** The visit's first wave, dealt in enter(). */
export function firstWave(): number { return rng.int(WAVE_FIRST_MIN, WAVE_FIRST_MAX); }

/** The wave's room beat, every update while the round is played: the sea, and the timer that brings the next one. */
export function stepWave(sc: BeachScreen): void {
  if (sc.waveT > 0) stepSea(sc);
  if (--sc.waveIn > 0) return;
  // never over a joke already playing: a wave waits out a gull coming in or busy with a catch
  if (sc.waveT > 0 || sc.gullState === ARRIVE || sc.gullState === BUSY) { sc.waveIn = WAVE_WAIT; return; }
  sc.waveIn = rng.int(WAVE_MIN, WAVE_MAX);
  sc.waveT = WAVE_TOTAL; sc.waves++;
  sc.fishSeat = rng.int(0, sc.seats.length - 1);
  if (sc.gullState === WATCH) leave(sc);   // a gull knows what the sea going out means
  lookOut(sc);
  sc.game.audio.play('beach_suck');
}

/** One frame of the wave: anyone free stops to stare while the sea draws back; the swell's sound; the crash. */
function stepSea(sc: BeachScreen): void {
  const t = --sc.waveT, e = WAVE_TOTAL - t;
  if (e < DRAW_FRAMES) lookOut(sc);
  if (e === DRAW_FRAMES + RUSH_FRAMES - SWELL_SOUND) sc.game.audio.play('wave');
  if (t === CRASH_T) crash(sc);
  else if (t === GETUP_FRAMES) {
    // the fish flips itself back down the beach to the water as the crew get up
    const s = sc.seats[sc.fishSeat];
    if (s) { burstDrops(sc.fishX, s.y - 4, 4, true); sc.game.audio.play('beach_flop'); }
  }
}

/** Everyone with no beat of their own stops and stares out to sea, '!': their lock runs with the wave's own countdown. */
function lookOut(sc: BeachScreen): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.pounceT > 0 || s.pinchT > 0 || s.snatchT > 0 || s.wetT > 0) continue;
    s.wetT = sc.waveT; s.moving = false;
    seatAnim(s, 'lookOut', true);
    gagBubble(s.x, overHead(s), NOTICE, s.colour);
  }
}

/** THE BANG: the wave lands. Everyone in it is flung back onto the sand, wet through; the world thumps; a fish lands. */
function crash(sc: BeachScreen): void {
  let n = 0, sx = 0, top: number = ROWS.bottom;
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.pinchT > 0 || s.snatchT > 0 || s.pounceT > 0) continue;   // a beat already playing plays out
    s.wetT = sc.waveT; s.moving = false;
    seatAnim(s, 'splooshed', true);
    burstDrops(s.x, s.y - 30, 6, true);
    const oh = overHead(s);
    if (oh < top) top = oh;
    n++; sx += s.x;
  }
  // one card for the room, over the middle of the crew (rimmed in the paper's tan: it is nobody's seat's joke)
  if (n > 0) gagBurst(R(sx / n), top - BURST_UP, SPLOOSH);
  gagBump(3);
  for (let x = 40; x < VIEW_W; x += 80) burstDrops(x, WAVE_REACH - 6, 3, true);
  const f = sc.seats[sc.fishSeat];
  if (f) {
    sc.fishX = sc.clampX(f.x + (f.x < VIEW_W / 2 ? FISH_OFF : -FISH_OFF));
    burstDrops(sc.fishX, f.y - 4, 3, true);
  }
  sc.game.audio.play('beach_sploosh');
  sc.game.audio.play('beach_flop', FLOP_LATE);
}

/** One frame of a seat's wave lock: the drips while sat in the wet, the sit after the fall, the get-up, and done. */
export function stepWet(sc: BeachScreen, s: BeachSeat): void {
  const t = --s.wetT;
  if (s.anim === 'splooshed' && s.player.done) seatAnim(s, 'sitWet', true);
  if (t < CRASH_T && t > GETUP_FRAMES && t % DRIP_EVERY === 0) burstDrops(s.x, s.y - 34, 1, true);
  if (t === GETUP_FRAMES) seatAnim(s, 'getUp', true);
  else if (t === 0) seatAnim(s, 'carry', true);
  s.moving = false;
}

// ---------------------------------------------------------------- the gull
/**
 * The gull's states on the screen (`gullState`): away (gullT counts down to its landing), gliding in to the post,
 * watching from it (gullT counts down to giving up), flying off, and busy with one seat's catch (`gullSeat`; the
 * seat's own snatchT runs the beat).
 */
export const AWAY = 0, ARRIVE = 1, WATCH = 2, LEAVE = 3, BUSY = 4;
export const GULL_STATES = Object.freeze(['away', 'arrive', 'watch', 'leave', 'busy']);
/**
 * The deal. The first landing comes GULL_FIRST_MIN..GULL_FIRST_MAX frames into a visit, early on purpose: a weed,
 * salt or cockle visit has no pinch and is often over in under ten seconds, and the gull is the joke it can show.
 * After that it comes back GULL_MIN..GULL_MAX frames after it last flew off (the wave's own spacing), and watches for
 * up to GULL_WATCH. Most landings end in a snatch (a crew grabs something clean within five seconds; only a crew
 * grabbing nothing but running crabs - pinches - sees it give up), so the landing IS the deal: after the first, a
 * gull about every 20..25 seconds of a long visit, and with the wave, one timed joke every ten seconds or so.
 */
const GULL_FIRST_MIN = 180, GULL_FIRST_MAX = 360, GULL_MIN = 900, GULL_MAX = 1300, GULL_WATCH = 300;
/**
 * The glide in to the post and the flight off it, in frames; and JOKE_GAP, the clear frames each timed joke keeps
 * after the other - a wave after a gull's snatch, a landing after a wave - so the two never come back to back.
 */
const ARRIVE_FRAMES = 48, LEAVE_FRAMES = 40, JOKE_GAP = 120;
/**
 * The snatch, as one countdown on the seat (snatchT, SNATCH_TOTAL down to 0), read as k = frames since the grab:
 *   0..SCOOP       the catch comes up out of the strand into the paw (the basket set down); the gull is off its post;
 *   SCOOP..SEE     held up high and admired, while the gull's shadow sweeps across the sand at the critter;
 *   SEE..SNATCH    '!': it has seen it - head up, mouth open, the catch still up;
 *   SNATCH         THE BANG: SQUAWK!, the catch out of the paw, feathers, the critter spun round for SPIN frames;
 *   ..DROP         the gull climbs away past the critter (RISE frames) and hangs there beside the SQUAWK card - not
 *                  behind it - flapping, with the catch, while the critter turns and shakes its basket at it; then
 *                  it crosses back over the head (CROSS frames). DROP waits for the card to have gone, so the fall
 *                  is in the clear;
 *   DROP..BONK     it lets go and the catch falls;
 *   BONK           BONK! on the head, and stars;
 *   ..LAND         the catch bounces off the head into the basket: +1, the one that was grabbed;
 *   ..SHAKE        dazed, the stars going round; a shake, and at SNATCH_TOTAL the seat is a player again.
 */
const SCOOP = 10, SEE = 14, SNATCH = 28, SPIN = 18, SPIN_TURN = 3, RISE = 16, CROSS = 10, DROP = 84, BONK = 96, LAND = 108, SHAKE = 124;
export const SNATCH_TOTAL = 134;
/**
 * Where the gull hangs after the snatch: beside the SQUAWK card, never behind it. The card goes up over the critter
 * but is held SQUAWK_HALF + CARD_EDGE in from the ends of the screen - inside game/gags.ts's own clamp, so it is
 * exactly where it is put - SQUAWK_HALF being the card's half-width at the pop's overshoot (measured off the kit for
 * this word). The gull hangs GULL_CLEAR px past the card's edge on the way it was flying (it came from the post), or
 * on the other side when that is off the screen, SIDE_UP rows over the row above the plate.
 */
const SQUAWK_HALF = 76, CARD_EDGE = 8, GULL_CLEAR = 26, SIDE_UP = 30;
/** The +1 when the catch lands: BANK_OUT px out past the basket, so the float clears the face. */
const BANK_OUT = 30, BANK_Y = 8;
/** The dive's whoosh starts this many frames before the snatch, so it ends on it; the gull's yelp as it lets go is pitched up. */
const SWOOP_LEAD = 22, YELP = { pitch: 1.3, volume: 0.7 };
/**
 * Feathers: the 'leaf' particle (it flutters and turns over as it falls), white one side and the gull's dark grey
 * the other so they read on the sand and the foam alike - a burst of them at the snatch, a puff as it lets go.
 */
const FEATHERS = { speed: 2.6, up: 1.4, color: GULL.white, color2: GULL.greyFar, size: 4, life: 80, screen: true };
const FEATHER_BURST = 12, FEATHER_PUFF = 4;
const SQUAWK = 'SQUAWK!', BONK_WORD = 'BONK!';
/**
 * Rows the held catch sits above the paw point; the gull's hover point over the row above a plate (high enough that
 * the SQUAWK card under it leaves the bird and its catch in the clear); how high the catch bounces off the head, and
 * how far under the paw point it lands in the basket; and how far under the gull's feet a carried catch hangs.
 */
const HELD_UP = 6, HOVER_UP = 56, BOUNCE_LIFT = 10, IN_BASKET = 6, CARRY_DROP = 8;

/** The visit's first landing, dealt in enter(). */
export function firstGull(): number { return rng.int(GULL_FIRST_MIN, GULL_FIRST_MAX); }

/**
 * The gull's room beat, every update - `playing` false while the end sign hangs, when a gull still flies in or off
 * (or sits it out on its post) but none lands.
 */
export function stepGull(sc: BeachScreen, playing: boolean): void {
  switch (sc.gullState) {
    case AWAY:
      if (!playing || --sc.gullT > 0) return;
      if (sc.waveT > 0) { sc.gullT = sc.waveT + JOKE_GAP; return; }   // no landing while the wave runs, nor straight after
      sc.gullState = ARRIVE; sc.gullT = ARRIVE_FRAMES;
      return;
    case ARRIVE:
      if (--sc.gullT > 0) return;
      sc.gullState = WATCH; sc.gullT = GULL_WATCH;
      sc.game.audio.play('beach_cry');
      return;
    case WATCH:
      if (--sc.gullT <= 0) leave(sc);
      return;
    case LEAVE:
      if (--sc.gullT > 0) return;
      sc.gullState = AWAY; sc.gullT = rng.int(GULL_MIN, GULL_MAX);
      return;
  }
}

function leave(sc: BeachScreen): void { sc.gullState = LEAVE; sc.gullT = LEAVE_FRAMES; }

/** True when the next clean grab is the gull's. */
export function gullWatching(sc: BeachScreen): boolean { return sc.gullState === WATCH && sc.waveT === 0; }

/** A clean grab while the gull watches: the catch at `x` comes up into the paw instead of the basket, and the gull goes. */
export function startSnatch(sc: BeachScreen, s: BeachSeat, x: number): void {
  sc.gullState = BUSY; sc.gullSeat = s.index; sc.gullT = 0;
  s.snatchT = SNATCH_TOTAL; s.moving = false;
  s.facing = x >= s.x ? 1 : -1;
  s.rig.weapon = null;   // the basket is set down: the catch goes up in the paw
  seatAnim(s, 'scoop', true);
  burstDust(x, ROWS.quarry, 4, 1.4, true);
}

/** One frame of the snatch on its seat (see SNATCH_TOTAL for the beats). */
export function stepSnatch(sc: BeachScreen, s: BeachSeat): void {
  const k = SNATCH_TOTAL - --s.snatchT;
  if (k === SCOOP) seatAnim(s, 'holdUp', true);
  else if (k === SNATCH - SWOOP_LEAD) sc.game.audio.play('beach_swoop');
  else if (k === SEE) { seatAnim(s, 'startle', true); gagBubble(s.x, overHead(s), NOTICE, s.colour); }
  else if (k === SNATCH) snatch(sc, s);
  else if (k === SNATCH + SPIN) { s.facing = gullSide(s); seatAnim(s, 'shakeFist', true); }   // round to face it, and shake the basket at it
  else if (k === DROP) { particles.burst('leaf', s.x, overHead(s) - HOVER_UP, FEATHER_PUFF, FEATHERS); sc.game.audio.play('beach_squawk', YELP); }
  else if (k === BONK) { seatAnim(s, 'bonked', true); gagBurst(s.x, overHead(s) - BURST_UP, BONK_WORD, s.colour); sc.game.audio.play('beach_bonk'); }
  else if (k === LAND) sc.bank(s, s.x + s.facing * BANK_OUT, s.y - BANK_Y);
  else if (k === SHAKE) seatAnim(s, 'shakeOff', true);
  // the downdraft spins the critter round on the spot
  if (k > SNATCH && k < SNATCH + SPIN && (k - SNATCH) % SPIN_TURN === 0) s.facing = -s.facing;
  if (s.anim === 'bonked' && s.player.done) seatAnim(s, 'dazed', true);
  s.moving = false;
  if (s.snatchT === 0) {
    seatAnim(s, 'carry', true);
    sc.gullState = AWAY; sc.gullSeat = -1; sc.gullT = rng.int(GULL_MIN, GULL_MAX);
    if (sc.waveIn < JOKE_GAP) sc.waveIn = JOKE_GAP;
  }
}

/** Where the SQUAWK card's centre goes: over the critter, held in from the ends of the screen (SQUAWK_HALF). */
function squawkX(s: BeachSeat): number {
  const lo = SQUAWK_HALF + CARD_EDGE, hi = VIEW_W - SQUAWK_HALF - CARD_EDGE;
  return s.x < lo ? lo : s.x > hi ? hi : s.x;
}
/** The gull's hang point's x after the snatch, on `side` of the card. */
function hangX(s: BeachSeat, side: number): number { return squawkX(s) + side * (SQUAWK_HALF + GULL_CLEAR); }
/** The side of the card the gull hangs on: plain compares on the seat's x, so update() and draw() agree. */
function gullSide(s: BeachSeat): number {
  const side = s.x >= POST_X ? 1 : -1, x = hangX(s, side);
  return x > VIEW_W - GULL_CLEAR || x < GULL_CLEAR ? -side : side;
}

/** THE BANG: the catch whipped out of the paw. The basket is back in it (the paw is empty), and the critter spins. */
function snatch(sc: BeachScreen, s: BeachSeat): void {
  sc.gulls++;
  s.rig.weapon = RIBBON_BASKET;
  seatAnim(s, 'spun', true);
  gagBurst(squawkX(s), overHead(s) - BURST_UP, SQUAWK, s.colour);
  particles.burst('leaf', s.x + s.facing * 12, s.y - 50, FEATHER_BURST, FEATHERS);
  burstDust(s.x, s.y, 6, 2.2, true);
  ringAt(s.x, s.y, 6, 30, UI.cream, 2, 14, true, true);
  sc.game.audio.play('beach_squawk');
}

// ---------------------------------------------------------------- the end of the round
/**
 * The round ends mid-joke (game/gags.ts: it must be safe to): a crab on a paw is put down, a catch the gull still
 * has goes into the basket after all (nothing is ever lost to a joke), everyone is up off the sand, the gull goes,
 * and the sea is back. From finish(), BEFORE the sign is written, so the sign counts that catch.
 */
export function endJokes(sc: BeachScreen): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.pinchT > 0) { s.pinchT = 0; s.rig.weapon = RIBBON_BASKET; sc.dropCrab(s); }
    if (s.snatchT > 0) {
      if (SNATCH_TOTAL - s.snatchT < LAND) sc.bank(s, s.x + s.facing * BANK_OUT, s.y - BANK_Y);
      s.snatchT = 0; s.rig.weapon = RIBBON_BASKET;
    }
    s.wetT = 0;
  }
  if (sc.gullState === BUSY) { sc.gullState = AWAY; sc.gullSeat = -1; sc.gullT = GULL_MAX; }
  else if (sc.gullState === WATCH) leave(sc);
  sc.waveT = 0;
}

// ---------------------------------------------------------------- drawing (draw-only: reads the countdowns, writes nothing)
/** The gull's flight: where it comes in from and goes off to, the climb over the dive, the flight off a hover. */
const IN_X = -30, IN_Y = 112, OFF_Y = 70, SWOOP_LIFT = 46, FLY_OFF = 40;
/** The gull's shadow on the sand during the dive: from the post's foot to the critter's feet. */
const SHADOW_FROM_Y = 248, SHADOW_W = 48;
/** Where the gull is this frame (written by gullAt, read by the two passes). */
const GP = { x: 0, y: 0, dir: 1, wing: PERCH, look: 1, call: false, on: false, shadow: false, sx: 0, sy: 0, sw: 0, sa: 0 };

function smooth(u: number): number { return u * u * (3 - 2 * u); }
function flap(f: number): number { return (f >> 2) & 1 ? WING_UP : WING_DOWN; }

/** The seat the gull on the post is eyeing: the one nearest something it could grab (draw-only). */
function eyed(sc: BeachScreen): BeachSeat | null {
  let best: BeachSeat | null = null, bd = 1e9;
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    for (let j = 0; j < sc.things.length; j++) {
      const t = sc.things[j];
      if (!sc.takeable(t)) continue;
      const d = t.x > s.x ? t.x - s.x : s.x - t.x;
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best;
}

/** Where the gull is and how it is drawn this frame, from the screen's gull state and the busy seat's countdown. */
function gullAt(sc: BeachScreen, f: number): void {
  GP.on = sc.gullState !== AWAY; GP.shadow = false; GP.call = false; GP.look = 1;
  if (!GP.on) return;
  if (sc.gullState === ARRIVE) {
    const u = 1 - sc.gullT / ARRIVE_FRAMES;
    GP.x = IN_X + (POST_X - IN_X) * smooth(u); GP.y = IN_Y + (POST_TOP - IN_Y) * u * u; GP.dir = 1;
    GP.wing = u < 0.6 ? flap(f) : u < 0.9 ? WING_GLIDE : WING_UP;
    return;
  }
  if (sc.gullState === WATCH) {
    // on the post, turning about: it faces whoever is nearest a catch, looks back over its shoulder now and then, and
    // opens its beak at them every so often
    const s = eyed(sc);
    GP.x = POST_X; GP.y = POST_TOP; GP.wing = PERCH;
    GP.dir = s && s.x < POST_X ? -1 : 1;
    GP.look = ((f >> 4) % 5) === 0 ? -1 : 1;
    GP.call = ((f >> 3) % 11) === 4;
    return;
  }
  if (sc.gullState === LEAVE) {
    const u = 1 - sc.gullT / LEAVE_FRAMES;
    GP.x = POST_X + (IN_X - POST_X) * smooth(u); GP.y = POST_TOP + (OFF_Y - POST_TOP) * smooth(u); GP.dir = -1; GP.wing = flap(f);
    return;
  }
  const s = sc.seats[sc.gullSeat];
  if (!s) { GP.on = false; return; }
  const k = SNATCH_TOTAL - s.snatchT, hx = s.x, hy = overHead(s) - HOVER_UP;
  if (k < SNATCH) {
    // the dive: off the post, up over the beach and down on the paw, along one curve; its shadow sweeps the sand
    const u = smooth(k / SNATCH), tx = s.basketPt.x, ty = s.basketPt.y - HELD_UP;
    const cx = (POST_X + tx) / 2, cy = Math.min(POST_TOP, ty) - SWOOP_LIFT, a = 1 - u;
    GP.x = a * a * POST_X + 2 * a * u * cx + u * u * tx; GP.y = a * a * POST_TOP + 2 * a * u * cy + u * u * ty;
    GP.dir = tx >= POST_X ? 1 : -1;
    GP.wing = k < 6 ? flap(f) : k < SNATCH - 9 ? WING_GLIDE : WING_DIVE;
    GP.call = k >= SNATCH - 4;
    GP.shadow = true; GP.sx = GP.x; GP.sy = SHADOW_FROM_Y + (s.y + 1 - SHADOW_FROM_Y) * u; GP.sw = SHADOW_W * (1 - 0.45 * u); GP.sa = 0.2 + 0.35 * u;
    return;
  }
  const side = gullSide(s), sx = hangX(s, side), sy = overHead(s) - SIDE_UP;
  if (k < DROP) {
    // on past the critter and up, to hang there beside the card beating hard with the catch, turned to face the
    // critter shaking its basket at it; then back over the head to drop it
    GP.wing = (f >> 1) & 1 ? WING_UP : WING_DOWN; GP.dir = -side; GP.call = k >= DROP - CROSS;
    if (k < SNATCH + RISE) {
      const u = (k - SNATCH) / RISE, e = 1 - (1 - u) * (1 - u), px = s.basketPt.x, py = s.basketPt.y - HELD_UP;
      GP.x = px + (sx - px) * e; GP.y = py + (sy - py) * e; GP.dir = side;
    } else if (k < DROP - CROSS) {
      GP.x = sx; GP.y = sy + ((f >> 3) & 1) * 2;
    } else {
      const u = smooth((k - DROP + CROSS) / CROSS);
      GP.x = sx + (hx - sx) * u; GP.y = sy + (hy - sy) * u;
    }
    return;
  }
  if (k < DROP + FLY_OFF) {
    // off, empty-footed, on the way it was going
    const u = smooth((k - DROP) / FLY_OFF), ox = side > 0 ? IN_X : VIEW_W - IN_X;
    GP.x = hx + (ox - hx) * u; GP.y = hy + (OFF_Y - hy) * u; GP.dir = -side; GP.wing = flap(f);
    return;
  }
  GP.on = false;
}

/** The gull's shadow, under everyone (it is on the sand): from draw(), after the seats' contact shadows. */
export function drawGullShadowPass(ctx: CanvasRenderingContext2D, sc: BeachScreen, f: number): void {
  gullAt(sc, f);
  if (GP.on && GP.shadow) drawGullShadow(ctx, GP.sx, GP.sy, GP.sw, GP.sa);
}

/**
 * THE SEA DRAWING BACK, between the far layer and the mid layer (the boat and the post stand on the bared sand): the
 * edge goes up the beach fast and then slower, the swell rising behind it over the last part of the draw, and it
 * holds there while the wave's rush (drawSeaFront) comes down over it.
 */
export function drawSeaBack(ctx: CanvasRenderingContext2D, sc: BeachScreen, f: number): void {
  if (sc.waveT <= 0) return;
  const e = WAVE_TOTAL - sc.waveT;
  if (e >= DRAW_FRAMES + RUSH_FRAMES) return;
  const k = Math.min(1, e / DRAW_FRAMES), out = 1 - (1 - k) * (1 - k);
  const swell = k > SWELL_FROM ? R((SWELL_H * (k - SWELL_FROM)) / (1 - SWELL_FROM)) : 0;
  drawSeaDrawn(ctx, R(ROWS.breakers - RECEDE * out), swell, f);
}

/** What a seat wears from its joke, after its rig is drawn: the catch up in its paw, weed on its head, stars round it. */
export function drawSeatJoke(ctx: CanvasRenderingContext2D, sc: BeachScreen, s: BeachSeat, f: number): void {
  const top = s.headPt.y - s.rig.p.headR * s.rig.scale;
  if (s.wetT > 0 && s.wetT <= CRASH_T) drawWeed(ctx, s.headPt.x, top + 2, s.index & 1 ? -s.facing : s.facing);
  if (s.snatchT <= 0) return;
  const k = SNATCH_TOTAL - s.snatchT;
  if (k < SNATCH) drawCatch(ctx, sc.ing, sc.icon, sc.hex, s.basketPt.x, s.basketPt.y - HELD_UP, s.facing, f);
  else if (k >= BONK && k < SHAKE) drawDizzy(ctx, s.headPt.x, top - 4, f);
}

/**
 * Everything the jokes put in front of the crew, after the strand and the hops: the crab swinging off a pinched paw,
 * the fish, the gull and whatever it carries or drops, and the wave's water over the lot.
 */
export function drawJokesFront(ctx: CanvasRenderingContext2D, sc: BeachScreen, f: number): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.pinchT <= 0) continue;
    const k = PINCH_FRAMES - s.pinchT, swing = k <= PINCH_CLAMP ? 0.12 * Math.sin(f * 0.9) : CRAB_SWING * Math.sin(f * 0.35);
    ctx.save(); ctx.translate(R(s.basketPt.x), R(s.basketPt.y)); ctx.rotate(swing);
    drawCrab(ctx, 0, CRAB_HANG, s.facing, (f >> 1) & 1, 1);
    ctx.restore();
  }
  drawFishFlop(ctx, sc);
  gullAt(sc, f);
  if (GP.on) {
    drawGull(ctx, GP.x, GP.y, GP.dir, GP.wing, GP.look, GP.call);
    drawCarried(ctx, sc, f);
  }
  drawSeaFront(ctx, sc, f);
}

/** The catch after the snatch: in the gull's feet, then falling, then bouncing off the head into the basket. */
function drawCarried(ctx: CanvasRenderingContext2D, sc: BeachScreen, f: number): void {
  if (sc.gullState !== BUSY) return;
  const s = sc.seats[sc.gullSeat];
  if (!s) return;
  const k = SNATCH_TOTAL - s.snatchT;
  if (k < SNATCH || k >= LAND) return;
  if (k < DROP) { drawCatch(ctx, sc.ing, sc.icon, sc.hex, GP.x + GP.dir * 2, GP.y + CARRY_DROP, GP.dir, f); return; }
  const headTop = s.headPt.y - s.rig.p.headR * s.rig.scale;
  if (k < BONK) {
    // let go of over the head: it falls, faster and faster, onto it, turning over as it goes
    const u = (k - DROP) / (BONK - DROP), x0 = s.x, y0 = overHead(s) - HOVER_UP + CARRY_DROP;
    drawCatch(ctx, sc.ing, sc.icon, sc.hex, x0 + (s.headPt.x - x0) * u, y0 + (headTop - 6 - y0) * u * u, (k >> 1) & 1 ? 1 : -1, f);
    return;
  }
  // off the head and down into the basket
  const u = (k - BONK) / (LAND - BONK), bx = s.basketPt.x, by = s.basketPt.y + IN_BASKET;
  drawCatch(ctx, sc.ing, sc.icon, sc.hex, s.headPt.x + (bx - s.headPt.x) * u, headTop - 6 + (by - headTop + 6) * u - Math.sin(u * Math.PI) * BOUNCE_LIFT, s.facing, f);
}

/** The fish the wave left beside one of the crew: flopping on the sand while they sit, then a leap back to the water. */
function drawFishFlop(ctx: CanvasRenderingContext2D, sc: BeachScreen): void {
  if (sc.waveT <= 0 || sc.waveT > CRASH_T) return;
  const s = sc.seats[sc.fishSeat];
  if (!s) return;
  const w = CRASH_T - sc.waveT, y = s.y + 2;
  if (sc.waveT > GETUP_FRAMES) {
    const p = w % FLOP_EVERY, n = (w / FLOP_EVERY) | 0, up = p < FLOP_UP ? Math.sin((p / FLOP_UP) * Math.PI) : 0;
    drawFish(ctx, sc.fishX, y, n & 1 ? 1 : -1, up * FLOP_H, up * (n & 1 ? 0.6 : -0.6));
    return;
  }
  const u = 1 - sc.waveT / GETUP_FRAMES, back = sc.fishX < VIEW_W / 2 ? -1 : 1;
  drawFish(ctx, sc.fishX + back * 24 * u, y, back, Math.sin(u * Math.PI) * FISH_LEAP * 0.4 + u * FISH_LEAP, back * u * 3);
}

/** The wave's water in front of everything: the rush down the beach to the crash, then the drain back to the wet line. */
function drawSeaFront(ctx: CanvasRenderingContext2D, sc: BeachScreen, f: number): void {
  if (sc.waveT <= 0) return;
  const e = WAVE_TOTAL - sc.waveT;
  if (e < DRAW_FRAMES) return;
  const sea = ROWS.breakers - RECEDE;
  if (e < DRAW_FRAMES + RUSH_FRAMES) {
    const u = (e - DRAW_FRAMES + 1) / RUSH_FRAMES;
    drawSeaRush(ctx, sea - SWELL_H, R(sea + (WAVE_REACH - sea) * u * u), 0, f);
    return;
  }
  const w = e - DRAW_FRAMES - RUSH_FRAMES;
  if (w >= WASH_FRAMES) return;
  const u = w / WASH_FRAMES;
  drawSeaRush(ctx, ROWS.breakers, R(WAVE_REACH - (WAVE_REACH - ROWS.wet) * u), u, f);
}
