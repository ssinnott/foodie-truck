// THYME TERRACE - HERBS, and the verb is SNIP (docs/CONTENT_ROADMAP.md section E; docs/GDD.md section 5). A walled
// herb bed on a warm morning: six clumps of the visit's herb stand along the bed at CLUMP_X, the crew works the
// gravel walk in front of them, and `action` with a clump anywhere under the critter (REACH either side) that still
// has a snip on it is one snip of the shears (a SNIP_FRAMES crouch): the sprig hops into the basket, +1, and the
// clump is one stage shorter. A clump gives SNIPS_PER_CLUMP snips and then stands as stubble, and grows back a
// stage every REGROW_STEP frames, each stage drawn, so the party is pushed along the bed and back. A visit is for
// mint, chives or rosemary (`gatherTarget`).
//
// TWO JOKES (their deal, beats and drawing are screens/terraceGags.ts; this file keeps the round they happen in):
//   THE HEDGEHOG  asleep under a clump, with a Z drifting up off it. The snip there wakes it with a start (!): it
//                 curls into a spiky ball and comes bouncing at the critter, off its shins - EEK! - and the critter
//                 leaps with its fur on end and lands hopping on one foot, while the hedgehog uncurls, glares (HMPH)
//                 and trundles off to sleep under another clump. No sprig: the clump keeps its snips.
//   THE TOPIARY   a clump grown WILD, twice the size, sprigs sticking out everywhere. The first snip at it and the
//                 shears run away with the critter: a storm of snipping, then the leaves settle - TA-DA! - on a hedge
//                 statue of the critter itself, and the clump's snips hop into the basket. The critter steps back,
//                 looks up at it, turns to the room and takes a bow; Barley takes a bite out of its head instead.
//                 The statue stands until the clump has grown back.
// Neither costs anything but the time.
//
// Determinism (docs/ARCHITECTURE.md section 0): the clumps, the seats and the hedgehog are plain sim objects built
// in enter(); every random number comes from the rng singleton (the opening deal in enter(), the rest inside
// update()). The sprig hops, the storm, the statue's canvas, the height of the leaps, the word cards and the
// particles are draw-side or cosmetic and stay out of checksumFields().
import { UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstSparkle } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { gatherTarget } from '../run.ts';
import { terraceLayers, CLUMP_X, CLUMP_Y } from '../../art/backgrounds/terrace.ts';
import { drawClump, drawWildClump, WILD_H, TERRACE_ANIMS } from '../../art/terraceProps.ts';
import { resetStatues, blankFace } from '../../art/terraceGags.ts';
import { NONE, tintJokes, dealJokes, grownBack, springJoke, stepJoke, stepHedgehog, cutting, endJokes, liftOf, drawTopiary, drawLook, drawStorms, drawHedgehogRun } from './terraceGags.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { clearGags, stepGags, drawGags } from '../gags.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint } from '../ui.ts';

const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'tap']);
const R = Math.round;
const SPEED = 2.0, X_MIN = 26, X_MAX = 614;
const LANE_Y0 = 322, LANE_GAP = 8;
/** Snips per full clump, the regrowth (a stage back every REGROW_STEP frames), and the reach. */
const SNIPS_PER_CLUMP = 3, REGROW_STEP = 50, REACH = 34, SNIP_FRAMES = 10;
const HOP_FRAMES = 12, HOP_LIFT = 14, MAX_HOPS = 4;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', TITLE = 'THYME TERRACE';

export interface TerraceSeat extends Seat {
  /** Frames left of the snip beat; the stick is locked while it runs. */
  reachT: number;
  /** The joke this seat is in (screens/terraceGags.ts HOG, TOPIARY or NONE), frames left of it (the stick is locked), and the clump it is at. */
  gag: number;
  gagT: number;
  gagAt: number;
  /** Where the basket is on screen, refilled from the `handN` joint by every drawSeat. */
  basketPt: Point;
  /**
   * The twin of this seat's rig that its statues are carved from, built once in enter(): its own joints, chains and
   * no basket, so drawing a statue never moves the seat's, and no face (art/terraceGags.ts blankFace). Draw-only.
   */
  statueRig: Rig;
}
/** One clump: snips on it (0..SNIPS_PER_CLUMP), frames toward its next stage, and the topiary on it. */
export interface Clump {
  snips: number;
  regrow: number;
  /** 1 = grown back WILD: the topiary's tell. */
  wild: number;
  /** 0, or 1 + the party index of the seat it is a statue of. A statue stands until the clump is back to full. */
  statue: number;
  /** The way the statue faces: back at the critter who made it. */
  face: number;
  /** 1 = Barley has had a bite out of the statue's head. */
  bite: number;
}
/**
 * The hedgehog: the clump it is at (`at`), the clump it goes to sleep under next (`to`), the frames of its run left
 * (0 = asleep), and the shins it bounces off on that run (`hitX`, `hitY`: the waker's feet row).
 */
export interface Hedgehog { at: number; to: number; t: number; hitX: number; hitY: number; }
export interface Hop { t: number; x0: number; y0: number; seat: number; }
export interface TerraceLayer { L: { canvas: HTMLCanvasElement; w: number; h: number }; y: number; }
export interface TerraceLayers { far: TerraceLayer; ground: TerraceLayer; near: TerraceLayer; }

export class TerraceScreen extends Screen {
  declare layers: TerraceLayers;
  declare seats: TerraceSeat[];
  declare clumps: Clump[];
  declare hog: Hedgehog;
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
  /** Times the hedgehog has been woken this round (the old joke's count). */
  declare eeks: number;
  /** Statues carved this round (the new joke's count). */
  declare topiaries: number;

  constructor(game: Game) { super(game, 'terrace'); this.seats = []; this.clumps = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = terraceLayers();
    particles.clear();
    clearGags();
    resetStatues();
    const place = PLACES.find((p) => p.id === params.place && p.screen === 'terrace');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'terrace');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.mint;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    tintJokes(hex);
    this.seats = makeSeats<TerraceSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(320 + (i - (n - 1) / 2) * 110);
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.reachT = 0; s.gag = NONE; s.gagT = 0; s.gagAt = -1;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.statueRig = critterRig(getCritter(s.critter), s.slot);
      s.statueRig.weapon = null;
      s.statueRig.parts = { ...s.statueRig.parts, face: blankFace };
      s.player.setOverlay(TERRACE_ANIMS);
      seatAnim(s, 'carry');
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }
    this.clumps = [];
    for (let i = 0; i < CLUMP_X.length; i++) this.clumps.push({ snips: SNIPS_PER_CLUMP, regrow: 0, wild: 0, statue: 0, face: 1, bite: 0 });
    this.hog = { at: -1, to: -1, t: 0, hitX: 0, hitY: 0 };
    dealJokes(this);
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    const need = run ? run.need(this.ing) : null;
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0; this.eeks = 0; this.topiaries = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   SNIP: ' + game.input.keyText(0, 'action');
    this.cardKey = game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    stepGags();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateClumps();
      stepHedgehog(this);
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

  /** Every clump short of full grows a stage back every REGROW_STEP frames (and back to full is dealt again: grownBack). */
  updateClumps(): void {
    for (let i = 0; i < this.clumps.length; i++) {
      const c = this.clumps[i];
      if (c.snips >= SNIPS_PER_CLUMP) continue;
      if (++c.regrow >= REGROW_STEP) { c.regrow = 0; if (++c.snips === SNIPS_PER_CLUMP) grownBack(c); }
    }
  }

  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.gagT > 0) { stepJoke(this, s); s.moving = false; s.player.tick(); continue; }
      if (s.reachT > 0) { s.reachT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.trySnip(s);
      if (s.reachT === 0 && s.gagT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /**
   * `action`: the nearest clump within REACH with a snip on it gives up a sprig - unless the snip springs a joke (the
   * hedgehog asleep under it, or it grown wild). A statue is not for snipping, and nor is a clump already in a storm.
   */
  trySnip(s: TerraceSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.clumps.length; i++) {
      const c = this.clumps[i];
      if (c.snips <= 0 || c.statue > 0 || cutting(this, i)) continue;
      const d = Math.abs(CLUMP_X[i] - s.x);
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    s.moving = false; s.facing = CLUMP_X[best] >= s.x ? 1 : -1;
    if (springJoke(this, s, best)) return;
    const c = this.clumps[best];
    c.snips--; c.regrow = 0;
    s.count++; this.setTotal(this.total + 1);
    s.reachT = SNIP_FRAMES;
    seatAnim(s, 'snip', true);
    this.hop(s, CLUMP_X[best], CLUMP_Y - 14, 0);
    ringAt(CLUMP_X[best], CLUMP_Y - 10, 3, 12, UI.cream, 2, 12, false, true);
    burstSparkle(CLUMP_X[best], CLUMP_Y - 16, 2, UI.cream, true);
    floatText(CLUMP_X[best], CLUMP_Y - 28, PLUS_ONE, s.colour, 1, true);
    this.game.audio.play('snip');
    this.game.audio.play('catch');
  }

  /** A sprig's hop from (x0, y0) into the seat's basket, `t0` frames from now (a negative start waits its turn). */
  hop(s: TerraceSeat, x0: number, y0: number, t0: number): void {
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = t0; h.x0 = x0; h.y0 = y0; h.seat = s.index;
  }

  /** One step along the walk toward `gap` px from the clump the seat's joke is at, on the side it is on: false once there. */
  stepTo(s: TerraceSeat, gap: number): boolean {
    const cx = CLUMP_X[s.gagAt], d = s.x - cx, side = d > 0 ? 1 : d < 0 ? -1 : -s.facing;
    const dx = Math.max(X_MIN, Math.min(X_MAX, cx + side * gap)) - s.x;
    if (dx === 0) return false;
    s.x += dx > 0 ? Math.min(SPEED, dx) : Math.max(-SPEED, dx);
    return true;
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign, every joke ends where it is (endJokes), and every seat with something in its basket cheers. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    endJokes(this);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; s.reachT = 0; s.moving = false; seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true); }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    for (let i = 0; i < this.clumps.length; i++) this.drawClumpAt(ctx, i, f);
    drawHedgehogRun(ctx, this, f, false);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, liftOf(s)); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    drawHedgehogRun(ctx, this, f, true);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    drawStorms(ctx, this, f);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawGags(ctx);
    drawClock(ctx, this.countStr, this.total / this.target, this.clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** A clump at its stage (or grown wild, or the topiary's: a statue, or lost in a storm), and the sparkle over one with a snip left on it. */
  drawClumpAt(ctx: CanvasRenderingContext2D, i: number, f: number): void {
    if (drawTopiary(ctx, this, i)) return;
    const c = this.clumps[i], x = CLUMP_X[i];
    if (c.wild) drawWildClump(ctx, x, CLUMP_Y, this.ing, f + i * 23); else drawClump(ctx, x, CLUMP_Y, this.ing, c.snips);
    if (c.snips > 0 && (((f + i * 7) >> 3) & 1) && !cutting(this, i)) {
      const y = CLUMP_Y - (c.wild ? WILD_H + 8 : 40);
      ctx.fillStyle = SIGNAL.terrace; ctx.fillRect(x + 13, y, 2, 8); ctx.fillRect(x + 10, y + 3, 8, 2);
    }
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: TerraceSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y - liftOf(s); o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
    drawLook(ctx, this, s);
  }

  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t < 0 || h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    drawFood(ctx, this.icon, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT), 6, this.hex);
  }

  override summary() {
    return {
      total: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText, ing: this.ing,
      eeks: this.eeks, topiaries: this.topiaries,
      seats: this.seats.map((s) => ({ slot: s.slot, critter: s.critter, x: R(s.x), facing: s.facing, count: s.count, reachT: s.reachT, gag: s.gag, gagT: s.gagT, gagAt: s.gagAt, anim: s.anim })),
      /** [x, snips, regrow, wild, statue, face, bite] per clump. */
      clumps: this.clumps.map((c, i) => [CLUMP_X[i], c.snips, c.regrow, c.wild, c.statue, c.face, c.bite]),
      hog: { at: this.hog.at, to: this.hog.to, t: this.hog.t, hitX: this.hog.hitX, hitY: this.hog.hitY },
    };
  }

  override checksumFields(): number[] {
    const f = this.fields, h = this.hog; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.eeks, this.topiaries, h.at, h.to, h.t, h.hitX, h.hitY);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.reachT, s.gag, s.gagT, s.gagAt, s.moving ? 1 : 0); }
    for (let i = 0; i < this.clumps.length; i++) { const c = this.clumps[i]; f.push(c.snips, c.regrow, c.wild, c.statue, c.face, c.bite); }
    return f;
  }
}
