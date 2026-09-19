// HAZEL HOLT - NUTS, and the verb is SHAKE (docs/CONTENT_ROADMAP.md section E; docs/GDD.md section 5). A nut grove
// in September light: four nut trees stand at fixed x on the leaf litter, every seat walks left and right in front
// of them on its own depth lane with a basket, and HOLDING `action` within REACH of a tree that still has nuts in it
// SHAKES it: the canopy sways harder as a bar fills over SHAKE_HOLD frames of holding (the shake belongs to the
// TREE, so letting go early keeps the bar for the next hold, and a second seat can carry on where the first left
// off), and at the top a shower of SHOWER_MIN..SHOWER_MAX nuts comes down into the basket one every SHOWER_EVERY
// frames, each one +1, and that tree is bare for BARE_FRAMES, so the party is pushed along the grove. Nothing here
// hurts: THE JOKE is the squirrel - one shake in SQUIRREL_ODDS brings it down with the nuts, and it lands on the
// shaker's head, sits there indignant for SQUIRREL_FRAMES (the stick locked, the nuts still falling), then runs
// off. The round ends when the party's total reaches the order's remainder, and not before; the NUTS sign drops,
// is held, then run.gather() and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the trees and the seats are fixed pools of plain sim objects built
// in enter(); every random number comes from the rng singleton inside update(); the sway, the nut flights and the
// squirrel's run are draw-side reads of the timers. Everything in the checksum is an integer.
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstSparkle } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { gatherTarget } from '../run.ts';
import { holtLayers, HOLT, ROWS, TREE_X, CRATE_X } from '../../art/backgrounds/holt.ts';
import { drawNutTree, drawNutSpark, drawSquirrel, drawNutCrate, HOLT_ANIMS, TREE_Y, TRUNK_H } from '../../art/holtProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint, drawBar } from '../ui.ts';

/** The HOW TO PLAY card's pictograms (game/controlcard.ts), in the order they are read. */
const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'hold']);
const R = Math.round;
const SPEED = 1.8, X_MIN = 24, X_MAX = 616;
/** Seat i stands with its feet at LANE_Y0 - i * LANE_GAP: P1 in front, four lanes 8 px apart so bodies stack. */
const LANE_Y0 = 322, LANE_GAP = 8;
/** The shake: REACH either side of a trunk; SHAKE_HOLD held frames bring the shower; the tree is bare BARE_FRAMES after. */
const REACH = 36, SHAKE_HOLD = 60, BARE_FRAMES = 150;
/** The shower: SHOWER_MIN..SHOWER_MAX nuts, one every SHOWER_EVERY frames, each on a NUT_FLIGHT-frame arc into the basket. */
const SHOWER_MIN = 5, SHOWER_MAX = 8, SHOWER_EVERY = 5, NUT_FLIGHT = 14, MAX_FLIGHTS = 8;
/** The squirrel: one shake in SQUIRREL_ODDS; it sits on the head SQUIRREL_FRAMES, the last SQUIRREL_RUN of them running off. */
const SQUIRREL_ODDS = 6, SQUIRREL_FRAMES = 40, SQUIRREL_RUN = 10;
/** The sway the canopy is drawn with as the bar fills: up to SWAY_MAX px, alternating every 4 frames. */
const SWAY_MAX = 6;
const SHAKE_BAR_W = 30, SHAKE_BAR_H = 5, SHAKE_BAR_ABOVE = TRUNK_H + 56;
/** The shake's rustle replays every RUSTLE_EVERY held frames. */
const RUSTLE_EVERY = 12;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', TITLE = 'HAZEL HOLT';
const SHAKE_BAR = { color: SIGNAL.holt };
const HEAD: Point = { x: 0, y: 0 };

export interface HoltSeat extends Seat {
  /** Index into TREE_X of the tree this seat is shaking, -1 for none. */
  tree: number;
  /** Frames left of the squirrel on the head; the stick is locked while it runs. */
  squirrelT: number;
  /** Where the basket is on screen, refilled from the `handN` joint by every drawSeat. */
  basketPt: Point;
}

/** One nut tree: how far it is shaken (0..SHAKE_HOLD, kept between holds), who is shaking it, how long until it has nuts again, and the shower left in it. */
export interface Tree {
  shake: number;
  /** 1 while a seat has hold of the trunk. */
  held: number;
  /** Frames until it has nuts again; 0 = full. */
  refill: number;
  /** Nuts still to fall from the last shake, and the frames to the next one. */
  shower: number;
  showerT: number;
  /** The party index of the seat the shower falls to. */
  owner: number;
}

/** A nut on its way from the canopy into a basket (cosmetic). */
export interface NutFlight {
  t: number;
  x0: number;
  y0: number;
  seat: number;
}

export interface HoltLayer { L: { canvas: HTMLCanvasElement; w: number; h: number }; y: number; }
export interface HoltLayers { far: HoltLayer; ground: HoltLayer; near: HoltLayer; }

export class HoltScreen extends Screen {
  declare layers: HoltLayers;
  declare seats: HoltSeat[];
  declare trees: Tree[];
  declare flights: NutFlight[];
  declare flightCursor: number;
  declare target: number;
  declare total: number;
  declare countStr: string;
  declare hint: string;
  declare cardKey: string;
  declare clock: Clock;
  declare fields: number[];
  /** What this visit shakes down (game/run.js gatherTarget): hazelnuts, walnuts or chestnuts. */
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** Squirrels that have come down this round (the joke's count). */
  declare squirrels: number;

  constructor(game: Game) { super(game, 'holt'); this.seats = []; this.trees = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = holtLayers();
    particles.clear();
    const place = PLACES.find((p) => p.id === params.place && p.screen === 'holt');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'holt');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.hazelnut;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    this.seats = makeSeats<HoltSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = TREE_X[n === 1 ? 1 : R(i * (TREE_X.length - 1) / (n - 1))];
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.tree = -1; s.squirrelT = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(HOLT_ANIMS);
      seatAnim(s, 'carry');
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }
    this.trees = [];
    for (let i = 0; i < TREE_X.length; i++) this.trees.push({ shake: 0, held: 0, refill: 0, shower: 0, showerT: 0, owner: 0 });
    this.flights = [];
    for (let i = 0; i < MAX_FLIGHTS; i++) this.flights.push({ t: NUT_FLIGHT, x0: 0, y0: 0, seat: 0 });
    this.flightCursor = 0;
    const need = run ? run.need(this.ing) : null;
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0; this.squirrels = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   SHAKE: HOLD ' + game.input.keyText(0, 'action') + ' AT A TREE';
    this.cardKey = game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (let i = 0; i < this.flights.length; i++) if (this.flights[i].t < NUT_FLIGHT) this.flights[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateTrees();
      this.updateSeats(input);
      if (this.total >= this.target) this.finish();
    } else {
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather(this.ing, this.total);
        game.replace('map');
        return;
      }
    }
    tickClock(clock);
  }

  /** The trees: a bare one counts itself back to full, and a shower drops one nut every SHOWER_EVERY frames until it is spent. */
  updateTrees(): void {
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.refill > 0) t.refill--;
      if (t.shower > 0 && --t.showerT <= 0) {
        t.shower--; t.showerT = SHOWER_EVERY;
        this.dropNut(i, t);
      }
    }
  }

  /** One nut of a shower: +1 to the seat it falls to and to the party (never past the target), a flight into the basket, the pip. */
  dropNut(i: number, t: Tree): void {
    if (this.total >= this.target) { t.shower = 0; return; }
    const s = this.seats[t.owner];
    s.count++; this.setTotal(this.total + 1);
    const fl = this.flights[this.flightCursor]; this.flightCursor = (this.flightCursor + 1) % this.flights.length;
    fl.t = 0; fl.x0 = TREE_X[i] + (((t.shower * 7) % 5) - 2) * 8; fl.y0 = TREE_Y - TRUNK_H - 10; fl.seat = s.index;
    floatText(fl.x0, fl.y0 - 8, PLUS_ONE, s.colour, 1, true);
    this.game.audio.play('nut');
  }

  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.bumpT > 0) { s.bumpT--; s.moving = false; s.player.tick(); continue; }
      // the squirrel on the head: everything waits until it runs off
      if (s.squirrelT > 0) { if (--s.squirrelT === 0) seatAnim(s, 'carry', true); s.moving = false; s.player.tick(); continue; }
      const held = input.held(s.slot, 'action');
      if (held) {
        if (s.tree < 0) this.tryShake(s);
        else this.shakeOn(s);
        if (s.tree >= 0 || s.squirrelT > 0) { s.moving = false; s.player.tick(); continue; }
      } else if (s.tree >= 0) this.letGo(s);
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** The nearest FULL, unheld tree within REACH takes the hold: the seat faces the trunk and the shake stance starts. */
  tryShake(s: HoltSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.refill > 0 || t.held || t.shower > 0) continue;
      const x = TREE_X[i], d = s.x > x ? s.x - x : x - s.x;
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    this.trees[best].held = 1; this.trees[best].shake++;   // the first held frame counts, as the hive's does
    s.tree = best; s.moving = false;
    s.facing = TREE_X[best] >= s.x ? 1 : -1;
    seatAnim(s, 'shake', true);
    this.game.audio.play('shake');
  }

  /** One more held frame: the tree's shake climbs, and the SHAKE_HOLDth brings the shower. */
  shakeOn(s: HoltSeat): void {
    const t = this.trees[s.tree];
    t.shake++;
    if (t.shake % RUSTLE_EVERY === 0) this.game.audio.play('shake');
    if (t.shake >= SHAKE_HOLD) this.shower(s, s.tree);
  }

  /** The button came up short: the trunk is let go, and the tree KEEPS its shake for the next hold. */
  letGo(s: HoltSeat): void {
    if (s.tree >= 0) this.trees[s.tree].held = 0;
    s.tree = -1;
    seatAnim(s, 'carry', true);
  }

  /** The shower: SHOWER_MIN..SHOWER_MAX nuts start falling to this seat, the tree goes bare, and one shake in six brings the squirrel. */
  shower(s: HoltSeat, i: number): void {
    const t = this.trees[i];
    t.shake = 0; t.held = 0; t.refill = BARE_FRAMES;
    t.shower = rng.int(SHOWER_MIN, SHOWER_MAX); t.showerT = 1; t.owner = s.index;
    s.tree = -1;
    const cx = TREE_X[i], cy = TREE_Y - TRUNK_H;
    ringAt(cx, cy, 8, 40, UI.cream, 2, 14, false, true);
    burstSparkle(cx, cy, 6, SIGNAL.holt, true);
    particles.burst('leaf', cx, cy, 8, { speed: 1.4, up: 0.6, color: HOLT.leaf, color2: HOLT.leafDark, size: 3, life: 60, gravity: 0.05, screen: true });
    if (rng.int(1, SQUIRREL_ODDS) === 1) { s.squirrelT = SQUIRREL_FRAMES; this.squirrels++; seatAnim(s, 'squirrelHat', true); this.game.audio.play('chitter'); }
    else seatAnim(s, 'carry', true);
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.tree >= 0) this.trees[s.tree].held = 0;
      s.moving = false; s.bumpT = 0; s.tree = -1; s.squirrelT = 0;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
    for (const t of this.trees) t.shower = 0;
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    for (let i = 0; i < this.trees.length; i++) drawShadow(ctx, TREE_X[i], TREE_Y + 1, 40, 0.3, 0);
    for (let i = 0; i < this.trees.length; i++) this.drawTreeAt(ctx, i, f);
    drawNutCrate(ctx, CRATE_X, ROWS.band, this.total, this.icon, this.hex);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i], f);
    for (let i = 0; i < this.flights.length; i++) this.drawFlight(ctx, this.flights[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    for (let i = 0; i < this.trees.length; i++) this.drawShakeBar(ctx, i);
    drawClock(ctx, this.countStr, this.total / this.target, this.clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** A tree, swaying with its shake, the nuts in it while it is full, the sparkle over one that can be shaken. */
  drawTreeAt(ctx: CanvasRenderingContext2D, i: number, f: number): void {
    const t = this.trees[i], full = t.refill === 0 && t.shower === 0;
    const amp = t.held ? R(SWAY_MAX * t.shake / SHAKE_HOLD) + 1 : 0, sway = amp ? (((f >> 2) & 1) ? amp : -amp) : 0;
    drawNutTree(ctx, TREE_X[i], TREE_Y, i, sway, full || t.shower > 0, this.icon, this.hex);
    if (full && (((f + i * 7) >> 3) & 1)) drawNutSpark(ctx, TREE_X[i], TREE_Y - TRUNK_H - 50, SIGNAL.holt);
  }

  /** The bar over a tree being shaken (or one shaken part way and let go): the hold made visible as a fill. */
  drawShakeBar(ctx: CanvasRenderingContext2D, i: number): void {
    const t = this.trees[i];
    if (t.shake <= 0 || t.refill > 0) return;
    drawBar(ctx, TREE_X[i] - SHAKE_BAR_W / 2, TREE_Y - SHAKE_BAR_ABOVE, SHAKE_BAR_W, SHAKE_BAR_H, t.shake / SHAKE_HOLD, SHAKE_BAR);
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: HoltSeat, f: number): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
    // the squirrel on the head, and in its last frames running off it toward the nearest trunk
    if (s.squirrelT > 0) {
      const h = jointScreen(rig, 'head', HEAD), top = h.y - rig.p.headR * rig.scale;
      const run = s.squirrelT < SQUIRREL_RUN ? (SQUIRREL_RUN - s.squirrelT) * 6 : 0;
      drawSquirrel(ctx, h.x + s.facing * run, top - run * 0.4, s.facing);
    }
  }

  /** A nut on its arc from the canopy into the seat's basket. */
  drawFlight(ctx: CanvasRenderingContext2D, fl: NutFlight): void {
    if (fl.t >= NUT_FLIGHT) return;
    const s = this.seats[fl.seat], k = fl.t / NUT_FLIGHT;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    drawFood(ctx, this.icon, R(fl.x0 + (tx - fl.x0) * k), R(fl.y0 + (ty - fl.y0) * k + Math.sin(k * Math.PI) * 8), 5, this.hex);
  }

  override summary() {
    return {
      total: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText, ing: this.ing, squirrels: this.squirrels,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), count: s.count, tree: s.tree, squirrelT: s.squirrelT, anim: s.anim })),
      /** [x, shake, held, refill, shower] per tree. */
      trees: this.trees.map((t, i) => [TREE_X[i], t.shake, t.held, t.refill, t.shower]),
    };
  }

  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.squirrels);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.tree, s.squirrelT, s.bumpT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.trees.length; i++) { const t = this.trees[i]; f.push(t.shake, t.held, t.refill, t.shower, t.showerT, t.owner); }
    return f;
  }
}
