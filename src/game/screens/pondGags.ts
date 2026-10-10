// The millpond's two jokes (docs/GDD.md section 5), dealt as a float lands and played out on the seat machine of
// game/screens/pond.ts, which calls in here at the deal, the bite, each reel tap, the last tap and every frame of the
// two joke states. They live in their own module because the screen was already most of its 600 lines.
//
//   THE BIG ONE - one cast in DEAL_ROLL / BIG_IN, never twice running on a seat, never on a boot.
//     TELL     while the float waits, a big dark shadow circles under it; when it takes, the float zips from side
//              to side instead of dipping.
//     WIND-UP  the twelve reel taps work as ever, but each one drags the critter a step along the planks toward the
//              deck's edge - heels skidding in the dust, leaning back, gritting, the rod bent nearly double - with a
//              '!' as the first one lands.
//     BANG     the twelfth tap YANKS it off the jetty: it flies along the line, SPLOOSH!, the world thumps, and for a
//              beat there is nothing on its spot but bubbles where it went in.
//     LOOK     it hauls itself back up onto its spot, pond-green and dripping, a lily pad on its head with a very
//              small frog on it (RIBBIT), holding up the fish - which goes in the bucket, +1, the fish counts - then
//              shakes itself off, and the pad and the frog go back in the pond. BIG_FRAMES from the twelfth tap.
//
//   THE OLD BOOT - one cast in DEAL_ROLL / BOOT_IN, never twice running on a seat.
//     TELL     the waiting float lies still and leans over: snagged on something that is not swimming.
//     WIND-UP  it reels in with the same twelve taps, comes up the line to the paw and is held out at arm's length.
//     BANG     turned over, it pours: a torrent, far more water than a boot could hold, a puddle spreading over the
//              planks and running off the edge, while the critter stares at it (?!).
//     LOOK     the last thing out is a tiny fish that flops across the planks and back into the pond, and the boot
//              is lobbed back after it - SPLOSH! BOOT_FRAMES, and no +1: nothing that came out of a boot is a catch.
//
// Determinism (docs/ARCHITECTURE.md section 0): the deal is one rng roll per cast, inside update(); every beat is a
// frame of a countdown on the seat's own `t`, which the checksum already hashes with `big` and `boot`. The drag along
// the planks is not a position at all but a draw offset read off the reel count (`dragX`, `dragY`), so the seat's x
// never moves and there is nothing to put back. The shadow's circling, the zip, the bend, the flight, the climb,
// the bubbles, the torrent and the frog are draw-only, and the cards, drops and dust are the cosmetic pools
// (game/gags.ts, engine/particles.ts): none reads rng, none reaches the sim. A few cosmetic drops are spawned where
// the last draw left the paw (`s.paw`), as the boot's drips always were.
import { VIEW_W, UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { ringAt, floatText, burstDrops, burstDust } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F } from '../../content/critters/common.ts';
import { ROWS } from '../../art/backgrounds/pond.ts';
import {
  PARA_N, PARA_T, PARA_H, BUCKET_DX, BUCKET_MID, BUCKET_TOP, LAND_FRAMES, CATCH_LIFT, BOOT_MOUTH, drawLine, drawBoot, drawFloat,
} from '../../art/fishing.ts';
import { BENT_ROD, bentTip, drawFishShadow, drawBigTrout, drawLilyHat, drawBubbles, gushReach, drawGush, drawPuddle, drawTinyFish } from '../../art/pondGags.ts';
import { drawFood } from '../../art/food.ts';
import { gulp, gulps, seatAnim } from '../minigame.ts';
import { gagBurst, gagBubble, gagBump, overHead, coat, COAT } from '../gags.ts';
import type { PondScreen, PondSeat } from './pond.ts';

const R = Math.round, DEG = Math.PI / 180;

/** The two joke states, after the screen's own five (IDLE CAST WAIT BITE HOOKED): the old boot, the big one. */
export const BOOT = 5, BIG = 6;
/**
 * The deal, rolled once per cast as the float lands (the big one's shadow has to be under the float it is going to
 * take): one roll of DEAL_ROLL, its first BIG_IN faces the big one (1 in 6) and its last BOOT_IN the old boot
 * (1 in 8). A seat never gets the same joke twice running, so in play about one bite in four is a joke, and a round
 * of four or five bites usually shows one.
 */
export const DEAL_ROLL = 24, BIG_IN = 4, BOOT_IN = 3;

/** The words on the cards (module constants: a card is never a string built per frame). */
const WHOA = '!', SPLOOSH = 'SPLOOSH!', RIBBIT = 'RIBBIT', HUH = '?!', SPLOSH = 'SPLOSH!', PLUS_ONE = '+1';
/**
 * A bang's card sits CARD_UP rows over the water it is about and CARD_DX to its right: clear of the rings and the
 * bubbles under it, and of the seat's own spot to the left, where the big one's critter climbs back out.
 */
const CARD_UP = 32, CARD_DX = 14;

// ---------------------------------------------------------------- the big one: numbers
/**
 * The big one's sequence, one countdown on the seat (`t`, from BIG_FRAMES) from the twelfth tap: BIG_FLY frames in
 * the air on the line, SPLOOSH, BIG_UNDER frames of bubbles, BIG_CLIMB frames hauling out onto the planks,
 * BIG_STAND frames stood there dripping with the frog on its head (the fish into the bucket on the way), and
 * BIG_SHAKE frames shaking itself off. 150 frames is the bomb's length again: a joke, not a penalty.
 */
export const BIG_FLY = 14, BIG_UNDER = 24, BIG_CLIMB = 26, BIG_STAND = 56, BIG_SHAKE = 30;
export const BIG_FRAMES = BIG_FLY + BIG_UNDER + BIG_CLIMB + BIG_STAND + BIG_SHAKE;
/** The beats, as frames since the twelfth tap. */
const K_SPLASH = BIG_FLY, K_UP = K_SPLASH + BIG_UNDER, K_STAND = K_UP + BIG_CLIMB, K_SHAKE = K_STAND + BIG_STAND;
/** Into the stand: the frog's RIBBIT, how long its throat stays puffed, and when the fish leaves the paw and lands in the bucket. */
const RIBBIT_AT = 6, PUFF_FRAMES = 12, FISH_AT = 30, FISH_HOP = 10;
const K_RIBBIT = K_STAND + RIBBIT_AT, K_FISH = K_STAND + FISH_AT, K_LAND = K_FISH + FISH_HOP;
/**
 * The blub under the water; the pad and the frog's hop off the shaking head back into the pond; and the frame of the
 * shake the pond comes off in (the coat goes with a last spray, CLEAN_AT frames in).
 */
const K_BLUB = K_SPLASH + 6, PAD_HOP = 16, K_PAD = K_SHAKE + PAD_HOP, CLEAN_AT = 18, K_CLEAN = K_SHAKE + CLEAN_AT;
/**
 * The drag: each tap of a big one draws the critter STEP_X px along the planks toward its float and STEP_Y rows
 * toward the deck's front edge, so twelve leave it leaning out over the lip (15, 10) - a draw offset, never the
 * seat's x. HEEL_DX is where the dust kicks up behind its heels.
 */
const STEP_X = 1.25, STEP_Y = 0.84, HEEL_DX = 7;
/** The rod's bend in rig px: BEND_BASE once it takes, BEND_STEP more a tap, BEND_TUG more on a tug, FLY_BEND in the flight. */
const BEND_BASE = 4, BEND_STEP = 0.5, BEND_TUG = 2, FLY_BEND = 12;
/**
 * The float on a big bite: it zips ZIP px either side on a ZIP_RATE-frame swing and rides ZIP_SINK rows lower
 * than a trout's dip, a splash kicking off it every ZIP_SPLASH frames.
 */
const ZIP = 7, ZIP_RATE = 3, ZIP_SPLASH = 8;
export const ZIP_SINK = 2;
/**
 * The big one's shadow circles its waiting float on a flattened ring SHADOW_RX px across and SHADOW_RY deep,
 * SHADOW_DY rows under the float, SHADOW_RATE radians a frame, each seat SHADOW_PHASE further round than the last.
 */
const SHADOW_RX = 18, SHADOW_RY = 5, SHADOW_DY = 8, SHADOW_RATE = 0.045, SHADOW_PHASE = 1.7;
/**
 * The flight: the arc's lift as a fraction of the cast's (enough to carry it up off the planks before it dives),
 * and where on the body the flight is steered from, as a fraction of its height.
 */
const YANK_LIFT = 1.3, BODY_MID = 0.4;
/** The world thump on the splash (game/gags.ts: 3 is the big one). */
const SPLASH_BUMP = 3;
/** The deck's front edge (the bank's shadow band starts on the same row), and the waterline in front of it the climb is cut at. */
const DECK_EDGE = ROWS.shade, CLIP_Y = DECK_EDGE + 2;
/**
 * The climb, in frames into it: the head breaks the surface over CLIMB_POP frames (the feet come up to show
 * CLIMB_SHOW of the critter above the water), it hangs on the lip until CLIMB_HANG, then hauls itself up onto the planks.
 */
const CLIMB_POP = 6, CLIMB_HANG = 12, CLIMB_SHOW = 0.6;
/** A drop off the soaked critter every DRIP_EVERY frames, and a spray of them every SHAKE_EVERY while it shakes. */
const DRIP_EVERY = 5, SHAKE_EVERY = 5;
/** Where the pad and the frog land: PAD_DX in front of the seat, PAD_DY under the deck's edge; their hop's lift and spin (radians a frame). */
const PAD_DX = 40, PAD_DY = 16, PAD_LIFT = 0.6, PAD_SPIN = 0.3;
/**
 * The fish held up by its tail: the paw grips it HANG px from its middle, it swings SWING radians either side of
 * hanging straight down at SWING_RATE radians a frame, and on a visit that is not trout the catch's glyph is held
 * at BIG_GLYPH, twice its size.
 */
const HANG = 15, SWING = 0.12, SWING_RATE = 0.15, BIG_GLYPH = 12;

// ---------------------------------------------------------------- the old boot: numbers
/**
 * The boot's sequence, one countdown on the seat (`t`, from BOOT_FRAMES) from the twelfth tap: BOOT_ARC frames up
 * the line to the paw, BOOT_TIP turning it over, BOOT_GUSH of torrent, BOOT_FLOP of the tiny fish flopping out and
 * away, BOOT_TOSS lobbed back. A hundred frames, against the 66 it used to be over in.
 */
export const BOOT_ARC = 20, BOOT_TIP = 8, BOOT_GUSH = 44, BOOT_FLOP = 14, BOOT_TOSS = 14;
export const BOOT_FRAMES = BOOT_ARC + BOOT_TIP + BOOT_GUSH + BOOT_FLOP + BOOT_TOSS;
const K_HELD = BOOT_ARC, K_GUSH = K_HELD + BOOT_TIP, K_FLOP = K_GUSH + BOOT_GUSH, K_TOSS = K_FLOP + BOOT_FLOP;
/** The stare's ?! lands HUH_AT frames into the torrent, once it is plainly not stopping. */
const K_HUH = K_GUSH + 8;
/** The boot turned over to TIP_ANGLE radians (toe up, mouth down and forward), shaken GLUG_TILT more on every glug. */
const TIP_ANGLE = 2.7, GLUG_TILT = 0.08;
/** Where the torrent lands: on the planks mid-deck. The puddle grows to PUDDLE_RX across, and spills off the front edge after SPILL_AT frames. */
const DECK_Y = ROWS.feet + 6, PUDDLE_RX = 20, SPILL_AT = 16;
/** The lob back: its lift as a fraction of the cast's, and how fast it tumbles (radians a frame). */
const TOSS_LIFT = 0.6, TUMBLE = 0.35;
/**
 * The tiny fish's three flops from the boot's mouth: out and down onto the planks by frame FLOP_A (FLOP_X1 px
 * forward, on the row behind the torrent's), a hop along them by FLOP_B (to FLOP_X2, on the row in front of it, FLOP_HOP
 * rows up at the top), and off the edge into the pond by the end (to FLOP_DX, FLOP_DY under the deck's edge).
 */
const FLOP_A = 5, FLOP_B = 10, FLOP_X1 = 5, FLOP_X2 = 15, FLOP_HOP = 8, FLOP_DX = 26, FLOP_DY = 10;

/** The seat's drawn offset along the planks for `reel` taps of a big one. */
export function dragX(reel: number): number { return R(reel * STEP_X); }
/** ...and toward the deck's front edge. */
export function dragY(reel: number): number { return R(reel * STEP_Y); }

/** Particle options, built once (engine/particles.ts reads them and keeps nothing). */
const DRIP_OPTS = { vx: 0, vy: 0.5, life: 16, size: 2, screen: true };
const SPRAY_OPTS = { speed: 3.4, up: 3.4, size: 3, screen: true };
const SHAKE_OPTS = { speed: 2.8, up: 1.4, screen: true };
const SPLASH_OPTS = { speed: 1.3, up: 1.1, screen: true };
const SPILL_OPTS = { vx: 0.2, vy: 0.6, life: 22, size: 2, screen: true };
/** Cosmetic jitter for the drips, read by frame (no rng: the particles keep their own stream, and this needs none). */
const JIT = Int8Array.of(-8, 5, -3, 9, -10, 2, 7, -5);

// ---------------------------------------------------------------- the poses (an overlay table, game/screens/pond.ts merges it)
const IDLE_ARMS = { armL: [-12, 12] };
/**
 * The two jokes' stances, on top of the pond's own table. Every key sets both arms, the boot's keys leave the rod
 * set down (the screen nulls `rig.weapon` through the hold, as the orchard drops its basket for the bomb), and no
 * raised paw crosses the face.
 *   bootHold   the boot out at arm's length in the near paw, leaning back from it, turned over over BOOT_TIP;
 *   bootStare  held there pouring while the critter stares at what is coming out of it, mouth open;
 *   bootPeer   the tiny fish going: the head follows it down and away;
 *   bootToss   the near arm swings back and throws, `shout`.
 *   bigReel    braced against the big one: rooted with the feet out in front, the whole body tipped back, both
 *              paws on the rod, gritting; every tap restarts it with a jolt toward the water;
 *   yanked     pulled off the planks: tipping forward through the flight, arms out along the line, legs trailing;
 *   climbOut   paws up on the deck's lip, then hauled up over it with a knee;
 *   soaked     stood on its spot holding the fish up by the tail, bedraggled (`hurt`), a shiver on alternate keys;
 *   drip       the fish in the bucket: still soaked, but pleased with itself;
 *   shakeOff   a wet dog's shake, eyes screwed shut, three times each way.
 */
export const GAG_ANIMS = Object.freeze({
  bootHold: { loop: false, frames: [
    F(4, { armR: [100, -10], ...IDLE_ARMS, torso: -6, head: -8, root: [0, 0], face: 'hurt' }, { ease: 'out' }),
    F(4, { armR: [112, -18], ...IDLE_ARMS, torso: -8, head: -4, root: [0, 0], face: 'hurt' }),
  ] },
  bootStare: { loop: true, frames: [
    F(10, { armR: [112, -18], ...IDLE_ARMS, torso: -4, head: 12, root: [0, 0], face: 'shout' }),
    F(10, { armR: [114, -16], ...IDLE_ARMS, torso: -5, head: 14, root: [0, -1], face: 'shout' }),
  ] },
  bootPeer: { loop: false, frames: [
    F(6, { armR: [110, -16], ...IDLE_ARMS, torso: 2, head: 18, root: [0, 0], face: 'hurt' }, { ease: 'out' }),
    F(8, { armR: [108, -14], ...IDLE_ARMS, torso: 4, head: 22, root: [0, 0], face: 'hurt' }),
  ] },
  bootToss: { loop: false, frames: [
    F(5, { armR: [40, -30], ...IDLE_ARMS, torso: 4, head: -4, root: [0, 0], face: 'shout' }, { ease: 'in' }),
    F(11, { armR: [150, 0], ...IDLE_ARMS, torso: -6, head: -6, root: [0, 0], face: 'shout' }, { ease: 'overshoot' }),
  ] },
  bigReel: { loop: true, frames: [
    F(3, { armR: [66, 26], armL: [56, 30], weapon: -24, torso: -2, head: -2, root: [2, 0, -8], legR: [10, -2], legL: [-6, 6], face: 'grit' }, { ease: 'out' }),
    F(9, { armR: [60, 30], armL: [50, 36], weapon: -30, torso: -8, head: -6, root: [0, 0, -16], legR: [14, -6], legL: [-8, 8], face: 'grit' }),
  ] },
  yanked: { loop: false, frames: [
    F(4, { armR: [100, 0], armL: [90, 6], weapon: -16, torso: 6, head: 4, root: [0, 0, 10], legR: [-20, 30], legL: [-40, 34], face: 'shout' }, { ease: 'in' }),
    F(10, { armR: [104, -4], armL: [96, 0], weapon: -8, torso: 10, head: 8, root: [0, 0, 55], legR: [-30, 24], legL: [-50, 28], face: 'shout' }),
  ] },
  climbOut: { loop: false, frames: [
    F(12, { armR: [150, 14], armL: [-150, -14], torso: 6, head: -2, root: [0, 0], legR: [20, 30], legL: [-20, 30], face: 'grit' }),
    F(14, { armR: [40, 50], armL: [-30, 40], torso: 10, head: 2, root: [0, 0], legR: [70, -80], legL: [-10, 10], face: 'grit' }, { ease: 'inout' }),
  ] },
  soaked: { loop: true, frames: [
    F(4, { armR: [122, 12], armL: [-16, 6], torso: 4, head: 8, root: [0, 1], face: 'hurt' }),
    F(4, { armR: [122, 12], armL: [-16, 6], torso: 4, head: 8, root: [1, 1], face: 'hurt' }),
    F(24, { armR: [124, 10], armL: [-14, 6], torso: 5, head: 10, root: [0, 1], face: 'hurt' }),
  ] },
  drip: { loop: true, frames: [
    F(20, { armR: [16, 10], armL: [-18, 8], torso: 2, head: 4, root: [0, 1], face: 'happy' }),
    F(20, { armR: [18, 12], armL: [-16, 8], torso: 3, head: 6, root: [0, 1], face: 'happy' }),
  ] },
  shakeOff: { loop: false, frames: [
    F(5, { armR: [40, 20], armL: [-40, 20], torso: 12, head: 14, root: [-2, 0], face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [40, 20], armL: [-40, 20], torso: -12, head: -14, root: [2, 0], face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [40, 20], armL: [-40, 20], torso: 12, head: 14, root: [-2, 0], face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [40, 20], armL: [-40, 20], torso: -12, head: -14, root: [2, 0], face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [40, 20], armL: [-40, 20], torso: 8, head: 10, root: [-1, 0], face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [16, 10], armL: [-18, 8], torso: 2, head: 4, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
});

// ---------------------------------------------------------------- the deal
/** As the float lands: one roll, the big one on its first faces and the boot on its last, neither twice running. */
export function dealCast(s: PondSeat): void {
  const roll = rng.int(1, DEAL_ROLL);
  s.big = s.big === 0 && roll <= BIG_IN ? 1 : 0;
  s.boot = s.boot === 0 && roll > DEAL_ROLL - BOOT_IN ? 1 : 0;
}

// ---------------------------------------------------------------- the big one: sim
/** It takes: the rod that bends goes in the paw, the line zings out, and the critter braces against it. */
export function bigBite(sc: PondScreen, s: PondSeat): void {
  s.rig.weapon = BENT_ROD;
  seatAnim(s, 'bigReel', true);
  sc.game.audio.play('pond_zing');
}

/** One tap on a big one (the reel count is already up): a jolt, a skid and a puff of dust at the heels, and the '!' as it starts. */
export function bigTap(sc: PondScreen, s: PondSeat): void {
  const x = s.x + dragX(s.reel), y = s.y + dragY(s.reel);
  seatAnim(s, 'bigReel', true);
  burstDust(x - HEEL_DX, y, 3, 1.4, true);
  sc.game.audio.play('pond_skid');
  if (s.reel === 1) gagBubble(x, overHead(s) + dragY(s.reel), WHOA, s.colour);
}

/** The twelfth tap: YANKED. The reel count stays at twelve through the sequence, so the flight starts where the drag left off. */
export function bigYank(sc: PondScreen, s: PondSeat): void {
  s.state = BIG; s.t = BIG_FRAMES;
  seatAnim(s, 'yanked', true);
  sc.game.audio.play('pond_yank');
  burstDrops(s.fx, s.fy, 6, true);
}

/** One frame of the big one's sequence: each beat on the frame it lands, and the seat a player again at the end. */
export function stepBig(sc: PondScreen, s: PondSeat): void {
  const k = BIG_FRAMES - --s.t;
  if (k === K_SPLASH) splash(sc, s);
  else if (k === K_BLUB) sc.game.audio.play('pond_blub');
  else if (k === K_UP) {
    seatAnim(s, 'climbOut', true);
    ringAt(s.x, CLIP_Y, 4, 18, UI.cream, 2, 16, true, true); burstDrops(s.x, CLIP_Y, 6, true);
  } else if (k === K_STAND) seatAnim(s, 'soaked', true);
  else if (k === K_RIBBIT) { gagBubble(s.x, overHead(s), RIBBIT, s.colour); sc.game.audio.play('pond_ribbit'); }
  else if (k === K_LAND) landBig(sc, s);
  else if (k === K_SHAKE) { seatAnim(s, 'shakeOff', true); sc.game.audio.play('pond_shake'); }
  else if (k === K_PAD) { ringAt(s.x + PAD_DX, DECK_EDGE + PAD_DY, 3, 12, UI.cream, 2, 14, true, true); burstDrops(s.x + PAD_DX, DECK_EDGE + PAD_DY, 3, true); }
  else if (k === K_CLEAN) particles.burst('drop', s.x, s.y - 30, 12, SHAKE_OPTS);
  if (k > K_STAND && k < K_SHAKE && k % DRIP_EVERY === 0) particles.spawn('drop', s.x + JIT[(k / DRIP_EVERY) & 7], s.y - 18 - (k & 7), DRIP_OPTS);
  if (k > K_SHAKE && k < K_CLEAN && k % SHAKE_EVERY === 0) particles.burst('drop', s.x, s.y - 30, 4, SHAKE_OPTS);
  if (s.t <= 0) sc.rest(s);
}

/** SPLOOSH: the card, the thump, the rings and the spray where the line went in; the rod went in with it. */
function splash(sc: PondScreen, s: PondSeat): void {
  sc.bigOnes++;
  s.rig.weapon = null;
  gagBurst(s.fx + CARD_DX, s.fy - CARD_UP, SPLOOSH, s.colour);
  gagBump(SPLASH_BUMP);
  ringAt(s.fx, s.fy, 6, 44, UI.cream, 3, 24, true, true);
  ringAt(s.fx, s.fy, 4, 26, UI.cream, 2, 16, true, true);
  particles.burst('drop', s.fx, s.fy, 18, SPRAY_OPTS);
  sc.game.audio.play('pond_sploosh');
}

/** The fish goes in the bucket: +1, the fish counts, the rim takes the hit, and the critter cheers up. */
function landBig(sc: PondScreen, s: PondSeat): void {
  s.landT = LAND_FRAMES;
  const bx = s.x + BUCKET_DX + BUCKET_MID, by = s.y - BUCKET_TOP;
  seatAnim(s, 'drip', true);
  if (gulps(s)) { gulp(sc.game, s, bx, by - 16); return; }   // the hungry one's gulp: no bucket, no +1
  s.count++; sc.setTotal(sc.total + 1);
  ringAt(bx, by, 4, 14, UI.cream, 2, 14, true, true);
  floatText(bx, by - 16, PLUS_ONE, UI.cream, 1, true);
  sc.game.audio.play('pond_plonk');
}

// ---------------------------------------------------------------- the old boot: sim
/** The last turn of the reel brings up the boot instead: no count, no pip; the seat plays it out and casts again. */
export function bootUp(sc: PondScreen, s: PondSeat): void {
  s.state = BOOT; s.t = BOOT_FRAMES; s.reel = 0; sc.boots++;
  seatAnim(s, 'pull', true);
  burstDrops(s.fx, s.fy, 6, true); ringAt(s.fx, s.fy, 4, 14, UI.cream, 2, 14, true, true);
}

const MOUTH: Point = { x: 0, y: 0 }, SPOT: Point = { x: 0, y: 0 };
/** One frame of the boot's sequence. */
export function stepBoot(sc: PondScreen, s: PondSeat): void {
  const k = BOOT_FRAMES - --s.t;
  if (k === K_HELD) { s.rig.weapon = null; seatAnim(s, 'bootHold', true); sc.game.audio.play('boot'); }
  else if (k === K_GUSH) { seatAnim(s, 'bootStare', true); sc.game.audio.play('pond_gush'); }
  else if (k === K_HUH) gagBubble(s.x, overHead(s), HUH, s.colour);
  else if (k === K_FLOP) { seatAnim(s, 'bootPeer', true); sc.game.audio.play('pond_flop'); }
  else if (k === K_TOSS) {
    seatAnim(s, 'bootToss', true);
    const p = tinyFishAt(s, BOOT_FLOP, SPOT);
    ringAt(p.x, p.y, 2, 9, UI.cream, 2, 12, true, true); burstDrops(p.x, p.y, 2, true);
  }
  if (k >= K_GUSH && k < K_FLOP) {
    // the torrent lands on the planks (where the last draw left the paw), and once it has pooled, runs off the edge
    const m = bootMouth(s, k, MOUTH), lx = m.x + gushReach(m.y, DECK_Y);
    if (!(k & 1)) particles.burst('drop', lx, DECK_Y, 2, SPLASH_OPTS);
    if (k >= K_GUSH + SPILL_AT && k % 3 === 0) particles.spawn('drop', lx + JIT[k & 7] * 2, DECK_EDGE, SPILL_OPTS);
  }
  if (s.t <= 0) {
    ringAt(s.tx, s.sy, 4, 22, UI.cream, 2, 16, true, true); burstDrops(s.tx, s.sy, 8, true);
    gagBurst(s.tx + CARD_DX, s.sy - CARD_UP, SPLOSH, s.colour);
    sc.game.audio.play('splash');
    sc.rest(s);
  }
}

/** How far over the held boot is turned on frame `k`: eased over BOOT_TIP, then held, shaken on every glug of the torrent. */
function tiltAt(k: number): number {
  if (k < K_HELD) return 0;
  if (k < K_GUSH) { const u = (k - K_HELD) / BOOT_TIP; return TIP_ANGLE * u * (2 - u); }
  if (k < K_FLOP && (k >> 2) & 1) return TIP_ANGLE + GLUG_TILT;
  return TIP_ANGLE;
}

/** The boot's mouth on frame `k` of the hold: the paw (as the last draw read it) plus BOOT_MOUTH turned by the tilt. */
function bootMouth(s: PondSeat, k: number, out: Point): Point {
  const a = tiltAt(k), c = Math.cos(a), sn = Math.sin(a);
  out.x = s.paw.x + BOOT_MOUTH.x * c - BOOT_MOUTH.y * sn; out.y = s.paw.y + BOOT_MOUTH.x * sn + BOOT_MOUTH.y * c;
  return out;
}

/** Where the tiny fish is `j` frames into its flops: out of the mouth onto the planks, a hop along them, and off the edge into the pond. */
function tinyFishAt(s: PondSeat, j: number, out: Point): Point {
  const m = bootMouth(s, K_FLOP, out), x0 = m.x, y0 = m.y, y1 = DECK_Y - 3, y2 = DECK_Y + 2, y3 = DECK_EDGE + FLOP_DY;
  if (j < FLOP_A) { const u = j / FLOP_A; out.x = x0 + u * FLOP_X1; out.y = y0 + (y1 - y0) * u * u; return out; }
  if (j < FLOP_B) {
    const u = (j - FLOP_A) / (FLOP_B - FLOP_A);
    out.x = x0 + FLOP_X1 + u * (FLOP_X2 - FLOP_X1); out.y = y1 + (y2 - y1) * u - 4 * u * (1 - u) * FLOP_HOP;
    return out;
  }
  const u = Math.min(1, (j - FLOP_B) / (BOOT_FLOP - FLOP_B));
  out.x = x0 + FLOP_X2 + u * (FLOP_DX - FLOP_X2); out.y = y2 + (y3 - y2) * u - 2 * u * (1 - u) * FLOP_HOP;
  return out;
}

// ---------------------------------------------------------------- drawing
/** True while a seat in the big one's sequence is off its spot (in the air, under the water, or climbing out): no contact shadow. */
export function offDeck(s: PondSeat): boolean { return s.state === BIG && BIG_FRAMES - s.t < K_STAND; }

/** The rod's bend for a seat reeling a big one on this frame (`tug` while a tap's tug is still on it). */
export function reelBend(s: PondSeat, f: number): number {
  return BEND_BASE + s.reel * BEND_STEP + (s.t > 0 ? BEND_TUG : 0) + ((f >> 2) & 1);
}
/** The big one's float zips side to side: its x offset on frame `f` (a triangle wave). It rides ZIP_SINK rows lower too. */
export function zipX(f: number): number { const p = (f / ZIP_RATE) % 4; return R((p < 2 ? p - 1 : 3 - p) * ZIP); }
/** A zipping float throws a little spray every ZIP_SPLASH frames (cosmetic, from update). */
export function zipSpray(s: PondSeat, frame: number): void { if (frame % ZIP_SPLASH === 0) burstDrops(s.fx, s.fy, 1, true); }

const CROWN: Point = { x: 0, y: 0 }, HEAD: Point = { x: 0, y: 0 }, NECK: Point = { x: 0, y: 0 };

/**
 * What lies on the water and the planks under a seat's joke, drawn before the crew: the big one's shadow circling
 * under a waiting float (round a flattened ring, nose the way it swims), the bubbles where the big one's critter
 * went in, and the boot's puddle growing on the planks and draining away.
 */
export function drawUnder(ctx: CanvasRenderingContext2D, s: PondSeat, waiting: boolean, f: number): void {
  if (waiting) {
    if (!s.big) return;
    const a = f * SHADOW_RATE + s.slot * SHADOW_PHASE, sn = Math.sin(a);
    drawFishShadow(ctx, R(s.fx + Math.cos(a) * SHADOW_RX), R(s.fy + SHADOW_DY + sn * SHADOW_RY), sn > 0 ? -1 : 1);
    return;
  }
  if (s.state === BIG) {
    const k = BIG_FRAMES - s.t;
    if (k >= K_SPLASH && k < K_UP) drawBubbles(ctx, s.fx, s.fy - 2, k - K_SPLASH);
    return;
  }
  if (s.state === BOOT) {
    const k = BOOT_FRAMES - s.t;
    if (k < K_GUSH) return;
    const m = bootMouth(s, k, MOUTH), lx = R(m.x + gushReach(m.y, DECK_Y));
    const rx = k < K_FLOP ? (PUDDLE_RX * (k - K_GUSH)) / BOOT_GUSH : (PUDDLE_RX * (BOOT_FRAMES - k)) / (BOOT_FRAMES - K_FLOP);
    drawPuddle(ctx, lx, DECK_Y, R(rx));
  }
}

/**
 * A seat in the big one's sequence, in its place in the crew's pass (the screen has drawn its bucket): flying along
 * the line with the rod bent double, gone under, climbing out (cut at the waterline in front of the deck), and
 * stood on its spot pond-green with the lily pad and the frog on its head and the fish in its paw - then the fish
 * dropping into the bucket, and the pad and the frog hopping back into the pond as it shakes.
 */
export function drawBigSeat(ctx: CanvasRenderingContext2D, sc: PondScreen, s: PondSeat, f: number): void {
  const k = BIG_FRAMES - s.t, rig = s.rig, o = s.opts, h = rig.height * rig.scale;
  o.facing = 1;
  if (k < K_SPLASH) {
    // the flight: the body's middle rides an arc from where the drag left it to the float, tipping as it goes
    const i = R((k * (PARA_N - 1)) / (BIG_FLY - 1)), mid = R(h * BODY_MID);
    const x0 = s.x + dragX(s.reel), y0 = s.y + dragY(s.reel) - mid;
    const cx = x0 + (s.fx - x0) * PARA_T[i], cy = y0 + (s.fy - y0) * PARA_T[i] - PARA_H[i] * YANK_LIFT;
    const th = s.player.pose.root.rot * DEG;
    o.x = R(cx - mid * Math.sin(th)); o.y = R(cy + mid * Math.cos(th));
    rig.rodBend = FLY_BEND;
    drawRig(ctx, rig, s.player.pose, o);
    bentTip(rig, s.tip);
    drawLine(ctx, R(s.tip.x), R(s.tip.y), s.fx, s.fy);
    return;
  }
  if (k < K_UP) return;
  const climbing = k < K_STAND, coated = k < K_CLEAN;
  o.x = s.x; o.y = climbing ? climbFeet(s, k - K_UP, h) : s.y;
  if (climbing) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VIEW_W, CLIP_Y); ctx.clip(); }
  if (coated) coat(rig, COAT.pond);
  drawRig(ctx, rig, s.player.pose, o);
  if (coated) coat(rig, null);
  jointScreen(rig, 'handN', s.paw);
  crownOf(s, CROWN);
  if (k < K_SHAKE) drawLilyHat(ctx, R(CROWN.x), R(CROWN.y), Math.atan2(HEAD.x - NECK.x, NECK.y - HEAD.y), k >= K_RIBBIT && k < K_RIBBIT + PUFF_FRAMES);
  if (k < K_FISH) drawHeldFish(ctx, sc, s.paw.x, s.paw.y, Math.sin(f * SWING_RATE) * SWING);
  if (climbing) ctx.restore();
  if (k >= K_FISH && k < K_LAND) drawDroppingFish(ctx, sc, s, k - K_FISH);
  if (k >= K_SHAKE && k < K_PAD) {
    // the pad and the frog go back in the pond: off the shaking crown, onto the water in front of the deck
    const j = k - K_SHAKE, i = R((j * (PARA_N - 1)) / (PAD_HOP - 1));
    const x0 = CROWN.x, y0 = CROWN.y, x1 = s.x + PAD_DX, y1 = DECK_EDGE + PAD_DY;
    drawLilyHat(ctx, R(x0 + (x1 - x0) * PARA_T[i]), R(y0 + (y1 - y0) * PARA_T[i] - PARA_H[i] * PAD_LIFT), j * PAD_SPIN, false);
  }
}

/** True while the big one's critter is under the water: the screen draws no name plate over the empty spot. */
export function submerged(s: PondSeat): boolean { const k = BIG_FRAMES - s.t; return s.state === BIG && k >= K_SPLASH && k < K_UP; }

/** The climb: the feet's row on frame `j` of it - the head breaks the surface, hangs on the lip, and hauls up. */
function climbFeet(s: PondSeat, j: number, h: number): number {
  const deep = CLIP_Y + h + 2, hang = CLIP_Y + R(h * CLIMB_SHOW);
  if (j < CLIMB_POP) return R(deep + ((hang - deep) * j) / CLIMB_POP);
  if (j < CLIMB_HANG) return hang;
  const u = (j - CLIMB_HANG) / (BIG_CLIMB - CLIMB_HANG), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
  return R(hang + (s.y - hang) * e);
}

/** The crown of the head on screen after the last drawRig (head and neck joints into HEAD/NECK, the crown into `out`). */
function crownOf(s: PondSeat, out: Point): Point {
  const rig = s.rig;
  jointScreen(rig, 'head', HEAD); jointScreen(rig, 'neck', NECK);
  const ux = HEAD.x - NECK.x, uy = HEAD.y - NECK.y, len = Math.sqrt(ux * ux + uy * uy) || 1, r = rig.p.headR * rig.scale;
  out.x = HEAD.x + (ux / len) * r; out.y = HEAD.y + (uy / len) * r;
  return out;
}

/** The big one held up by its tail from the paw at (x, y), hanging nose down with a swing; the catch's glyph at BIG_GLYPH on a visit that is not trout. */
function drawHeldFish(ctx: CanvasRenderingContext2D, sc: PondScreen, x: number, y: number, swing: number): void {
  if (sc.ing !== 'fish') { drawFood(ctx, sc.icon, R(x), R(y) + BIG_GLYPH, BIG_GLYPH, sc.hex); return; }
  drawBigTrout(ctx, R(x - Math.sin(swing) * HANG), R(y + Math.cos(swing) * HANG), swing - Math.PI / 2);
}

/** The fish let go: it drops from the paw into the bucket over FISH_HOP frames, cut at the rim so it goes IN. */
function drawDroppingFish(ctx: CanvasRenderingContext2D, sc: PondScreen, s: PondSeat, j: number): void {
  const bx = s.x + BUCKET_DX + BUCKET_MID, rim = s.y - BUCKET_TOP, u = j / FISH_HOP;
  const x = s.paw.x + (bx - s.paw.x) * u, y = s.paw.y + (rim + 4 - s.paw.y) * u * u;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VIEW_W, rim); ctx.clip();
  drawHeldFish(ctx, sc, x, y, 0);
  ctx.restore();
}

/** The line on the boot's way up: from the rod's tip to the boot, which leads it. */
export function drawBootLine(ctx: CanvasRenderingContext2D, s: PondSeat, tx: number, ty: number): void {
  if (BOOT_FRAMES - s.t >= BOOT_ARC) return;
  const b = bootPoint(s);
  if (b) drawLine(ctx, tx, ty, b.x - 4, b.y - 8);
}

const BOOT_P: Point = { x: 0, y: 0 };
/** Where the boot is on this frame, or null once it is lobbed: up the line on the cast's parabola, then in the paw. */
function bootPoint(s: PondSeat): Point | null {
  const k = BOOT_FRAMES - s.t;
  if (k < BOOT_ARC) {
    const i = R((k * (PARA_N - 1)) / (BOOT_ARC - 1));
    BOOT_P.x = R(s.fx + (s.paw.x - s.fx) * PARA_T[i]);
    BOOT_P.y = R(s.fy + (s.paw.y - s.fy) * PARA_T[i]) - R(PARA_H[i] * CATCH_LIFT);
    return BOOT_P;
  }
  if (k < K_TOSS) { BOOT_P.x = R(s.paw.x); BOOT_P.y = R(s.paw.y); return BOOT_P; }
  return null;
}

/**
 * The boot, over the crew: up the line to the paw, turned over there with the torrent coming out of it and then the
 * tiny fish, and lobbed back on a lower arc to the water, tumbling.
 */
export function drawBootFlight(ctx: CanvasRenderingContext2D, s: PondSeat, f: number): void {
  const k = BOOT_FRAMES - s.t, p = bootPoint(s);
  if (p) {
    if (k >= K_GUSH && k < K_FLOP) { const m = bootMouth(s, k, MOUTH); drawGush(ctx, R(m.x), R(m.y), DECK_Y, f); }
    drawBoot(ctx, p.x, p.y, tiltAt(k));
    if (k >= K_FLOP) { const j = k - K_FLOP, q = tinyFishAt(s, j, SPOT); drawTinyFish(ctx, R(q.x), R(q.y), (j >> 1) & 1 ? 1 : -1); }
    return;
  }
  const j = k - K_TOSS, i = R((j * (PARA_N - 1)) / (BOOT_TOSS - 1));
  const x = R(s.paw.x + (s.tx - s.paw.x) * PARA_T[i]), y = R(s.paw.y + (s.sy - s.paw.y) * PARA_T[i]) - R(PARA_H[i] * TOSS_LIFT);
  drawBoot(ctx, x, y, TIP_ANGLE + j * TUMBLE);
}

/**
 * The boot's tell: a float snagged on something that is not swimming lies still and leans over, SNAG_TILT radians
 * about its waterline, instead of riding the bob. The line runs to it as to any float.
 */
const SNAG_TILT = 0.45;
export function drawSnaggedFloat(ctx: CanvasRenderingContext2D, s: PondSeat, tx: number, ty: number): void {
  drawLine(ctx, tx, ty, s.fx - 2, s.fy - 4);
  ctx.save(); ctx.translate(s.fx, s.fy + 5); ctx.rotate(SNAG_TILT); ctx.translate(-s.fx, -s.fy - 5);
  drawFloat(ctx, s.fx, s.fy, s.slot, true, false);
  ctx.restore();
}
