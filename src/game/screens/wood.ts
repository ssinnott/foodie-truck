// TANGLE WOOD - and the verb is FORAGE (docs/CONTENT_ROADMAP.md section E; docs/GDD.md section 5). A dark wood on
// the coop's side of the river: things hide in the leaf litter along the band the crew walks. A BUMP lifts in the
// leaves every SPAWN_MIN..SPAWN_MAX frames at a free x (LIFT_FRAMES of rising, then it SHOWS with the gold sparkle
// over it), and `action` with a showing bump anywhere under the critter (REACH either side) brushes the leaves off
// it: a BRUSH_FRAMES crouch, the thing hops into the basket, +1. A visit is for mushrooms, wild garlic or
// blackberries (`gatherTarget`), and every bump hides that. THE JOKE: one bump in TOADSTOOL_ODDS lifts red with
// white spots; brushing it off is the shared bump beat, a wrinkled nose and POOH!, and it sinks back into the
// litter. Nothing is lost. The round ends when the party's total reaches the order's remainder, and not before.
//
// Determinism (docs/ARCHITECTURE.md section 0): the bumps and the seats are fixed pools of plain sim objects built
// in enter(); every random number comes from the rng singleton inside update(); the lift, the hops and the
// particles are draw-side. Everything in the checksum is an integer.
import { UI, SIGNAL } from '../../constants.ts';
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
import { woodLayers, WOOD, ROWS } from '../../art/backgrounds/wood.ts';
import { drawBump, drawToadstool, WOOD_ANIMS } from '../../art/woodProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint } from '../ui.ts';

const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'tap']);
const R = Math.round;
const SPEED = 2.0, X_MIN = 26, X_MAX = 614;
const LANE_Y0 = 322, LANE_GAP = 8;
/** The bumps lie on the litter just behind the lanes' feet. */
const BUMP_Y = ROWS.band - 8;
/** The pool, the spawn timer, how far apart bumps lie, and how long one takes to lift before it shows. */
const MAX_BUMPS = 8, SEED_BUMPS = 4, SPAWN_MIN = 70, SPAWN_MAX = 120, MIN_GAP = 44, B_X_MIN = 40, B_X_MAX = 600, SPAWN_TRIES = 8, LIFT_FRAMES = 20;
/** A showing bump sinks back on its own after this long unbrushed, so the litter never fills up with things nobody wants. */
const SHOW_FRAMES = 900;
const REACH = 34, BRUSH_FRAMES = 12;
/** The toadstool: one bump in TOADSTOOL_ODDS; brushing it is the shared bump beat, POOH_FRAMES long. */
const TOADSTOOL_ODDS = 8, POOH_FRAMES = 20;
const HOP_FRAMES = 12, HOP_LIFT = 14, MAX_HOPS = 4;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', POOH = 'POOH!', TITLE = 'TANGLE WOOD';

export interface WoodSeat extends Seat {
  /** Frames left of the brush or the pooh beat; the stick is locked while it runs. */
  reachT: number;
  basketPt: Point;
}
/** One bump of the pool: lifting (`lift` 0..LIFT_FRAMES), then showing for `show` frames, a toadstool or the visit's thing. */
export interface Bump {
  active: boolean;
  x: number;
  lift: number;
  show: number;
  toadstool: number;
}
export interface Hop { t: number; x0: number; y0: number; seat: number; }
export interface WoodLayer { L: { canvas: HTMLCanvasElement; w: number; h: number }; y: number; }
export interface WoodLayers { far: WoodLayer; ground: WoodLayer; near: WoodLayer; }

export class WoodScreen extends Screen {
  declare layers: WoodLayers;
  declare seats: WoodSeat[];
  declare bumps: Bump[];
  declare nextSpawn: number;
  declare hops: Hop[];
  declare hopCursor: number;
  declare target: number;
  declare total: number;
  declare countStr: string;
  declare hint: string;
  declare cardKey: string;
  declare clock: Clock;
  declare fields: number[];
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** Toadstools brushed this round (the joke's count). */
  declare poohs: number;

  constructor(game: Game) { super(game, 'wood'); this.seats = []; this.bumps = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = woodLayers();
    particles.clear();
    const place = PLACES.find((p) => p.id === params.place && p.screen === 'wood');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'wood');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.mushroom;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    this.seats = makeSeats<WoodSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(320 + (i - (n - 1) / 2) * 110);
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.reachT = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(WOOD_ANIMS);
      seatAnim(s, 'carry');
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }
    this.bumps = [];
    for (let i = 0; i < MAX_BUMPS; i++) this.bumps.push({ active: false, x: 0, lift: 0, show: 0, toadstool: 0 });
    // the wood the truck arrives to: SEED_BUMPS already showing, spread along the litter
    for (let i = 0; i < SEED_BUMPS; i++) { const x = this.freeX(); if (x >= 0) this.lay(x, LIFT_FRAMES); }
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    const need = run ? run.need(this.ing) : null;
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0; this.poohs = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   BRUSH: ' + game.input.keyText(0, 'action');
    this.cardKey = game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
  }

  /** A seeded x at least MIN_GAP from every bump that is up, or -1 if the litter is too full. */
  freeX(): number {
    for (let k = 0; k < SPAWN_TRIES; k++) {
      const x = rng.int(B_X_MIN, B_X_MAX);
      let ok = true;
      for (let i = 0; i < this.bumps.length && ok; i++) { const b = this.bumps[i]; if (b.active && Math.abs(b.x - x) < MIN_GAP) ok = false; }
      if (ok) return x;
    }
    return -1;
  }

  /** One more bump at `x`, `lift` frames into its lift, a toadstool one time in TOADSTOOL_ODDS. */
  lay(x: number, lift: number): void {
    let slot = -1;
    for (let i = 0; i < this.bumps.length; i++) if (!this.bumps[i].active) { slot = i; break; }
    if (slot < 0) return;
    const b = this.bumps[slot];
    b.active = true; b.x = x; b.lift = lift; b.show = 0; b.toadstool = rng.int(1, TOADSTOOL_ODDS) === 1 ? 1 : 0;
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateBumps();
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

  /** Every bump lifts, then shows; a showing one sinks back after SHOW_FRAMES; and one more lifts on the spawn timer. */
  updateBumps(): void {
    for (let i = 0; i < this.bumps.length; i++) {
      const b = this.bumps[i];
      if (!b.active) continue;
      if (b.lift < LIFT_FRAMES) b.lift++;
      else if (++b.show >= SHOW_FRAMES) b.active = false;
    }
    if (--this.nextSpawn > 0) return;
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
    const x = this.freeX();
    if (x >= 0) this.lay(x, 0);
  }

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
      if (input.pressed(s.slot, 'action')) this.tryBrush(s);
      if (s.reachT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** `action`: the nearest SHOWING bump within REACH is brushed - the thing into the basket, or the toadstool's pooh. */
  tryBrush(s: WoodSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.bumps.length; i++) {
      const b = this.bumps[i];
      if (!b.active || b.lift < LIFT_FRAMES) continue;
      const d = Math.abs(b.x - s.x);
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    const b = this.bumps[best];
    b.active = false;
    s.moving = false; s.facing = b.x >= s.x ? 1 : -1;
    if (b.toadstool) { this.pooh(s, b.x); return; }
    s.count++; this.setTotal(this.total + 1);
    s.reachT = BRUSH_FRAMES;
    seatAnim(s, 'brush', true);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = b.x; h.y0 = BUMP_Y - 8; h.seat = s.index;
    ringAt(b.x, BUMP_Y - 4, 3, 12, UI.cream, 2, 12, true, true);
    particles.burst('leaf', b.x, BUMP_Y - 6, 5, { speed: 1.2, up: 1.4, color: WOOD.leaf, color2: WOOD.leafPale, size: 3, life: 40, gravity: 0.06, screen: true });
    floatText(b.x, BUMP_Y - 20, PLUS_ONE, s.colour, 1, true);
    this.game.audio.play('brush');
    this.game.audio.play('catch');
  }

  /** The joke: it was a toadstool. The shared bump beat, a wrinkled nose, POOH!, and it sinks back. Nothing lost. */
  pooh(s: WoodSeat, x: number): void {
    this.poohs++;
    s.reachT = POOH_FRAMES;
    seatAnim(s, 'pooh', true);
    ringAt(x, BUMP_Y - 4, 3, 12, UI.cream, 2, 10, true, true);
    floatText(s.x, s.y - 66, POOH, UI.cream, 1, true);
    this.game.audio.play('pooh');
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; s.reachT = 0; s.moving = false; seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true); }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    for (let i = 0; i < this.bumps.length; i++) this.drawBumpAt(ctx, this.bumps[i], i, f);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.countStr, this.total / this.target, this.clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** A bump lifting out of the litter, and the sparkle over one that is showing: the one bright thing in the wood. */
  drawBumpAt(ctx: CanvasRenderingContext2D, b: Bump, i: number, f: number): void {
    if (!b.active) return;
    const k = b.lift / LIFT_FRAMES;
    if (b.toadstool) drawToadstool(ctx, b.x, BUMP_Y, k); else drawBump(ctx, b.x, BUMP_Y, k, this.icon, this.hex);
    if (k >= 1 && (((f + i * 7) >> 3) & 1)) { ctx.fillStyle = SIGNAL.wood; ctx.fillRect(b.x + 11, BUMP_Y - 26, 2, 8); ctx.fillRect(b.x + 8, BUMP_Y - 23, 8, 2); }
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: WoodSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
  }

  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    drawFood(ctx, this.icon, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT), 6, this.hex);
  }

  override summary() {
    return {
      total: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText, ing: this.ing, poohs: this.poohs,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), count: s.count, reachT: s.reachT, anim: s.anim })),
      /** [x, lift, toadstool] per bump that is up. */
      bumps: this.bumps.filter((b) => b.active).map((b) => [b.x, b.lift, b.toadstool]),
    };
  }

  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.nextSpawn, this.poohs);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.reachT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.bumps.length; i++) { const b = this.bumps[i]; f.push(b.active ? 1 : 0, b.x, b.lift, b.show, b.toadstool); }
    return f;
  }
}
