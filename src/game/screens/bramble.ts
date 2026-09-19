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
// Determinism (docs/ARCHITECTURE.md section 0): the bushes are six plain sim objects built in enter() and never
// grown; every random number - which bush ripens next, how long until it does - comes from the rng singleton
// inside update(); the ripe state is a 3-bit INTEGER mask per bush; input is read by seat slot only. The berry
// hops and the float text are cosmetic pools on their own streams and stay out of checksumFields().
//
// One signal, and only one (docs/ART_STYLE.md section 4): SIGNAL.garden gold, on the sparkle over a ripe berry -
// "the thing you want", the farm's own mark, because the bank shares the farm's accent and its hour. There is no
// SIGNAL.hot anywhere in this scene: nothing on a bank of brambles can hurt you (the thorns are drawn, not
// simulated).
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstSparkle } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { gatherTarget } from '../run.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { brambleLayers, ROWS, BUSH_X } from '../../art/backgrounds/bramble.ts';
import { BUSH_H, SPOT, BRAMBLE_ANIMS, drawBush, drawFlyingBerry } from '../../art/brambleProps.ts';
import {
  makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates,
} from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
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
/** Berry spots per bush, and the mask with every one of them ripe. */
const SPOTS = 3, ALL_RIPE = (1 << SPOTS) - 1;
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
/** The sparkle's blink, index-hashed per bush so the bank never blinks as one object. */
const PLUS_ONE = '+1';
const TITLE = 'BRAMBLE BANK', FALLBACK_TARGET = 4;

/** One seat working the path: the shared seat plus the reach beat and the basket point the hop flies to. */
export interface BrambleSeat extends Seat {
  /** Frames left of the pick beat; the stick is locked while it runs. */
  reachT: number;
  /** Where the basket is on screen, refilled from the `handN` joint by every drawSeat. */
  basketPt: Point;
}

/** One bush of the six: its ripe mask over the three spots. A number, not three booleans: checksumFields() hashes it. */
export interface Bush {
  /** Bit k set = spot k holds a ripe berry. */
  ripe: number;
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
  /**
   * What the bank grows this visit (game/run.js gatherTarget): strawberries or blueberries. `icon`/`hex` are its
   * glyph, the sign prefix its name, the title the landmark's.
   */
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare title: string;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** The backdrop, pre-rendered once (art/backgrounds/bramble.js brambleLayers) and blitted per frame. */
  declare layers: BrambleBackdrop;
  /** Frames until the next berry ripens (RIPEN_MIN..RIPEN_MAX). */
  declare nextRipen: number;
  /** The berry hops: a fixed cosmetic pool. */
  declare hops: Hop[];
  /** Next slot of `hops` to reuse. */
  declare hopCursor: number;
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

    const place = PLACES.find((p) => p.id === params.place && p.screen === 'bramble');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'bramble');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.strawberry;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    this.title = place ? place.name : TITLE;
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);

    this.seats = makeSeats<BrambleSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length, pitch = Math.min(120, R((X_MAX - X_MIN) / (n + 1)));
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * pitch);
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.reachT = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(BRAMBLE_ANIMS);
      seatAnim(s, 'carry');
      // four people on a path, not one pose printed four times: each seat starts its breath a beat later (pose
      // only - nothing in summary() or the checksum reads the anim clock)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }

    this.bushes = [];
    for (let i = 0; i < BUSH_X.length; i++) this.bushes.push({ ripe: 0 });
    this.seedBank();
    this.nextRipen = rng.int(RIPEN_MIN, RIPEN_MAX);

    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;

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
   * and never three on one bush and an empty end of the path.
   */
  seedBank(): void {
    const start = rng.int(0, this.bushes.length - 1);
    for (let k = 0; k < SEED_RIPE; k++) {
      const b = this.bushes[(start + k) % this.bushes.length];
      b.ripe |= 1 << rng.int(0, SPOTS - 1);
    }
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
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

  /** Every seat: the beat first (it locks the stick), then the stick along the path, the pick, the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.reachT > 0) { s.reachT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryPick(s);
      if (s.reachT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /**
   * `action`: the nearest bush inside the reach with a ripe berry on it gives up its LOWEST ripe spot (no random
   * number spent on which, so a pick costs the rng stream nothing): the reach beat, the berry's hop, +1.
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
    b.ripe &= ~(1 << k);
    const bx = BUSH_X[best], sx = bx + SPOT[k * 2], sy = BUSH_Y + SPOT[k * 2 + 1];
    s.count++; this.setTotal(this.total + 1);
    s.reachT = REACH_FRAMES; s.moving = false;
    s.facing = bx >= s.x ? 1 : -1;
    seatAnim(s, 'pick', true);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = sx; h.y0 = sy; h.seat = s.index;
    ringAt(sx, sy, 3, 10, UI.cream, 2, 12, false, true);
    burstSparkle(sx, sy - 4, 3, UI.cream, true);
    floatText(sx, sy - 14, PLUS_ONE, s.colour, 1, true);
    this.game.audio.play('catch');   // the orchard's basket and its pip: a berry lands in the same basket
  }

  /** Ripen one more berry, on a seeded bush that has a green spot, on a seeded spot of it. */
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
      return;
    }
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with berries in its basket cheers, one without sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.reachT = 0; s.moving = false;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.mid.L, 0, L.mid.y);
    // the bushes stand on the bank's foot behind the whole cast: ground contact, then each one with its berries
    for (let i = 0; i < this.bushes.length; i++) drawShadow(ctx, BUSH_X[i], BUSH_Y, 52, 0.3, 0);
    for (let i = 0; i < this.bushes.length; i++) drawBush(ctx, BUSH_X[i], BUSH_Y, i & 1, this.bushes[i].ripe, this.icon, this.hex, ((f + i * 7) >> 3) & 1);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    // ground contact first, then the cast back lane to front lane
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.countStr, this.total / this.target, this.clockIcon, this.title);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
    if (this.game.options.debug) this.drawWindows(ctx);
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: BrambleSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
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
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), count: s.count, reachT: s.reachT, anim: s.anim })),
      /** The ripe mask per bush, in BUSH_X order. */
      bushes: this.bushes.map((b) => b.ripe),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.nextRipen);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.reachT, s.moving ? 1 : 0);
    }
    for (let i = 0; i < this.bushes.length; i++) f.push(this.bushes[i].ripe);
    return f;
  }
}
