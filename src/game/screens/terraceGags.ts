// Thyme Terrace's two jokes (docs/GDD.md section 5): their deal, their beats and the drawing of them, run on the
// screen's own state (screens/terrace.ts keeps the round - the clumps, the snips, the regrowth - and calls in here).
// Each joke is the orchard bomb's four beats - a TELL a sharp eye can see coming, a WIND-UP with the stick locked, a
// BANG with its card and its sound, and a LOOK that stays on the critter - run off one countdown on the seat (`gagT`,
// the joke in `gag`), so a seat is only ever in one of them, and neither costs anything but the time.
//
// Determinism (docs/ARCHITECTURE.md section 0): everything here that the sim keeps is an integer on the seat, the
// clump or the hedgehog, stepped once a frame from update() and hashed by the screen's checksumFields(); the only
// random numbers are the rng singleton's (the opening deal, the hedgehog's next clump). The leaps' height, the
// storm, the ball's bounce, the word cards and the particles are draw-side or cosmetic.
import { UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { floatText, ringAt, burstCrumbs, burstDust } from '../../art/fx.ts';
import { foodTones } from '../../art/food.ts';
import { CLUMP_X, CLUMP_Y } from '../../art/backgrounds/terrace.ts';
import { drawHedgehog, drawHogBall, drawSnore, WILD_H } from '../../art/terraceProps.ts';
import { drawStatue, drawStorm, drawClippings, drawBristle, statueHeadUp, statueTopUp, BITE_SPOT, STATUE_SCALE } from '../../art/terraceGags.ts';
import { seatAnim } from '../minigame.ts';
import { gagBurst, gagBubble, overHead, coat } from '../gags.ts';
import type { TerraceScreen, TerraceSeat, Clump } from './terrace.ts';

const R = Math.round;
/** The joke a seat is in (TerraceSeat.gag). */
export const NONE = 0, HOG = 1, TOPIARY = 2;
/** The hungry one, whose look at a statue is a bite out of it (Seat.critter). */
const BARLEY = 'barley';

/**
 * THE HEDGEHOG. The deal: in HOG_IN rounds of HOG_OF it is asleep under a seeded clump when the truck pulls up. It
 * used to be under one clump in eight, the first the roll landed on: the left-hand clumps most of the time, a long
 * way from where the crew starts, so most rounds never woke it. On the seat whose snip wakes it, HOG_BEAT frames:
 *   0 .. BALL_IN     the WIND-UP: it wakes with a start ('!' over it), curls into a spiky ball and comes bouncing at
 *                    the critter, who braces
 *   BALL_IN          the BANG: off the shins - EEK! - and the critter leaps LEAP_H rows, its fur on end for BRISTLE_FRAMES
 *   + LEAP_FRAMES    the LOOK: down hopping on one foot, and a player again at HOG_BEAT
 * and on the hedgehog its own run (Hedgehog.t, from HOG_RUN down): the ball out at the shins (BALL_IN), the REBOUND
 * back to its clump's foot, the GLARE (HMPH) at whoever woke it, the TRUNDLE to another clump, and asleep again.
 */
const HOG_IN = 2, HOG_OF = 3;
const HOG_BEAT = 80, BALL_IN = 16, LEAP_FRAMES = 22, LEAP_H = 26, BRISTLE_FRAMES = 30;
const REBOUND = 14, GLARE = 26, TRUNDLE_FRAMES = 40, HOG_RUN = BALL_IN + REBOUND + GLARE + TRUNDLE_FRAMES;
/** Where it sleeps (right of its clump's centre, on the bed's foot), the ball's two hops in and its one hop back. */
const HOG_DX = 12, HOG_Y = CLUMP_Y + 2, BALL_HOP = 12, REBOUND_HOP = 20;
/**
 * Its two remarks: the '!' it wakes with, over its own head (which also points the eye at the ball before it comes),
 * and the HMPH at HMPH_AT frames into its run, once the '!' has gone, leaning HMPH_LEAN px away from the critter so it
 * clears that one's name plate.
 */
const HOG_HEAD = 14, HMPH_AT = 44, HMPH_LEAN = 10;
/** The shins it bounces off: this far in front of the feet of the critter facing it. */
const SHIN_DX = 8;

/**
 * THE TOPIARY. The deal: a clump that grows back to full grows WILD one time in WILD_ODDS, and the bed the truck
 * pulls up to has one clump grown wild overnight in WILD_IN rounds of WILD_OF (never the hedgehog's). A herb line
 * is one to three and a round is mostly over before anything has grown back to full, so without the opening deal
 * the joke would hardly ever be seen. On the seat whose snip finds it, TOPIARY_BEAT frames:
 *   FRENZY_FRAMES   the WIND-UP: the shears run away with the critter ('?!'): a storm of snipping round the clump,
 *                   a volley of snips every FRENZY_EVERY, the storm blowing up over STORM_UP and dying over STORM_DOWN
 *   the bang        TA-DA!: the clump is a hedge statue of the critter, and its snips hop into the basket, +1 each
 *                   and never past the target (SPRIG_GAP frames apart)
 *   LOOK_FRAMES     the LOOK, with the clippings stuck in its fur: steps back to BOW_GAP from the statue (by
 *                   STEP_BACK), looks up at it, turns to the room at TURN_AT and bows at BOW_AT. Barley shuffles
 *                   to BITE_GAP, crouches at LEAP_AT, leaps CROUCH later, bites at CHOMP_AT, lands at LAND_AT (a
 *                   LANDING squash), backs off to BOW_GAP chewing (a chew every CHEW_EVERY), says MMM! at MMM_AT -
 *                   leaning MMM_LEAN away from the statue, so the bubble never covers the bite - and at SATED_AT
 *                   admires his work
 */
const WILD_ODDS = 5, WILD_IN = 2, WILD_OF = 3;
const FRENZY_FRAMES = 50, FRENZY_EVERY = 10, LEAF_EVERY = 5, STORM_UP = 6, STORM_DOWN = 4;
const LOOK_FRAMES = 90, TOPIARY_BEAT = FRENZY_FRAMES + LOOK_FRAMES, SPRIG_GAP = 4;
const STEP_BACK = 24, BOW_GAP = 46, TURN_AT = 44, BOW_AT = 56;
const BITE_GAP = 30, LEAP_AT = 14, CROUCH = 6, CHOMP_AT = 25, LAND_AT = 34, LANDING = 6, MMM_AT = 48, MMM_LEAN = 12, CHEW_EVERY = 14, SATED_AT = 80;
/** A critter's mouth is this many of its head radii under the middle of its head (the muzzle's lower half). */
const MOUTH_DROP = 0.4;
/** The storm's cloud, its half-width and half-height round the clump and the critter; its core sits on the middle of the clump (a wild clump is WILD_H tall). */
const STORM_RX = 50, STORM_RY = 42, CORE_UP = WILD_H / 2;
/** A burst card is centred this far over the row above a head (gags.ts overHead), so the face stays clear; the TA-DA a little higher again, clear of the statue's ears. */
const BURST_UP = 16, TADA_UP = 12;

const PLUS = Object.freeze(['', '+1', '+2', '+3']);
const WAKE = '!', EEK = 'EEK!', HMPH = 'HMPH', WHAT = '?!', TADA = 'TA-DA!', MMM = 'MMM!';
/** The particles the jokes throw, coloured per visit (tintJokes): leaves out of the storm, leaves settling on the statue. */
const FLY_OPTS = { speed: 3, up: 1.4, color: '', color2: '', screen: true };
const SETTLE_OPTS = { speed: 2, up: 0.6, color: '', color2: '', screen: true };
/** The TA-DA's sprigs land in the basket a beat after the fanfare. */
const CATCH_LATE = { delay: 0.25 };

/** A hop `h` rows high at the top, `u` 0..1 of the way through it. */
function arc(u: number, h: number): number { return R(4 * h * u * (1 - u)); }

/** The leaves the jokes throw are the visit's herb (a screen's enter()). */
export function tintJokes(hex: string): void {
  const t = foodTones(hex);
  FLY_OPTS.color = SETTLE_OPTS.color = t.base; FLY_OPTS.color2 = SETTLE_OPTS.color2 = t.hi;
}

/** The bed the truck pulls up to: the hedgehog asleep under a seeded clump (HOG_IN of HOG_OF), one other clump grown wild (WILD_IN of WILD_OF). */
export function dealJokes(sc: TerraceScreen): void {
  const n = CLUMP_X.length, hog = sc.hog;
  if (rng.int(1, HOG_OF) <= HOG_IN) hog.at = rng.int(0, n - 1);
  if (rng.int(1, WILD_OF) <= WILD_IN) {
    let w = rng.int(0, hog.at >= 0 ? n - 2 : n - 1);
    if (hog.at >= 0 && w >= hog.at) w++;   // never the clump the hedgehog is under
    sc.clumps[w].wild = 1;
  }
}

/** Clump `c` has just grown back to full (the screen's regrowth): a statue there is a clump again, and one in WILD_ODDS comes back wild. */
export function grownBack(c: Clump): void {
  c.statue = 0; c.bite = 0;
  if (rng.int(1, WILD_ODDS) === 1) c.wild = 1;
}

/**
 * A snip at clump `i` that is a joke: the hedgehog asleep under it, or it grown wild. Starts it and returns true; the
 * snip is then not a snip (screens/terrace.ts trySnip).
 */
export function springJoke(sc: TerraceScreen, s: TerraceSeat, i: number): boolean {
  if (sc.hog.at === i && sc.hog.t === 0) { wake(sc, s, i); return true; }
  if (sc.clumps[i].wild) { frenzy(sc, s, i); return true; }
  return false;
}

/** One frame of the joke a seat is in. */
export function stepJoke(sc: TerraceScreen, s: TerraceSeat): void { if (s.gag === HOG) stepHog(sc, s); else stepTopiary(sc, s); }

/** True while some seat's frenzy is cutting clump `i` into a statue: nobody else can snip it. */
export function cutting(sc: TerraceScreen, i: number): boolean {
  for (let k = 0; k < sc.seats.length; k++) { const s = sc.seats[k]; if (s.gag === TOPIARY && s.gagAt === i && s.gagT > LOOK_FRAMES) return true; }
  return false;
}

/** Put a seat into a joke: `frames` of it, at clump `at`, the stick locked until it is over. */
function startGag(s: TerraceSeat, gag: number, frames: number, at: number): void { s.gag = gag; s.gagT = frames; s.gagAt = at; s.reachT = 0; s.moving = false; }

/** The joke is over: the seat is a player again. */
function endGag(s: TerraceSeat): void { s.gag = NONE; s.gagT = 0; s.gagAt = -1; seatAnim(s, 'carry', true); }

/**
 * The round is over (the screen's finish()): every joke ends where it is. A storm still blowing settles at once on
 * its statue (the round is already won, so nothing more is scored), every seat is out of its joke, and the hedgehog,
 * wherever it was in its run, is asleep under the clump it was going to.
 */
export function endJokes(sc: TerraceScreen): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.gag === TOPIARY && s.gagT > LOOK_FRAMES) carve(s, sc.clumps[s.gagAt]);
    s.gag = NONE; s.gagT = 0; s.gagAt = -1;
  }
  const h = sc.hog;
  if (h.t > 0) { h.at = h.to; h.to = -1; h.t = 0; }
}

// ---------------------------------------------------------------- the hedgehog
/** It was under that clump: woken, it curls up and comes bouncing at this seat's shins. The WIND-UP. */
function wake(sc: TerraceScreen, s: TerraceSeat, i: number): void {
  sc.eeks++;
  startGag(s, HOG, HOG_BEAT, i);
  seatAnim(s, 'braced', true);
  const h = sc.hog;
  let to = rng.int(0, CLUMP_X.length - 2); if (to >= i) to++;   // any clump but this one
  h.to = to; h.t = HOG_RUN; h.hitX = R(s.x + s.facing * SHIN_DX); h.hitY = s.y;
  gagBubble(CLUMP_X[i] + HOG_DX, HOG_Y - HOG_HEAD, WAKE);
  sc.game.audio.play('snuffle');
}

/** The hedgehog's run once it is woken: out at the shins, back to its clump, the glare (HMPH), the trundle, and asleep under `to`. */
export function stepHedgehog(sc: TerraceScreen): void {
  const h = sc.hog;
  if (h.t <= 0) return;
  if (--h.t === HOG_RUN - HMPH_AT) {
    const x = CLUMP_X[h.at] + HOG_DX;
    gagBubble(x + (h.hitX > x ? -HMPH_LEAN : HMPH_LEAN), HOG_Y - HOG_HEAD, HMPH);
    sc.game.audio.play('terrace_hmph');
  }
  if (h.t === 0) { h.at = h.to; h.to = -1; }
}

/** One frame of the hedgehog's beat on the seat that woke it: the bang off the shins, the leap, the hopping. */
function stepHog(sc: TerraceScreen, s: TerraceSeat): void {
  const k = HOG_BEAT - --s.gagT;
  if (k === BALL_IN) {
    seatAnim(s, 'leap', true);
    gagBurst(s.x, overHead(s) - BURST_UP - LEAP_H, EEK, s.colour);
    ringAt(sc.hog.hitX, s.y - 8, 4, 18, UI.cream, 2, 12, false, true);
    sc.game.audio.play('terrace_boing');
    sc.game.audio.play('terrace_eek');
  } else if (k === BALL_IN + LEAP_FRAMES) {
    seatAnim(s, 'ouchHop', true);
    burstDust(s.x, s.y, 4, 1.4, true);
  } else if (s.gagT === 0) endGag(s);
}

// ---------------------------------------------------------------- the topiary
/** The first snip at a wild clump: the shears run away with the critter. The WIND-UP. */
function frenzy(sc: TerraceScreen, s: TerraceSeat, i: number): void {
  startGag(s, TOPIARY, TOPIARY_BEAT, i);
  seatAnim(s, 'frenzy', true);
  gagBubble(s.x, overHead(s), WHAT, s.colour);
  sc.game.audio.play('terrace_frenzy');
}

/** One frame of the topiary on its seat: the storm, the bang, then the bow (or Barley's bite), then a player again. */
function stepTopiary(sc: TerraceScreen, s: TerraceSeat): void {
  const t = --s.gagT;
  if (t > LOOK_FRAMES) {
    const e = TOPIARY_BEAT - t;
    if (e % FRENZY_EVERY === 0) sc.game.audio.play('terrace_frenzy');
    if (e % LEAF_EVERY === 0) particles.burst('leaf', CLUMP_X[s.gagAt], CLUMP_Y - CORE_UP, 3, FLY_OPTS);
    return;
  }
  if (t === LOOK_FRAMES) { tada(sc, s); return; }
  if (t === 0) { endGag(s); return; }
  if (s.critter === BARLEY) stepBite(sc, s, LOOK_FRAMES - t); else stepBow(sc, s, LOOK_FRAMES - t);
}

/** The BANG: the leaves settle - TA-DA! - on a hedge statue of the critter, and the clump's snips hop into the basket. */
function tada(sc: TerraceScreen, s: TerraceSeat): void {
  const c = sc.clumps[s.gagAt], x = CLUMP_X[s.gagAt];
  const n = Math.min(c.snips, sc.target - sc.total);
  carve(s, c);
  sc.topiaries++;
  s.count += n; sc.setTotal(sc.total + n);
  for (let k = 0; k < n; k++) sc.hop(s, x, CLUMP_Y - 30, -k * SPRIG_GAP);
  if (n > 0) floatText(x, CLUMP_Y - 44, PLUS[n], s.colour, 1, true);
  gagBurst(x, CLUMP_Y - R(statueTopUp(s.rig, s.crown)) - BURST_UP - TADA_UP, TADA, s.colour);
  ringAt(x, CLUMP_Y - 30, 6, 40, UI.cream, 3, 16, false, true);
  particles.burst('leaf', x, CLUMP_Y - 34, 18, SETTLE_OPTS);
  sc.game.audio.play('terrace_tada');
  if (n > 0) sc.game.audio.play('catch', CATCH_LATE);
  seatAnim(s, s.critter === BARLEY ? 'admire' : 'stepBack', true);
}

/** Clump `c` becomes a statue of seat `s`, looking back at it: no snips on it, growing back from stubble. */
function carve(s: TerraceSeat, c: Clump): void { c.snips = 0; c.regrow = 0; c.wild = 0; c.statue = s.index + 1; c.face = -s.facing; c.bite = 0; }

/** The bow, `k` frames after the bang: back away to BOW_GAP still looking at it, look up at it, turn to the room, bow. */
function stepBow(sc: TerraceScreen, s: TerraceSeat, k: number): void {
  if (k < STEP_BACK && sc.stepTo(s, BOW_GAP)) return;
  if (k < TURN_AT) seatAnim(s, 'admire');
  else if (k === TURN_AT) { s.facing = -s.facing; seatAnim(s, 'present', true); }
  else if (k === BOW_AT) { seatAnim(s, 'bow', true); particles.burst('leaf', s.x, s.y - 40, 6, SETTLE_OPTS); }
}

/**
 * Barley eats the evidence, `k` frames after the bang: up to BITE_GAP, a leap at the statue's head, a bite out of
 * it, and down to chew it over backing off to BOW_GAP, so the bitten head is in plain view beside him.
 */
function stepBite(sc: TerraceScreen, s: TerraceSeat, k: number): void {
  if (k < LEAP_AT) seatAnim(s, sc.stepTo(s, BITE_GAP) ? 'stepBack' : 'admire');
  else if (k === LEAP_AT) seatAnim(s, 'leapBite', true);
  else if (k === CHOMP_AT) {
    // the mouthful comes off the front of the statue's head, where the bite is cut (art/terraceGags.ts BITE_SPOT)
    const c = sc.clumps[s.gagAt], r = s.rig.p.headR * s.rig.scale * STATUE_SCALE;
    c.bite = 1;
    const hx = R(CLUMP_X[s.gagAt] + c.face * BITE_SPOT[0] * r), hy = R(CLUMP_Y - statueHeadUp(s.rig) + BITE_SPOT[1] * r);
    burstCrumbs(hx, hy, CLUMP_Y, sc.hex, 8, true);
    sc.game.audio.play('nom');
  } else if (k === LAND_AT) burstDust(s.x, s.y, 4, 1.4, true);
  if (k >= LAND_AT + LANDING && k < SATED_AT) {
    seatAnim(s, sc.stepTo(s, BOW_GAP) ? 'stepBack' : 'munch');
    if ((k - LAND_AT - LANDING) % CHEW_EVERY === 0) sc.game.audio.play('chew');
    if (k === MMM_AT) gagBubble(s.x + (s.x >= CLUMP_X[s.gagAt] ? MMM_LEAN : -MMM_LEAN), overHead(s), MMM, s.colour);
  } else if (k === SATED_AT) seatAnim(s, 'admire', true);
}

// ---------------------------------------------------------------- drawn
/** Rows a seat is off the ground this frame (draw-side): the leap off the hedgehog, and Barley's leap at a statue's head. */
export function liftOf(s: TerraceSeat): number {
  if (s.gag === HOG) {
    const k = HOG_BEAT - s.gagT - BALL_IN;
    return k > 0 && k < LEAP_FRAMES ? arc(k / LEAP_FRAMES, LEAP_H) : 0;
  }
  if (s.gag === TOPIARY && s.critter === BARLEY && s.gagT < LOOK_FRAMES) {
    // high enough to put the mouth level with the middle of the statue's head: it stands on its plinth on the bed,
    // a fifth bigger than life, and Barley jumps from the walk in front of it
    const k = LOOK_FRAMES - s.gagT - LEAP_AT - CROUCH, air = LAND_AT - LEAP_AT - CROUCH, rig = s.rig;
    const rise = s.y - CLUMP_Y + statueHeadUp(rig) - (rig.height - rig.p.headR * (1 + MOUTH_DROP)) * rig.scale;
    return k > 0 && k < air ? arc(k / air, rise) : 0;
  }
  return 0;
}

/**
 * Clump `i` as the topiary has it, if it does: a statue standing there (the maker's twin rig, coated in the herb's
 * green with the ink kept - the kit's coat - carved and cached by the art), or a wild clump hidden in the storm
 * that is cutting it (its churning core). False when the clump is the screen's to draw.
 */
export function drawTopiary(ctx: CanvasRenderingContext2D, sc: TerraceScreen, i: number): boolean {
  const c = sc.clumps[i];
  if (c.statue > 0) {
    const rig = sc.seats[c.statue - 1].statueRig;
    coat(rig, sc.hex);
    drawStatue(ctx, i, rig, c.statue - 1, CLUMP_X[i], CLUMP_Y, c.face, c.snips, c.bite, sc.ing);
    coat(rig, null);
    return true;
  }
  if (!c.wild) return false;
  for (let k = 0; k < sc.seats.length; k++) {
    const s = sc.seats[k];
    if (s.gag === TOPIARY && s.gagAt === i && s.gagT > LOOK_FRAMES && TOPIARY_BEAT - s.gagT >= STORM_UP) return true;
  }
  return false;
}

/** The look on a critter, after its drawRig: fur on end off the hedgehog; clippings stuck in it off the topiary, until the bow shakes them off. */
export function drawLook(ctx: CanvasRenderingContext2D, sc: TerraceScreen, s: TerraceSeat): void {
  if (s.gag === HOG) { const k = HOG_BEAT - s.gagT; if (k >= BALL_IN && k < BALL_IN + BRISTLE_FRAMES) drawBristle(ctx, s.rig, s.facing); }
  else if (s.gag === TOPIARY && s.gagT < LOOK_FRAMES && (s.critter === BARLEY || LOOK_FRAMES - s.gagT < BOW_AT)) drawClippings(ctx, s.rig, s.facing, sc.ing);
}

/** The storm over every seat still in a frenzy: over its clump, and half over the critter. */
export function drawStorms(ctx: CanvasRenderingContext2D, sc: TerraceScreen, f: number): void {
  for (let i = 0; i < sc.seats.length; i++) {
    const s = sc.seats[i];
    if (s.gag !== TOPIARY || s.gagT <= LOOK_FRAMES) continue;
    const env = Math.min(1, (TOPIARY_BEAT - s.gagT) / STORM_UP, (s.gagT - LOOK_FRAMES) / STORM_DOWN);
    drawStorm(ctx, CLUMP_X[s.gagAt], CLUMP_Y - CORE_UP, s.x, s.y - R(s.rig.height * s.rig.scale / 2), STORM_RX, STORM_RY, f, env, sc.ing);
  }
}

/**
 * The hedgehog: asleep at the foot of its clump with a Z drifting up (a sharp eye can spot it); woken, a spiky ball
 * bouncing out at the shins and back; uncurled and glaring; then trundling along the bed to the next clump. Drawn
 * twice a frame: in the bed before the crew, and with `ball` after it, because the ball comes out onto the walk in
 * front of the shins it is going to bounce off.
 */
export function drawHedgehogRun(ctx: CanvasRenderingContext2D, sc: TerraceScreen, f: number, ball: boolean): void {
  const h = sc.hog;
  if (h.at < 0) return;
  const x0 = CLUMP_X[h.at] + HOG_DX, e = HOG_RUN - h.t, dir = h.hitX >= x0 ? 1 : -1;
  if (h.t > 0 && e < BALL_IN + REBOUND) {
    if (!ball) return;
    if (e < BALL_IN) {
      const u = e / BALL_IN, half = u < 0.5 ? u * 2 : u * 2 - 1;
      drawHogBall(ctx, x0 + (h.hitX - x0) * u, HOG_Y + (h.hitY - HOG_Y) * u - arc(half, u < 0.5 ? BALL_HOP : BALL_HOP * 0.6), e * 0.5 * dir);
    } else {
      const u = (e - BALL_IN) / REBOUND;
      drawHogBall(ctx, h.hitX + (x0 - h.hitX) * u, h.hitY + (HOG_Y - h.hitY) * u - arc(u, REBOUND_HOP), -e * 0.5 * dir);
    }
    return;
  }
  if (ball) return;
  if (h.t === 0) { drawHedgehog(ctx, x0, HOG_Y, 1, 1); drawSnore(ctx, x0 + 3, HOG_Y - 22, f + h.at * 17); }
  else if (e < BALL_IN + REBOUND + GLARE) drawHedgehog(ctx, x0, HOG_Y, dir, 0, true);
  else {
    const k = 1 - h.t / TRUNDLE_FRAMES, x1 = CLUMP_X[h.to] + HOG_DX;
    drawHedgehog(ctx, x0 + (x1 - x0) * k, HOG_Y - (((f >> 2) & 1) ? 1 : 0), x1 >= x0 ? 1 : -1, 0);
  }
}
