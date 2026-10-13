// BRAMBLE BANK - PICK (docs/GDD.md section 5; docs/ART_STYLE.md section 1, section 4). Side view, late afternoon:
// six berry bushes stand along the foot of a turf bank and the crew works the path in front of them. Every bush
// has three berry spots; a spot ripens on a seeded timer (the berry turns from a green pea to the visit's own
// fruit with the gold sparkle over it); every seat walks LEFT and RIGHT along the path on its own depth lane, and
// `action` within REACH of a bush with a ripe berry on it picks one - a 12-frame reach up into the bush, the berry
// hops into the basket, +1. There is no beat to hit and nothing to pick by mistake: a bush with nothing ripe on it
// simply does nothing, and the only thing the bank asks of anyone is to walk to the sparkle and tap. The round ends
// when the party's total reaches the order's amount, and not before (there is no clock to run out); the
// STRAWBERRIES sign drops, is held, then run.gather('strawberry') and back to the map.
//
// This is the coop's shape - walk a lane, tap at the thing, a reach beat - with bushes for nesting boxes: the bank
// borrowed the farm's bed for a while, and a strawberry pulled out of the ground by its top was the one thing on
// the south lane that looked wrong.
//
// The bank's two jokes - THE THORN and THE SQUISHY ONE - are dealt by the one roll a ripening berry makes and played
// out in game/screens/brambleGags.ts (the shared word cards, coats and bump are game/gags.ts). Neither costs a point.
//
// Determinism (docs/ARCHITECTURE.md section 0): the bushes are six plain sim objects built in enter() and never
// grown; every random number - which bush ripens next, how long until it does, what kind of berry it is - comes from
// the rng singleton inside update(); the ripe, thorn and squishy states are 3-bit INTEGER masks per bush; input is
// read by seat slot only. The berry hops, the float text, the word cards, the juice on the path and a bush's shake
// are cosmetic pools on their own streams and stay out of checksumFields().
//
// One signal, and only one (docs/ART_STYLE.md section 4): SIGNAL.garden gold, on the sparkle over a ripe berry -
// "the thing you want", the farm's own mark, because the bank shares the farm's accent and its hour. There is no
// SIGNAL.hot anywhere in this scene: nothing on a bank of brambles can hurt you (a thorn is a joke, and its ring is
// cream).
import { VIEW_W, VIEW_H, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng, makeRng } from '../../lib/engine/rng.ts';
import type { RngInstance } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt, INK } from '../../art/layers.ts';
import { mix } from '../../art/palettes.ts';
import { drawShadow, floatText, ringAt, burstSparkle } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { gatherTarget } from '../run.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { brambleLayers, ROWS, BUSH_X, BRAMBLE } from '../../art/backgrounds/bramble.ts';
import { BUSH, BUSH_H, SPOT, SPOTS, BRAMBLE_ANIMS, drawBush, drawFlyingBerry, drawHeldBerry, drawJuiceSplash, drawJuiceSplat, spotDX, juiceFor } from '../../art/brambleProps.ts';
import {
  makeSeats, gulp, gulps, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates, RIBBON_BASKET,
} from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { clearGags, stepGags, drawGags, coat } from '../gags.ts';
import type { GagCard } from '../gags.ts';
import {
  dealBerry, startPrick, stepPrick, startSquish, stepSquish, endJokes, setJuice, juiceLeft, holding, heldSize, heldPhase, splashing, heldX, heldY,
  FAR_BASKET, PRICK_TOTAL, PRICK_REACH, BUSH_SHAKE, SPLASH_R0, SPLASH_GROW,
} from './brambleGags.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint } from '../ui.ts';

/** The HOW TO PLAY card's pictograms (game/controlcard.ts), in the order they are read. */
const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'tap']);
const R = Math.round;

/** Movement: px/frame along the path, and the ends of the path (a basket's width in from each edge). */
const SPEED = 2.0, X_MIN = 26, X_MAX = 614;
/**
 * Seat i works the path on its own lane: P1 in front at LANE_Y0, four lanes 8 px apart - the farm's spacing, for
 * the same reason (four bodies at one y fuse into one shape). The lanes and their contact shadows live entirely
 * inside the backdrop's clean walk band, ROWS.bandTop 282 .. ROWS.bandBot 322.
 */
const LANE_Y0 = 316, LANE_GAP = 8;
/** Every bush stands with its base on the bank's foot, behind the walk band (art/backgrounds/bramble.js). */
const BUSH_Y = ROWS.bushBase;
/** The mask with every berry spot of a bush ripe (art/brambleProps.ts SPOTS). */
const ALL_RIPE = (1 << SPOTS) - 1;
/**
 * Ripening: one berry every RIPEN_MIN..RIPEN_MAX frames on a bush that has a green spot left, and SEED_RIPE of
 * them already on the bushes when the truck pulls up (one per bush, so the opening frame has a sparkle in every
 * hundred px of path and nobody walks an empty bank). The same 70..120 the farm plants its tops on: measured
 * there as the rate that keeps four seats busy without ever letting the row fill.
 */
const RIPEN_MIN = 70, RIPEN_MAX = 120, SEED_RIPE = 6;
/**
 * The reach: a bush whose base is within REACH px of the feet, either side - a whole critter's width, so any bush
 * the body overlaps can be picked from (docs/GDD.md section 5 "reach is the whole body"). Symmetric on purpose,
 * for the farm's reason: facing is decided BY the pick, and two bushes inside the window go to the nearer one.
 */
const REACH = 34;
/** The pick beat, in frames: the anim's own length. */
const REACH_FRAMES = 12;
/** Cosmetic pool: the picked berry's hop into the basket. */
const HOP_FRAMES = 12, HOP_LIFT = 14, MAX_HOPS = 4;
/**
 * Cosmetic pool: a burst berry's juice on the path, SPLAT_LIFE frames (the squishy one's look and a little over),
 * the last four SPLAT_STEPs of it stepping down a size each (nothing on the bank fades: ART_STYLE section 5).
 */
const SPLAT_LIFE = 150, SPLAT_STEP = 6, MAX_SPLATS = 4;
const SPLAT_RX = Int8Array.of(16, 12, 9, 6), SPLAT_RY = Int8Array.of(4, 3, 3, 2);
/** The drips' own stream (cosmetic, the bank's seed block 210..219: the backdrop has 210..212). */
const DRIP_SEED = 213;
const PLUS_ONE = '+1';
const TITLE = 'BRAMBLE BANK', FALLBACK_TARGET = 4;

/** One seat working the path: the shared seat plus its beats and the basket point the hop flies to. */
export interface BrambleSeat extends Seat {
  /** Frames left of the pick beat; the stick is locked while it runs. */
  reachT: number;
  /** Frames left of the thorn (brambleGags.ts PRICK_TOTAL..0); the stick is locked while it runs. */
  prickT: number;
  /** Frames left of the squishy one (SQUISH_TOTAL, or Barley's GULP_TOTAL, ..0); the stick is locked while it runs. */
  squishT: number;
  /** The berry spot a joke is about (bush * SPOTS + k), or -1: where the thorn went in, which bush to shake. */
  spot: number;
  /** Where the basket is on screen, refilled from the `handN` joint by every drawSeat. */
  basketPt: Point;
  /** The last word card a joke put up over this seat (cosmetic, out of the checksum): the next one knocks it away. */
  card: GagCard | null;
}

/** One bush of the six: its masks over the three spots. Numbers, not booleans: checksumFields() hashes them. */
export interface Bush {
  /** Bit k set = spot k holds a ripe berry. */
  ripe: number;
  /** Bit k set = a thorn lies across spot k's berry: the first reach at it is the prick, and clears the bit. */
  thorn: number;
  /** Bit k set = spot k's berry is the squishy one, swollen: the reach at it takes it off the bush, and it bursts. */
  squish: number;
}

/** A burst berry's juice on the path (cosmetic): frames since it landed (SPLAT_LIFE = the slot is free), and where. */
export interface Splat {
  t: number;
  x: number;
  y: number;
}

/** A picked berry hopping from its spot into a seat's basket (cosmetic). */
export interface Hop {
  /** Frames into the hop; HOP_FRAMES means the slot is free. */
  t: number;
  /** Where the berry hung. */
  x0: number;
  y0: number;
  /** The party index of the seat it flies to (`Seat.index`). */
  seat: number;
}

/** One pre-rendered backdrop layer and the y the screen blits it at (art/backgrounds/bramble.js brambleLayers). */
export interface BrambleLayer {
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  y: number;
}
/** The backdrop: the hedge, the bank and the path, painted once and blitted in this order. */
export interface BrambleBackdrop {
  far: BrambleLayer;
  mid: BrambleLayer;
  ground: BrambleLayer;
}

export class BrambleScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations, for the reason game/game.ts states over its own block: a plain field declaration emits a
  // class field per name (es2022 defines them before the constructor body runs), which would wipe what the
  // constructor has just written. `declare` erases under tsc, under esbuild and under Node's type stripping alike.

  /** One seat per party member, in party order (not slot order). */
  declare seats: BrambleSeat[];
  /** The six bushes, one per BUSH_X, built in enter() and never grown. */
  declare bushes: Bush[];
  /** Pricks taken this round (the thorn's count, for the tests and the desync canary). */
  declare pricks: number;
  /** Squishy berries burst this round (the squishy one's count, likewise). */
  declare squishes: number;
  /**
   * What the bank grows this visit (game/run.js gatherTarget): strawberries, blueberries, raspberries or blackberries. `icon`/`hex` are its
   * glyph, the sign prefix its name, the title the landmark's.
   */
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare title: string;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** The juice a squishy berry coats its picker in (art/brambleProps.ts JUICE), and its shade on the path. */
  declare juice: string;
  declare juiceSh: string;
  /** The backdrop, pre-rendered once (art/backgrounds/bramble.js brambleLayers) and blitted per frame. */
  declare layers: BrambleBackdrop;
  /** Frames until the next berry ripens (RIPEN_MIN..RIPEN_MAX). */
  declare nextRipen: number;
  /** The berry hops: a fixed cosmetic pool. */
  declare hops: Hop[];
  /** Next slot of `hops` to reuse. */
  declare hopCursor: number;
  /** Frames left of each bush's shake after a thorn's OW! (cosmetic, BUSH_X order). */
  declare shakes: number[];
  /** The juice on the path: a fixed cosmetic pool, and its next slot. */
  declare splats: Splat[];
  declare splatCursor: number;
  /** The drips' own generator (DRIP_SEED): cosmetic only, never the sim. */
  declare vis: RngInstance;
  /** Berries the round is played to: the order's REMAINDER, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Berries the party has banked this round (the sum of the seats' counts). */
  declare total: number;
  /** The clock's count, rebuilt by setTotal(): 'total/target'. */
  declare countStr: string;
  /** The hint line under the path, built once in enter() with the seat's own action key. */
  declare hint: string;
  /** What the action key is called on seat 0's device, for the HOW TO PLAY card. */
  declare cardKey: string;
  /** The round clock and its end sign (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];

  constructor(game: Game) { super(game, 'bramble'); this.seats = []; this.bushes = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = brambleLayers();
    particles.clear();
    clearGags();

    const place = PLACES.find((p) => p.id === params.place && p.screen === 'bramble');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'bramble');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.strawberry;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    this.title = place ? place.name : TITLE;
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    this.juice = juiceFor(this.ing, hex); this.juiceSh = mix(this.juice, BRAMBLE.plum, 0.4);
    setJuice(hex, this.juice);

    this.seats = makeSeats<BrambleSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length, pitch = Math.min(120, R((X_MAX - X_MIN) / (n + 1)));
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * pitch);
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.reachT = 0; s.prickT = 0; s.squishT = 0; s.spot = -1;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.card = null;
      s.player.setOverlay(BRAMBLE_ANIMS);
      seatAnim(s, 'carry');
      // four people on a path, not one pose printed four times: each seat starts its breath a beat later (pose
      // only - nothing in summary() or the checksum reads the anim clock)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }

    this.bushes = [];
    for (let i = 0; i < BUSH_X.length; i++) this.bushes.push({ ripe: 0, thorn: 0, squish: 0 });
    this.pricks = 0; this.squishes = 0;
    this.seedBank();
    this.nextRipen = rng.int(RIPEN_MIN, RIPEN_MAX);

    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    this.shakes = [];
    for (let i = 0; i < BUSH_X.length; i++) this.shakes.push(0);
    this.splats = [];
    for (let i = 0; i < MAX_SPLATS; i++) this.splats.push({ t: SPLAT_LIFE, x: 0, y: 0 });
    this.splatCursor = 0;
    this.vis = makeRng(DRIP_SEED);

    const need = run ? run.need(this.ing) : null;
    // the REMAINDER, not the whole line: the map may already have banked some (the other mini-games agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   PICK: ' + game.input.keyText(0, 'action');
    this.cardKey = game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
  }

  /**
   * The bank the truck arrives to: SEED_RIPE berries, dealt one per bush round the row from a seeded start, on a
   * seeded spot each. Dealt rather than rejection-sampled, so six ripe berries are six sparkles a hundred px apart
   * and never three on one bush and an empty end of the path. Each is dealt like any berry that ripens (a thorn,
   * the squishy one or neither: brambleGags.ts dealBerry), so the first berries of a round can be a joke too.
   */
  seedBank(): void {
    const start = rng.int(0, this.bushes.length - 1);
    for (let k = 0; k < SEED_RIPE; k++) {
      const b = this.bushes[(start + k) % this.bushes.length];
      const spot = rng.int(0, SPOTS - 1);
      b.ripe |= 1 << spot;
      dealBerry(b, spot);
    }
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    stepGags();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    for (let i = 0; i < this.shakes.length; i++) if (this.shakes[i] > 0) this.shakes[i]--;
    for (let i = 0; i < this.splats.length; i++) if (this.splats[i].t < SPLAT_LIFE) this.splats[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateSeats(input);
      this.updateBushes();
      if (this.total >= this.target) this.finish();
    } else {
      // the sign hangs: the crew holds its last beat, nothing is stepped, no input counts
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather(this.ing, this.total);
        game.replace('map');
        return;
      }
    }
    tickClock(clock);
  }

  /** Every seat: the beats first (they lock the stick), then the stick along the path, the pick, the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.prickT > 0) { stepPrick(this, s); s.moving = false; s.player.tick(); continue; }
      if (s.squishT > 0) { stepSquish(this, s); s.moving = false; s.player.tick(); continue; }
      if (s.reachT > 0) { s.reachT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED * s.walk;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryPick(s);
      // a press that started a beat (the pick, or a joke) has just played that beat's anim: leave it be
      if (s.reachT === 0 && s.prickT === 0 && s.squishT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /**
   * `action`: the nearest bush inside the reach with a ripe berry on it gives up its LOWEST ripe spot (no random
   * number spent on which): the reach beat, the berry's hop, +1. Unless that berry is a joke: a thorn across it is the
   * prick and the berry stays; the squishy one comes off the bush into the paw, and is not scored. Only Barley's seat
   * spends a roll, on the gulp.
   */
  tryPick(s: BrambleSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.bushes.length; i++) {
      if (!this.bushes[i].ripe) continue;
      const bx = BUSH_X[i], d = bx > s.x ? bx - s.x : s.x - bx;
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    const b = this.bushes[best];
    let k = 0;
    while (!(b.ripe & (1 << k))) k++;
    const bit = 1 << k, bx = BUSH_X[best];
    s.facing = bx >= s.x ? 1 : -1;
    if (b.thorn & bit) { b.thorn &= ~bit; startPrick(this, s, best, k); return; }
    if (b.squish & bit) { b.squish &= ~bit; b.ripe &= ~bit; startSquish(this, s, best, k); return; }
    const spot = best * SPOTS + k, sx = this.spotX(spot), sy = this.spotY(spot);
    b.ripe &= ~bit;
    s.reachT = REACH_FRAMES; s.moving = false;
    seatAnim(s, 'pick', true);
    if (gulps(s)) { gulp(this.game, s, sx, sy - 14); return; }
    s.count++; this.setTotal(this.total + 1);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = sx; h.y0 = sy; h.seat = s.index;
    ringAt(sx, sy, 3, 10, UI.cream, 2, 12, false, true);
    burstSparkle(sx, sy - 4, 3, UI.cream, true);
    floatText(sx, sy - 14, PLUS_ONE, s.colour, 1, true);
    this.game.audio.play('catch');   // the orchard's basket and its pip: a berry lands in the same basket
  }

  /**
   * Where berry spot `spot` (bush * SPOTS + k) hangs on screen. Bush i is drawn mirrored on odd i (draw(): `i & 1`
   * is its variant), and its spots with it, so x comes through spotDX and never SPOT alone.
   */
  spotX(spot: number): number { const i = (spot / SPOTS) | 0; return BUSH_X[i] + spotDX(i & 1, spot % SPOTS); }
  spotY(spot: number): number { return BUSH_Y + SPOT[(spot % SPOTS) * 2 + 1]; }

  /** Ripen one more berry, on a seeded bush that has a green spot, on a seeded spot of it, and deal it. */
  updateBushes(): void {
    if (--this.nextRipen > 0) return;
    this.nextRipen = rng.int(RIPEN_MIN, RIPEN_MAX);
    const start = rng.int(0, this.bushes.length - 1);
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[(start + i) % this.bushes.length];
      if (b.ripe === ALL_RIPE) continue;
      let k = rng.int(0, SPOTS - 1);
      while (b.ripe & (1 << k)) k = (k + 1) % SPOTS;
      b.ripe |= 1 << k;
      dealBerry(b, k);
      return;
    }
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** A burst berry's juice lands on the path at (x, y) (cosmetic: brambleGags.ts splut). */
  splat(x: number, y: number): void {
    const sp = this.splats[this.splatCursor]; this.splatCursor = (this.splatCursor + 1) % this.splats.length;
    sp.t = 0; sp.x = x; sp.y = y;
  }

  /**
   * The round is over: drop the sign; a seat with berries in its basket cheers, one without sulks. A joke still
   * running is dropped where it stands (endJokes): the coat goes with its countdown, the basket comes back.
   */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.reachT = 0; s.moving = false;
      endJokes(s);
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.mid.L, 0, L.mid.y);
    // the bushes stand on the bank's foot behind the whole cast: ground contact, then each one with its berries
    // (the squishy ones swollen and wobbling on their own phase, a pricked bush shaking)
    for (let i = 0; i < this.bushes.length; i++) drawShadow(ctx, BUSH_X[i], BUSH_Y, 52, 0.3, 0);
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[i], ox = this.shakeX(i);
      drawBush(ctx, BUSH_X[i] + ox, BUSH_Y, i & 1, b.ripe, this.icon, this.hex, ((f + i * 7) >> 3) & 1, b.squish, (f + i * 5) >> 3);
      // a thorn across a ripe berry is drawn, so a sharp-eyed picker can see it coming: an inked bramble cane with
      // its spikes, laid over the berry's spot (where the berry hangs on THIS bush, mirrored or not: spotX)
      for (let k = 0; k < SPOTS; k++) if ((b.ripe & b.thorn) & (1 << k)) this.drawThorn(ctx, this.spotX(i * SPOTS + k) + ox, this.spotY(i * SPOTS + k));
    }
    // a reach on its way to a thorn: the bit went with the press, but the thorn is there until the paw gets to it
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.prickT > PRICK_TOTAL - PRICK_REACH) this.drawThorn(ctx, this.spotX(s.spot), this.spotY(s.spot));
    }
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    // the juice on the path goes down under the feet that are standing in it
    for (let i = 0; i < this.splats.length; i++) this.drawSplat(ctx, this.splats[i]);
    // ground contact first, then the cast back lane to front lane
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawGags(ctx);
    drawClock(ctx, this.countStr, this.total / this.target, this.clockIcon, this.title);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
    if (this.game.options.debug) this.drawWindows(ctx);
  }

  /**
   * The bramble across a berry: a cane drawn the way the bush's own are (4 px of ink under 2 px of cane), at a slant
   * over the berry, with two inked spikes standing off it, one up and one down. It used to be a bare 2 px ink line,
   * which at 1x over a 9 px berry was a pen mark and not a thorn anyone could see coming.
   */
  drawThorn(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 9, y + 5); ctx.lineTo(x + 9, y - 4);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = BUSH.cane; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(x - 4, y + 1); ctx.lineTo(x - 1, y - 6); ctx.lineTo(x + 1, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 3, y - 2); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x + 7, y - 3); ctx.closePath(); ctx.fill();
  }

  /** A pricked bush's sway this frame: 2 px either way on alternate pairs of frames, then 1 px over its second half. */
  shakeX(i: number): number {
    const t = this.shakes[i];
    return t > 0 ? ((t >> 1) & 1 ? 1 : -1) * (t > BUSH_SHAKE / 2 ? 2 : 1) : 0;
  }

  /** The juice on the path: full size, then a size smaller every SPLAT_STEP over its last frames, then gone. */
  drawSplat(ctx: CanvasRenderingContext2D, sp: Splat): void {
    if (sp.t >= SPLAT_LIFE) return;
    const left = SPLAT_LIFE - sp.t, n = SPLAT_RX.length;
    const k = left >= SPLAT_STEP * n ? 0 : n - 1 - ((left / SPLAT_STEP) | 0);
    drawJuiceSplat(ctx, sp.x, sp.y, SPLAT_RX[k], SPLAT_RY[k], this.juice, this.juiceSh);
  }

  /**
   * One seat. Coated after the squishy one's bang (game/gags.ts coat, in the visit's juice), down from a line that
   * sweeps or steps down the body as the juice goes (brambleGags.ts juiceLeft): the clean critter is drawn, then the
   * coated one again over it clipped to the rows below the line - the second pass with `still`, so the tail's chain
   * is stepped once. Before the bang, the squishy one is on the near paw's palm, read off the joint just drawn.
   */
  drawSeat(ctx: CanvasRenderingContext2D, s: BrambleSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    const wet = juiceLeft(s);
    if (wet < 1) drawRig(ctx, rig, s.player.pose, o);
    if (wet > 0) {
      const part = wet < 1;
      if (part) {
        // the line runs from the crown (wet 1) to the feet (wet 0); everything under it is coated, down to the
        // bottom of the screen, because a basket in the far paw can hang below the feet
        const top = s.y - rig.height * rig.scale - s.crown - 4, cut = R(s.y - (s.y - top) * wet);
        ctx.save(); ctx.beginPath(); ctx.rect(0, cut, VIEW_W, VIEW_H - cut); ctx.clip();
        o.still = true;
      }
      coat(rig, this.juice); drawRig(ctx, rig, s.player.pose, o); coat(rig, null);
      if (part) { ctx.restore(); o.still = false; }
    }
    jointScreen(rig, 'handN', s.basketPt);
    if (holding(s)) drawHeldBerry(ctx, s.basketPt.x, s.basketPt.y, s.facing, this.icon, this.hex, heldSize(s), heldPhase(s, this.frame));
    const sp = splashing(s);
    if (sp >= 0) drawJuiceSplash(ctx, heldX(s), heldY(s), SPLASH_R0 + sp * SPLASH_GROW, this.juice, this.hex);
  }

  /** The picked berry hops from its spot into the seat's basket over 12 frames (the basket point comes from the last drawSeat). */
  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    drawFlyingBerry(ctx, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT), this.icon, this.hex);
  }

  /** ?debug=1: each seat's reach against the bushes' bases (UI.red, the orchard's debug ink - never shipped art). */
  drawWindows(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    for (let i = 0; i < this.seats.length; i++) ctx.strokeRect(R(this.seats[i].x - REACH) + 0.5, BUSH_Y - BUSH_H - 0.5, REACH * 2, BUSH_H);
  }

  override summary() {
    return {
      total: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText,
      pricks: this.pricks, squishes: this.squishes, juice: this.juice,
      seats: this.seats.map((s) => ({
        slot: s.slot, critter: s.critter, x: R(s.x), count: s.count, reachT: s.reachT, prickT: s.prickT, squishT: s.squishT, anim: s.anim,
        /** How much of it is coated in juice, 0..1 (brambleGags.ts juiceLeft), and which paw has the basket. */
        wet: R(juiceLeft(s) * 100) / 100, basket: s.rig.weapon === RIBBON_BASKET ? 'near' : s.rig.weapon === FAR_BASKET ? 'far' : '',
      })),
      /** The ripe mask per bush, in BUSH_X order. */
      bushes: this.bushes.map((b) => b.ripe),
      /** The thorn mask per bush. */
      thorns: this.bushes.map((b) => b.thorn),
      /** The squishy-one mask per bush. */
      squishy: this.bushes.map((b) => b.squish),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.nextRipen, this.pricks, this.squishes);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.reachT, s.prickT, s.squishT, s.spot, s.moving ? 1 : 0);
    }
    for (let i = 0; i < this.bushes.length; i++) f.push(this.bushes[i].ripe, this.bushes[i].thorn, this.bushes[i].squish);
    return f;
  }
}
