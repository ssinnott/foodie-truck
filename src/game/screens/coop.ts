// COOP - COLLECT (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Coop"). An interior in daylight with a deep
// floor band: every seat walks in eight directions across it with a basket, eggs appear in the nesting boxes along
// the back wall and on the floor, `action` within reach plucks one (a 12-frame reach up into a nest from the gold
// ring the nest egg drops on the floor to mark its reach point, a 12-frame crouch to a floor egg), five hens wander between seeded waypoints and bump whoever they touch (the top egg pops out
// and cracks into a yolk puddle), and every ~600 frames the rooster telegraphs for 20 frames and charges across the
// band, tossing anyone it hits for two eggs. The round ends when the party's total reaches the order's amount or the
// 40-second clock runs out; the EGGS sign drops, is held, then run.gather() and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the eggs, hens and rooster are fixed pools of plain sim objects,
// every random number comes from the rng singleton inside update(), distances go through dhypot, and nothing in
// draw() is read back. The egg hops, the cracks, the rings, the float text and the dust are cosmetic pools kept out of
// checksumFields(). The y-sort is an insertion sort over a fixed index array with the seat slot as the tiebreak
// (the judges' graft: equal-y overlaps must never flicker).
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { dhypot } from '../../lib/engine/trig.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt, INK } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstDust } from '../../art/fx.ts';
import { foodTones } from '../../art/food.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { pathEllipse } from '../../lib/art/shapes.ts';
import { F } from '../../content/critters/common.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { coopLayers, ROWS, NEST_X, NEST_EGG_Y } from '../../art/backgrounds/coop.ts';
import { drawHen, drawRooster, HEN } from '../../art/hens.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawHint } from '../ui.ts';

const R = Math.round;
/** Movement: px/frame per axis, and the feet clamp (the band's walkable rows). */
const SPEED_X = 2.0, SPEED_Y = 1.2, X_MIN = 20, X_MAX = 620, Y_MIN = 262, Y_MAX = 336;
/** Eggs: a fixed pool, one laid every 90..150 frames (a nest half the time), plucked within 14 px of the reach point. */
const MAX_EGGS = 8, SPAWN_MIN = 90, SPAWN_MAX = 150, EGG_S = 5, PLUCK_R = 14, REACH_FRAMES = 12;
/** At most three nests hold an egg at once: nest eggs share the pool, and six unreachable ones would starve the floor spawns. */
const NEST_CAP = 3;
/** Floor eggs land inside the band but never in its back 12 rows (the dark strip) or under the lip. */
const EGG_X_MIN = 30, EGG_X_MAX = 610, EGG_Y_MIN = 250, EGG_Y_MAX = 334;
/** Hens: five, 0.6 px/frame between seeded waypoints with 30..90 frame pauses; touching a seat within 12 px is a bump. */
const HEN_N = 5, HEN_SPEED = 0.6, PAUSE_MIN = 30, PAUSE_MAX = 90, HEN_X_MIN = 24, HEN_X_MAX = 616, HEN_Y_MIN = 248, HEN_Y_MAX = 336, BUMP_R = 12;
/** The bump beat (4/10/6 of the shared `bump` anim, plus the push), and the grace after it so a hen cannot chain-bump. */
const BUMP_FRAMES = 21, PUSH = 8, SAFE_FRAMES = 45;
/** The rooster: a charge every ~600 frames, 20 frames of telegraph at the edge, 3 px/frame across, two eggs on contact. */
const ROOSTER_MIN = 540, ROOSTER_MAX = 660, TELEGRAPH = 20, CHARGE_SPEED = 3, ROOSTER_R = 14, ROOSTER_LOSS = 2, ROOSTER_OFF = 40, ROOSTER_EDGE = 22;
/** Cosmetic pools: the egg's hop into the basket, the popped egg's arc and its splat. */
const HOP_FRAMES = 12, ARC_N = 12, SPLAT_FRAMES = 30, CRACK_TOTAL = ARC_N + SPLAT_FRAMES, MAX_HOPS = 4, MAX_CRACKS = 6, POP_N = 12;
/**
 * The popped egg's height above the floor over its 12-frame arc: it leaves ABOVE the basket's rim (22 px, clear of the
 * eggs drawn inside the basket - at 14 the shell spent three frames as one more oval in that pile), up, and down.
 */
const ARC = [22, 28, 32, 34, 34, 32, 28, 23, 17, 10, 4, 0];
/**
 * ...starting ARC_X0 px out and flying ARC_VX px/frame away from whatever bumped the seat: a cream shell over a cream
 * sheep is invisible, so the arc has to clear the critter's own body (half a torso, ~14 px) by its second frame.
 */
const ARC_X0 = 10, ARC_VX = 3.5;
/** The rooster's toss: the seat's root pops up and lands over 12 frames (draw-only offset). */
const POP = [3, 6, 8, 9, 9, 8, 6, 4, 2, 1, 0, 0];
const PLUS_ONE = '+1', MINUS_ONE = '-1', BWAK = 'BWAK', SQUAWK = 'BWAAK!', TITLE = 'CLUCKET COOP', SIGN_PREFIX = 'EGGS: ';
const YOLK = HEN.beak, SHELL = INGREDIENTS.egg.hex;
/**
 * The shell is painted here and NOT by drawFood. That glyph's generic ramp cools every base it shades (blue gets the
 * biggest lift), and its shade ellipse covers nearly the whole oval, so the cream egg came out #A3A1AA - a cool
 * neutral, blue-leaning, at the same luminance as the #C9A05C nest straw it lies in. The one object the scene exists
 * for read as a grey pebble and the gold sparkle did all the work (the judges' finding; ART_STYLE 1 "every colour is
 * a paper-warm mid-chroma tone" and section 12 "nest straw darker than eggs"). Here the shell keeps its cream base
 * with a PLUM shadow over its lower-right half and the 2 px cap the other big food glyphs get
 * (ART_STYLE 0.5), so it is lighter AND warmer than the straw, and the floor stays the scene's only cool thing.
 */
const EGG_SH = '#8C7A86', EGG_HI = foodTones(SHELL).hi;
/**
 * The eggs already in a basket go through items.js -> drawFood, which this screen cannot repaint. Handing that ramp a
 * shell a step warmer than the ingredient hex lands its shade warm-neutral instead of blue, so the pile in the basket
 * belongs to the same egg as the one in the nest.
 */
const BASKET_EGG = '#F7E4BC';
/** The sort tiebreak: seats by slot (0..3), then eggs, then birds, so a stack at one y always draws the same way. */
const TIE_EGG = 4, TIE_HEN = 8, TIE_ROOSTER = 9;

/**
 * The two pluck beats, as AnimPlayer overlays on top of the shared table:
 *   pluck     - the crouch to a floor egg: the basket dips to the ground and comes back up, both paws on it.
 *   reachNest - up into a nesting box. NOT the shared `reach`: that raises the NEAR arm, and the near paw carries the
 *               ribbon basket, so paw and basket both swung across the muzzle for the whole 12 frames (worst on
 *               Chicory, whose face vanished behind it) - ART_STYLE section 0.7. Here the FAR arm goes up and back
 *               toward the wall (it draws behind the head) while the near arm stays low with `weapon: 90`, so the
 *               basket hangs upright in front of the belly and the face and the apron stay open.
 */
const COOP_ANIMS = Object.freeze({
  pluck: { loop: false, frames: [
    F(5, { armR: [44, 36], armL: [40, 40], weapon: 90, legR: [20, 30], legL: [-14, 30], torso: 14, head: 8, root: [0, 4], squash: 1.1, face: 'happy' }, { ease: 'in' }),
    F(7, { armR: [60, 50], armL: [56, 54], weapon: 90, torso: 2, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  reachNest: { loop: false, frames: [
    F(5, { armL: [-150, -10], armR: [56, 44], weapon: 90, torso: -4, head: -8, root: [0, -1], stretch: 1.02, face: 'happy' }, { ease: 'in' }),
    F(7, { armL: [-158, -14], armR: [50, 40], weapon: 90, torso: -6, head: -10, root: [0, -2], stretch: 1.04, face: 'happy' }, { ease: 'out' }),
  ] },
});

/** The coop's egg glyph: inked oval, cream shell, one plum shadow crescent, one 2 px cap. `s` is the half-height. */
function eggGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.7, s, 0, 0, Math.PI * 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = SHELL; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = EGG_SH;
  ctx.beginPath(); ctx.ellipse(x + s * 0.72, y + s * 0.66, s * 0.95, s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = EGG_HI; ctx.fillRect(R(x - s * 0.5), R(y - s * 0.6), 2, 2);
}

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { eggGlyph(ctx, x, y, 5); }

/**
 * An egg in flight - popped out of a basket or hopping into one - crosses the critters' own bodies, and a cream shell
 * over Barley's cream wool was a 1 px ink line on its own value: for the first frames of a pop the loss could only be
 * read from the float text. An airborne shell gets a second ink line (2 px of warm ink, the weight the backdrop gives
 * a big block) on top of the glyph's own, so the shell itself carries the beat. Darkening the shell instead was tried
 * and lost the egg: the scene's one bright warm object cannot also be the dark one.
 */
function airEgg(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, EGG_S * 0.7 + 1, EGG_S + 1, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK; ctx.fill();
  eggGlyph(ctx, x, y, EGG_S);
}

/** One pre-rendered backdrop layer and the screen y it is blitted at (art/backgrounds/coop.ts coopLayers). */
export interface CoopLayer {
  /** The offscreen canvas art/layers.ts makeLayer painted once. */
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  /** Screen y its top row lands on. */
  y: number;
}

/** The coop's backdrop: painted on the first visit, kept for every visit after. */
export interface CoopLayers {
  /** Back wall with the nesting boxes, down to the floor row. */
  wall: CoopLayer;
  /** The floor band the party walks. */
  floor: CoopLayer;
  /** The near lip, drawn over everything standing on the band. */
  near: CoopLayer;
  /** The rafters across the top of the frame. */
  rafter: CoopLayer;
}

/**
 * A seat at the coop: the shared mini-game seat plus the beat timers this screen keeps for it and the basket
 * point the hop flies to. The per-screen extension minigame.ts documents, so `makeSeats<CoopSeat>` hands these
 * back with the screen's own fields as typed as the shared ones.
 */
export interface CoopSeat extends Seat {
  /** Frames left of the pluck / reachNest beat; the stick is locked while it runs. */
  reachT: number;
  /** Frames of bump grace left: a hen cannot chain-bump while this is up. */
  safeT: number;
  /** Frames left of the rooster toss's root pop (POP), a draw-only offset. */
  popT: number;
  /** Where the basket is on screen, refilled from the `handN` joint by every drawSeat. */
  basketPt: Point;
}

/** One egg of the fixed pool: in a nesting box (`nest` >= 0) or on the floor. */
export interface Egg {
  /** False while the slot is free for the next spawn. */
  active: boolean;
  x: number;
  /** The row the shell is drawn on. */
  y: number;
  /** The floor row it is plucked from: its own row on the floor, the feet line under a nest. */
  fy: number;
  /** Index into NEST_X, or -1 for a floor egg. */
  nest: number;
}

/** One of the five hens wandering between seeded waypoints. */
export interface Hen {
  x: number;
  y: number;
  /** The waypoint it is walking to (stale while it pauses). */
  tx: number;
  ty: number;
  /** 0 = pausing, 1 = walking to the waypoint. */
  state: number;
  /** Frames left of the pause; its bits also drive the peck while it pauses. */
  t: number;
  /** Which of the two hen looks to draw (art/hens.ts drawHen). */
  kind: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
}

/** The rooster: it waits off screen, telegraphs at one edge, then charges across the band. */
export interface Rooster {
  x: number;
  y: number;
  /** 0 = waiting, 1 = telegraphing at the edge, 2 = charging. */
  state: number;
  /** Frames left of the wait or of the telegraph. */
  t: number;
  /** 1 = charging right, -1 = charging left. */
  dir: number;
}

/** A plucked egg hopping from where it lay into a seat's basket (cosmetic). */
export interface Hop {
  /** Frames into the hop; HOP_FRAMES means the slot is free. */
  t: number;
  /** Where the egg lay. */
  x0: number;
  y0: number;
  /** The party index of the seat it flies to (`Seat.index`). */
  seat: number;
}

/** An egg knocked out of a basket: the 12-frame arc, then the splat fading on the floor (cosmetic). */
export interface Crack {
  /** Frames into the arc and the splat; CRACK_TOTAL means the slot is free. */
  t: number;
  /** Where it left the basket. */
  x: number;
  y: number;
  /** Which way it flies: away from whatever bumped the seat. */
  dir: number;
}

export class CoopScreen extends Screen {
  // The fields, for the checker only, in enter() order. `declare` for the reason game.ts gives over its own
  // block: a plain field declaration would emit a class field per name (es2022 defines them before the
  // constructor body runs, and a screen's own declaration would also define a base field back to undefined), and
  // this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** The backdrop, pre-rendered once (art/backgrounds/coop.ts coopLayers) and blitted per frame. */
  declare layers: CoopLayers;
  /** One seat per party member, in party order (not slot order). */
  declare seats: CoopSeat[];
  /** The egg pool: MAX_EGGS slots, reused in place, never reallocated. */
  declare eggs: Egg[];
  /** 1 per nesting box holding an egg, indexed like NEST_X; NEST_CAP of them at once at most. */
  declare nestFull: Int8Array;
  /** Frames until the next egg is laid (SPAWN_MIN..SPAWN_MAX). */
  declare nextSpawn: number;
  /** The five hens. */
  declare hens: Hen[];
  /** The rooster: one object for the whole round, charge after charge. */
  declare rooster: Rooster;
  /** The hop pool (cosmetic): MAX_HOPS slots handed out in turn. */
  declare hops: Hop[];
  /** The next hop slot to reuse. */
  declare hopCursor: number;
  /** The crack pool (cosmetic): MAX_CRACKS slots handed out in turn. */
  declare cracks: Crack[];
  /** The next crack slot to reuse. */
  declare crackCursor: number;
  /** Bumps the party has taken this round, hens and rooster alike (the playtest reads it). */
  declare bumps: number;
  /** Eggs the round is played to: what the order still needs, or 3 with no run. */
  declare target: number;
  /** Eggs in the party's baskets right now. */
  declare total: number;
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
  /** The hint line along the bottom. */
  declare hint: string;
  /** The round's clock and its ending (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The y-sort's fixed index array: seats, hens, the rooster, then the floor eggs. */
  declare sortIdx: Int16Array;
  /** Their sort keys (y * 16 + the tiebreak), sorted alongside `sortIdx`. */
  declare sortKey: Float64Array;
  /** How many entries of those two the sort filled. */
  declare sortN: number;

  constructor(game: Game) { super(game, 'coop'); }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = coopLayers();
    particles.clear();
    this.seats = makeSeats<CoopSeat>(game, (i) => 300 - (i & 1) * 20);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * 110);
      s.rig.basketIcon = 'egg'; s.rig.basketHex = BASKET_EGG;
      s.reachT = 0; s.safeT = 0; s.popT = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(COOP_ANIMS);
      seatAnim(s, 'carry');
    }
    this.eggs = [];
    for (let i = 0; i < MAX_EGGS; i++) this.eggs.push({ active: false, x: 0, y: 0, fy: 0, nest: -1 });
    this.nestFull = new Int8Array(NEST_X.length);
    this.nextSpawn = SPAWN_MIN;
    this.hens = [];
    for (let i = 0; i < HEN_N; i++) {
      this.hens.push({ x: 80 + i * 120, y: HEN_Y_MIN + 10 + (i % 3) * 30, tx: 0, ty: 0, state: 0, t: 20 + i * 11, kind: i & 1, facing: i & 1 ? -1 : 1 });
    }
    this.rooster = { x: -ROOSTER_OFF, y: HEN_Y_MIN, state: 0, t: 0, dir: 1 };
    this.rooster.t = ROOSTER_MIN;
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    this.cracks = [];
    for (let i = 0; i < MAX_CRACKS; i++) this.cracks.push({ t: CRACK_TOTAL, x: 0, y: 0, dir: 1 });
    this.crackCursor = 0;
    this.bumps = 0;
    const need = run ? run.order.needs.find((x) => x.id === 'egg') : null;
    this.target = need ? Math.max(1, need.amount - need.have) : 3;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: ARROWS   PLUCK: ' + game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
    // the y-sort's fixed index array: seats, hens, the rooster, then the floor eggs
    const total = n + HEN_N + 1 + MAX_EGGS;
    this.sortIdx = new Int16Array(total); this.sortKey = new Float64Array(total); this.sortN = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    for (let i = 0; i < this.cracks.length; i++) if (this.cracks[i].t < CRACK_TOTAL) this.cracks[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateSeats(input);
      this.updateEggs();
      this.updateHens();
      this.updateRooster();
      if (this.total >= this.target) this.finish();
    } else {
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('egg', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /** Every seat: the beats first (they lock the stick), then the stick, the pluck, the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.safeT > 0) s.safeT--;
      if (s.popT > 0) s.popT--;
      if (s.bumpT > 0) { s.bumpT--; s.moving = false; s.player.tick(); continue; }
      if (s.reachT > 0) { s.reachT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot), ay = input.axisY(s.slot);
      s.moving = ax !== 0 || ay !== 0;
      if (s.moving) {
        if (ax !== 0) s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED_X; s.y += ay * SPEED_Y;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
        if (s.y < Y_MIN) s.y = Y_MIN; else if (s.y > Y_MAX) s.y = Y_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryPluck(s);
      if (s.reachT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** The nearest egg whose reach point is within PLUCK_R on both axes goes into the basket. */
  tryPluck(s: CoopSeat): void {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < this.eggs.length; i++) {
      const e = this.eggs[i];
      if (!e.active) continue;
      const dx = e.x > s.x ? e.x - s.x : s.x - e.x, dy = e.fy > s.y ? e.fy - s.y : s.y - e.fy;
      if (dx > PLUCK_R || dy > PLUCK_R) continue;
      if (dx + dy < bestD) { bestD = dx + dy; best = i; }
    }
    if (best < 0) return;
    const e = this.eggs[best];
    e.active = false;
    if (e.nest >= 0) this.nestFull[e.nest] = 0;
    s.count++; this.setTotal(this.total + 1);
    s.reachT = REACH_FRAMES; s.moving = false;
    seatAnim(s, e.nest >= 0 ? 'reachNest' : 'pluck', true);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = e.x; h.y0 = e.y; h.seat = s.index;
    ringAt(e.x, e.y, 3, 10, UI.cream, 2, 12, false, true);
    floatText(e.x, e.y - 12, PLUS_ONE, s.colour, 1, true);
    if (e.nest >= 0) burstDust(e.x, e.y + 4, 3, 1, true);
  }

/**
   * Lay an egg every 90..150 frames while fewer than eight are out: in a free nest half the time, else on the floor.
   * Nests are capped at NEST_CAP: a nest egg costs a pool slot and can only be taken from one 14 px strip, so six of
   * them would lock the pool and stop the floor spawns a party that has not found the back row depends on.
   */
  updateEggs(): void {
    if (--this.nextSpawn > 0) return;
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
    let slot = -1;
    for (let i = 0; i < this.eggs.length; i++) if (!this.eggs[i].active) { slot = i; break; }
    if (slot < 0) return;
    const e = this.eggs[slot];
    let nest = -1, full = 0;
    for (let i = 0; i < this.nestFull.length; i++) full += this.nestFull[i];
    if (full < NEST_CAP && rng.chance(0.5)) {
      const start = rng.int(0, NEST_X.length - 1);
      for (let k = 0; k < NEST_X.length; k++) { const j = (start + k) % NEST_X.length; if (!this.nestFull[j]) { nest = j; break; } }
    }
    e.active = true; e.nest = nest;
    if (nest >= 0) { this.nestFull[nest] = 1; e.x = NEST_X[nest]; e.y = NEST_EGG_Y; e.fy = Y_MIN; }
    else { e.x = rng.int(EGG_X_MIN, EGG_X_MAX); e.fy = rng.int(EGG_Y_MIN, EGG_Y_MAX); e.y = e.fy - EGG_S; }
  }

  /** Hens: pause, pick a waypoint, walk to it at 0.6 px/frame; a seat within 12 px takes the bump. */
  updateHens(): void {
    for (let i = 0; i < this.hens.length; i++) {
      const h = this.hens[i];
      if (h.state === 0) {
        if (--h.t <= 0) { h.tx = rng.int(HEN_X_MIN, HEN_X_MAX); h.ty = rng.int(HEN_Y_MIN, HEN_Y_MAX); h.state = 1; }
      } else {
        const dx = h.tx - h.x, dy = h.ty - h.y, d = dhypot(dx, dy);
        if (d <= HEN_SPEED) { h.x = h.tx; h.y = h.ty; h.state = 0; h.t = rng.int(PAUSE_MIN, PAUSE_MAX); }
        else { h.x += dx / d * HEN_SPEED; h.y += dy / d * HEN_SPEED; if (dx !== 0) h.facing = dx < 0 ? -1 : 1; }
      }
      for (let k = 0; k < this.seats.length; k++) {
        const s = this.seats[k];
        if (s.safeT > 0 || s.bumpT > 0) continue;
        if (dhypot(s.x - h.x, s.y - h.y) < BUMP_R) {
          this.bump(s, h.x, 1, false);
          h.facing = s.x < h.x ? -1 : 1;
          h.state = 0; h.t = rng.int(PAUSE_MIN, PAUSE_MAX);
          floatText(h.x - (s.x < h.x ? -1 : 1) * 14, h.y - 34, BWAK, UI.cream, 1, true);   // away from the seat it just shoved, above its comb
        }
      }
    }
  }

  /** The rooster: wait ~600 frames, telegraph at the edge (comb flashing, dust), charge across, gone off the far side. */
  updateRooster(): void {
    const r = this.rooster;
    if (r.state === 0) {
      if (--r.t <= 0) { r.state = 1; r.t = TELEGRAPH; r.dir = rng.sign(); r.y = rng.int(HEN_Y_MIN, HEN_Y_MAX); r.x = r.dir > 0 ? ROOSTER_EDGE : VIEW_W - ROOSTER_EDGE; }
      return;
    }
    if (r.state === 1) {
      if ((r.t & 3) === 0) burstDust(r.x - r.dir * 10, r.y, 2, 1, true);
      if (--r.t <= 0) r.state = 2;
      return;
    }
    r.x += r.dir * CHARGE_SPEED;
    if ((this.frame % 3) === 0) burstDust(r.x - r.dir * 8, r.y, 2, 1.2, true);
    for (let k = 0; k < this.seats.length; k++) {
      const s = this.seats[k];
      if (s.safeT > 0 || s.bumpT > 0) continue;
      if (dhypot(s.x - r.x, s.y - r.y) < ROOSTER_R) { this.bump(s, r.x, ROOSTER_LOSS, true); floatText(r.x, r.y - 28, SQUAWK, UI.cream, 1, true); }
    }
    if (r.x < -ROOSTER_OFF || r.x > VIEW_W + ROOSTER_OFF) { r.state = 0; r.t = rng.int(ROOSTER_MIN, ROOSTER_MAX); }
  }

  /** The bump beat: pushed 8 px away from `fromX`, facing it, `loss` eggs popping out of the basket and cracking. */
  bump(s: CoopSeat, fromX: number, loss: number, toss: boolean): void {
    const dir = s.x >= fromX ? 1 : -1;
    s.bumpT = BUMP_FRAMES; s.safeT = SAFE_FRAMES; s.reachT = 0; s.moving = false;
    if (toss) s.popT = POP_N;
    s.x += dir * PUSH;
    if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
    s.facing = -dir;
    seatAnim(s, 'bump', true);
    for (let k = 0; k < loss && s.count > 0; k++) {
      s.count--; this.setTotal(this.total - 1);
      const c = this.cracks[this.crackCursor]; this.crackCursor = (this.crackCursor + 1) % this.cracks.length;
      c.t = 0; c.x = s.x + dir * k * 6; c.y = s.y + 2 + k * 3; c.dir = dir;
      // the mirror of the pluck's ring and +1: the ring marks where the shell actually leaves (the arc's first key)
      // and the shell flies out of it, so the number is thrown the OTHER way, up over the shoulder. Both used to be
      // launched along the flight path, and the text - drawn in the front particle pass, over everything - rode on
      // top of the shell for the four frames the loss is read from. It rides high, too, clear of the hen's BWAK.
      const mx = s.x + dir * ARC_X0;
      ringAt(mx, s.y - ARC[0], 3, 11, UI.cream, 2, 12, false, true);
      floatText(s.x - dir * 15, s.y - 50 - k * 8, MINUS_ONE, s.colour, 1, true);
    }
    this.bumps++;
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with eggs cheers, one without sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; s.moving = false; s.bumpT = 0; s.reachT = 0; seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true); }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.wall.L, 0, L.wall.y);
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest >= 0) this.drawEgg(ctx, e, i, f); }
    blitAt(ctx, L.floor.L, 0, L.floor.y);
    particles.draw(ctx, null, 'back');
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest >= 0) this.drawNestCue(ctx, e, i, f); }
    // ground contact first: the slot ring under each seat's shadow, then every bird and floor egg
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      ctx.globalAlpha = 0.6; ctx.strokeStyle = s.colour; ctx.lineWidth = 2;
      pathEllipse(ctx, R(s.x), R(s.y), 13, 5); ctx.stroke(); ctx.globalAlpha = 1;
      drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0);
    }
    for (let i = 0; i < this.hens.length; i++) drawShadow(ctx, this.hens[i].x, this.hens[i].y, 18, 0.35, 0);
    if (this.rooster.state !== 0) drawShadow(ctx, this.rooster.x, this.rooster.y, 24, 0.35, 0);
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest < 0) drawShadow(ctx, e.x, e.fy, 9, 0.25, 0); }
    for (let i = 0; i < this.cracks.length; i++) this.drawSplat(ctx, this.cracks[i]);
    this.drawSorted(ctx, f);
    for (let i = 0; i < this.cracks.length; i++) this.drawArc(ctx, this.cracks[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    for (let i = this.seats.length - 1; i >= 0; i--) drawSeatPlate(ctx, this.seats[i]);
    blitAt(ctx, L.rafter.L, 0, L.rafter.y);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** Insertion-sort the seats, hens, rooster and floor eggs by y (slot as the tiebreak), then draw them back to front. */
  drawSorted(ctx: CanvasRenderingContext2D, f: number): void {
    const idx = this.sortIdx, key = this.sortKey, ns = this.seats.length, nh = this.hens.length;
    let n = 0;
    for (let i = 0; i < ns; i++) { idx[n] = i; key[n++] = this.seats[i].y * 16 + this.seats[i].slot; }
    for (let i = 0; i < nh; i++) { idx[n] = ns + i; key[n++] = this.hens[i].y * 16 + TIE_HEN; }
    if (this.rooster.state !== 0) { idx[n] = ns + nh; key[n++] = this.rooster.y * 16 + TIE_ROOSTER; }
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest < 0) { idx[n] = ns + nh + 1 + i; key[n++] = e.fy * 16 + TIE_EGG; } }
    for (let i = 1; i < n; i++) {
      const k = key[i], id = idx[i]; let j = i - 1;
      while (j >= 0 && key[j] > k) { key[j + 1] = key[j]; idx[j + 1] = idx[j]; j--; }
      key[j + 1] = k; idx[j + 1] = id;
    }
    for (let i = 0; i < n; i++) {
      const id = idx[i];
      if (id < ns) this.drawSeat(ctx, this.seats[id]);
      else if (id < ns + nh) { const h = this.hens[id - ns]; drawHen(ctx, R(h.x), R(h.y), h.kind, h.facing, h.state === 1 ? (f >> 3) & 1 : 0, h.state === 0 ? (h.t >> 4) & 1 : 0); }
      else if (id === ns + nh) this.drawRoosterAt(ctx, f);
      else this.drawEgg(ctx, this.eggs[id - ns - nh - 1], id - ns - nh - 1, f);
    }
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: CoopSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = s.x; o.y = s.y - (s.popT > 0 ? POP[POP_N - s.popT] : 0); o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
  }

  drawRoosterAt(ctx: CanvasRenderingContext2D, f: number): void {
    const r = this.rooster;
    // the comb flashes HOT through the telegraph AND the charge itself (the charge is the scene's real threat, and it
    // used to run its ~210 frames in the muted comb); the charge's tick is twice as fast, so it reads as motion
    const hot = (r.state === 1 && ((f >> 3) & 1)) || (r.state === 2 && ((f >> 2) & 1));
    const comb = hot ? SIGNAL.hot : HEN.comb;
    drawRooster(ctx, R(r.x), R(r.y), r.dir, r.state === 2 ? (f >> 1) & 1 : 0, comb);
  }

  /**
   * The floor spot a nest egg is reached from: the nests are 100 px above the feet line, so without a mark on the
   * floor the 14 px strip the pluck works from is invisible. A ring where the feet go, with the same blink as the
   * egg's own sparkle so a player joins the two.
   */
  drawNestCue(ctx: CanvasRenderingContext2D, e: Egg, i: number, f: number): void {
    const x = R(e.x);
    // the ring: an ink line under the gold one, so the mark holds on the cool earth and under a critter's feet
    ctx.globalAlpha = 0.5; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    pathEllipse(ctx, x, Y_MIN, 10, 4); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = SIGNAL.coop; ctx.lineWidth = 2;
    pathEllipse(ctx, x, Y_MIN, 10, 4); ctx.stroke(); ctx.globalAlpha = 1;
    // and an inked arrow standing in it, pointing up at the box that holds the egg: the whole hint that the back row
    // is reachable at all. It is on for as long as the egg is (a blinking arrow was half a hint), and the egg's own
    // sparkle above it does the blinking, which is what joins the two.
    const y = Y_MIN - 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 13); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 2, y - 6); ctx.lineTo(x + 2, y);
    ctx.lineTo(x - 2, y); ctx.lineTo(x - 2, y - 6); ctx.lineTo(x - 6, y - 6); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = SIGNAL.coop; ctx.fill();
    if (((f + i * 7) >> 3) & 1) { ctx.fillStyle = UI.cream; ctx.fillRect(x - 2, y - 10, 2, 2); }
  }

  /** An egg at rest, with the fresh-egg sparkle blinking above it on an index hash. */
  drawEgg(ctx: CanvasRenderingContext2D, e: Egg, i: number, f: number): void {
    const x = R(e.x), y = R(e.y);
    eggGlyph(ctx, x, y, EGG_S);
    if (((f + i * 7) >> 3) & 1) { ctx.fillStyle = SIGNAL.coop; ctx.fillRect(x + 3, y - 10, 2, 6); ctx.fillRect(x + 1, y - 8, 6, 2); }
  }

  /** The plucked egg hops from where it lay into the seat's basket over 12 frames. */
  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    airEgg(ctx, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * 12));
  }

  /** The popped egg in the air: out of the basket on the 12-entry arc, away from what bumped the seat, its shadow racing along the floor under it (the read that survives a cream shell crossing cream wool). */
  drawArc(ctx: CanvasRenderingContext2D, c: Crack): void {
    if (c.t >= ARC_N) return;
    const x = R(c.x + c.dir * (ARC_X0 + c.t * ARC_VX));
    drawShadow(ctx, x, c.y, 9, 0.3, ARC[c.t]);
    airEgg(ctx, x, R(c.y - ARC[c.t]));
  }

  /** Where it lands: three cream discs and a 3x3 yolk, no outline (the one soft mark), fading over 30 frames. */
  drawSplat(ctx: CanvasRenderingContext2D, c: Crack): void {
    if (c.t < ARC_N || c.t >= CRACK_TOTAL) return;
    const a = ctx.globalAlpha, k = 1 - (c.t - ARC_N) / SPLAT_FRAMES, x = R(c.x + c.dir * (ARC_X0 + (ARC_N - 1) * ARC_VX)), y = R(c.y);
    ctx.globalAlpha = a * 0.9 * k;
    ctx.fillStyle = SHELL;
    ctx.beginPath();
    ctx.ellipse(x - 4, y + 1, 3, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4, y + 2, 3, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(x, y - 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = YOLK; ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.globalAlpha = a;
  }

  override summary() {
    return {
      count: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText, bumps: this.bumps,
      seats: this.seats.map((s) => [s.slot, R(s.x), R(s.y), s.count]),
      eggs: this.eggs.filter((e) => e.active).map((e) => [R(e.x), R(e.fy), e.nest]),
      hens: this.hens.map((h) => [R(h.x), R(h.y), h.state]),
      rooster: [this.rooster.state, R(this.rooster.x), R(this.rooster.y)],
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.nextSpawn, this.bumps);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.y, s.facing, s.count, s.bumpT, s.reachT, s.safeT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; f.push(e.active ? 1 : 0, e.x, e.y, e.fy, e.nest); }
    for (let i = 0; i < this.hens.length; i++) { const h = this.hens[i]; f.push(h.x, h.y, h.tx, h.ty, h.state, h.t, h.facing); }
    const r = this.rooster; f.push(r.x, r.y, r.state, r.t, r.dir);
    return f;
  }
}
