// MARKET GARDEN - PULL (docs/GDD.md section 5; docs/ART_STYLE.md section 1, section 4). Side view, afternoon: the
// Saturday Market's own walled kitchen garden, and the crew works one row of it. Leafy tops stand in the crop ridge
// at seeded x positions; every seat walks LEFT and RIGHT along the row on its own depth lane; `action` within REACH
// of a top takes HOLD of it and opens that seat's TUG GAUGE - a needle sweeping a paper bar with a green band on it;
// `action` again inside the band brings the root out (+1), outside it snaps the top off (nothing, and that root
// grows a new one after REGROW_FRAMES). One top in WEED_IN is a THISTLE, and pulling one of those costs a banked
// carrot and gets thrown over a shoulder. The round ends when the party's total reaches the order's amount or the
// 40-second clock runs out; the CARROTS sign drops, is held, then run.gather('carrot') and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the crop is a fixed pool of plain sim objects built in enter() and
// never grown; every random number - where a top is planted, whether it is a thistle, where a pull's band sits and
// what phase its needle starts on - comes from the rng singleton inside update(); the needle is an INTEGER sweep
// counter, not an accumulating float, so four browsers agree to the bit; input is read by seat slot only. The
// thistledown, the soil crumbs, the holes, the flying roots and the float text are cosmetic pools on their own
// streams and stay out of checksumFields().
//
// One signal, and only one (docs/ART_STYLE.md section 4): SIGNAL.garden gold, on the sparkle over a ripe root -
// "the thing you want", the same mark the coop's fresh egg wears. There is no SIGNAL.hot anywhere in this scene and
// that is deliberate: nothing in a market garden can hurt you. The thistle costs a banked carrot and throws itself
// over a shoulder, which is a joke, and HOT is reserved game-wide for heat and danger. The carrot's own orange is
// the ingredient's hex and only ever appears on a root that is OUT of the ground (art/gardenProps.js ROOT_HEX);
// "good timing" on the gauge is UI.green under an ink line, never gold, as section 4 requires.
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng, makeRng } from '../../lib/engine/rng.ts';
import type { RngInstance } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstCrumbs, burstSparkle } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Rig, RigWeapon } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { gardenLayers, ROWS } from '../../art/backgrounds/garden.ts';
import {
  CROP, FERN_H, TAG_W, TAG_H, GAUGE_UNITS, GARDEN_TRUG, GARDEN_ANIMS,
  drawFern, drawThistle, drawStub, drawHole, drawRipeSpark, drawPulledCarrot, drawFlyingThistle, drawTugGauge, drawBarrow,
} from '../../art/gardenProps.ts';
import {
  makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates,
} from '../minigame.ts';
import type { Clock, PlateStack, Seat } from '../minigame.ts';
import { drawHint } from '../ui.ts';

const R = Math.round;
/** Per-seat state. A seat in anything but IDLE or GRIP is inside a beat and its stick is ignored. */
const IDLE = 0, GRIP = 1, PULL = 2, SNAP = 3, BUMP = 4;
const STATE_NAMES = Object.freeze(['idle', 'grip', 'pull', 'snap', 'bump']);
/** A top is a carrot or a thistle. */
const CARROT = 0, WEED = 1;

/**
 * Movement: px/frame along the row, and the ends of the row (a trug's width in from each edge).
 *
 * 2.0, a step under the orchard's 2.2: that scene is a chase and this one is worked ground, and at 2.2 the step
 * INTO the row that a grip snaps (see tryGrip) was landing on top of a walk that had already overshot the top.
 */
const SPEED = 2.0, X_MIN = 26, X_MAX = 614;
/**
 * Seat i works the row on its own lane: P1 in front at LANE_Y0, four lanes 8 px apart - the orchard's spacing, for
 * the same reason (four bodies at one y fuse into one shape). The lanes and their contact shadows live entirely
 * inside the backdrop's clean walk band, ROWS.bandTop 282 .. ROWS.bandBot 322.
 */
const LANE_Y0 = 316, LANE_GAP = 8;
/** Every leafy top stands on the crop ridge's soil line, which the backdrop paints (art/backgrounds/garden.js). */
const ROOT_Y = ROWS.root;

/**
 * The crop: a fixed pool of eight, of which SEED_TOPS are already standing when the truck pulls up and the rest
 * come up on the timer. An empty bed was the first thing that had to go: with the orchard's "spawn from nothing"
 * shape a solo player spent the round's first 70..120 frames walking an empty row, and a garden is the one place in
 * this game where the crop is obviously there before you are.
 *
 * MIN_GAP 42 is wider than the 32 px grip window, so two tops can never both be takeable from one spot, and it is
 * wider than a fern (26 px) plus its neighbour's shadow, so the row never closes into a hedge. Eight tops need
 * 7 x 42 = 294 px of the 552 px row, which leaves the seeded placement room to breathe.
 */
const MAX_TOPS = 8, SEED_TOPS = 7, SPAWN_MIN = 70, SPAWN_MAX = 120;
const TOP_X_MIN = 44, TOP_X_MAX = 596, MIN_GAP = 42, PLANT_TRIES = 8;
/** One top in five is a thistle: with seven or eight standing, that is one or two in the row at any moment. */
const WEED_IN = 5;
/**
 * The grip window: anything whose crown is within REACH px of the feet, either side. It is symmetric on purpose -
 * a window biased GRIP_DX in front of the facing was written first and thrown out, because a critter that had just
 * walked LEFT past a top could not then take hold of the top it was standing on without tapping right first, which
 * is a fiddle nobody should have to learn in a cozy game. Facing is decided BY the grip instead (tryGrip).
 * REACH 16 gives a 32 px window, the same order as the coop's 14 px pluck radius, and MIN_GAP (42) is wider than
 * it, so two tops are never both takeable from one spot.
 *
 * GRIP_DX survives as the POSE's offset: where the paws land relative to the feet once the seat has hold.
 */
const GRIP_DX = 10, REACH = 16;

/**
 * THE GAUGE. The needle is an integer sweep counter, 0..2*SWEEP_N-1: SWEEP_N steps out and SWEEP_N back, three
 * GAUGE_UNITS a frame. Integers, because a float accumulating a fifth of a unit a frame for 150 frames is exactly
 * the kind of state that drifts a lockstep room apart.
 *
 * SWEEP_N is 40 - one traverse of the bar in 40 frames, 80 for the round trip - and it was 20 for one afternoon.
 * At 20 the band (22 % of the bar, the width this scene was specified at) is open for 4.4 frames, 73 ms, and a
 * headless solo run scored it: a policy that pressed the instant it saw the needle in the band banked 25 carrots in
 * a round, and the same policy with a 100 ms reaction banked ZERO and snapped 21 tops in a row. A window narrower
 * than a reaction time is not a timing game, it is a coin toss with a needle drawn on it, and this is a cozy co-op
 * cooking game.
 *
 * At 40 the same 22 % band is open 8.7 frames (145 ms), twice a sweep - the pond's 18-frame bite, met twice instead
 * of once. Measured solo, one seat, the four-carrot target:
 *     pure reaction, 100 ms      25 carrots a round,  2 snaps, fourth carrot on frame 223
 *     anticipation, +/- 50 ms    17 carrots a round, 13 snaps, fourth carrot on frame 499
 *     anticipation, +/- 133 ms    8 carrots a round, 28 snaps, fourth carrot on frame 1229
 * The worst of those banks the target in half the round with a seat to spare, and the arithmetic behind it is: a
 * walk to the next ripe top (about 46 px at 2.0 px/frame, 23 frames) + the wait for the band to come round (20
 * frames on average) + the pull beat (14) is roughly 60 frames a carrot, so four is about 240 frames of a 2400
 * frame round. A SWEEPING needle is read by anticipation, not by reaction - that is what a sweep is FOR, and a cue
 * that only flashed would have to be twice as wide - and a miss here costs nothing anyway: the top snaps, the
 * critter sits down, and the root grows a new one in REGROW_FRAMES.
 *
 * BAND_MIN / BAND_MAX keep the band 16 units clear of both ends, because a band sitting on a turnaround holds the
 * needle inside it for two frames running and stops being a beat at all.
 */
const SWEEP_N = 40, SWEEP_STEP = GAUGE_UNITS / SWEEP_N, BAND_W = 26, BAND_MIN = 16, BAND_MAX = GAUGE_UNITS - BAND_W - 16;
/** Where the needle is, in 0..GAUGE_UNITS, for a sweep counter. */
function needleAt(sweep: number): number { return sweep <= SWEEP_N ? sweep * SWEEP_STEP : (SWEEP_N * 2 - sweep) * SWEEP_STEP; }

/**
 * Letting go: GRIP_TIMEOUT frames without a press and the critter straightens up, at no cost. 150 frames is very
 * nearly two round trips of the needle, so it offers three or four crossings of the band - long enough that nobody
 * is ever hurried off a root, short enough that a seat cannot park on the one carrot everybody else wanted.
 */
const GRIP_TIMEOUT = 150;
/** A snapped-off root grows a new top in 90 frames: a second and a half, so nothing in this bed is ever lost. */
const REGROW_FRAMES = 90;
/** The three beats, in frames. PULL and SNAP are their anims' own lengths; BUMP is the shared 4/10/6 the orchard uses. */
const PULL_FRAMES = 14, SNAP_FRAMES = 14, BUMP_FRAMES = 21;

/**
 * Cosmetic pools, all of them fixed and none of them in the checksum: the hole a pulled root leaves (four steps of
 * 10 frames, the orchard's stepped splat rather than an alpha fade), the root's hop into the trug, and the thistle
 * going over a shoulder.
 */
const HOLE_STEP = 10, HOLE_FRAMES = 40, MAX_HOLES = 6;
const FLIGHT_FRAMES = 14, FLIGHT_LIFT = 26, MAX_FLIGHTS = 4;
/**
 * The thistle over the shoulder: 22 frames and 80 px BEHIND whoever pulled it, drawn in the back pass with the
 * barrow rather than in front with the crop.
 *
 * It was in the front pass at first, and the screenshot showed it sailing straight across Barley's muzzle, which is
 * the one thing ART_STYLE 0.7 will not have. Over your shoulder means behind you: in the back pass it comes out
 * from behind the ear, arcs over the path and is gone, and the critter's face - which is playing the whole joke -
 * stays open the entire time.
 */
const TOSS_FRAMES = 22, TOSS_VX = 3.2, TOSS_LIFT = 34, TOSS_FALL = 10, MAX_TOSSES = 3;
/** Thistledown on the afternoon air: a cosmetic stream off its own seed, one every eight frames. */
const DOWN_EVERY = 8, DOWN_SEED = 205, DOWN_PALE = '#F1E4C8';
/** The fern's 1 px breeze, index-hashed so the row does not sway as one object. */
const SWAY = Int8Array.of(0, 1, 0, -1);
/** The barrow: parked on the path behind the back lane, so nothing solid ever stands in the walk band. */
const BARROW_X = 586, BARROW_Y = 280;

const PLUS_ONE = '+1', MINUS_ONE = '-1', SNAP_TXT = 'SNAP!', WEED_TXT = 'WEED!';
const TITLE = 'SATURDAY MARKET', SIGN_PREFIX = 'CARROTS: ', FALLBACK_TARGET = 4;

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { drawFood(ctx, 'carrot', x, y, 4); }
/** The ground-contact ellipse every sprite draws before the sorted pass. */
function drawSeatShadow(ctx: CanvasRenderingContext2D, seat: GardenSeat): void { drawShadow(ctx, seat.x, seat.y, seat.rig.width + 6, 0.4, 0); }

/**
 * Climb `y` until the box clears every rect already in `stack`, then register it - the same walk
 * game/minigame.js drawSeatPlate does, over a stack of our own big enough for a name plate AND a gauge per seat.
 * The shared PLATES holds exactly four rects, which is exactly the four plates, so the gauges need somewhere else
 * to be counted; the mill's fill tag solved it the same way. Nothing a player has to read may land on anything
 * else a player has to read, and the gauge is the thing this scene is read from.
 */
function place(stack: PlateStack, x: number, y: number, w: number, h: number): number {
  const v = stack.v;
  for (let pass = 0; pass < 6; pass++) {
    let hit = false;
    for (let i = 0; i < stack.n; i++) {
      const k = i * 4;
      if (x < v[k] + v[k + 2] && x + w > v[k] && y < v[k + 1] + v[k + 3] && y + h > v[k + 1]) { y = v[k + 1] - h - 2; hit = true; }
    }
    if (!hit) break;
  }
  if (stack.n * 4 < v.length) { const k = stack.n * 4; v[k] = x; v[k + 1] = y; v[k + 2] = w; v[k + 3] = h; stack.n++; }
  return y;
}

/**
 * A seat's rig as this scene hands it round: lib/art/rig.ts's own rig plus the trug's fill count, which
 * art/gardenProps.js GARDEN_TRUG reads straight back off the rig it is handed. Optional because `buildRig` builds a
 * complete `Rig` without it - a rig carries a trug count only while its owner is working this row.
 */
export interface GardenRig extends Rig {
  /** Roots in the carried trug; GARDEN_TRUG draws at most four of them. */
  trugCount?: number;
}

/**
 * One seat working the row: game/minigame.ts's shared seat plus this scene's own pull state. These are the extra
 * fields `Seat` documents a screen keeping more per seat should declare for itself, and `makeSeats` is generic so
 * enter() gets them back typed.
 */
export interface GardenSeat extends Seat {
  /** The rig, carrying the garden trug whose fill this screen sets every draw. */
  rig: GardenRig;
  /** IDLE, GRIP, PULL, SNAP or BUMP. */
  state: number;
  /** Frames left of the PULL / SNAP / BUMP beat; 0 when the stick is live again. */
  t: number;
  /** Index into `tops` of the top this seat has hold of, -1 when it has none. */
  top: number;
  /** Frames this grip has lasted, against GRIP_TIMEOUT. */
  grip: number;
  /** The needle's integer sweep counter, 0..2*SWEEP_N-1 (see `needleAt`). */
  sweep: number;
  /** The low end of this pull's band, in gauge units 0..GAUGE_UNITS. */
  bandLo: number;
  /** Its high end: bandLo + BAND_W. */
  bandHi: number;
  /** Scratch for the trug's screen point, refilled by jointScreen() on every drawSeat. */
  trugPt: Point;
}

/** One leafy top in the crop ridge: a slot of the fixed pool enter() builds and never grows. */
export interface CropTop {
  /** True while a top is standing: an empty slot and a root that is regrowing are both false. */
  active: boolean;
  /** px along the row, TOP_X_MIN..TOP_X_MAX. */
  x: number;
  /** CARROT or WEED. */
  kind: number;
  /** Frames until a snapped root grows a new top; 0 when it is not regrowing. */
  regrow: number;
  /** 1 while a seat has hold of it. A number, not a boolean: checksumFields() hashes it. */
  held: number;
}

/** The hole a pulled root leaves, in four stepped frames. Cosmetic: a fixed pool, out of the checksum. */
export interface Hole {
  /** Frames since it opened; HOLE_FRAMES means the slot is spent. */
  t: number;
  /** px along the row. */
  x: number;
}

/** A pulled root's hop from its hole into the seat's trug. Cosmetic. */
export interface RootFlight {
  /** Frames since it came out; FLIGHT_FRAMES means it has landed. */
  t: number;
  /** Where it left the soil. */
  x0: number;
  y0: number;
  /** Party index of the seat whose trug it is flying to (an index into `seats`). */
  seat: number;
}

/** A thistle going over a shoulder, turning end over end. Cosmetic. */
export interface ThistleToss {
  /** Frames since it was thrown; TOSS_FRAMES means it is gone. */
  t: number;
  /** Where it left the paws. */
  x0: number;
  y0: number;
  /** The thrower's facing; the thistle travels the other way (see TOSS_FRAMES). */
  dir: number;
}

/**
 * One pre-rendered backdrop layer and the y the screen blits it at (art/backgrounds/garden.js gardenLayers). `L` is
 * exactly what art/layers.js `makeLayer` hands back; stated here rather than imported because art/layers.js is still
 * untyped, the same way game/screens/map.ts states its own. When its turn comes this becomes an import.
 */
export interface GardenLayer {
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  /** Screen y the layer is blitted at. */
  y: number;
}

/** The backdrop: the far wall, the mid beds and the ground, painted once and blitted in this order. */
export interface GardenBackdrop {
  far: GardenLayer;
  mid: GardenLayer;
  ground: GardenLayer;
}

export class GardenScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations, for the reason game/game.ts states over its own block: a plain field declaration emits a
  // class field per name (es2022 defines them before the constructor body runs, and a screen's own declaration
  // would also define a base field back to undefined), which would wipe what the constructor has just written.
  // `declare` erases under tsc, under esbuild and under Node's type stripping alike, so the emitted class is the
  // one that shipped.

  /** One seat per party member, in party order (not slot order). */
  declare seats: GardenSeat[];
  /** The crop: a fixed pool of MAX_TOPS slots, built in enter() and never grown. */
  declare tops: CropTop[];
  /** The backdrop, pre-rendered once (art/backgrounds/garden.js gardenLayers) and blitted per frame. */
  declare layers: GardenBackdrop;
  /** The cosmetic stream's own generator (DOWN_SEED): thistledown only, never the sim. */
  declare vis: RngInstance;
  /** The thistledown spawn options, built once in enter() and handed to particles.spawn every DOWN_EVERY frames. */
  declare downOpts: { color: string; color2: string; size: number; life: number; vx: number; vy: number; screen: boolean };
  /** The burst options for the leaves a snapped top throws (engine/particles.js `burst`). */
  declare leafOpts: { speed: number; up: number; color: string; color2: string; life: number; screen: boolean };
  /** Frames until the spawner plants one more top (SPAWN_MIN..SPAWN_MAX). */
  declare nextSpawn: number;
  /** The holes pulled roots leave: a fixed cosmetic pool, oldest slot reused first. */
  declare holes: Hole[];
  /** Next slot of `holes` to reuse. */
  declare holeCursor: number;
  /** The roots hopping into trugs: a fixed cosmetic pool. */
  declare flights: RootFlight[];
  /** Next slot of `flights` to reuse. */
  declare flightCursor: number;
  /** The thistles going over shoulders: a fixed cosmetic pool. */
  declare tosses: ThistleToss[];
  /** Next slot of `tosses` to reuse. */
  declare tossCursor: number;
  /** Carrots the round is played to: the order's REMAINDER, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Carrots the party has banked this round (the sum of the seats' counts). */
  declare total: number;
  /** Roots pulled this round (summary / checksum only). */
  declare pulls: number;
  /** Tops snapped off this round. */
  declare snaps: number;
  /** Thistles pulled this round. */
  declare weeds: number;
  /** The clock's count, rebuilt by setTotal(): 'total/target'. */
  declare countStr: string;
  /** The hint line under the row, built once in enter() with the seat's own action key. */
  declare hint: string;
  /** The round clock and its end sign (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The gauges' own rect stack, seeded each frame with the four name plates so a tag lands on neither. */
  declare gaugeStack: PlateStack;

  constructor(game: Game) { super(game, 'garden'); this.seats = []; this.tops = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = gardenLayers();
    particles.clear();
    // every options object a per-frame call needs is built HERE and mutated, never in update() or draw()
    this.vis = makeRng(DOWN_SEED);
    this.downOpts = { color: DOWN_PALE, color2: CROP.leafHi, size: 3, life: 150, vx: -0.25, vy: 0.3, screen: true };
    this.leafOpts = { speed: 2.2, up: 1.4, color: CROP.leaf, color2: CROP.leafHi, life: 34, screen: true };

    this.seats = makeSeats<GardenSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length, pitch = Math.min(120, R((X_MAX - X_MIN) / (n + 1)));
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * pitch);
      // the garden's own trug in place of the shared ribbon basket (art/gardenProps.js GARDEN_TRUG says why)
      // `as RigWeapon`: art/gardenProps.js is not typed yet, so its `attach: 'handR'` widens to `string` and the
      // literal misses RigWeapon's `attach?: HandName` by that one field. It IS a rig weapon - rig.ts reads exactly
      // these keys back off it - so the assertion says what gardenProps.js cannot yet (kitchen.ts carries the same
      // note over ITEMS).
      s.rig.weapon = GARDEN_TRUG as RigWeapon; s.rig.trugCount = 0;
      s.player.setOverlay(GARDEN_ANIMS);
      s.state = IDLE; s.t = 0; s.top = -1; s.grip = 0; s.sweep = 0; s.bandLo = BAND_MIN; s.bandHi = BAND_MIN + BAND_W;
      s.trugPt = { x: s.x, y: s.y - 18 };
      seatAnim(s, 'carry');
      // four people working a row, not one pose printed four times: each seat starts its breath a beat later
      // (pose only - nothing in summary() or the checksum reads the anim clock)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }

    this.tops = [];
    for (let i = 0; i < MAX_TOPS; i++) this.tops.push({ active: false, x: 0, kind: CARROT, regrow: 0, held: 0 });
    this.plantBed();
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);

    this.holes = [];
    for (let i = 0; i < MAX_HOLES; i++) this.holes.push({ t: HOLE_FRAMES, x: 0 });
    this.holeCursor = 0;
    this.flights = [];
    for (let i = 0; i < MAX_FLIGHTS; i++) this.flights.push({ t: FLIGHT_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.flightCursor = 0;
    this.tosses = [];
    for (let i = 0; i < MAX_TOSSES; i++) this.tosses.push({ t: TOSS_FRAMES, x0: 0, y0: 0, dir: 1 });
    this.tossCursor = 0;

    const need = run ? run.order.needs.find((x) => x.id === 'carrot') : null;
    // the REMAINDER, not the whole line: the map may already have banked some (the other six mini-games agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.pulls = 0; this.snaps = 0; this.weeds = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   GRIP + PULL: ' + game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
    // four name plates and, above each, at most one gauge
    this.gaugeStack = { n: 0, v: new Int16Array(8 * 4) };
  }

  /**
   * Plant the bed the truck arrives to. The x positions are an even spread with a seeded jitter rather than the
   * spawner's rejection sampling: seven rejection-sampled positions leave gaps a player has to walk twice, and the
   * opening frame of a market garden has to look planted.
   *
   * The kinds are dealt, not rolled, for one reason: the thistle is the rule this scene teaches, and a bed that
   * opens with no thistle in it teaches nothing until the first one comes up a hundred frames later. `weeds` is
   * what WEED_IN would give on average, floored at one, and the slots are stepped by three so they never cluster.
   * Every top planted AFTER this one is a straight 1-in-WEED_IN roll.
   */
  plantBed(): void {
    const span = TOP_X_MAX - TOP_X_MIN;
    for (let i = 0; i < SEED_TOPS; i++) {
      const t = this.tops[i];
      t.active = true; t.kind = CARROT; t.regrow = 0; t.held = 0;
      t.x = TOP_X_MIN + R(i * span / (SEED_TOPS - 1)) + rng.int(-10, 10);
      if (t.x < TOP_X_MIN) t.x = TOP_X_MIN; else if (t.x > TOP_X_MAX) t.x = TOP_X_MAX;
    }
    const weeds = Math.max(1, Math.round(SEED_TOPS / WEED_IN)), start = rng.int(0, SEED_TOPS - 1);
    for (let k = 0; k < weeds; k++) this.tops[(start + k * 3) % SEED_TOPS].kind = WEED;
  }

  /** A seeded x at least MIN_GAP from every top that is up or coming back, or -1 if the row is too full. */
  freeX(): number {
    for (let k = 0; k < PLANT_TRIES; k++) {
      const x = rng.int(TOP_X_MIN, TOP_X_MAX);
      let ok = true;
      for (let i = 0; i < this.tops.length && ok; i++) {
        const t = this.tops[i];
        if (!t.active && t.regrow === 0) continue;
        const d = t.x > x ? t.x - x : x - t.x;
        if (d < MIN_GAP) ok = false;
      }
      if (ok) return x;
    }
    return -1;
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    if (this.frame % DOWN_EVERY === 0) particles.spawn('leaf', this.vis.int(-20, VIEW_W + 20), this.vis.int(110, 200), this.downOpts);
    for (let i = 0; i < this.holes.length; i++) if (this.holes[i].t < HOLE_FRAMES) this.holes[i].t++;
    for (let i = 0; i < this.flights.length; i++) if (this.flights[i].t < FLIGHT_FRAMES) this.flights[i].t++;
    for (let i = 0; i < this.tosses.length; i++) if (this.tosses[i].t < TOSS_FRAMES) this.tosses[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateSeats(input);
      this.updateTops();
      if (this.total >= this.target) this.finish();
    } else {
      // the sign hangs: the crew holds its last beat, nothing is stepped, no input counts
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('carrot', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /** Every seat: the beats first (they lock the stick), then the gauge, then the walk and the grip. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.t > 0) {
        s.moving = false;
        if (--s.t === 0) { s.state = IDLE; seatAnim(s, 'carry', true); }
        s.player.tick();
        continue;
      }
      if (s.state === GRIP) { this.stepGrip(s, input.pressed(s.slot, 'action')); s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryGrip(s);
      if (s.state === IDLE) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /**
   * A seat with hold of a top. The press is judged against the needle the player was LOOKING at: this frame's
   * draw ran after last frame's advance, so the press resolves BEFORE the sweep moves on. Resolving after would
   * cost every player one step of the bar - a fifth of the band - for nothing.
   */
  stepGrip(s: GardenSeat, pressed: boolean): void {
    if (pressed) { this.resolve(s); return; }
    if (++s.grip >= GRIP_TIMEOUT) { this.letGo(s); return; }
    s.sweep = s.sweep + 1 >= SWEEP_N * 2 ? 0 : s.sweep + 1;
  }

  /** `action` on a free seat: take hold of the nearest top inside the grip window. */
  tryGrip(s: GardenSeat): void {
    const gx = s.x;
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.tops.length; i++) {
      const t = this.tops[i];
      if (!t.active || t.held) continue;
      const d = t.x > gx ? t.x - gx : gx - t.x;
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    const t = this.tops[best];
    t.held = 1;
    s.state = GRIP; s.top = best; s.grip = 0;
    // this one pull's own rhythm: where the band sits and what phase the needle starts on, so nobody learns a beat
    s.bandLo = rng.int(BAND_MIN, BAND_MAX); s.bandHi = s.bandLo + BAND_W;
    s.sweep = rng.int(0, SWEEP_N * 2 - 1);
    // and the step INTO the row: face the top, then plant the feet GRIP_DX back from it. The grip pose's paws land
    // at a fixed offset from the feet, so without this a seat that took hold from the edge of its window spent the
    // whole tug gripping air beside the plant. Worst case the step is GRIP_DX px (a top directly underfoot) - five
    // frames' walk - and it lands under the grip anim's own 9-frame anticipation, which is what hides it.
    s.facing = t.x >= s.x ? 1 : -1;
    s.x = t.x - s.facing * GRIP_DX;
    if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
    s.moving = false;
    seatAnim(s, 'grip', true);
  }

  /** The one rule: inside the band the top comes OUT (and what it is decides what that is worth), outside it snaps. */
  resolve(s: GardenSeat): void {
    const t = this.tops[s.top];
    const n = needleAt(s.sweep);
    t.held = 0; s.top = -1;   // the hold is over whichever way this goes; the beat below owns the seat from here
    if (n < s.bandLo || n > s.bandHi) { this.snapOff(s, t); return; }
    if (t.kind === WEED) this.pullWeed(s, t); else this.pullRoot(s, t);
  }

  /** The root comes free: +1, a hole in the bed, soil everywhere, and the carrot hops into the seat's trug. */
  pullRoot(s: GardenSeat, t: CropTop): void {
    t.active = false; t.regrow = 0;   // the root is out, so the slot is free and the spawner replants it elsewhere
    s.count++; this.setTotal(this.total + 1);
    s.state = PULL; s.t = PULL_FRAMES; seatAnim(s, 'pullOut', true);
    this.pulls++;
    this.openHole(t.x);
    const fl = this.flights[this.flightCursor]; this.flightCursor = (this.flightCursor + 1) % this.flights.length;
    fl.t = 0; fl.x0 = t.x; fl.y0 = ROOT_Y - 12; fl.seat = s.index;
    burstCrumbs(t.x, ROOT_Y - 2, ROOT_Y + 6, CROP.soil, 8, true);
    ringAt(t.x, ROOT_Y - 4, 3, 13, UI.cream, 2, 12, true, true);
    burstSparkle(t.x, ROOT_Y - 18, 4, SIGNAL.garden, true);
    floatText(t.x + s.facing * 14, ROOT_Y - 54, PLUS_ONE, s.colour, 1, true);
  }

  /**
   * The top comes off in its paws and the root stays in the ground. No carrot, no cost, a 14-frame pratfall and a
   * stub that grows a new top in REGROW_FRAMES - the failure in this scene is meant to be funny, not expensive.
   */
  snapOff(s: GardenSeat, t: CropTop): void {
    t.active = false; t.regrow = REGROW_FRAMES;   // same x: this root is still down there
    s.state = SNAP; s.t = SNAP_FRAMES; seatAnim(s, 'snap', true);
    this.snaps++;
    particles.burst('leaf', t.x, ROOT_Y - 22, 5, this.leafOpts);
    ringAt(t.x, ROOT_Y - 6, 3, 11, UI.paperDark, 2, 12, true, true);
    floatText(t.x, ROOT_Y - 48, SNAP_TXT, UI.cream, 1, true);
  }

  /** The scene's joke: a thistle comes out whole, costs a banked carrot, and goes over the critter's shoulder. */
  pullWeed(s: GardenSeat, t: CropTop): void {
    t.active = false; t.regrow = 0;
    const cost = s.count > 0;
    if (cost) { s.count--; this.setTotal(this.total - 1); }
    s.state = BUMP; s.t = BUMP_FRAMES; seatAnim(s, 'bump', true);
    this.weeds++;
    this.openHole(t.x);
    const tz = this.tosses[this.tossCursor]; this.tossCursor = (this.tossCursor + 1) % this.tosses.length;
    tz.t = 0; tz.x0 = t.x; tz.y0 = ROOT_Y - 24; tz.dir = s.facing;
    burstCrumbs(t.x, ROOT_Y - 2, ROOT_Y + 6, CROP.soil, 6, true);
    // the number is thrown the OTHER way from the thistle - the thistle goes back over the shoulder, so the count
    // goes forward - because the coop's round 1 proved that a float text launched along a flight path rides on top
    // of the thing it is describing for exactly the four frames the loss is read from
    floatText(t.x + s.facing * 18, ROOT_Y - 58, cost ? MINUS_ONE : WEED_TXT, cost ? s.colour : UI.cream, 1, true);
  }

  /** GRIP_TIMEOUT with no press: the critter straightens up and the top is free again. Costs nothing. */
  letGo(s: GardenSeat): void {
    if (s.top >= 0) this.tops[s.top].held = 0;
    s.state = IDLE; s.top = -1;
    seatAnim(s, 'carry', true);
  }

  openHole(x: number): void {
    const h = this.holes[this.holeCursor]; this.holeCursor = (this.holeCursor + 1) % this.holes.length;
    h.t = 0; h.x = x;
  }

  /** Regrow the snapped roots, then plant one more top if the row has a gap and a free slot. */
  updateTops(): void {
    for (let i = 0; i < this.tops.length; i++) {
      const t = this.tops[i];
      if (t.regrow > 0 && --t.regrow === 0) { t.active = true; t.held = 0; t.kind = rng.int(1, WEED_IN) === 1 ? WEED : CARROT; }
    }
    if (--this.nextSpawn > 0) return;
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
    let up = 0, slot = -1;
    for (let i = 0; i < this.tops.length; i++) {
      const t = this.tops[i];
      if (t.active) up++; else if (t.regrow === 0 && slot < 0) slot = i;
    }
    if (slot < 0 || up >= MAX_TOPS) return;
    const x = this.freeX();
    if (x < 0) return;
    const t = this.tops[slot];
    t.active = true; t.held = 0; t.regrow = 0; t.x = x;
    t.kind = rng.int(1, WEED_IN) === 1 ? WEED : CARROT;
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with roots in its trug cheers, one without sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.top >= 0) this.tops[s.top].held = 0;
      s.state = IDLE; s.t = 0; s.top = -1; s.moving = false;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.mid.L, 0, L.mid.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    // the barrow stands on the path behind every lane, so it draws before the cast and never covers a critter
    drawShadow(ctx, BARROW_X - 10, BARROW_Y, 46, 0.35, 0);
    drawBarrow(ctx, BARROW_X, BARROW_Y, this.total);
    // the thrown thistles go here, BEHIND the cast: over your shoulder means behind you (see TOSS_FRAMES)
    for (let i = 0; i < this.tosses.length; i++) this.drawToss(ctx, this.tosses[i]);
    // ground contact first, then the cast back lane to front lane
    for (let i = 0; i < this.seats.length; i++) drawSeatShadow(ctx, this.seats[i]);
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    // THE CROP ROW, in front of the whole cast. It is the frontmost thing in the scene on purpose: a thistle that a
    // critter could stand in front of would be a cost the player had no way of seeing coming, so the row is never
    // occluded by anybody. What it does cover is feet and shins, which is exactly where a front row of foliage goes.
    for (let i = 0; i < this.tops.length; i++) { const t = this.tops[i]; if (t.active) drawShadow(ctx, t.x, ROOT_Y + 2, 16, 0.3, 0); }
    for (let i = 0; i < this.holes.length; i++) { const h = this.holes[i]; if (h.t < HOLE_FRAMES) drawHole(ctx, h.x, ROOT_Y, (h.t / HOLE_STEP) | 0); }
    for (let i = 0; i < this.tops.length; i++) this.drawTop(ctx, this.tops[i], i, f);
    for (let i = 0; i < this.flights.length; i++) this.drawFlight(ctx, this.flights[i]);
    particles.draw(ctx, null, 'front');
    this.drawPlates(ctx);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
    if (this.game.options.debug) this.drawWindows(ctx);
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: GardenSeat): void {
    const rig = s.rig, o = s.opts;
    rig.trugCount = s.count;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.trugPt);
  }

  /** One top: the stub of a regrowing root, a thistle, or a ripe fern with its gold sparkle blinking above it. */
  drawTop(ctx: CanvasRenderingContext2D, t: CropTop, i: number, f: number): void {
    if (t.regrow > 0) { drawStub(ctx, t.x, ROOT_Y); return; }
    if (!t.active) return;
    // held: a 2 px shake on alternate frames - the tug, and the only mark that says which top a gauge belongs to
    const sway = t.held ? (((f >> 1) & 1) ? 2 : -2) : SWAY[((f + i * 13) >> 4) & 3];
    if (t.kind === WEED) { drawThistle(ctx, t.x, ROOT_Y, sway); return; }
    drawFern(ctx, t.x, ROOT_Y, sway, i & 1);
    // 6 above the fern's drawn top: 4 for the mark's own half-height (drawRipeSpark takes its CENTRE) and 2 of
    // clear air, so the one signal in the scene stands off the foliage instead of on it
    if (((f + i * 7) >> 3) & 1) drawRipeSpark(ctx, t.x + 7, ROOT_Y - FERN_H - 6);
  }

  /** The pulled root's hop from its hole into the seat's trug (the trug point comes from the last drawSeat). */
  drawFlight(ctx: CanvasRenderingContext2D, fl: RootFlight): void {
    if (fl.t >= FLIGHT_FRAMES) return;
    const s = this.seats[fl.seat], k = fl.t / FLIGHT_FRAMES;
    const tx = s.trugPt.x, ty = s.trugPt.y + 10;
    drawPulledCarrot(ctx, R(fl.x0 + (tx - fl.x0) * k), R(fl.y0 + (ty - fl.y0) * k - Math.sin(k * Math.PI) * FLIGHT_LIFT));
  }

  /** The thistle going over a shoulder, turning end over end on its way. */
  drawToss(ctx: CanvasRenderingContext2D, tz: ThistleToss): void {
    if (tz.t >= TOSS_FRAMES) return;
    const k = tz.t / TOSS_FRAMES;
    drawFlyingThistle(ctx, tz.x0 - tz.dir * (10 + tz.t * TOSS_VX), tz.y0 + TOSS_FALL * k - Math.sin(k * Math.PI) * TOSS_LIFT, (tz.t >> 2) & 3);
  }

  /**
   * The name plates, and above each gripping seat its gauge. The plates go through the shared PLATES stack (front
   * lane first, so a back-lane plate climbs over a front-lane one); the gauges then go through a stack of our own
   * seeded with those four plate rects, so a gauge can never land on a plate and two gauges can never land on each
   * other. Four seats gripping at once is therefore four tags at four different x, each one riding above its own
   * seat's name plate so the ragged plate row reads underneath them, not a wall - the tags are only 48 px wide and
   * each one sits over its own critter's head.
   */
  drawPlates(ctx: CanvasRenderingContext2D): void {
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    const st = this.gaugeStack, v = PLATES.v;
    st.n = 0;
    for (let i = 0; i < PLATES.n; i++) { const k = i * 4; place(st, v[k], v[k + 1], v[k + 2], v[k + 3]); }
    for (let i = 0; i < this.seats.length && i < PLATES.n; i++) {
      const s = this.seats[i];
      if (s.state !== GRIP) continue;
      const k = i * 4, cx = v[k] + (v[k + 2] >> 1);
      const y = place(st, cx - (TAG_W >> 1), v[k + 1] - TAG_H - 2, TAG_W, TAG_H);
      const n = needleAt(s.sweep);
      drawTugGauge(ctx, cx, y, n, s.bandLo, s.bandHi, s.colour, n >= s.bandLo && n <= s.bandHi);
    }
  }

  /** ?debug=1: each seat's grip window against the row (UI.red, the orchard's debug ink - never shipped art). */
  drawWindows(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    for (let i = 0; i < this.seats.length; i++) ctx.strokeRect(R(this.seats[i].x - REACH) + 0.5, ROOT_Y - 8.5, REACH * 2, 10);
  }

  override summary() {
    return {
      total: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText,
      pulls: this.pulls, snaps: this.snaps, weeds: this.weeds,
      // needle is -1 unless the seat has hold of something; band and top are its current pull's own numbers
      seats: this.seats.map((s) => ({
        slot: s.slot, x: R(s.x), count: s.count, state: STATE_NAMES[s.state], t: s.t,
        needle: s.state === GRIP ? needleAt(s.sweep) : -1, lo: s.bandLo, hi: s.bandHi, top: s.top, grip: s.grip,
      })),
      // [x, kind (0 carrot, 1 thistle, -1 a snapped root regrowing), frames until it is back]
      tops: this.tops.filter((t) => t.active || t.regrow > 0).map((t) => [t.x, t.active ? t.kind : -1, t.regrow]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.nextSpawn, this.pulls, this.snaps, this.weeds);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.state, s.t, s.grip, s.sweep, s.bandLo, s.top, s.moving ? 1 : 0);
    }
    for (let i = 0; i < this.tops.length; i++) {
      const t = this.tops[i];
      f.push(t.active ? 1 : 0, t.x, t.kind, t.regrow, t.held);
    }
    return f;
  }
}
