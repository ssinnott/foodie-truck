// THYME TERRACE - HERBS, and the verb is SNIP (docs/CONTENT_ROADMAP.md section E; docs/GDD.md section 5). A walled
// herb bed on a warm morning: six clumps of the visit's herb stand along the bed at CLUMP_X, the crew works the
// gravel walk in front of them, and `action` with a clump anywhere under the critter (REACH either side) that still
// has a snip on it is one snip of the shears (a SNIP_FRAMES crouch): the sprig hops into the basket, +1, and the
// clump is one stage shorter. A clump gives SNIPS_PER_CLUMP snips and then stands as stubble, and grows back a
// stage every REGROW_STEP frames, each stage drawn, so the party is pushed along the bed and back. A visit is for
// mint, chives or rosemary (`gatherTarget`). THE JOKE: the hedgehog is asleep under one clump (one in
// HEDGEHOG_ODDS has it when the truck pulls up); the snip at that clump wakes it - the critter jumps back, EEK!,
// for EEK_FRAMES, no sprig - and it uncurls, snuffles, and trundles off to sleep under another clump. Nothing is
// lost: the clump keeps its snips for the next reach.
//
// Determinism (docs/ARCHITECTURE.md section 0): the clumps, the seats and the hedgehog are plain sim objects built
// in enter(); every random number comes from the rng singleton inside update(); the hops are draw-side.
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
import { terraceLayers, ROWS, CLUMP_X } from '../../art/backgrounds/terrace.ts';
import { drawClump, drawHedgehog, TERRACE_ANIMS } from '../../art/terraceProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint } from '../ui.ts';

const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'tap']);
const R = Math.round;
const SPEED = 2.0, X_MIN = 26, X_MAX = 614;
const LANE_Y0 = 322, LANE_GAP = 8;
/** The clumps stand at the front of the bed, just behind the walk. */
const CLUMP_Y = ROWS.band - 10;
/** Snips per full clump, the regrowth (a stage back every REGROW_STEP frames), and the reach. */
const SNIPS_PER_CLUMP = 3, REGROW_STEP = 50, REACH = 34, SNIP_FRAMES = 10;
/** The hedgehog: under one clump in HEDGEHOG_ODDS at the start; the eek beat, and its trundle to the next clump. */
const HEDGEHOG_ODDS = 8, EEK_FRAMES = 20, TRUNDLE_FRAMES = 40;
const HOP_FRAMES = 12, HOP_LIFT = 14, MAX_HOPS = 4;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', EEK = 'EEK!', TITLE = 'THYME TERRACE';

export interface TerraceSeat extends Seat {
  /** Frames left of the snip or the eek beat; the stick is locked while it runs. */
  reachT: number;
  basketPt: Point;
}
/** One clump: snips still on it (0..SNIPS_PER_CLUMP), and frames until the next stage grows back. */
export interface Clump { snips: number; regrow: number; }
/** The hedgehog: the clump it is under (`at`), the clump it is trundling to (`to`), and the frames of trundle left (0 = asleep). */
export interface Hedgehog { at: number; to: number; t: number; }
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
  /** Times the hedgehog has been woken this round (the joke's count). */
  declare eeks: number;

  constructor(game: Game) { super(game, 'terrace'); this.seats = []; this.clumps = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = terraceLayers();
    particles.clear();
    const place = PLACES.find((p) => p.id === params.place && p.screen === 'terrace');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'terrace');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.mint;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    this.seats = makeSeats<TerraceSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(320 + (i - (n - 1) / 2) * 110);
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.reachT = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(TERRACE_ANIMS);
      seatAnim(s, 'carry');
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }
    this.clumps = [];
    for (let i = 0; i < CLUMP_X.length; i++) this.clumps.push({ snips: SNIPS_PER_CLUMP, regrow: 0 });
    // the hedgehog: asleep under one clump in HEDGEHOG_ODDS (the first the roll lands on), or nowhere today
    this.hog = { at: -1, to: -1, t: 0 };
    for (let i = 0; i < CLUMP_X.length; i++) if (rng.int(1, HEDGEHOG_ODDS) === 1) { this.hog.at = i; break; }
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    const need = run ? run.need(this.ing) : null;
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0; this.eeks = 0;
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
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateClumps();
      if (this.hog.t > 0 && --this.hog.t === 0) { this.hog.at = this.hog.to; this.hog.to = -1; }
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

  /** Every clump short of full grows a stage back every REGROW_STEP frames. */
  updateClumps(): void {
    for (let i = 0; i < this.clumps.length; i++) {
      const c = this.clumps[i];
      if (c.snips >= SNIPS_PER_CLUMP) continue;
      if (++c.regrow >= REGROW_STEP) { c.regrow = 0; c.snips++; }
    }
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
      if (input.pressed(s.slot, 'action')) this.trySnip(s);
      if (s.reachT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** `action`: the nearest clump within REACH with a snip on it gives up a sprig - unless the hedgehog is under it. */
  trySnip(s: TerraceSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.clumps.length; i++) {
      if (this.clumps[i].snips <= 0) continue;
      const d = Math.abs(CLUMP_X[i] - s.x);
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    s.moving = false; s.facing = CLUMP_X[best] >= s.x ? 1 : -1;
    if (this.hog.at === best && this.hog.t === 0) { this.eek(s, best); return; }
    const c = this.clumps[best];
    c.snips--; c.regrow = 0;
    s.count++; this.setTotal(this.total + 1);
    s.reachT = SNIP_FRAMES;
    seatAnim(s, 'snip', true);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = CLUMP_X[best]; h.y0 = CLUMP_Y - 14; h.seat = s.index;
    ringAt(CLUMP_X[best], CLUMP_Y - 10, 3, 12, UI.cream, 2, 12, false, true);
    burstSparkle(CLUMP_X[best], CLUMP_Y - 16, 2, UI.cream, true);
    floatText(CLUMP_X[best], CLUMP_Y - 28, PLUS_ONE, s.colour, 1, true);
    this.game.audio.play('snip');
    this.game.audio.play('catch');
  }

  /** The joke: the hedgehog was under it. The critter jumps back, EEK!, and the hedgehog trundles off to another clump. Nothing lost. */
  eek(s: TerraceSeat, i: number): void {
    this.eeks++;
    s.reachT = EEK_FRAMES;
    seatAnim(s, 'eek', true);
    let to = rng.int(0, CLUMP_X.length - 2); if (to >= i) to++;   // any clump but this one
    this.hog.to = to; this.hog.t = TRUNDLE_FRAMES;
    floatText(s.x, s.y - 66, EEK, UI.cream, 1, true);
    ringAt(CLUMP_X[i], CLUMP_Y, 4, 16, UI.cream, 2, 12, true, true);
    this.game.audio.play('snuffle');
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
    for (let i = 0; i < this.clumps.length; i++) this.drawClumpAt(ctx, i, f);
    this.drawHog(ctx, f);
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

  /** A clump at its stage, and the sparkle over one with a snip left on it. */
  drawClumpAt(ctx: CanvasRenderingContext2D, i: number, f: number): void {
    const c = this.clumps[i];
    drawClump(ctx, CLUMP_X[i], CLUMP_Y, this.ing, c.snips);
    if (c.snips > 0 && (((f + i * 7) >> 3) & 1)) { ctx.fillStyle = SIGNAL.terrace; ctx.fillRect(CLUMP_X[i] + 13, CLUMP_Y - 40, 2, 8); ctx.fillRect(CLUMP_X[i] + 10, CLUMP_Y - 37, 8, 2); }
  }

  /** The hedgehog: curled at the foot of its clump (a sharp eye can spot it), or trundling along the bed to the next. */
  drawHog(ctx: CanvasRenderingContext2D, f: number): void {
    const h = this.hog;
    if (h.at < 0) return;
    if (h.t === 0) { drawHedgehog(ctx, CLUMP_X[h.at] + 12, CLUMP_Y + 2, 1, 1); return; }
    const k = 1 - h.t / TRUNDLE_FRAMES, x0 = CLUMP_X[h.at] + 12, x1 = CLUMP_X[h.to] + 12;
    const x = x0 + (x1 - x0) * k, facing = x1 >= x0 ? 1 : -1;
    drawHedgehog(ctx, x, CLUMP_Y + 2 - (((f >> 2) & 1) ? 1 : 0), facing, 0);
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: TerraceSeat): void {
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
      total: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText, ing: this.ing, eeks: this.eeks,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), count: s.count, reachT: s.reachT, anim: s.anim })),
      /** [x, snips, regrow] per clump. */
      clumps: this.clumps.map((c, i) => [CLUMP_X[i], c.snips, c.regrow]),
      hog: { at: this.hog.at, to: this.hog.to, t: this.hog.t },
    };
  }

  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.eeks, this.hog.at, this.hog.to, this.hog.t);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.reachT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.clumps.length; i++) f.push(this.clumps[i].snips, this.clumps[i].regrow);
    return f;
  }
}
