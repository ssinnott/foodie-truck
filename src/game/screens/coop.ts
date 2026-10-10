// COOP - COLLECT (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Coop"). An interior in daylight with a deep
// floor band: every seat walks left and right along its own depth lane with a basket, eggs appear in the nesting
// boxes along the back wall and on the floor in front of the lanes, and `action` within reach of one plucks it (a
// 12-frame reach up into a nest from the gold ring on the floor that marks its spot, a 12-frame crouch to a floor
// egg). Five hens potter about the back of the floor and never get in the way: nothing in this coop bumps, charges
// or costs an egg. THE JOKES (coopGags.ts, which has their beats): one egg in six is the SURPRISE CHICK - it wobbles
// and wears a zigzag crack, and plucked it is held up to the face until it hatches, and the chick rides its new mum's
// head for a while (no +1: it hatched) - and one nest egg in four of the rest is laid with a BROODY HEN sat on it
// (`broody` on the egg, a countdown): reaching for it gets her puffed up to twice her size, a flurry of pecks, OW!,
// and a hop round on one foot, and then she flounces off the nest, leaving the egg where it was (left alone, she
// hops off when her countdown ends). Nothing is lost but the moment. The round ends when the party's total reaches
// the order's amount, and not before (there is no clock to run out); the EGGS sign drops, is held, then
// run.gather() and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the eggs and hens are fixed pools of plain sim objects, every random
// number comes from the rng singleton inside update(), distances are plain differences along x, and nothing in
// draw() is read back. The egg hops, the rings, the float text, the dust, the jokes' cards and feathers and the
// chicks once they are let go are cosmetic pools kept out of checksumFields(). The y-sort is an insertion sort over
// a fixed index array with the seat slot as the tiebreak (the judges' graft: equal-y overlaps must never flicker).
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { dhypot } from '../../lib/engine/trig.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt, INK } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstDust } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { pathEllipse } from '../../lib/art/shapes.ts';
import { F } from '../../content/critters/common.ts';
import { coopLayers, ROWS, NEST_X, NEST_EGG_Y } from '../../art/backgrounds/coop.ts';
import { drawHen } from '../../art/hens.ts';
import { eggGlyph, EGG_S } from '../../art/coopProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint } from '../ui.ts';
import { clearGags, stepGags, drawGags } from '../gags.ts';
import {
  GAG_ANIMS, dealEgg, startHatch, stepHatch, startPeck, stepPeck, endJokes, makeChicks, makeBits, stepChicks, cheepRider,
  onFloor, floorY, drawHatch, drawRider, drawFloorChick, drawChickShadows, drawBits, drawBroody, drawSurpriseEgg,
} from './coopGags.ts';
import type { Chick, ShellBit } from './coopGags.ts';

/** The HOW TO PLAY card's pictograms (game/controlcard.ts), in the order they are read. */
const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'tap']);
const R = Math.round;
/** Movement: px/frame along the lane, and the feet clamp. */
const SPEED = 2.0, X_MIN = 20, X_MAX = 620;
/** Seat i stands with its feet at LANE_Y0 - i * LANE_GAP: P1 in front, four lanes 8 px apart so bodies stack. */
const LANE_Y0 = 316, LANE_GAP = 8;
/** Eggs: a fixed pool, one laid every 90..150 frames (a nest half the time), plucked from anywhere the critter's body overlaps them (34 px either side of the feet). */
const MAX_EGGS = 8, SPAWN_MIN = 90, SPAWN_MAX = 150, PLUCK_R = 34, REACH_FRAMES = 12;
/** At most three nests hold an egg at once: nest eggs share the pool, and six unreachable ones would starve the floor spawns. */
const NEST_CAP = 3;
/** Floor eggs land in the band's front rows, where the lanes are, never under the lip. */
const EGG_X_MIN = 30, EGG_X_MAX = 610, EGG_Y_MIN = 296, EGG_Y_MAX = 334;
/** Hens: five, 0.6 px/frame between seeded waypoints with 30..90 frame pauses, kept to the back of the floor behind the lanes. */
const HEN_N = 5, HEN_SPEED = 0.6, PAUSE_MIN = 30, PAUSE_MAX = 90, HEN_X_MIN = 24, HEN_X_MAX = 616, HEN_Y_MIN = 248, HEN_Y_MAX = 290;
/** The floor row a nest egg is reached from: the front lane, and the row its cue ring sits on. */
const NEST_REACH_Y = LANE_Y0;
/** Cosmetic pool: the egg's hop into the basket. */
const HOP_FRAMES = 12, MAX_HOPS = 4;
const PLUS_ONE = '+1', TITLE = 'CLUCKET COOP', SIGN_PREFIX = 'EGGS: ';
/**
 * The eggs already in a basket go through items.js -> drawFood, which this screen cannot repaint. Handing that ramp a
 * shell a step warmer than the ingredient hex lands its shade warm-neutral instead of blue, so the pile in the basket
 * belongs to the same egg as the one in the nest (art/coopProps.ts paints every other egg in the scene).
 */
const BASKET_EGG = '#F7E4BC';
/** The sort tiebreak: seats by slot (0..3), then eggs, then hens, then chicks, so a stack at one y always draws the same way. */
const TIE_EGG = 4, TIE_HEN = 8, TIE_CHICK = 9;

/**
 * The two pluck beats (and the jokes' poses, from coopGags.ts), as AnimPlayer overlays on top of the shared table:
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
  // the two jokes' poses: the egg held up to hatch, and the hen's glare, flurry and hop round (coopGags.ts)
  ...GAG_ANIMS,
});

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { eggGlyph(ctx, x, y, 5); }

/**
 * An egg in flight - hopping into a basket - crosses the critters' own bodies, and a cream shell over Barley's cream
 * wool was a 1 px ink line on its own value. An airborne shell gets a second ink line (2 px of warm ink, the weight
 * the backdrop gives a big block) on top of the glyph's own, so the shell itself carries the beat.
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
 * A seat at the coop: the shared mini-game seat plus the reach beat this screen keeps for it and the basket point
 * the hop flies to. The per-screen extension minigame.ts documents, so `makeSeats<CoopSeat>` hands these back with
 * the screen's own fields as typed as the shared ones.
 */
export interface CoopSeat extends Seat {
  /** Frames left of the pluck / reachNest beat; the stick is locked while it runs. */
  reachT: number;
  /** Frames left of the surprise chick's hatch (coopGags.ts HATCH_TOTAL..0); the stick is locked while it runs. */
  hatchT: number;
  /** Frames left of the broody hen's beat (coopGags.ts PECK_TOTAL..0); the stick is locked while it runs. */
  peckT: number;
  /** Where the hatching egg lay, for its hop into the paw (cosmetic: draw only). */
  eggX: number;
  eggY: number;
  /** Where the hen that pecked it sits, for the feathers (cosmetic). */
  henX: number;
  henY: number;
  /** The critter's own crown (minigame.ts): `crown` climbs over it while a chick rides the head, and comes back down after. */
  baseCrown: number;
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
  /** The floor row it is plucked from: its own row on the floor, the front lane under a nest. */
  fy: number;
  /** Index into NEST_X, or -1 for a floor egg. */
  nest: number;
  /** Frames a broody hen is still sat on this nest egg (0: nobody is; the egg can be plucked). */
  broody: number;
  /** Frames left of that hen's temper (coopGags.ts HEN_FURY..0): puffed up, pecking, going down again. */
  fury: number;
  /** 1 = the surprise chick's egg (it wobbles, it is cracked, and it hatches in the paw instead of scoring). */
  chick: number;
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

export class CoopScreen extends Screen {
  // The fields, for the checker only, in enter() order. `declare` for the reason game.ts gives over its own
  // block: a plain field declaration would emit a class field per name (es2022 defines them before the
  // constructor body runs, and a screen's own declaration would also define a base field back to undefined), and
  // this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** The backdrop, pre-rendered once (art/backgrounds/coop.ts coopLayers) and blitted per frame. */
  declare layers: CoopLayers;
  /** One seat per party member, in party order (not slot order): one depth lane each, P1 in front. */
  declare seats: CoopSeat[];
  /** The egg pool: MAX_EGGS slots, reused in place, never reallocated. */
  declare eggs: Egg[];
  /** 1 per nesting box holding an egg, indexed like NEST_X; NEST_CAP of them at once at most. */
  declare nestFull: Int8Array;
  /** Frames until the next egg is laid (SPAWN_MIN..SPAWN_MAX). */
  declare nextSpawn: number;
  /** The five hens. */
  declare hens: Hen[];
  /** The hop pool (cosmetic): MAX_HOPS slots handed out in turn. */
  declare hops: Hop[];
  /** The next hop slot to reuse. */
  declare hopCursor: number;
  /** Eggs the round is played to: what the order still needs, or 3 with no run. */
  declare target: number;
  /** Eggs in the party's baskets right now. */
  declare total: number;
  /** Pecks taken this round (the broody hen's count, for the tests and the desync canary). */
  declare pecks: number;
  /** Surprise eggs hatched in a paw this round (the chick's count, likewise). */
  declare hatches: number;
  /** The chicks once their seats let go of them (coopGags.ts): riding a head, hopping off, trotting after a hen. Cosmetic. */
  declare chicks: Chick[];
  /** The shell tops in flight off a hatching egg (coopGags.ts), and the next slot to reuse. Cosmetic. */
  declare bits: ShellBit[];
  declare bitCursor: number;
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
  /** The hint line along the bottom. */
  declare hint: string;
  /** What the action key is called on seat 0's device, for the HOW TO PLAY card. */
  declare cardKey: string;
  /** The round's clock and its ending (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The y-sort's fixed index array: seats, hens, the floor eggs, then the chicks on the floor. */
  declare sortIdx: Int16Array;
  /** Their sort keys (y * 16 + the tiebreak), sorted alongside `sortIdx`. */
  declare sortKey: Float64Array;

  constructor(game: Game) { super(game, 'coop'); }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = coopLayers();
    particles.clear();
    clearGags();
    this.seats = makeSeats<CoopSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * 110);
      s.rig.basketIcon = 'egg'; s.rig.basketHex = BASKET_EGG;
      s.reachT = 0; s.hatchT = 0; s.peckT = 0;
      s.eggX = 0; s.eggY = 0; s.henX = 0; s.henY = 0; s.baseCrown = s.crown;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(COOP_ANIMS);
      seatAnim(s, 'carry');
    }
    this.eggs = [];
    for (let i = 0; i < MAX_EGGS; i++) this.eggs.push({ active: false, x: 0, y: 0, fy: 0, nest: -1, broody: 0, fury: 0, chick: 0 });
    this.nestFull = new Int8Array(NEST_X.length);
    this.nextSpawn = SPAWN_MIN;
    this.hens = [];
    for (let i = 0; i < HEN_N; i++) {
      this.hens.push({ x: 80 + i * 120, y: HEN_Y_MIN + 10 + (i % 3) * 14, tx: 0, ty: 0, state: 0, t: 20 + i * 11, kind: i & 1, facing: i & 1 ? -1 : 1 });
    }
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    this.chicks = makeChicks();
    this.bits = makeBits(); this.bitCursor = 0;
    const need = run ? run.need('egg') : null;
    this.target = need ? Math.max(1, need.amount - need.have) : 3;
    this.total = 0; this.pecks = 0; this.hatches = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   PLUCK: ' + game.input.keyText(0, 'action');
    this.cardKey = game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
    // the y-sort's fixed index array: seats, hens, the floor eggs, then the chicks on the floor
    const total = n + HEN_N + MAX_EGGS + this.chicks.length;
    this.sortIdx = new Int16Array(total); this.sortKey = new Float64Array(total);
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    stepGags();
    stepChicks(this);
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateSeats(input);
      this.updateEggs();
      this.updateBroody();
      this.updateHens();
      if (this.total >= this.target) this.finish();
    } else {
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('egg', this.total);
        game.replace('map');
        return;
      }
    }
    tickClock(clock);
  }

  /** Every seat: the beats first (they lock the stick), then the stick along the lane, the pluck, the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.hatchT > 0) { stepHatch(this, s); s.moving = false; s.player.tick(); continue; }
      if (s.peckT > 0) { stepPeck(this, s); s.moving = false; s.player.tick(); continue; }
      if (s.reachT > 0) { s.reachT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryPluck(s);
      if (s.reachT === 0 && s.hatchT === 0 && s.peckT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /**
   * The nearest egg within PLUCK_R along the lane goes into the basket: a nest egg by its floor spot, a floor egg by
   * where it lies. Unless it is a joke: a hen sat on it is the broody hen's beat (and a hen already in a temper is
   * left alone), a surprise egg is the hatch - neither scores. A chick riding the plucker's head cheeps at a real one.
   */
  tryPluck(s: CoopSeat): void {
    let best = -1, bestD = PLUCK_R + 1;
    for (let i = 0; i < this.eggs.length; i++) {
      const e = this.eggs[i];
      if (!e.active) continue;
      const dx = e.x > s.x ? e.x - s.x : s.x - e.x;
      if (dx <= PLUCK_R && dx < bestD) { bestD = dx; best = i; }
    }
    if (best < 0) return;
    const e = this.eggs[best];
    if (e.broody > 0) { if (e.fury === 0) startPeck(this, s, e); return; }
    if (e.chick) { startHatch(this, s, e); return; }
    e.active = false;
    if (e.nest >= 0) this.nestFull[e.nest] = 0;
    s.count++; this.setTotal(this.total + 1);
    s.reachT = REACH_FRAMES; s.moving = false;
    s.facing = e.x >= s.x ? 1 : -1;
    seatAnim(s, e.nest >= 0 ? 'reachNest' : 'pluck', true);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = e.x; h.y0 = e.y; h.seat = s.index;
    ringAt(e.x, e.y, 3, 10, UI.cream, 2, 12, false, true);
    floatText(e.x, e.y - 12, PLUS_ONE, s.colour, 1, true);
    if (e.nest >= 0) burstDust(e.x, e.y + 4, 3, 1, true);
    this.game.audio.play('egg');
    cheepRider(this, s);
  }

  /** The hens on the nests: a temper runs down, each broody countdown runs, and at 0 the hen clucks and hops off, leaving the egg. */
  updateBroody(): void {
    for (let i = 0; i < this.eggs.length; i++) {
      const e = this.eggs[i];
      if (!e.active) continue;
      if (e.fury > 0) e.fury--;
      if (e.broody <= 0) continue;
      if (--e.broody === 0) { burstDust(e.x, e.y + 6, 4, 1, true); this.game.audio.play('cluck'); }
    }
  }

  /**
   * Lay an egg every 90..150 frames while fewer than eight are out: in a free nest half the time, else on the floor.
   * Nests are capped at NEST_CAP: a nest egg costs a pool slot, so six of them would lock the pool and stop the
   * floor spawns a party that has not found the back row depends on.
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
    if (nest >= 0) { this.nestFull[nest] = 1; e.x = NEST_X[nest]; e.y = NEST_EGG_Y; e.fy = NEST_REACH_Y; }
    else { e.x = rng.int(EGG_X_MIN, EGG_X_MAX); e.fy = rng.int(EGG_Y_MIN, EGG_Y_MAX); e.y = e.fy - EGG_S; }
    // the deal (coopGags.ts): one egg in six is the surprise chick, one nest egg in four of the rest has a hen sat on it
    dealEgg(e);
  }

  /** Hens: pause, pick a waypoint at the back of the floor, walk to it at 0.6 px/frame. Scenery that moves. */
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
    }
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with eggs cheers, one without sulks, whatever joke it was in the middle of. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.moving = false; s.reachT = 0;
      endJokes(this, s);
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
    for (let i = 0; i < this.eggs.length; i++) this.eggs[i].fury = 0;
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.wall.L, 0, L.wall.y);
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest >= 0) { if (e.broody > 0) drawBroody(ctx, e, f); else this.drawEgg(ctx, e, i, f); } }
    blitAt(ctx, L.floor.L, 0, L.floor.y);
    particles.draw(ctx, null, 'back');
    // no cue under a sat-on nest: the hen on it is the whole hint that there is nothing to reach for yet
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest >= 0 && e.broody === 0) this.drawNestCue(ctx, e, i, f); }
    // ground contact first: the slot ring under each seat's shadow, then every hen and floor egg
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      ctx.globalAlpha = 0.6; ctx.strokeStyle = s.colour; ctx.lineWidth = 2;
      pathEllipse(ctx, R(s.x), R(s.y), 13, 5); ctx.stroke(); ctx.globalAlpha = 1;
      drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0);
    }
    for (let i = 0; i < this.hens.length; i++) drawShadow(ctx, this.hens[i].x, this.hens[i].y, 18, 0.35, 0);
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; if (e.active && e.nest < 0) drawShadow(ctx, e.x, e.fy, 9, 0.25, 0); }
    drawChickShadows(ctx, this);
    this.drawSorted(ctx, f);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    drawBits(ctx, this);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    // plates front lane first, each one stacked clear of the ones already down: ragged row, no buried name
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    blitAt(ctx, L.rafter.L, 0, L.rafter.y);
    drawGags(ctx);
    drawClock(ctx, this.countStr, this.total / this.target, clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** Insertion-sort the seats, hens, floor eggs and floor chicks by y (slot as the tiebreak), then draw them back to front. */
  drawSorted(ctx: CanvasRenderingContext2D, f: number): void {
    const idx = this.sortIdx, key = this.sortKey, ns = this.seats.length, nh = this.hens.length, ne = this.eggs.length;
    let n = 0;
    for (let i = 0; i < ns; i++) { idx[n] = i; key[n++] = this.seats[i].y * 16 + this.seats[i].slot; }
    for (let i = 0; i < nh; i++) { idx[n] = ns + i; key[n++] = this.hens[i].y * 16 + TIE_HEN; }
    for (let i = 0; i < ne; i++) { const e = this.eggs[i]; if (e.active && e.nest < 0) { idx[n] = ns + nh + i; key[n++] = e.fy * 16 + TIE_EGG; } }
    for (let i = 0; i < this.chicks.length; i++) { const c = this.chicks[i]; if (onFloor(c)) { idx[n] = ns + nh + ne + i; key[n++] = floorY(c) * 16 + TIE_CHICK; } }
    for (let i = 1; i < n; i++) {
      const k = key[i], id = idx[i]; let j = i - 1;
      while (j >= 0 && key[j] > k) { key[j + 1] = key[j]; idx[j + 1] = idx[j]; j--; }
      key[j + 1] = k; idx[j + 1] = id;
    }
    for (let i = 0; i < n; i++) {
      const id = idx[i];
      if (id < ns) this.drawSeat(ctx, this.seats[id]);
      else if (id < ns + nh) { const h = this.hens[id - ns]; drawHen(ctx, R(h.x), R(h.y), h.kind, h.facing, h.state === 1 ? (f >> 3) & 1 : 0, h.state === 0 ? (h.t >> 4) & 1 : 0); }
      else if (id < ns + nh + ne) this.drawEgg(ctx, this.eggs[id - ns - nh], id - ns - nh, f);
      else drawFloorChick(ctx, this.chicks[id - ns - nh - ne], f);
    }
  }

  /** One seat: the rig, then what it holds through a hatch and the chick riding its head, both read off its joints. */
  drawSeat(ctx: CanvasRenderingContext2D, s: CoopSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = s.x; o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
    drawHatch(ctx, s);
    drawRider(ctx, this, s);
  }

  /**
   * The floor spot a nest egg is reached from: the nests are 100 px above the lanes, so without a mark on the floor
   * the strip the pluck works from is invisible. A ring where the feet go, with the same blink as the egg's own
   * sparkle so a player joins the two.
   */
  drawNestCue(ctx: CanvasRenderingContext2D, e: Egg, i: number, f: number): void {
    const x = R(e.x);
    // the ring: an ink line under the gold one, so the mark holds on the cool earth and under a critter's feet
    ctx.globalAlpha = 0.5; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    pathEllipse(ctx, x, NEST_REACH_Y, 10, 4); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = SIGNAL.coop; ctx.lineWidth = 2;
    pathEllipse(ctx, x, NEST_REACH_Y, 10, 4); ctx.stroke(); ctx.globalAlpha = 1;
    // and an inked arrow standing in it, pointing up at the box that holds the egg: the whole hint that the back row
    // is reachable at all. It is on for as long as the egg is (a blinking arrow was half a hint), and the egg's own
    // sparkle above it does the blinking, which is what joins the two.
    const y = NEST_REACH_Y - 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 13); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 2, y - 6); ctx.lineTo(x + 2, y);
    ctx.lineTo(x - 2, y); ctx.lineTo(x - 2, y - 6); ctx.lineTo(x - 6, y - 6); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = SIGNAL.coop; ctx.fill();
    if (((f + i * 7) >> 3) & 1) { ctx.fillStyle = UI.cream; ctx.fillRect(x - 2, y - 10, 2, 2); }
  }

  /** An egg at rest, with the fresh-egg sparkle blinking above it on an index hash: a surprise egg wobbles and wears its crack. */
  drawEgg(ctx: CanvasRenderingContext2D, e: Egg, i: number, f: number): void {
    const x = R(e.x), y = R(e.y);
    if (e.chick) drawSurpriseEgg(ctx, x, y, i, f); else eggGlyph(ctx, x, y, EGG_S);
    if (((f + i * 7) >> 3) & 1) { ctx.fillStyle = SIGNAL.coop; ctx.fillRect(x + 3, y - 10, 2, 6); ctx.fillRect(x + 1, y - 8, 6, 2); }
  }

  /** The plucked egg hops from where it lay into the seat's basket over 12 frames. */
  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    airEgg(ctx, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * 12));
  }

  override summary() {
    return {
      count: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText, pecks: this.pecks, hatches: this.hatches,
      seats: this.seats.map((s) => [s.slot, R(s.x), R(s.y), s.count, s.reachT, s.hatchT, s.peckT, s.facing]),
      eggs: this.eggs.filter((e) => e.active).map((e) => [R(e.x), R(e.fy), e.nest, e.broody, e.chick, e.fury]),
      hens: this.hens.map((h) => [R(h.x), R(h.y), h.state]),
      chicks: this.chicks.filter((c) => c.state).map((c) => [c.state, c.seat, R(c.x), R(c.y), c.hen]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.nextSpawn, this.pecks, this.hatches);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.reachT, s.hatchT, s.peckT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.eggs.length; i++) { const e = this.eggs[i]; f.push(e.active ? 1 : 0, e.x, e.y, e.fy, e.nest, e.broody, e.fury, e.chick); }
    for (let i = 0; i < this.hens.length; i++) { const h = this.hens[i]; f.push(h.x, h.y, h.tx, h.ty, h.state, h.t, h.facing); }
    return f;
  }
}
