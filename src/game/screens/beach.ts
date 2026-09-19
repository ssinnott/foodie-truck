// COCKLE COVE - CHASE (docs/GDD.md section 5; docs/ART_STYLE.md section 1, section 4). Side view, golden hour: the
// crew runs along the dry sand with the sea behind it and the STRAND LINE in front, and the quarry is on the strand.
// A crab comes up out of a burrow and scuttles along the sand, stopping now and then with its claws up; run at it
// and it darts away, then tires and stops again - and `action` with a crab anywhere under the critter GRABS it: a
// 12-frame pounce, the crab hops into the basket, +1. A crab nobody catches goes back down its burrow after a
// while and another comes up somewhere else. There is no beat to hit and nothing to lose: a grab at empty sand
// does nothing, a crab that got away is not a miss, and the only thing the cove asks of anyone is to chase.
//
// The same strand serves the cove's other two ingredients with the same grab and their own behaviour: WEED washes
// up in clumps and drifts slowly along the tide line until it is raked in; SALT PANS are four rocks the tide fills
// and the sun crusts over, and a pan can be scraped once its crust is white (the mint sparkle says so). One table
// of numbers per ingredient (QUARRY) is the whole difference: a crab is a fast thing that runs from you, weed is a
// slow thing that does not, a pan is a still thing that has to be ready.
//
// Determinism (docs/ARCHITECTURE.md section 0): the quarry is a fixed pool of plain sim objects built in enter()
// and never grown; every random number - where a crab surfaces, how long it runs, which way it turns - comes from
// the rng singleton inside update(); movement is + - * on the table's px/frame; input is read by seat slot only.
// The burrow steps, the catch's flight, the float text and the sea's twinkle are cosmetic and stay out of
// checksumFields().
//
// One signal, and only one (docs/ART_STYLE.md section 4): SIGNAL.pond mint - the cove keeps the pond's accent
// (content/places.js) - on the ring a grab opens and on the sparkle over a stopped crab or a crusted pan, "the
// thing you can take NOW". There is no SIGNAL.hot anywhere in this scene: a crab's claws are drawn, never simulated.
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstDust, burstDrops } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { gatherTarget } from '../run.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { beachLayers, ROWS, GLINTS, BEACH } from '../../art/backgrounds/beach.ts';
import { BEACH_ANIMS, drawCrab, drawWeed, drawPan, drawBurrow, drawCatchSpark, drawFlyingCatch } from '../../art/beachProps.ts';
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

/**
 * Movement: px/frame along the sand, and the ends of the beach. 2.2, the orchard's: this scene is a chase like
 * that one, and the crab's own run (QUARRY.crab.speed 1.2) is set against it so a walking critter gains on a
 * running crab and only its DART outpaces the crew - briefly.
 */
const SPEED = 2.2, X_MIN = 26, X_MAX = 614;
/**
 * Seat i runs the sand on its own lane: P1 in front at LANE_Y0, four lanes 8 px apart - the orchard's spacing, for
 * the same reason (four bodies at one y fuse into one shape). The lanes and their contact shadows live entirely
 * inside the backdrop's clean walk band, ROWS.bandTop 282 .. ROWS.bandBot 322.
 */
const LANE_Y0 = 316, LANE_GAP = 8;
/** The row every quarry lives on: the strand line, in front of the whole cast (art/backgrounds/beach.js). */
const QUARRY_Y = ROWS.quarry;
/** The quarry pool, and how far apart two of them surface, and the strip they keep to. */
const MAX_QUARRY = 5, MIN_GAP = 40, Q_X_MIN = 40, Q_X_MAX = 600, SPAWN_TRIES = 8;
/** The four salt pans' rocks: fixed, because a rock is not something the tide brings. */
const PAN_X = Int16Array.of(96, 258, 396, 552);
/** A quarry's states. */
const EMERGE = 0, RUN = 1, STOP = 2, DIG = 3;
const STATE_NAMES = Object.freeze(['emerge', 'run', 'stop', 'dig']);
/** The burrow's open and close: three steps of 4 frames each way. */
const BURROW_STEP = 4, BURROW_FRAMES = 12;
/**
 * The grab: anything on the strand within REACH px of the feet, either side - a whole critter's width, so any
 * quarry the body overlaps can be taken (docs/GDD.md section 5 "reach is the whole body"). Symmetric, for the
 * farm's reason: facing is decided BY the grab, and two things inside the window go to the nearer one.
 */
const REACH = 34;
/** The pounce beat, in frames: the anim's own length. */
const POUNCE_FRAMES = 12;
/**
 * THE DART. A crab that sees a critter coming - any seat within DART_R of it - turns away and goes at the table's
 * dart speed for DART_FRAMES, then stops, TIRED, for TIRED_FRAMES with its claws up, which is the moment to
 * pounce. DART_COOL frames pass before it will dart again, so a chase is run-dart-stop-grab and never a stalemate
 * at the edge of the reach: a crab that is caught is caught by walking up to it while it rests.
 */
const DART_R = 46, DART_FRAMES = 14, TIRED_FRAMES = 36, DART_COOL = 110;
/** Cosmetic pool: the catch's hop into the basket. */
const HOP_FRAMES = 12, HOP_LIFT = 22, MAX_HOPS = 4;
const PLUS_ONE = '+1';
const TITLE = 'COCKLE COVE', FALLBACK_TARGET = 3;

/**
 * What the strand holds this visit, one row of numbers per ingredient: how fast it moves (px/frame), how fast it
 * darts (0 = it never does), how long it runs and stops for, how long it stays before it is gone, how often a new
 * one comes, how many are out when the truck pulls up, and whether it is a fixed pan. Every number a young
 * player meets on the beach is here and nowhere else.
 */
interface Quarry {
  speed: number; dart: number;
  runMin: number; runMax: number; stopMin: number; stopMax: number;
  life: number; spawnMin: number; spawnMax: number; seed: number;
  /** Frames a pan takes to crust once the tide fills it (a pan only); 0 for a thing that is ready as it comes. */
  crust: number;
  /** True while a running thing hides between runs (a crab in its burrow); false for weed and pans. */
  burrows: boolean;
}
const QUARRY: Readonly<Record<string, Quarry>> = Object.freeze({
  crab: { speed: 1.2, dart: 2.8, runMin: 40, runMax: 110, stopMin: 24, stopMax: 60, life: 720, spawnMin: 50, spawnMax: 100, seed: 3, crust: 0, burrows: true },
  seaweed: { speed: 0.3, dart: 0, runMin: 80, runMax: 200, stopMin: 60, stopMax: 140, life: 1500, spawnMin: 60, spawnMax: 120, seed: 3, crust: 0, burrows: false },
  salt: { speed: 0, dart: 0, runMin: 0, runMax: 0, stopMin: 0, stopMax: 0, life: 100000, spawnMin: 70, spawnMax: 130, seed: 2, crust: 90, burrows: false },
});
function quarryFor(ing: string): Quarry { return QUARRY[ing] || QUARRY.crab; }

/** One seat on the sand: the shared seat plus the pounce beat and the basket point the hop flies to. */
export interface BeachSeat extends Seat {
  /** Frames left of the pounce beat; the stick is locked while it runs. */
  pounceT: number;
  /** Where the basket is on screen, refilled from the `handN` joint by every drawSeat. */
  basketPt: Point;
}

/** One slot of the quarry pool. */
export interface Thing {
  /** True while it is on the strand; false is a free slot. */
  active: boolean;
  /** px along the strand. */
  x: number;
  /** 1 right, -1 left. */
  dir: number;
  /** EMERGE | RUN | STOP | DIG. */
  state: number;
  /** Frames left of the state. */
  t: number;
  /** Frames left before it goes (a crab back down its burrow, weed out on the wash). */
  life: number;
  /** Frames left before it will dart again; 0 means it can. */
  cool: number;
  /** Frames left of a dart; 0 means it is not darting. */
  dartT: number;
}

/** A catch hopping from the strand into a seat's basket (cosmetic). */
export interface Hop {
  t: number;
  x0: number;
  y0: number;
  seat: number;
}

/** One pre-rendered backdrop layer and the y the screen blits it at (art/backgrounds/beach.js beachLayers). */
export interface BeachLayer {
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  y: number;
}
export interface BeachBackdrop {
  far: BeachLayer;
  mid: BeachLayer;
  ground: BeachLayer;
  near: BeachLayer;
}

export class BeachScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations, for the reason game/game.ts states over its own block: a plain field declaration emits a
  // class field per name (es2022 defines them before the constructor body runs), which would wipe what the
  // constructor has just written. `declare` erases under tsc, under esbuild and under Node's type stripping alike.

  /** One seat per party member, in party order (not slot order). */
  declare seats: BeachSeat[];
  /** The quarry: a fixed pool of MAX_QUARRY slots, built in enter() and never grown. */
  declare things: Thing[];
  /**
   * What the strand holds this visit (game/run.js gatherTarget): crabs, weed or salt. `icon`/`hex` are its glyph,
   * the sign prefix its name, the title the landmark's, and `q` its row of QUARRY.
   */
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare title: string;
  declare q: Quarry;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** The backdrop, pre-rendered once (art/backgrounds/beach.js beachLayers) and blitted per frame. */
  declare layers: BeachBackdrop;
  /** Frames until the next thing comes onto the strand (q.spawnMin..q.spawnMax). */
  declare nextSpawn: number;
  /** The catch hops: a fixed cosmetic pool. */
  declare hops: Hop[];
  declare hopCursor: number;
  /** What the round is played to: the order's REMAINDER, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** What the party has banked this round (the sum of the seats' counts). */
  declare total: number;
  /** The clock's count, rebuilt by setTotal(): 'total/target'. */
  declare countStr: string;
  /** The hint line under the sand, built once in enter() with the seat's own action key. */
  declare hint: string;
  /** What the action key is called on seat 0's device, for the HOW TO PLAY card. */
  declare cardKey: string;
  /** The round clock and its end sign (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];

  constructor(game: Game) { super(game, 'beach'); this.seats = []; this.things = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = beachLayers();
    particles.clear();

    const place = PLACES.find((p) => p.id === params.place && p.screen === 'beach');
    this.ing = gatherTarget(run, place ? place.id : undefined, 'beach');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.crab;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    this.title = place ? place.name : TITLE;
    this.q = quarryFor(this.ing);
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);

    this.seats = makeSeats<BeachSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length, pitch = Math.min(120, R((X_MAX - X_MIN) / (n + 1)));
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * pitch);
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.pounceT = 0;
      s.basketPt = { x: s.x, y: s.y - 20 };
      s.player.setOverlay(BEACH_ANIMS);
      seatAnim(s, 'carry');
      // four people on a beach, not one pose printed four times: each seat starts its breath a beat later (pose
      // only - nothing in summary() or the checksum reads the anim clock)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }

    this.things = [];
    for (let i = 0; i < MAX_QUARRY; i++) this.things.push({ active: false, x: 0, dir: 1, state: RUN, t: 0, life: 0, cool: 0, dartT: 0 });
    for (let k = 0; k < this.q.seed; k++) this.spawn();
    this.nextSpawn = rng.int(this.q.spawnMin, this.q.spawnMax);

    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, seat: 0 });
    this.hopCursor = 0;

    const need = run ? run.need(this.ing) : null;
    // the REMAINDER, not the whole line: the map may already have banked some (the other mini-games agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    const verb = this.ing === 'salt' ? 'SCRAPE' : this.ing === 'seaweed' ? 'RAKE' : 'GRAB';
    this.hint = 'MOVE: LEFT/RIGHT   ' + verb + ': ' + game.input.keyText(0, 'action');
    this.cardKey = game.input.keyText(0, 'action');
    this.clock = makeClock();
    this.fields = [];
  }

  /** A seeded x on the strand at least MIN_GAP from every thing that is out, or -1 if the strand is too full. */
  freeX(): number {
    for (let k = 0; k < SPAWN_TRIES; k++) {
      const x = rng.int(Q_X_MIN, Q_X_MAX);
      let ok = true;
      for (let i = 0; i < this.things.length && ok; i++) {
        const t = this.things[i];
        if (!t.active) continue;
        const d = t.x > x ? t.x - x : x - t.x;
        if (d < MIN_GAP) ok = false;
      }
      if (ok) return x;
    }
    return -1;
  }

  /**
   * One more thing onto the strand: a crab up out of a burrow at a seeded x (EMERGE, then it runs), a clump of
   * weed already lying there and drifting, or the tide filling the first empty pan (RUN is its crust timer; STOP is
   * "crusted", the state it is taken in). Nothing happens when the pool is full or the strand has no room.
   */
  spawn(): void {
    let slot = -1;
    for (let i = 0; i < this.things.length; i++) if (!this.things[i].active) { slot = i; break; }
    if (slot < 0) return;
    const q = this.q, t = this.things[slot];
    if (q.crust) {
      if (slot >= PAN_X.length) return;
      t.active = true; t.x = PAN_X[slot]; t.dir = 1; t.state = RUN; t.t = q.crust; t.life = q.life; t.cool = 0; t.dartT = 0;
      return;
    }
    const x = this.freeX();
    if (x < 0) return;
    t.active = true; t.x = x; t.dir = rng.chance(0.5) ? 1 : -1; t.life = q.life; t.cool = 0; t.dartT = 0;
    if (q.burrows) { t.state = EMERGE; t.t = BURROW_FRAMES; }
    else { t.state = RUN; t.t = rng.int(q.runMin, q.runMax); }
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
      this.updateThings();
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
    if (tickClock(clock)) this.finish();
  }

  /** Every seat: the beat first (it locks the stick), then the stick along the sand, the grab, the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.pounceT > 0) { s.pounceT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (input.pressed(s.slot, 'action')) this.tryGrab(s);
      if (s.pounceT === 0) seatAnim(s, s.moving ? 'carryWalk' : 'carry');
      s.player.tick();
    }
  }

  /** True when a thing can be taken right now: a crab or weed that is up, a pan that has crusted. */
  takeable(t: Thing): boolean {
    if (!t.active || t.state === EMERGE || t.state === DIG) return false;
    if (this.q.crust) return t.state === STOP;
    return true;
  }

  /** `action`: the nearest takeable thing inside the reach goes into the basket: the pounce, the hop, +1. */
  tryGrab(s: BeachSeat): void {
    let best = -1, bd = REACH + 1;
    for (let i = 0; i < this.things.length; i++) {
      const t = this.things[i];
      if (!this.takeable(t)) continue;
      const d = t.x > s.x ? t.x - s.x : s.x - t.x;
      if (d <= REACH && d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    const t = this.things[best];
    t.active = false;
    s.count++; this.setTotal(this.total + 1);
    s.pounceT = POUNCE_FRAMES; s.moving = false;
    s.facing = t.x >= s.x ? 1 : -1;
    seatAnim(s, 'pounce', true);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.x0 = t.x; h.y0 = QUARRY_Y - 8; h.seat = s.index;
    ringAt(t.x, QUARRY_Y - 4, 4, 16, SIGNAL.pond, 2, 14, true, true);
    burstDust(t.x, QUARRY_Y, 4, 1.4, true);
    floatText(t.x, QUARRY_Y - 30, PLUS_ONE, s.colour, 1, true);
  }

  /** Every thing on the strand, then the spawner. */
  updateThings(): void {
    const q = this.q;
    for (let i = 0; i < this.things.length; i++) { const t = this.things[i]; if (t.active) this.stepThing(t, q); }
    if (--this.nextSpawn > 0) return;
    this.nextSpawn = rng.int(q.spawnMin, q.spawnMax);
    this.spawn();
  }

  /**
   * One thing's frame. A pan only crusts (RUN counts down to STOP and stays there). Everything else: the burrow
   * opens (EMERGE) and it runs; it runs for a seeded while, turning at the ends of the strand, then stops for a
   * seeded while, then runs again the way the rng says; a crab that can dart and sees a seat coming darts away
   * (see DART_R); and when its life runs out it digs down (DIG) or, for weed, the wash takes it.
   */
  stepThing(t: Thing, q: Quarry): void {
    if (q.crust) {
      if (t.state === RUN && --t.t <= 0) { t.state = STOP; t.t = 0; }
      return;
    }
    if (t.cool > 0) t.cool--;
    if (t.state === EMERGE) {
      if (--t.t <= 0) { t.state = RUN; t.t = rng.int(q.runMin, q.runMax); }
      return;
    }
    if (t.state === DIG) {
      if (--t.t <= 0) t.active = false;
      return;
    }
    if (--t.life <= 0) {
      if (q.burrows) { t.state = DIG; t.t = BURROW_FRAMES; burstDust(t.x, QUARRY_Y, 3, 1, true); }
      else { t.active = false; burstDrops(t.x, QUARRY_Y - 4, 4, true); }
      return;
    }
    // the dart: a crab that sees a critter coming turns away and goes, then tires
    if (q.dart > 0 && t.cool === 0 && t.dartT === 0) {
      for (let i = 0; i < this.seats.length; i++) {
        const sx = this.seats[i].x, d = sx > t.x ? sx - t.x : t.x - sx;
        if (d <= DART_R) { t.dir = sx > t.x ? -1 : 1; t.dartT = DART_FRAMES; t.cool = DART_COOL; t.state = RUN; t.t = DART_FRAMES; burstDust(t.x, QUARRY_Y, 2, 1.2, true); break; }
      }
    }
    if (t.state === RUN) {
      const speed = t.dartT > 0 ? q.dart : q.speed;
      t.x += t.dir * speed;
      if (t.x < Q_X_MIN) { t.x = Q_X_MIN; t.dir = 1; } else if (t.x > Q_X_MAX) { t.x = Q_X_MAX; t.dir = -1; }
      if (t.dartT > 0) {
        if (--t.dartT === 0) { t.state = STOP; t.t = TIRED_FRAMES; }
        return;
      }
      if (--t.t <= 0) { t.state = STOP; t.t = rng.int(q.stopMin, q.stopMax); }
    } else if (t.state === STOP) {
      if (--t.t <= 0) { t.state = RUN; t.t = rng.int(q.runMin, q.runMax); if (rng.chance(0.4)) t.dir = -t.dir; }
    }
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with a catch in its basket cheers, one without sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.pounceT = 0; s.moving = false;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    // the sea's twinkle on the swell and the breakers: cream dashes, index-hashed so a third are lit on any frame
    ctx.globalAlpha = 0.7; ctx.fillStyle = BEACH.foam;
    for (let i = 0; i < GLINTS.length; i++) { const g = GLINTS[i]; if ((((f + i * 5) >> 3) % 3) === 0) ctx.fillRect(g[0], g[1], g[2], 2); }
    ctx.globalAlpha = 1;
    blitAt(ctx, L.mid.L, 0, L.mid.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    // ground contact first, then the cast back lane to front lane
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    // THE STRAND, in front of the whole cast: the thing a player is chasing is never hidden by the chaser. What it
    // covers is feet and shins, which is where a crab at your feet goes.
    if (this.q.crust) for (let i = 0; i < PAN_X.length; i++) drawShadow(ctx, PAN_X[i], QUARRY_Y, 30, 0.3, 0);
    for (let i = 0; i < this.things.length; i++) { const t = this.things[i]; if (t.active && !this.q.crust) drawShadow(ctx, t.x, QUARRY_Y + 1, 22, 0.3, 0); }
    if (this.q.crust) this.drawPans(ctx, f); else for (let i = 0; i < this.things.length; i++) this.drawThing(ctx, this.things[i], i, f);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.clock, this.countStr, this.clockIcon, this.title);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
    if (this.game.options.debug) this.drawWindows(ctx);
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: BeachSeat): void {
    const rig = s.rig, o = s.opts;
    rig.basketFill = this.target ? Math.min(1, s.count / this.target) : 0; rig.basketSquash = 1;
    o.x = R(s.x); o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
    jointScreen(rig, 'handN', s.basketPt);
  }

  /** A crab or a clump of weed on the strand, with the burrow under a crab that is coming up or going down. */
  drawThing(ctx: CanvasRenderingContext2D, t: Thing, i: number, f: number): void {
    if (!t.active) return;
    const x = R(t.x);
    if (t.state === EMERGE || t.state === DIG) {
      // the burrow opens over three steps as the crab comes up (and closes as it goes down): the crab shows once
      // the hole is open, sunk to its eyes
      const open = t.state === EMERGE ? BURROW_FRAMES - t.t : t.t;
      drawBurrow(ctx, x, QUARRY_Y, Math.min(2, (open / BURROW_STEP) | 0));
      if (open >= BURROW_STEP * 2) drawCrab(ctx, x, QUARRY_Y + 8, t.dir, 0, 0);
      return;
    }
    if (this.ing === 'seaweed') { drawWeed(ctx, x, QUARRY_Y, t.dir); return; }
    const moving = t.state === RUN;
    drawCrab(ctx, x, QUARRY_Y, t.dir, moving ? (f >> 2) & 1 : 0, moving ? 0 : 1);
    // the mint sparkle over a crab that has stopped: the moment to pounce
    if (!moving && (((f + i * 7) >> 3) & 1)) drawCatchSpark(ctx, x + 12, QUARRY_Y - 24);
  }

  /** The four pans: every rock always, wet or crusting or crusted by the pool slot that maps to it. */
  drawPans(ctx: CanvasRenderingContext2D, f: number): void {
    for (let i = 0; i < PAN_X.length; i++) {
      const t = i < this.things.length ? this.things[i] : null, on = t && t.active;
      const crust = !on ? 0 : t.state === STOP ? 1 : 1 - t.t / this.q.crust;
      drawPan(ctx, PAN_X[i], QUARRY_Y, i & 1, crust);
      if (on && t.state === STOP && (((f + i * 7) >> 3) & 1)) drawCatchSpark(ctx, PAN_X[i] + 14, QUARRY_Y - 18);
    }
  }

  /** The catch hops from the strand into the seat's basket over 12 frames (the basket point comes from the last drawSeat). */
  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const s = this.seats[h.seat], k = h.t / HOP_FRAMES;
    const tx = s.basketPt.x, ty = s.basketPt.y + 10;
    drawFlyingCatch(ctx, R(h.x0 + (tx - h.x0) * k), R(h.y0 + (ty - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT), this.icon, this.hex);
  }

  /** ?debug=1: each seat's reach against the strand, and each crab's dart radius (UI.red, the orchard's debug ink). */
  drawWindows(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    for (let i = 0; i < this.seats.length; i++) ctx.strokeRect(R(this.seats[i].x - REACH) + 0.5, QUARRY_Y - 14.5, REACH * 2, 16);
    for (let i = 0; i < this.things.length; i++) { const t = this.things[i]; if (t.active) ctx.strokeRect(R(t.x - DART_R) + 0.5, QUARRY_Y - 20.5, DART_R * 2, 4); }
  }

  override summary() {
    return {
      total: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText, ing: this.ing,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), count: s.count, pounceT: s.pounceT, anim: s.anim })),
      /** [x, dir, state, dartT] per thing on the strand. */
      things: this.things.filter((t) => t.active).map((t) => [R(t.x), t.dir, STATE_NAMES[t.state], t.dartT]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.nextSpawn);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.pounceT, s.moving ? 1 : 0);
    }
    for (let i = 0; i < this.things.length; i++) {
      const t = this.things[i];
      f.push(t.active ? 1 : 0, t.x, t.dir, t.state, t.t, t.life, t.cool, t.dartT);
    }
    return f;
  }
}
