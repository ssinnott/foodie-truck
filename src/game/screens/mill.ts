// MILL - FILL (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Mill", section 7). Inside Windle Mill's timber
// tower, one floor under the grindstone: four chutes hang out of the bressummer beam, each one wakes on a seeded
// timer (TELEGRAPH frames of a strobing mouth, a puff of dust, a 1 px shake), then pours for POUR_FRAMES with the
// scene's gold at its mouth for every one of them. Every seat runs left and right along the plank floor on its own
// depth lane with an empty sack in its paw; standing under a pouring chute with `action` HELD fills that sack, and
// letting go decides what it was worth:
//   released at or over the brim  -> tied off: +1 flour, the sack hops onto the barrow, a ring and a '+1'
//   released under the brim       -> kept, part full, to be topped up at the next chute (this is the co-op bit)
//   held past BURST               -> the sack goes up in a cloud of flour, the critter is whitened for a few frames
//                                    and one BANKED sack goes with it, the same cost the orchard's wormy apple charges
// The round ends when the party's total reaches the order's amount or the 40-second clock runs out; the FLOUR sign
// drops, is held, then run.gather('flour') and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the chutes and the seats are fixed pools of plain sim objects, the
// only randomness is `rng` inside update() (the wake timer and which spout takes it), input is read by seat slot
// only, and the one place trig touches simulation state is the sack offsets built ONCE in enter() through
// engine/trig.js. The motes in the light shaft, the dust puffs, the flour clouds, the hops, the rings and the
// float text are cosmetic pools and stay out of checksumFields(). The spur wheel overhead and the sail past the
// window turn on an index step read from `this.frame` in draw() and touch nothing.
import { UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng, makeRng } from '../../lib/engine/rng.ts';
import type { RngInstance } from '../../lib/engine/rng.ts';
import { dsin, dcos } from '../../lib/engine/trig.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt, VIEW_W } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig } from '../../lib/art/rig.ts';
import type { Rig, RigWeapon } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F } from '../../content/critters/common.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { MILL, ROWS, CHUTE_X, CHUTE_PITCH, SHAFT, millLayers } from '../../art/backgrounds/mill.ts';
import {
  MILL_SACK, DORMANT, WAKING, POURING, TAG_W, TAG_H,
  drawChute, drawPour, drawPile, drawBarrow, drawTiedSack, drawFillTag, drawBurstCloud, drawGear, drawSail, BURST_STEPS,
} from '../../art/millProps.ts';
import {
  makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates,
} from '../minigame.ts';
import type { Clock, PlateStack, Seat } from '../minigame.ts';
import { drawHint } from '../ui.ts';

const R = Math.round, DEG = Math.PI / 180;

// ---------------------------------------------------------------- the numbers
/**
 * Movement. 2.4 px/frame is a step up on the orchard's 2.2 and the coop's 2.0, and the step is bought by the walk
 * this scene actually asks for: CHUTE_PITCH is 140 px, and taking CATCH_HALF off each end leaves a 104 px run
 * between two catch zones. At 2.4 that is 44 frames; TELEGRAPH covers 24 of them, so a player who leaves the
 * moment a spout lights arrives 20 frames into a 110-frame pour with 90 frames left and a full sack costs 54.
 * At 2.2 the same walk is 48 frames, which still works but leaves no room for a player who starts a beat late.
 * The clamp is symmetric, 34 px in from each wall: a whole body stays on the boards and inside the end posts
 * (backgrounds/mill.js POST_X 30 and 610). Neither end is dead floor - the mill's own stock is piled at the left
 * and the party's cart is parked at the right (BARROW_X 574) - but both stand above the walk band, so a seat walks
 * in front of them rather than into them.
 */
const SPEED = 2.4, X_MIN = 34, X_MAX = 606;
/**
 * Seat i stands at LANE_Y0 - i * LANE_GAP: P1 at the front, four depth lanes 8 px apart - the spacing every other
 * lane screen uses (orchard.js, hive.js, garden.js). Converged on one spout the front body still covers most of the
 * one behind it; what the lanes buy is that the four are ORDERED (draw back to front, so the overlap reads as depth)
 * and that their name plates start on four different rows instead of one. LANE_Y0 is ROWS.feet 324, which is what
 * puts the BACK lane's feet on row 300, the row the whole backdrop's clear-air budget is pinned to.
 */
const LANE_Y0 = ROWS.feet, LANE_GAP = 8;
/**
 * The chutes. At most POUR_MAX are awake at once so a solo player is never asked to be in two places, and a wake
 * lands every 70..130 frames (mean 100). A wake costs a chute TELEGRAPH + POUR_FRAMES = 134 frames of its life, so
 * over a 2400-frame round the two slots offer 4800 chute-frames against the ~24 wakes the timer asks for: the cap
 * is what shapes the round, not the timer, and the room never fills with gold.
 */
const POUR_MAX = 2, TELEGRAPH = 24, POUR_FRAMES = 110, WAKE_MIN = 70, WAKE_MAX = 130;
/**
 * Measured headless over seeds 1/7/23/99, one seat, a bot that walks to the nearest awake spout and lets go at the
 * brim: a SOLO party banks the fallback target of 3 in 480..658 frames of the 2400, on 5..7 wakes. The same bot told
 * to camp under one spout and never walk banks 3 in 650..1451 frames. Both numbers are the tuning. Walking is worth
 * two to three times camping, so moving is plainly the better play; camping still finishes inside the round, so a
 * player who has not worked that out is never locked out of a cozy game's ingredient. A four-seat party shares the
 * same 2400 frames and the same two live spouts, which is what keeps a full room co-operative rather than four
 * people racing each other.
 */
/** A seat is under a chute within this of its centre: 36 px of standing room, a little wider than a critter. */
const CATCH_HALF = 18;
/**
 * The sack. FILL_RATE is 1/54, so an empty sack takes 54 frames (0.9 s) under a pour - the beat the whole scene is
 * cut to. FULL is the brim; BRIM_BAND is the last 0.35 of a sack (19 frames) where the tag and the sack's own tie
 * turn green; BURST is 1.5, which puts 27 frames between the brim and the bang.
 *
 * 27 frames is the number that makes this the FORGIVING scene: the pond's bite window is 18 frames (GDD section 5)
 * and missing it costs nothing, while missing this one costs a banked sack, so the window has to be wider than the
 * tightest one the game already asks for, not narrower. 1.25 was tried first (the brief's suggestion) and gives 13
 * frames - under the pond's window, for a harsher penalty, on a scene whose job is to be co-operative.
 */
const FILL_RATE = 1 / 54, FULL = 1, BRIM_BAND = 0.35, BURST = 1.5;
const BRIM_AT = FULL - BRIM_BAND;
/** The tie beat (18 frames of the `tie` anim) and the frame of it the sack leaves the paw on. */
const TIE_FRAMES = 18, TIE_TOSS = 9;
/** The burst: the shared bump (4/10/6 frames), and the first 8 of them with the critter whitened by rig.override. */
const BUMP_FRAMES = 21, WHITE_FRAMES = 8;
/** Flour on a critter: the rig's existing flash path, so the whole cast gets the beat for free (ART_STYLE section 3). */
const WHITENED = '#EFE6D2';
/** How far below the near paw the sack's neck hangs, in root space (MILL_SACK's tie band runs y 3..16). */
const SACK_DROP = 8;
/**
 * The cart the party's tied sacks land on, parked in the corner by the sack stack at the right end of the floor.
 *
 * It was at 440 first (its shafts came out of a filling critter's chest) and then dead centre at 320, which is worse
 * than it sounds: 320 is where a solo party and the middle of a three-seat party START, so the one prop that shows
 * the party's score spent the opening frame entirely behind the one critter. Every chute x and every party's
 * opening layout is drawn from CHUTE_X, so the corner is the only place on this floor that is never a starting
 * spot; it is also where the mill's own sacks already are, which is where a full one would actually go.
 */
const BARROW_X = 574, BARROW_Y = ROWS.pile;
/**
 * The row the seats' paper stops at, and how far a tag steps sideways when it will not fit under it.
 *
 * The fill tag is the gauge a player reads to tell "nearly full" from "about to burst", so it is stacked over
 * everything else in the frame - but four seats converged on one spout is the NORMAL shape of this room (POUR_MAX
 * is 2), and four name plates and four tags in one column are a 108 px tower. Left free to climb it lands on the
 * chute the player is standing under: measured, four seats at x 530 covered rows 139..245, which is the hopper, the
 * hoops, the lip, the mouth, the shake and the warning dust - the whole telegraph the player is there to read.
 * Rows above TAG_CEIL belong to the spouts: a chute's lowest ink is ROWS.mouth + 2 = 172 and its warning dust falls
 * out at + 6, so a box that starts at 190 keeps 18 rows of clear air under it. A tag that cannot fit under the
 * ceiling steps SIDEWAYS a tag-width at a time instead of climbing, and its slot-colour tab says whose it is.
 */
const TAG_CEIL = ROWS.mouth + 20, TAG_STEP = TAG_W + 4, TAG_EDGE = 2;
/** Cosmetic pools: the tied sack's hop to the barrow, and the burst cloud. */
const MAX_HOPS = 4, HOP_FRAMES = 20, HOP_LIFT = 30, MAX_CLOUDS = 4, CLOUD_FRAMES = BURST_STEPS * 4;
/** The motes hanging in the shaft: a cosmetic stream off the mill's own seed block, about 20 in the air at once. */
const MOTE_SEED = 184, MOTE_EVERY = 7;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', MINUS_ONE = '-1', TITLE = 'WINDLE MILL', SIGN_PREFIX = 'FLOUR: ';
const FLOUR_HEX = INGREDIENTS.flour.hex;

/**
 * The two beats this scene owns, as an AnimPlayer overlay on the shared table (content/critters/common.js is not
 * ours to touch). Everything else is the shared `carry`, `carryWalk`, `bump`, `cheer` and `sad`.
 *
 * `fill` is NOT the shared `reach`: reach raises the near arm to 112-118 degrees, which would swing the sack - the
 * one thing the player is reading - up beside the muzzle and put it behind the head at the exact moment its level
 * matters (ART_STYLE 0.7). Here the near arm goes OUT at 78, a step past `carry`'s 60, so the sack hangs clear of
 * the hip at chest height with the apron open beside it, and the head tips back 12 degrees to look up the spout.
 * The far arm stays down at the far side, so both paws read.
 */
const FILL_POSE = { torso: -2, upper: 78, lower: 52 };
const MILL_ANIMS = Object.freeze({
  fill: { loop: true, frames: [
    F(24, { armR: [78, 52], armL: [-18, 8], weapon: 90, torso: -2, head: -12, root: [0, 0], face: 'grit' }),
    F(24, { armR: [82, 54], armL: [-16, 10], weapon: 90, torso: -4, head: -14, root: [0, -1], face: 'grit' }),
  ] },
  // tie: heft the full sack up on the near arm (the far arm goes up BACKWARD, behind the head, so nothing crosses
  // the apron), then a smeared toss toward the barrow, then settle onto the carry stance with a fresh empty sack.
  tie: { loop: false, frames: [
    F(5, { armR: [104, 24], armL: [-140, -16], weapon: 40, torso: -6, head: -8, root: [0, -1], stretch: 1.03, face: 'shout' }, { ease: 'in' }),
    F(4, { armR: [132, 8], armL: [-152, -12], weapon: -20, torso: -10, head: -12, root: [0, -2], stretch: 1.06, face: 'happy' }, { ease: 'overshoot', smear: { from: 50, to: 150, a: 0.35 } }),
    F(9, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, root: [0, 1], squash: 1.04, face: 'happy' }, { ease: 'inout' }),
  ] },
});

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { drawFood(ctx, 'sack', x, y, 4, FLOUR_HEX); }

/** Reused by pawRoot so the sack-offset maths allocates nothing (it runs once per seat, in enter()). */
const PAW: Point = { x: 0, y: 0 };
/**
 * Root-space position of the near paw for a torso lean and arm angles (degrees), through the deterministic trig so
 * the offset is bit-identical on every peer. y is down-positive with the feet at 0, so the paw's y is negative.
 *
 * This is the orchard's helper, copied rather than shared: game/minigame.js is frozen furniture (its own header
 * says so) and the orchard's copy lives in the orchard because the coop does not catch anything. The mill is the
 * third screen to want it; when a fourth does, that is the integrator's cue to promote it, not ours.
 */
function pawRoot(rig: Rig, torsoRot: number, upper: number, lower: number): Point {
  const p = rig.p, hipY = rig.hipY;
  const c = dcos(torsoRot * DEG), s = dsin(torsoRot * DEG), shY = -(p.torsoH - 5);
  const sx = p.shoulderX * c - shY * s, sy = hipY + p.shoulderX * s + shY * c;
  const u = (torsoRot + upper) * DEG, l = (torsoRot + upper + lower) * DEG;
  const ex = sx + dsin(u) * p.upperArm, ey = sy + dcos(u) * p.upperArm;
  const wx = ex + dsin(l) * p.lowerArm, wy = ey + dcos(l) * p.lowerArm;
  PAW.x = wx + dsin(l) * p.handR * 0.6; PAW.y = wy + dcos(l) * p.handR * 0.6;
  return PAW;
}

/**
 * Climb `y` until the box clears every rect already in `stack` - the same walk game/minigame.js drawSeatPlate does,
 * over a stack of our own that is big enough for a plate AND a tag per seat (the shared PLATES holds four rects,
 * which is exactly the four name plates). Nothing a player has to read is allowed to land on anything else a player
 * has to read. It does NOT register the box: the caller decides whether the row it landed on is allowed.
 */
function climb(stack: PlateStack, x: number, y: number, w: number, h: number): number {
  const v = stack.v;
  for (let pass = 0; pass < 6; pass++) {
    let hit = false;
    for (let i = 0; i < stack.n; i++) {
      const k = i * 4;
      if (x < v[k] + v[k + 2] && x + w > v[k] && y < v[k + 1] + v[k + 3] && y + h > v[k + 1]) { y = v[k + 1] - h - 2; hit = true; }
    }
    if (!hit) break;
  }
  return y;
}

/** Register a box, so everything placed after it climbs over it. */
function push(stack: PlateStack, x: number, y: number, w: number, h: number): void {
  const v = stack.v;
  if (stack.n * 4 < v.length) { const k = stack.n * 4; v[k] = x; v[k + 1] = y; v[k + 2] = w; v[k + 3] = h; stack.n++; }
}

/** Reused by placeTag so the plate pass allocates nothing (draw()). */
const TAG_AT: Point = { x: 0, y: 0 };
/** The columns a tag may sit in, in the order they are tried: its seat's own, then a tag-width either side. */
const TAG_DX = Int16Array.of(0, -TAG_STEP, TAG_STEP, -2 * TAG_STEP, 2 * TAG_STEP);
/**
 * Where one seat's fill tag goes, as {x, y} in TAG_AT: its own column if the climb leaves it under TAG_CEIL, else
 * the next column along. `y0` is the row it would like (just over its own name plate); a tag whose own plate is
 * already at the ceiling starts AT the ceiling and looks sideways from there.
 */
function placeTag(stack: PlateStack, cx: number, y0: number): Point {
  const top = y0 < TAG_CEIL ? TAG_CEIL : y0, xMax = VIEW_W - TAG_W - TAG_EDGE;
  let x = 0, y = 0;
  for (let i = 0; i < TAG_DX.length; i++) {
    x = cx + TAG_DX[i] - (TAG_W >> 1);
    if (x < TAG_EDGE) x = TAG_EDGE; else if (x > xMax) x = xMax;
    y = climb(stack, x, top, TAG_W, TAG_H);
    if (y >= TAG_CEIL) break;
  }
  if (y < TAG_CEIL) y = TAG_CEIL;   // five columns full: sit ON the ceiling rather than climb over a spout
  push(stack, x, y, TAG_W, TAG_H);
  TAG_AT.x = x; TAG_AT.y = y;
  return TAG_AT;
}

/**
 * A seat's rig as this scene hands it round: lib/art/rig.ts's own rig plus the three fields art/millProps.js
 * MILL_SACK reads straight back off the rig it is handed (its header names them). Optional because `buildRig`
 * builds a complete `Rig` without them - a rig carries a sack's fill only while its owner is on this floor.
 */
export interface MillRig extends Rig {
  /** 0..BURST, the raw fill of the sack in the paw. */
  sackFill?: number;
  /** 0 under the brim band | 1 in the brim band | 2 over the brim, about to burst. */
  sackZone?: number;
  /** 0/1, the strobe the screen alternates while zone 2 is on. */
  sackBlink?: number;
}

/**
 * One seat working the floor: game/minigame.ts's shared seat plus this scene's own sack state. These are the extra
 * fields `Seat` documents a screen keeping more per seat should declare for itself, and `makeSeats` is generic so
 * enter() gets them back typed.
 */
export interface MillSeat extends Seat {
  /** The rig, carrying the mill sack whose fill this screen pushes on just before it draws. */
  rig: MillRig;
  /** The sack in the paw, 0..BURST: FULL is the brim and BURST is the bang. */
  fill: number;
  /** `action` last frame, so the release is the edge between the two (see updateSeats). */
  wasHeld: boolean;
  /** Index into `chutes` of the spout this seat is filling from, -1 when it is filling from none. */
  chute: number;
  /** Frames left of the tie beat; 0 when the stick is live again. */
  tieT: number;
  /** Frames left of the whitening a burst leaves on the critter (rig.override). */
  whiteT: number;
  /** Where this critter's sack neck hangs, in screen px from its feet: built ONCE in enter() from its own rig. */
  sackDX: number;
  sackDY: number;
}

/** One of the four spouts: a slot of the fixed pool enter() builds and never grows. */
export interface Chute {
  /** DORMANT, WAKING or POURING (art/millProps.js). */
  state: number;
  /** Frames left of the telegraph (WAKING) or of the pour (POURING); 0 when DORMANT. */
  t: number;
  /** Party index of the seat catching this pour, -1 when it is falling on the planks. Refilled every frame. */
  seat: number;
}

/** A tied sack's hop from the paw onto the barrow. Cosmetic: a fixed pool, out of the checksum. */
export interface Hop {
  /** Frames since the tie started it; NEGATIVE through the heft, HOP_FRAMES means the slot is spent. */
  t: number;
  /** Where it left the paw. */
  x0: number;
  y0: number;
  /** The tier's player slot, which is the tie band's colour on the sack in the air. */
  slot: number;
}

/** The cloud a burst sack leaves. Cosmetic. */
export interface BurstCloud {
  /** Frames since it went up; CLOUD_FRAMES means it is gone. */
  t: number;
  /** Where the sack was. */
  x: number;
  y: number;
}

/**
 * The fill tag's gauge, built once in enter() and handed to art/millProps.js drawFillTag every frame: fractions of
 * the trough, and the fill its full width stands for.
 */
export interface TagZones {
  /** Where the brim band starts, as a fraction of the trough. */
  brim: number;
  /** Where the brim post stands, as a fraction of the trough. */
  full: number;
  /** The fill the whole trough stands for (BURST). */
  cap: number;
}

/**
 * One pre-rendered backdrop layer and the y the screen blits it at (art/backgrounds/mill.js millLayers). `L` is
 * exactly what art/layers.js `makeLayer` hands back; stated here rather than imported because art/layers.js is
 * still untyped, the same way game/screens/garden.ts states its own. When its turn comes this becomes an import.
 */
export interface MillLayer {
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  /** Screen y the layer is blitted at. */
  y: number;
}

/** The tower's inside, painted once: the far wall, the plank floor and the ceiling boards, blitted in this order. */
export interface MillBackdrop {
  wall: MillLayer;
  floor: MillLayer;
  beam: MillLayer;
}

export class MillScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations, for the reason game/game.ts states over its own block: a plain field declaration emits a
  // class field per name (es2022 defines them before the constructor body runs, and a screen's own declaration
  // would also define a base field back to undefined), which would wipe what the constructor has just written.
  // `declare` erases under tsc, under esbuild and under Node's type stripping alike, so the emitted class is the
  // one that shipped.

  /** One seat per party member, in party order (not slot order). */
  declare seats: MillSeat[];
  /** The four spouts, one slot per CHUTE_X, built in enter() and never grown. */
  declare chutes: Chute[];
  /** The backdrop, pre-rendered once (art/backgrounds/mill.js millLayers) and blitted per frame. */
  declare layers: MillBackdrop;
  /** The cosmetic stream's own generator (MOTE_SEED): the motes in the light shaft only, never the sim. */
  declare vis: RngInstance;
  /** The mote spawn options, built once in enter() and handed to particles.spawn every MOTE_EVERY frames. */
  declare moteOpts: { color: string; size: number; life: number; vx: number; vy: number; gravity: number; drag: number; screen: boolean };
  /** The burst options for the dust a waking spout coughs out (engine/particles.js `burst`). */
  declare puffOpts: { speed: number; up: number; color: string; gravity: number; screen: boolean };
  /** The burst options for the flour a bursting sack throws. */
  declare burstOpts: { speed: number; up: number; color: string; sizeJitter: number; screen: boolean };
  /** The fill tag's gauge, built once and read by every drawFillTag. */
  declare zones: TagZones;
  /** Frames until the room's one wake timer hands its turn to a free spout (WAKE_MIN..WAKE_MAX). */
  declare wake: number;
  /** The tied sacks in the air: a fixed cosmetic pool, oldest slot reused first. */
  declare hops: Hop[];
  /** Next slot of `hops` to reuse. */
  declare hopCursor: number;
  /** The flour clouds of burst sacks: a fixed cosmetic pool. */
  declare clouds: BurstCloud[];
  /** Next slot of `clouds` to reuse. */
  declare cloudCursor: number;
  /** Sacks burst this round (summary / checksum only). */
  declare bursts: number;
  /** Sacks tied off this round. */
  declare tied: number;
  /** Sacks the round is played to: the order's REMAINDER, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Sacks the party has banked this round (a burst takes one back). */
  declare total: number;
  /** The clock's count, rebuilt by setTotal(): 'total/target'. */
  declare countStr: string;
  /** The hint line under the floor, built once in enter() with the seat's own action key. */
  declare hint: string;
  /** The round clock and its end sign (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The tags' own rect stack, seeded each frame with the four name plates so a tag lands on neither. */
  declare tagStack: PlateStack;

  constructor(game: Game) { super(game, 'mill'); this.seats = []; this.chutes = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = millLayers();
    particles.clear();
    this.vis = makeRng(MOTE_SEED);
    // every options object a per-frame call needs is built HERE and mutated, never in update() or draw()
    this.moteOpts = { color: MILL.flour, size: 2, life: 170, vx: -0.1, vy: 0.12, gravity: 0.003, drag: 1, screen: true };
    this.puffOpts = { speed: 0.7, up: -0.8, color: MILL.dust, gravity: 0.02, screen: true };
    this.burstOpts = { speed: 2.2, up: 1.2, color: MILL.flour, sizeJitter: 2, screen: true };
    // the tag's gauge, in fractions of its trough: where the brim band starts, where the brim post stands, and the fill
    // the whole trough stands for (art/millProps.js drawFillTag)
    this.zones = { brim: BRIM_AT / BURST, full: FULL / BURST, cap: BURST };

    this.seats = makeSeats<MillSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    // A small party keeps the chutes' pitch and slides to the middle of the floor, the way the pond shifts its bank
    // spots. An even party lands ON chutes (two under the middle two, four under all four); an odd one lands midway
    // between them, 70 px - 29 frames' walk - from the two nearest, and the same for every seat. Either way the
    // party is centred and nobody opens the round closer to a spout than anybody else.
    const shift = R((CHUTE_X.length - n) * CHUTE_PITCH / 2);
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = CHUTE_X[i % CHUTE_X.length] + shift;
      // `as RigWeapon`: art/millProps.js is not typed yet, so its `attach: 'handR'` widens to `string` and the
      // literal misses RigWeapon's `attach?: HandName` by that one field. It IS a rig weapon - rig.ts reads exactly
      // these keys back off it - so the assertion says what millProps.js cannot yet (garden.ts carries the same
      // note over its trug).
      s.rig.weapon = MILL_SACK as RigWeapon; s.rig.sackFill = 0; s.rig.sackZone = 0; s.rig.sackBlink = 0;
      s.player.setOverlay(MILL_ANIMS);
      s.fill = 0; s.wasHeld = false; s.chute = -1; s.tieT = 0; s.whiteT = 0; s.count = 0;
      // where this critter's sack neck sits, once, from ITS proportions: the pour column bends to this point and
      // the tie's ring and hop start from it (see the draw pass). Cress's arm is not Barley's.
      const p = pawRoot(s.rig, FILL_POSE.torso, FILL_POSE.upper, FILL_POSE.lower);
      s.sackDX = R(p.x * s.rig.scale); s.sackDY = R((p.y + SACK_DROP) * s.rig.scale);
      seatAnim(s, 'carry');
      // four people standing in a room, not one breath printed four times (pose only: nothing in the checksum)
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }

    this.chutes = [];
    for (let i = 0; i < CHUTE_X.length; i++) this.chutes.push({ state: DORMANT, t: 0, seat: -1 });
    this.wake = TELEGRAPH;
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, slot: 0 });
    this.hopCursor = 0;
    this.clouds = [];
    for (let i = 0; i < MAX_CLOUDS; i++) this.clouds.push({ t: CLOUD_FRAMES, x: 0, y: 0 });
    this.cloudCursor = 0;
    this.bursts = 0; this.tied = 0;

    const need = run ? run.order.needs.find((x) => x.id === 'flour') : null;
    // the remainder, not the whole order: the map may already have banked some (the three shipped scenes agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: ARROWS   FILL: HOLD ' + game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
    this.tagStack = { n: 0, v: new Int16Array(8 * 4) };
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    if (this.frame % MOTE_EVERY === 0) this.spawnMote();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    for (let i = 0; i < this.clouds.length; i++) if (this.clouds[i].t < CLOUD_FRAMES) this.clouds[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateChutes();
      this.updateSeats(input);
      if (this.total >= this.target) this.finish();
    } else {
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('flour', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /** A mote of flour somewhere in the shaft's quad: cosmetic, its own seeded stream, never in the checksum. */
  spawnMote(): void {
    const t = this.vis.next();
    const y = SHAFT.yTop + (SHAFT.yBot - SHAFT.yTop) * t;
    const xa = SHAFT.x0t + (SHAFT.x0b - SHAFT.x0t) * t, xb = SHAFT.x1t + (SHAFT.x1b - SHAFT.x1t) * t;
    particles.spawn('dust', xa + (xb - xa) * this.vis.next(), y, this.moteOpts);
  }

  /**
   * The wake timer and the four spouts. One timer for the room, not one per chute: a per-chute timer with the same
   * mean would drift into four spouts opening together, and POUR_MAX would then spend the round refusing three of
   * them. One timer that hands its turn to a free spout keeps the cadence even however many are busy.
   */
  updateChutes(): void {
    if (--this.wake <= 0) {
      this.wake = rng.int(WAKE_MIN, WAKE_MAX);
      let active = 0;
      for (let i = 0; i < this.chutes.length; i++) if (this.chutes[i].state !== DORMANT) active++;
      if (active < POUR_MAX) {
        const start = rng.int(0, this.chutes.length - 1);
        for (let k = 0; k < this.chutes.length; k++) {
          const c = this.chutes[(start + k) % this.chutes.length];
          if (c.state === DORMANT) { c.state = WAKING; c.t = TELEGRAPH; break; }
        }
      }
    }
    for (let i = 0; i < this.chutes.length; i++) {
      const c = this.chutes[i];
      c.seat = -1;
      if (c.state === WAKING) {
        // the telegraph MOVES as well as lighting up: a puff of dust falling out of the spout every four frames
        if ((c.t & 3) === 0) particles.burst('dust', CHUTE_X[i], ROWS.mouth + 6, 2, this.puffOpts);
        if (--c.t <= 0) { c.state = POURING; c.t = POUR_FRAMES; }
      } else if (c.state === POURING) {
        if (--c.t <= 0) { c.state = DORMANT; c.t = 0; }
      }
    }
  }

  /** Every seat: the beats first (they lock the stick), then the stick, then the hold, the release and the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.whiteT > 0) s.whiteT--;
      if (s.bumpT > 0) { s.bumpT--; s.moving = false; s.chute = -1; s.wasHeld = false; s.player.tick(); continue; }
      if (s.tieT > 0) { s.tieT--; s.moving = false; s.chute = -1; s.wasHeld = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      const held = input.held(s.slot, 'action');
      s.chute = -1;
      if (s.wasHeld && !held) {
        // the release: at or over the brim the sack is tied off, under it the part-fill is KEPT for the next chute
        if (s.fill >= FULL) this.tie(s);
      } else if (held) {
        const c = this.chuteUnder(s.x);
        if (c >= 0 && this.chutes[c].state === POURING) {
          s.chute = c;
          if (this.chutes[c].seat < 0) this.chutes[c].seat = i;
          s.fill += FILL_RATE;
          if (s.fill >= BURST) this.burst(s);
        }
      }
      s.wasHeld = held;
      if (s.tieT === 0 && s.bumpT === 0) seatAnim(s, s.chute >= 0 ? 'fill' : s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** The chute a seat at `x` is standing under, or -1. */
  chuteUnder(x: number): number {
    for (let i = 0; i < CHUTE_X.length; i++) { const d = x - CHUTE_X[i]; if (d > -CATCH_HALF && d < CATCH_HALF) return i; }
    return -1;
  }

  /** Tied off at the brim: +1 flour, the sack leaves the paw on the toss key and hops onto the barrow. */
  tie(s: MillSeat): void {
    s.count++; this.setTotal(this.total + 1); this.tied++;
    s.fill = 0; s.tieT = TIE_FRAMES; s.moving = false;
    seatAnim(s, 'tie', true);
    const mx = R(s.x + s.facing * s.sackDX), my = R(s.y + s.sackDY);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    // the hop is started NEGATIVE so it is still counting up to 0 through the heft: the sack leaves the paw on the
    // toss key, not on the frame the count ticked over
    h.t = -(TIE_FRAMES - TIE_TOSS); h.x0 = mx; h.y0 = my; h.slot = s.slot;
    ringAt(mx, my, 4, 16, UI.cream, 2, 14, false, true);
    floatText(mx, my - 26, PLUS_ONE, s.colour, 1, true);
  }

  /**
   * Held past the brim: the sack goes. The whole part-fill is lost AND one banked sack with it when there is one -
   * the orchard's wormy apple charges exactly that, and a failure that only cost the part-fill would make holding
   * the button down forever the correct play.
   */
  burst(s: MillSeat): void {
    s.fill = 0; s.chute = -1;
    s.bumpT = BUMP_FRAMES; s.whiteT = WHITE_FRAMES; s.moving = false;
    seatAnim(s, 'bump', true);
    this.bursts++;
    const mx = R(s.x + s.facing * s.sackDX), my = R(s.y + s.sackDY);
    const c = this.clouds[this.cloudCursor]; this.cloudCursor = (this.cloudCursor + 1) % this.clouds.length;
    c.t = 0; c.x = mx; c.y = my;
    particles.burst('steam', mx, my, 14, this.burstOpts);
    ringAt(mx, my, 4, 24, UI.cream, 2, 16, false, true);
    if (s.count > 0) { s.count--; this.setTotal(this.total - 1); floatText(s.x - s.facing * 14, my - 34, MINUS_ONE, s.colour, 1, true); }
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat that tied a sack cheers, one that never did sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.moving = false; s.bumpT = 0; s.tieT = 0; s.whiteT = 0; s.chute = -1;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.wall.L, 0, L.wall.y);
    drawSail(ctx, f);                                   // clipped to the window's opening
    drawGear(ctx, f);                                   // the spur wheel and the stone nut, one index step per 3 frames
    blitAt(ctx, L.floor.L, 0, L.floor.y);
    this.drawChutes(ctx, f);
    particles.draw(ctx, null, 'back');                  // the motes in the shaft and the spouts' warning dust
    // ground contact first, then the barrow (it stands behind every lane), then the lanes back to front
    let flying = 0;
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) flying++;
    drawShadow(ctx, BARROW_X, BARROW_Y, 40, 0.34, 0);
    drawBarrow(ctx, BARROW_X, BARROW_Y, this.total - flying);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i], f);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    for (let i = 0; i < this.clouds.length; i++) { const c = this.clouds[i]; if (c.t < CLOUD_FRAMES) drawBurstCloud(ctx, c.x, c.y, c.t); }
    particles.draw(ctx, null, 'front');
    blitAt(ctx, L.beam.L, 0, L.beam.y);                 // the ceiling boards: the gear's teeth run up into them
    this.drawPlates(ctx);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /**
   * The four spouts, the flour falling out of the awake ones, and the heap an uncaught pour builds on the planks.
   *
   * The column is drawn FIRST and the spout over it, so the flour comes out from under the lip and the gold mouth -
   * the one mark in the frame that says which chute is live - is never crossed by the column's own 2 px ink.
   */
  drawChutes(ctx: CanvasRenderingContext2D, f: number): void {
    for (let i = 0; i < this.chutes.length; i++) {
      const c = this.chutes[i], x = CHUTE_X[i];
      if (c.state === POURING) {
        const age = POUR_FRAMES - c.t, k = age < 10 ? age / 10 : 1;
        if (c.seat >= 0) {
          const s = this.seats[c.seat];
          drawPour(ctx, x, ROWS.mouth, R(s.x + s.facing * s.sackDX), R(s.y + s.sackDY), f, k);
        } else {
          drawPour(ctx, x, ROWS.mouth, x, ROWS.pile, f, k);
          drawPile(ctx, x, ROWS.pile, age / POUR_FRAMES);
        }
      }
      // the shake is on ALTERNATE frames and only through the telegraph; the mouth strobes on a slower beat so the
      // two warnings do not read as one flicker
      drawChute(ctx, x, c.state, c.state === WAKING && (f & 1) ? 1 : 0, (f >> 2) & 1);
    }
  }

  /** One seat, with the state of its sack pushed onto the rig just before it draws (never held on the rig). */
  drawSeat(ctx: CanvasRenderingContext2D, s: MillSeat, f: number): void {
    const rig = s.rig, o = s.opts;
    // through the heft the sack is still full in the paw; it empties on the toss key, with the hop
    const shown = s.tieT > TIE_TOSS ? FULL : s.fill;
    rig.sackFill = shown;
    rig.sackZone = s.tieT > 0 ? 1 : shown >= FULL ? 2 : shown >= BRIM_AT ? 1 : 0;
    rig.sackBlink = (f >> 2) & 1;
    rig.override = s.whiteT > 0 ? WHITENED : null;
    o.x = s.x; o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    rig.override = null;
  }

  /** The tied sack's arc from the paw to the barrow's bed. */
  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t < 0 || h.t >= HOP_FRAMES) return;
    const k = h.t / HOP_FRAMES;
    const x = R(h.x0 + (BARROW_X - h.x0) * k);
    const y = R(h.y0 + (BARROW_Y - 24 - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT);
    drawTiedSack(ctx, x, y, h.slot);
  }

  /**
   * The name plates and, above each one, that seat's fill tag. The plates go through the shared PLATES stack (front
   * lane first, so a back-lane plate climbs over a front-lane one); the tags then go through a stack of our own
   * seeded with those four plate rects, so a tag can never land on a plate and two tags can never land on each
   * other. The tag is what a player reads to tell "nearly full" from "about to burst" at a glance, so it is the one
   * thing in the frame that is never allowed to be underneath anything - but it is not allowed to climb over a
   * spout either, so past TAG_CEIL it goes sideways instead (placeTag).
   */
  drawPlates(ctx: CanvasRenderingContext2D): void {
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    const st = this.tagStack, v = PLATES.v;
    st.n = 0;
    for (let i = 0; i < PLATES.n; i++) { const k = i * 4; push(st, v[k], v[k + 1], v[k + 2], v[k + 3]); }
    for (let i = 0; i < this.seats.length && i < PLATES.n; i++) {
      const s = this.seats[i], k = i * 4, cx = v[k] + (v[k + 2] >> 1);
      const at = placeTag(st, cx, v[k + 1] - TAG_H - 2);
      drawFillTag(ctx, at.x + (TAG_W >> 1), at.y, s.tieT > TIE_TOSS ? FULL : s.fill, s.colour, this.zones);
    }
  }

  override summary() {
    return {
      total: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText,
      bursts: this.bursts, tied: this.tied, wake: this.wake,
      // fill is rounded to three places so a test can read it without chasing float tails
      seats: this.seats.map((s) => [s.slot, R(s.x), s.count, Math.round(s.fill * 1000) / 1000, s.chute]),
      // [state, frames left, the seat filling from it, its x]. State is 0 dormant / 1 waking / 2 pouring
      // (art/millProps.js DORMANT / WAKING / POURING). The x is carried so a headless test can walk a seat under a
      // spout without a copy of the layout table going stale behind it.
      chutes: this.chutes.map((c, i) => [c.state, c.t, c.seat, CHUTE_X[i]]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.wake, this.bursts, this.tied);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.fill, s.bumpT, s.tieT, s.whiteT, s.chute, s.wasHeld ? 1 : 0, s.moving ? 1 : 0);
    }
    for (let i = 0; i < this.chutes.length; i++) { const c = this.chutes[i]; f.push(c.state, c.t, c.seat); }
    return f;
  }
}
