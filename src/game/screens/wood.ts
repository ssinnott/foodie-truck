// TANGLE WOOD - and the verb is FORAGE (docs/CONTENT_ROADMAP.md section E; docs/GDD.md section 5). A dark wood on
// the coop's side of the river: things hide in the leaf litter along the band the crew walks. A BUMP lifts in the
// leaves every SPAWN_MIN..SPAWN_MAX frames at a free x (LIFT_FRAMES of rising, then it SHOWS with the gold sparkle
// over it), and `action` with a showing bump anywhere under the critter (REACH either side) brushes the leaves off
// it: a BRUSH_FRAMES crouch, the thing hops into the basket, +1. A visit is for mushrooms or wild garlic
// (`gatherTarget`), and every bump hides that. The round ends when the party's total reaches the order's remainder,
// and not before.
//
// THE JOKES (game/gags.ts has the furniture: the cards, the bump, the coats). One bump in four is dealt one, from the
// single roll every bump has always made (DEAL_ROLL), and neither ever costs a thing already gathered:
//   THE TOADSTOOL  the bump lifts red with white spots. Brushing it is two sniffs at it (the wind-up), then a big
//                  green-grey stink cloud out of it, PEE-YOO!, and the critter staggers back out of it fanning its
//                  nose, gone queasy green with stink lines coming off it, and shakes its head; the toadstool sinks
//                  back. No +1: it was never the thing.
//   THE TANGLE     a curl of vine lies in the leaves beside the bump (the tell). Brushing it, the vine slides out
//                  round the ankle - ?! - and WHOOP!, the critter is hauled up it to hang head down from the canopy,
//                  swinging, the basket left standing on the litter; then the vine lets go, FLUMP! into the leaves,
//                  and it gets up wearing them and shakes them off. The find is still there for the next brush.
//
// Determinism (docs/ARCHITECTURE.md section 0): the bumps and the seats are fixed pools of plain sim objects built
// in enter(); every random number comes from the rng singleton inside update(); the lift, the hops, the vine, the
// leaves, the cards and the particles are draw-side. Everything in the checksum is a number the sim moved.
import { UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { gatherTarget } from '../run.ts';
import { woodLayers, WOOD, ROWS } from '../../art/backgrounds/wood.ts';
import {
  drawBump, drawToadstool, drawVineCurl, drawVineCreep, drawVineHang, drawVineCuff, drawLeaf, drawStinkLine, WOOD_ANIMS,
  CREEP_FRAMES, CREEP_REACH, DANGLE_FRAMES, FALL_FRAMES, LIE_FRAMES, GETUP_FRAMES, STAND_FRAMES, SHAKE_FRAMES, DANGLE_LIFT, SNIFF_FRAMES, POOH_FRAMES,
} from '../../art/woodProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates, RIBBON_BASKET } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { clearGags, stepGags, drawGags, gagBurst, gagBubble, gagBump, gagShakeY, overHead, coat } from '../gags.ts';
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
/**
 * The deal, one roll per bump as it is laid: TOADSTOOL_ROLL on a DEAL_ROLL-sided die and it lifts as a toadstool,
 * VINE_ROLL and a curl of vine lies beside it, anything else and it is the visit's thing and nothing more. One bump
 * in four is a joke and none is both. It is the very roll the toadstool always made (one rng.int over the same
 * eight), read two ways now, so a seed lays the bumps it always laid. On the party's side, brushing bumps as they
 * come, a round of n finds goes without a joke (3/4)^n of the time: a round of four shows one two times in three,
 * a round of eight nine times in ten; a party that steps round every toadstool goes without one (6/7)^n of the time.
 */
const DEAL_ROLL = 8, TOADSTOOL_ROLL = 1, VINE_ROLL = 2;
/**
 * THE TANGLE, as one countdown on the seat (`tangleT`, TANGLE_TOTAL down to 0) read as frames in; the beats'
 * lengths are art/woodProps.ts's, which builds the anims out of the same numbers:
 *   0       the brush finds the vine: the crouch, ?!, and it slides round the ankle (CREEP_REACH) - the wind-up;
 *   YANK    the BANG: WHOOP!, the basket left standing on the litter, hauled up the vine to swing head down;
 *   DROP    the vine lets go, and whips back up into the canopy (RETRACT_FRAMES);
 *   LAND    FLUMP! on its back in the leaves, the world bumps, and it gets up wearing them - the LOOK;
 *   SHAKE   it shakes them off, one leaf at a time (LEAF_OFF), picks the basket up at the end and plays on.
 * About two and a half seconds, all of it on the one seat, and the find is never touched.
 */
const YANK = CREEP_FRAMES, DROP = YANK + DANGLE_FRAMES, LAND = DROP + FALL_FRAMES, SHAKE = LAND + LIE_FRAMES + GETUP_FRAMES + STAND_FRAMES;
const TANGLE_TOTAL = SHAKE + SHAKE_FRAMES;
/** The curl lies this far left of its bump's centre, on the litter just clear of the mound. */
const VINE_DX = -24;
/** The vine hangs from the foot of the canopy, the dark mass overhead. */
const VINE_TOP = ROWS.canopy;
/** Let go, the vine whips back up into the canopy over this many frames. */
const RETRACT_FRAMES = 8;
/** The creeping vine makes for the near ankle: this many rows over the feet, beside them by the rig's hip width. */
const CREEP_FOOT = 4;
/**
 * The leaves a critter gets up wearing: [x, y] off the head's centre in ROOT space (so they turn over with the
 * critter and sit on the crown and the back of the head whichever way up it is, never on the face), and the frame
 * into the shake each one flies off.
 */
const LEAF_AT = Int8Array.of(-9, -6, -2, -12, 5, -13, -12, 3), LEAF_OFF = Uint8Array.of(3, 7, 11, 15), LEAF_ROT = Float32Array.of(0.6, -0.4, 0.9, -1.1);
/**
 * THE TOADSTOOL, as one countdown on the seat (`stinkT`, STINK_TOTAL down to 0) read as frames in: the sniffs (the
 * wind-up, SNIFF_FRAMES), the cloud and PEE-YOO! at STINK_BANG, then the stagger back - STAGGER_STEP px a frame
 * for STAGGER_FRAMES, the sim walking the seat away from the smell - with the queasy coat on for QUEASY_FRAMES of
 * it and a puff coming off the critter every PUFF_EVERY; then the shake of the head. Seventy-two frames, no +1.
 */
const STINK_BANG = SNIFF_FRAMES, STINK_TOTAL = SNIFF_FRAMES + POOH_FRAMES;
const STAGGER_FRAMES = 30, STAGGER_STEP = 0.5, QUEASY_FROM = STINK_BANG + 3, QUEASY_FRAMES = 26, PUFF_EVERY = 8;
/** The cloud: CLOUD_COUNT puffs at the bang, and it keeps billowing out of the toadstool every BILLOW_EVERY frames for BILLOW_FRAMES more. */
const CLOUD_COUNT = 22, BILLOW_FRAMES = 15, BILLOW_EVERY = 3;
/** The brushed toadstool stands while it puffs (the sniff and SINK_HOLD more), then sinks back over SINK_DOWN; it cannot be brushed again. */
const SINK_HOLD = 14, SINK_DOWN = 20, SINK_TOTAL = SNIFF_FRAMES + SINK_HOLD + SINK_DOWN;
/**
 * The stink's green-grey (the cloud is smoke, the one soft mark, docs/ART_STYLE.md section 5; the lines are inked)
 * and the coat's sicker green: both muted, neither a SIGNAL hex, and a hue family off the gold sparkle.
 */
const STINK = '#BDBF7E', QUEASY = '#9BB06C';
/** A burst is centred this far over the row overHead() gives (game/gags.ts); the WHOOP! this far over the hanging feet. */
const BURST_ABOVE = 16, WHOOP_ABOVE = 56;
/** Upside down, the plate rides this many rows over the feet (see drawPlate). */
const FEET_CLEAR = 2;
/** The basket the yank leaves behind stands this far in front of the feet; it is the willow basket's own height (content/critters/items.ts). */
const DROPPED_DX = 16, BASKET_H = 22;
const HOP_FRAMES = 12, HOP_LIFT = 14, MAX_HOPS = 4;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', SNAG = '?!', WHOOP = 'WHOOP!', FLUMP = 'FLUMP!', PEEYOO = 'PEE-YOO!', TITLE = 'TANGLE WOOD';
/** The jokes' particles, built once: the litter kicked up by the yank, splashed by the landing and shaken off; the stink. */
const LEAF_KICK = { speed: 1.6, up: 2.2, color: WOOD.leaf, color2: WOOD.leafPale, size: 3, life: 50, gravity: 0.08, screen: true };
const LEAF_SPLASH = { speed: 2.6, up: 2.6, color: WOOD.leaf, color2: WOOD.leafPale, size: 4, life: 70, gravity: 0.07, screen: true };
const LEAF_SHED = { speed: 1.5, up: 1.4, color: WOOD.leafPale, color2: WOOD.leaf, size: 4, life: 60, gravity: 0.06, screen: true };
const STINK_CLOUD = { speed: 2.4, up: 1.0, color: STINK, size: 8, sizeJitter: 3, life: 90, gravity: -0.012, drag: 0.94, screen: true };
const STINK_PUFF = { speed: 0.5, up: 0.6, color: STINK, size: 4, sizeJitter: 1, life: 50, screen: true };
/** Draw-side scratch points (zero allocation per frame). */
const PT: Point = { x: 0, y: 0 }, LEAF_PT: Point = { x: 0, y: 0 };

export interface WoodSeat extends Seat {
  /** Frames left of the brush crouch; the stick is locked while it runs. */
  reachT: number;
  /** Frames left of THE TANGLE (TANGLE_TOTAL..0): the stick is locked and the seat belongs to the vine. */
  tangleT: number;
  /** Frames left of THE TOADSTOOL's beat (STINK_TOTAL..0): the stick is locked and the seat staggers back on its own. */
  stinkT: number;
  /** Where this seat's joke went off: the x of the vine's curl, or of the toadstool the cloud comes out of. */
  jokeX: number;
  basketPt: Point;
}
/** One bump of the pool: lifting (`lift` 0..LIFT_FRAMES), then showing for `show` frames: the visit's thing, a toadstool, or a thing with a vine beside it. */
export interface Bump {
  active: boolean;
  x: number;
  lift: number;
  show: number;
  toadstool: number;
  /** 1 while a curl of vine lies beside it: the first brush is THE TANGLE, which takes the vine and leaves the find. */
  vine: number;
  /** Frames left of a brushed toadstool standing and sinking back (SINK_TOTAL..0); nobody can brush it meanwhile. */
  sink: number;
}
export interface Hop { t: number; x0: number; y0: number; seat: number; }
export interface WoodLayer { L: { canvas: HTMLCanvasElement; w: number; h: number }; y: number; }
export interface WoodLayers { far: WoodLayer; ground: WoodLayer; near: WoodLayer; }

/** A ROOT-space point through the rig's last draw: lib/art/rig.ts jointScreen's own sum, for a point that is not a joint. */
function rootToScreen(rig: Rig, x: number, y: number, out: Point): Point {
  const t = rig.tf, lx = x * t.c - y * t.s + t.rx, ly = x * t.s + y * t.c + t.ry;
  out.x = t.x + lx * t.fs; out.y = t.y + ly * t.ss;
  return out;
}

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
  /** Toadstools brushed this round (the first joke's count). */
  declare poohs: number;
  /** Vines walked into this round (the second joke's count). */
  declare tangles: number;

  constructor(game: Game) { super(game, 'wood'); this.seats = []; this.bumps = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = woodLayers();
    particles.clear();
    clearGags();
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
      s.reachT = 0; s.tangleT = 0; s.stinkT = 0; s.jokeX = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(WOOD_ANIMS);
      seatAnim(s, 'carry');
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }
    this.bumps = [];
    for (let i = 0; i < MAX_BUMPS; i++) this.bumps.push({ active: false, x: 0, lift: 0, show: 0, toadstool: 0, vine: 0, sink: 0 });
    // the wood the truck arrives to: SEED_BUMPS already showing, spread along the litter
    for (let i = 0; i < SEED_BUMPS; i++) { const x = this.freeX(); if (x >= 0) this.lay(x, LIFT_FRAMES); }
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;
    const need = run ? run.need(this.ing) : null;
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0; this.poohs = 0; this.tangles = 0;
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

  /** One more bump at `x`, `lift` frames into its lift, and the deal: a toadstool, a vine beside it, or neither. */
  lay(x: number, lift: number): void {
    let slot = -1;
    for (let i = 0; i < this.bumps.length; i++) if (!this.bumps[i].active) { slot = i; break; }
    if (slot < 0) return;
    const b = this.bumps[slot], roll = rng.int(1, DEAL_ROLL);
    b.active = true; b.x = x; b.lift = lift; b.show = 0; b.sink = 0;
    b.toadstool = roll === TOADSTOOL_ROLL ? 1 : 0; b.vine = roll === VINE_ROLL ? 1 : 0;
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

  /** Every bump lifts, then shows; a showing one sinks back after SHOW_FRAMES, a brushed toadstool after its puff; and one more lifts on the spawn timer. */
  updateBumps(): void {
    for (let i = 0; i < this.bumps.length; i++) {
      const b = this.bumps[i];
      if (!b.active) continue;
      if (b.sink > 0) { if (--b.sink === 0) b.active = false; continue; }
      if (b.lift < LIFT_FRAMES) b.lift++;
      else if (++b.show >= SHOW_FRAMES) b.active = false;
    }
    if (--this.nextSpawn > 0) return;
    this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
    const x = this.freeX();
    if (x >= 0) this.lay(x, 0);
  }

  /** Every seat: a joke first (it has the stick), then the brush crouch, then the stick and the brush. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.tangleT > 0) { this.stepTangle(s); s.moving = false; s.player.tick(); continue; }
      if (s.stinkT > 0) { this.stepStink(s); s.moving = false; s.player.tick(); continue; }
      if (s.reachT > 0) { s.reachT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryBrush(s);
      if (s.reachT === 0 && s.tangleT === 0 && s.stinkT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** `action`: the nearest SHOWING bump within REACH is brushed - the thing into the basket, or one of the jokes. */
  tryBrush(s: WoodSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.bumps.length; i++) {
      const b = this.bumps[i];
      if (!b.active || b.lift < LIFT_FRAMES || b.sink > 0) continue;
      const d = Math.abs(b.x - s.x);
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    const b = this.bumps[best];
    s.moving = false; s.facing = b.x >= s.x ? 1 : -1;
    if (b.vine) { this.snag(s, b); return; }
    if (b.toadstool) { this.pooh(s, b); return; }
    b.active = false;
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

  // ---------------------------------------------------------------- THE TOADSTOOL
  /** It was a toadstool: two sniffs at it, and it stands there to puff while the seat's beat runs. Nothing is lost and nothing is scored. */
  pooh(s: WoodSeat, b: Bump): void {
    this.poohs++;
    b.sink = SINK_TOTAL;
    s.stinkT = STINK_TOTAL; s.jokeX = b.x;
    seatAnim(s, 'sniff', true);
    this.game.audio.play('brush');
    this.game.audio.play('wood_sniff');
  }

  /** One frame of the toadstool's beat: the bang on its frame, the cloud billowing on, the stagger back, and the seat a player again at the end. */
  stepStink(s: WoodSeat): void {
    const k = STINK_TOTAL - --s.stinkT - STINK_BANG;
    if (k === 0) this.peeyoo(s);
    if (k > 0 && k <= BILLOW_FRAMES && k % BILLOW_EVERY === 0) particles.burst('smoke', s.jokeX, BUMP_Y - 10, 3, STINK_CLOUD);
    if (k > 0 && k <= STAGGER_FRAMES) {
      // backing away from the smell, one half-pixel a frame (exact in binary, so every peer lands on the same x)
      s.x -= s.facing * STAGGER_STEP;
      if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      if (k % PUFF_EVERY === 0) particles.burst('smoke', s.x, s.y - s.rig.height * s.rig.scale + 8, 2, STINK_PUFF);
    }
    // out of the cloud at last: the old wrinkled-nose huff, as the head shakes it off
    if (k === STAGGER_FRAMES) this.game.audio.play('pooh');
    if (s.stinkT === 0) seatAnim(s, 'carry', true);
  }

  /** The bang: a big green-grey cloud out of the toadstool, PEE-YOO!, and the critter reels back out of it. */
  peeyoo(s: WoodSeat): void {
    particles.burst('smoke', s.jokeX, BUMP_Y - 8, CLOUD_COUNT, STINK_CLOUD);
    ringAt(s.jokeX, BUMP_Y - 4, 4, 28, STINK, 2, 16, true, true);
    gagBurst(s.x, overHead(s) - BURST_ABOVE, PEEYOO, s.colour);
    seatAnim(s, 'pooh', true);
    this.game.audio.play('wood_peeyoo');
  }

  // ---------------------------------------------------------------- THE TANGLE
  /**
   * The tell was walked into: the vine has the ankle. It goes with the critter and the find stays where it lies,
   * its clock started again so it cannot sink back into the litter while it waits for the next brush.
   */
  snag(s: WoodSeat, b: Bump): void {
    this.tangles++;
    b.vine = 0; b.show = 0;
    s.tangleT = TANGLE_TOTAL; s.jokeX = b.x + VINE_DX;
    seatAnim(s, 'snagged', true);
    gagBubble(s.x, overHead(s), SNAG, s.colour);
    this.game.audio.play('brush');
    this.game.audio.play('wood_creep');
  }

  /** One frame of the tangle: each moment lands on its frame in, and the seat is a player again at the end. */
  stepTangle(s: WoodSeat): void {
    const e = TANGLE_TOTAL - --s.tangleT;
    if (e === YANK) this.yank(s);
    else if (e === DROP) seatAnim(s, 'flump', true);
    else if (e === LAND) this.flump(s);
    else if (e === SHAKE) { seatAnim(s, 'shakeOff', true); this.game.audio.play('wood_shake'); }
    else if (e > SHAKE) for (let k = 0; k < LEAF_OFF.length; k++) if (e === SHAKE + LEAF_OFF[k]) particles.burst('leaf', s.x, s.y - s.rig.height * s.rig.scale + 10, 3, LEAF_SHED);
    if (s.tangleT === 0) this.untangle(s);
  }

  /** The bang: WHOOP! - hauled up the vine by the ankle and turned over, the basket left standing on the litter. */
  yank(s: WoodSeat): void {
    s.rig.weapon = null;
    seatAnim(s, 'dangle', true);
    gagBurst(s.x, s.y - DANGLE_LIFT - WHOOP_ABOVE, WHOOP, s.colour);
    particles.burst('leaf', s.x, s.y - 4, 7, LEAF_KICK);
    this.game.audio.play('wood_whoop');
  }

  /** The landing: FLUMP! on its back in the litter, the world bumps, and the leaves go up - and come down on it. */
  flump(s: WoodSeat): void {
    const x = s.x - s.facing * 22;
    gagBurst(s.x, overHead(s) - BURST_ABOVE, FLUMP, s.colour);
    gagBump(2);
    particles.burst('leaf', x, s.y - 8, 12, LEAF_SPLASH);
    ringAt(x, s.y - 2, 4, 30, UI.cream, 2, 12, true, true);
    this.game.audio.play('wood_flump');
  }

  /** Shaken off: the basket is picked up off the litter and the seat is a player again. The find is still there. */
  untangle(s: WoodSeat): void {
    s.rig.weapon = RIBBON_BASKET;
    seatAnim(s, 'carry', true);
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: the sign drops; any joke still running stops where it is (the basket back in the paw), and every seat cheers or sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    for (let i = 0; i < this.bumps.length; i++) { const b = this.bumps[i]; if (b.sink > 0) { b.active = false; b.sink = 0; } }
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.reachT = 0; s.tangleT = 0; s.stinkT = 0; s.moving = false;
      s.rig.weapon = RIBBON_BASKET;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame, bump = gagShakeY();
    // the world, nudged by the FLUMP's bump; the paper over it (the plates, the cards, the ticket, the sign) never is.
    // Nothing clears the canvas between frames, so while it is nudged the backdrop goes down at rest first: the rows
    // the nudge uncovers at the top or the bottom show the wood, not the last frame
    if (bump !== 0) { blitAt(ctx, L.far.L, 0, L.far.y); blitAt(ctx, L.ground.L, 0, L.ground.y); blitAt(ctx, L.near.L, 0, L.near.y); }
    ctx.save(); ctx.translate(0, bump);
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    for (let i = 0; i < this.bumps.length; i++) this.drawBumpAt(ctx, this.bumps[i], i, f);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, this.airborne(s) ? DANGLE_LIFT : 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    ctx.restore();
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) this.drawPlate(ctx, this.seats[i]);
    drawGags(ctx);
    drawClock(ctx, this.countStr, this.total / this.target, this.clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** True while a seat is off the ground on the vine (hauled up, hanging or falling): its shadow shrinks under it. */
  airborne(s: WoodSeat): boolean { const e = TANGLE_TOTAL - s.tangleT; return s.tangleT > 0 && e >= YANK && e < LAND; }

  /** A bump lifting out of the litter, the vine curled beside one (the tell), and the sparkle over one that is showing: the one bright thing in the wood. */
  drawBumpAt(ctx: CanvasRenderingContext2D, b: Bump, i: number, f: number): void {
    if (!b.active) return;
    const k = b.lift / LIFT_FRAMES;
    if (b.vine) drawVineCurl(ctx, b.x + VINE_DX, BUMP_Y, f, i);
    if (b.toadstool) drawToadstool(ctx, b.x, BUMP_Y, k, b.sink > 0 && b.sink < SINK_DOWN ? 1 - b.sink / SINK_DOWN : 0); else drawBump(ctx, b.x, BUMP_Y, k, this.icon, this.hex);
    if (k >= 1 && b.sink === 0 && (((f + i * 7) >> 3) & 1)) { ctx.fillStyle = SIGNAL.wood; ctx.fillRect(b.x + 11, BUMP_Y - 26, 2, 8); ctx.fillRect(b.x + 8, BUMP_Y - 23, 8, 2); }
  }

  /**
   * One seat: the basket the yank left on the litter and the vine creeping out of it (both behind the critter), the
   * critter (in the queasy coat for a moment after a toadstool), then the joke's marks over it.
   */
  drawSeat(ctx: CanvasRenderingContext2D, s: WoodSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    const t = s.tangleT > 0 ? TANGLE_TOTAL - s.tangleT : -1, q = s.stinkT > 0 ? STINK_TOTAL - s.stinkT : -1;
    if (t >= YANK) {
      ctx.save(); ctx.translate(R(s.x + s.facing * DROPPED_DX), s.y - BASKET_H);
      RIBBON_BASKET.draw(ctx, rig, s.player.pose);
      ctx.restore();
    }
    if (t >= 0) this.drawVine(ctx, s, t);
    if (q >= QUEASY_FROM && q < QUEASY_FROM + QUEASY_FRAMES) coat(rig, QUEASY);
    drawRig(ctx, rig, s.player.pose, o);
    coat(rig, null);
    jointScreen(rig, 'handN', s.basketPt);
    if (t >= 0) this.drawTangled(ctx, s, t);
    if (q >= STINK_BANG && q < STINK_BANG + STAGGER_FRAMES) this.drawStink(ctx, s);
  }

  /**
   * The vine behind the critter, where nothing it is drawn to may come from this frame's joints (they do not exist
   * until drawRig): creeping out of the litter to the near foot, which is the seat's own feet and the rig's hip
   * width and moves no more than the tug does, and whipping back up into the canopy once it has let go.
   */
  drawVine(ctx: CanvasRenderingContext2D, s: WoodSeat, t: number): void {
    const rig = s.rig, hx = this.hangX(s), top = s.y - DANGLE_LIFT;
    if (t < YANK) drawVineCreep(ctx, s.jokeX, BUMP_Y, R(s.x + s.facing * rig.p.hipX * rig.scale), s.y - CREEP_FOOT, Math.min(1, t / CREEP_REACH), this.frame);
    else if (t >= DROP && t < DROP + RETRACT_FRAMES) drawVineHang(ctx, hx, VINE_TOP, hx, top + ((VINE_TOP - top) * (t - DROP)) / RETRACT_FRAMES, 0);
  }

  /** The hang point in the canopy: straight over the near ankle as it hangs at rest, so the swing is even either side of it. */
  hangX(s: WoodSeat): number { return R(s.x - s.facing * s.rig.p.hipX * s.rig.scale); }

  /**
   * Over the critter, off this frame's joints: the vine taut from the canopy to the ankle (upside down the feet are
   * the top of the critter, so it crosses nothing but the foot it holds), the loop round the ankle while it has
   * hold, and the leaves the critter lands in and gets up wearing.
   */
  drawTangled(ctx: CanvasRenderingContext2D, s: WoodSeat, t: number): void {
    const rig = s.rig;
    if (t >= CREEP_REACH && t < DROP) {
      const a = jointScreen(rig, 'ankleN', PT);
      if (t >= YANK) drawVineHang(ctx, this.hangX(s), VINE_TOP, a.x, a.y, Math.sin(this.frame * 0.15) * 2);
      drawVineCuff(ctx, a.x, a.y);
    }
    if (t < LAND) return;
    const head = rig.joints.head;
    for (let k = 0; k < LEAF_OFF.length; k++) {
      if (t >= SHAKE + LEAF_OFF[k]) continue;
      const p = rootToScreen(rig, head.x + LEAF_AT[k * 2], head.y + LEAF_AT[k * 2 + 1], LEAF_PT);
      drawLeaf(ctx, p.x, p.y, LEAF_ROT[k] * s.facing, k & 1 ? WOOD.leafPale : WOOD.leaf);
    }
  }

  /** Stink lines coming up off both sides of the head while the critter staggers out of the cloud. */
  drawStink(ctx: CanvasRenderingContext2D, s: WoodSeat): void {
    const rig = s.rig, h = jointScreen(rig, 'head', PT), r = rig.p.headR * rig.scale, ph = this.frame * 0.35;
    drawStinkLine(ctx, h.x - r - 4, h.y + 2, 15, ph, STINK);
    drawStinkLine(ctx, h.x + r + 4, h.y - 2, 15, ph + 2, STINK);
  }

  /**
   * A seat's name plate, over the higher of its head and its feet. Upside down on the vine the head is at the
   * bottom, and drawSeatPlate (which hangs the plate `crown` rows over the head) would print the name across the
   * critter's middle; so for that one draw the crown is lent the head-to-feet height, and the plate rides on the
   * vine just over the feet - still stacked clear of every other plate by drawSeatPlate itself.
   */
  drawPlate(ctx: CanvasRenderingContext2D, s: WoodSeat): void {
    const rig = s.rig, crown = s.crown;
    if (s.tangleT > 0) {
      const head = jointScreen(rig, 'head', PT).y - rig.p.headR * rig.scale;
      const feet = Math.min(jointScreen(rig, 'ankleN', PT).y, jointScreen(rig, 'ankleF', PT).y) - rig.p.footH * rig.scale;
      if (feet < head) s.crown = Math.max(crown, R(head - feet) + FEET_CLEAR);
    }
    drawSeatPlate(ctx, s, PLATES);
    s.crown = crown;
  }

  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    drawFood(ctx, this.icon, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT), 6, this.hex);
  }

  override summary() {
    return {
      total: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText, ing: this.ing, poohs: this.poohs, tangles: this.tangles,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), count: s.count, reachT: s.reachT, tangleT: s.tangleT, stinkT: s.stinkT, anim: s.anim, basket: s.rig.weapon ? 1 : 0 })),
      /** [x, lift, toadstool, vine, sink] per bump that is up. */
      bumps: this.bumps.filter((b) => b.active).map((b) => [b.x, b.lift, b.toadstool, b.vine, b.sink]),
    };
  }

  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.nextSpawn, this.poohs, this.tangles);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.reachT, s.moving ? 1 : 0, s.tangleT, s.stinkT, s.jokeX); }
    for (let i = 0; i < this.bumps.length; i++) { const b = this.bumps[i]; f.push(b.active ? 1 : 0, b.x, b.lift, b.show, b.toadstool, b.vine, b.sink); }
    return f;
  }
}
