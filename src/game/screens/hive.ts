// THE HIVES - HONEY, and the verb is CREEP (docs/GDD.md sections 3 and 5; docs/ART_STYLE.md section 1). A clover
// meadow at the warm end of the afternoon: five straw skeps stand at fixed x along a low bench at the back, every
// seat walks left and right in front of them on its own depth lane with a honey dipper in its paw, and HOLDING
// `action` within REACH of a skep that still has honey dips it: the dipper goes into the doorway, a strand of honey
// climbs onto it over DIP_HOLD frames of holding, and on the last one it is +1, a ring, a jar in the party's crate,
// and that skep goes empty for REFILL_FRAMES. Letting go early puts the dipper back at no cost; the next hold starts
// again. The bees drone over the bench the whole time and never turn: there is nothing in this meadow that stings.
// THE JOKES, two of them, both costing a moment and never a jar (screens/hiveGags.ts has them beat by beat):
//   the curious bee  one dip in BEE_ODDS, BEE_AT frames into the hold, a bee peels off the swarm and circles the
//                    head; the hold PAUSES (the bar keeps its fill, as letting go does) while it lands on the nose,
//                    the critter goes cross-eyed, stiff, and over backwards like a plank - FLUMP! - and lies there
//                    with the bee on its nose until it buzzes off; then it springs up and the hold runs on;
//   the honey flood  one skep fill in OVER_ODDS comes in OVERFULL and oozes where everyone can see it. A hold there
//                    swells and groans the skep over its last SWELL_FRAMES, and if it lands it is +1 as ever and
//                    the skep burps its honey over the dipper - GLOOP! - leaving the critter honey all over and
//                    stuck to the spot until SHLUP!, it pops free. Barley licks his off instead.
// The round ends when the party's total reaches the order's remainder, and not before (there is no clock to run
// out); the HONEY sign drops, is held, then run.gather() and back to the map. Ending it clears any joke mid-beat.
//
// Determinism (docs/ARCHITECTURE.md section 0): the skeps, the seats and the swarm are fixed pools of plain sim
// objects built in enter(); every random number comes from the rng singleton inside update() (the five opening
// skeps are dealt in enter(), on the frame the screen comes up on every peer alike, as the bramble deals its thorns);
// the swarm's orbit is an integer counter indexed into art/hiveProps.js's tables, so there is no trig anywhere in the
// simulation and nothing in draw() is read back. The clover drift, the rings, the float text, the dust, the jokes'
// word cards, their bump and every mark of theirs read off a rig are cosmetic and stay out of checksumFields().
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng, makeRng } from '../../lib/engine/rng.ts';
import type { RngInstance } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstDust, burstSparkle } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F } from '../../content/critters/common.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { hiveLayers, HIVE, ROWS, SKEP_X, CRATE_X } from '../../art/backgrounds/hive.ts';
import { drawSkep, drawOoze, drawSwarm, drawHoneyCrate, drawHoneyStrand, HONEY_DIPPER, SWARM_SHAPE, SWARM_SPIN, SKEP_H } from '../../art/hiveProps.ts';
import { makeSeats, gulp, gulps, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { clearGags, stepGags, drawGags, gagShakeY, COAT } from '../gags.ts';
import {
  HIVE_GAG_ANIMS, BEE_ODDS, BEE_AT, BEE_TOTAL, BEE_RIGID, OVER_ODDS, SWELL_FRAMES, SWELL_PX,
  beeComes, stepBee, floodSwells, floodLands, stepFlood, lieLift, lieBack, drawCuriousBee, drawFloodSeat, drawFloodPool,
  drawFloodWave, floodSag, drawHoneyBees,
} from './hiveGags.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint, drawBar } from '../ui.ts';

/** The HOW TO PLAY card's pictograms (game/controlcard.ts), in the order they are read. */
const SCHEMES: readonly CardScheme[] = Object.freeze(['move', 'hold']);
const R = Math.round;
/**
 * CREEP: px/frame, and the lane's ends. The orchard runs at 2.2 and the coop at 2.0; this scene is named for moving
 * CAREFULLY and every number below is measured at 1.8, which is also what makes the 126 px skep pitch cost a
 * meaningful 70 frames to cross.
 */
const SPEED = 1.8, X_MIN = 24, X_MAX = 616;
/** Seat i stands with its feet at LANE_Y0 - i * LANE_GAP: P1 in front, four lanes 8 px apart so bodies stack. */
const LANE_Y0 = 322, LANE_GAP = 8;
/** The skeps stand on the bench plank (art/backgrounds/hive.js ROWS.bench); the sparkle rides above the knob. */
const SKEP_TOP = ROWS.bench - SKEP_H, CRATE_Y = ROWS.bench;
/**
 * The dip. REACH is a whole critter's width either side of the skep: anywhere the body overlaps the skep, the
 * dipper reaches it, so nobody has to find the exact spot under the doorway. DIP_HOLD is how long `action` is held for the honey to come: 60 frames, a full second, long
 * enough to be a hold rather than a tap and short enough that a child never wonders if it is working - the strand
 * of honey climbing onto the dipper and the bar over the skep both say so from the first frame.
 */
const REACH = 36, DIP_HOLD = 60;
/**
 * A dipped skep is empty for this long. 150 frames is a couple of walks along the bench, so the party is pushed
 * ALONG the bench rather than parked at one skep, which is the movement this mini-game is made of.
 */
const REFILL_FRAMES = 150;
/**
 * The jokes are dealt here and played in screens/hiveGags.ts. A skep comes in OVERFULL one fill in OVER_ODDS (6) and
 * a hold at any other skep has a bee one in BEE_ODDS (8), so a little over one dip in four (13 in 48) has a joke on
 * it: a round of four dips shows one seven times in ten, and no joke is ever every other jar. The flood's wind-up
 * starts SWELL_AT frames into a hold at an overfull skep, its last SWELL_FRAMES.
 */
const SWELL_AT = DIP_HOLD - SWELL_FRAMES;
/**
 * The swarm: one cloud of bees drifting over the bench for the whole round, calm from the first frame to the last.
 * It is scenery that moves - the meadow would be dead without it - and nothing a seat does changes it.
 */
const CALM = 0;
/** The swarm's drift while it is a cloud over the bench, and the span of x it drifts across. */
const DRIFT = 0.6, SWARM_X_MIN = 130, SWARM_X_MAX = 510;
/** The dip bar over a skep being dipped: a small paper bar filling gold with the hold. */
const DIP_BAR_W = 28, DIP_BAR_H = 5, DIP_BAR_ABOVE = 26;
/** Clover drifting across the meadow: a cosmetic stream off the hive's own seed block, never the rng singleton. */
const CLOVER_EVERY = 9, CLOVER_SEED = 195;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1';
const TITLE = 'CLOVER HIVES', SIGN_PREFIX = 'HONEY: ';
const HONEY_HEX = INGREDIENTS.honey.hex;
const DIP_BAR = { color: SIGNAL.hive };
/** A flooded dip's jar plays after the gloop, not under it: the +1 the ear hears still has to be heard. */
const JAR_AFTER_GLOOP = { delay: 0.3 };

/**
 * The scene's own animation overlay (art/animation.js AnimPlayer.setOverlay, the coop's COOP_ANIMS pattern). None
 * of it belongs in content/critters/common.js: only this mini-game creeps, dips and freezes.
 *
 *   creep   the verb. 36 frames against the shared walk's 28, crouched (root +2), leaning forward, with SHORT steps
 *           (16/-14 against the walk's 26/-22) and the head tipped UP - every critter in this scene is watching the
 *           swarm, and the walk has to look like it is being got away with.
 *   dip     the reach up into a skep's doorway, HELD: the near paw carries the dipper, so this is the shared
 *           `reach`'s shape rather than the coop's reachNest: the skeps are above the seat, not behind it, and at
 *           [114, 22] the paw lands beside the muzzle with the dipper standing past it (ART_STYLE 0.7). It loops
 *           on a slow twirl of the dipper for as long as the button is down, so a held dip is a critter working,
 *           not a critter frozen mid-reach.
 * ...and the two jokes' poses (screens/hiveGags.ts HIVE_GAG_ANIMS: the bee's watch, tremble, plank, lie and spring;
 * the flood's gulp, stuck, strain, pop and shake, and Barley's lick and smack).
 */
const HIVE_ANIMS = Object.freeze({
  ...HIVE_GAG_ANIMS,
  creep: { loop: true, frames: [
    F(9, { armR: [46, 44], armL: [-16, 10], weapon: 90, legR: [16, 10], legL: [-14, 16], torso: 8, head: -4, root: [0, 2] }),
    F(9, { armR: [48, 46], armL: [-14, 10], weapon: 90, legR: [3, 20], legL: [-2, 5], torso: 8, head: -4, root: [0, 3], squash: 1.03 }),
    F(9, { armR: [46, 44], armL: [-16, 10], weapon: 90, legR: [-14, 16], legL: [16, 10], torso: 8, head: -4, root: [0, 2] }),
    F(9, { armR: [48, 46], armL: [-14, 10], weapon: 90, legR: [-2, 5], legL: [3, 20], torso: 8, head: -4, root: [0, 3], squash: 1.03 }),
  ] },
  dip: { loop: true, frames: [
    F(6, { armR: [114, 22], armL: [-140, -14], weapon: -28, torso: -4, head: -10, root: [0, 0], stretch: 1.02, face: 'grit' }, { ease: 'in' }),
    F(10, { armR: [122, 16], armL: [-150, -18], weapon: -34, torso: -7, head: -13, root: [0, -2], stretch: 1.04, face: 'happy' }, { ease: 'out' }),
    F(10, { armR: [120, 18], armL: [-148, -16], weapon: -40, torso: -6, head: -12, root: [0, -1], stretch: 1.03, face: 'happy' }, { ease: 'inout' }),
  ] },
});
/** Where the swarm's centre is this frame (draw-only): the point the jokes' bees leave from and fly back to. */
const SWARM_PT: Point = { x: 0, y: 0 };

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { drawFood(ctx, 'jar', x, y, 4, HONEY_HEX); }

/** One pre-rendered backdrop layer and the screen y it is blitted at (art/backgrounds/hive.ts hiveLayers). */
export interface HiveLayer {
  /** The offscreen canvas art/layers.ts makeLayer painted once. */
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  /** Screen y its top row lands on. */
  y: number;
}

/** The meadow's backdrop: painted on the first visit, kept for every visit after. */
export interface HiveLayers {
  /** Sky, downs, hedgerow, the far meadow and the skep bench, down to the ground row. */
  far: HiveLayer;
  /** The clover ground, with the trodden walk band the four lanes live in. */
  ground: HiveLayer;
  /** The near fringe of blades, drawn over everything standing on the band. */
  near: HiveLayer;
}

/**
 * A seat at the hives: the shared mini-game seat plus the held dip this screen keeps for it.
 * The per-screen extension minigame.ts documents, so `makeSeats<HiveSeat>` hands these back with the screen's own
 * fields as typed as the shared ones.
 */
export interface HiveSeat extends Seat {
  /** Frames `action` has been held at a full skep, 0..DIP_HOLD; the stick is ignored while it is above 0. */
  dipT: number;
  /** The skep being dipped (an index into SKEP_X), or -1. */
  dipSkep: number;
  /** 1 while this hold has a bee coming (rolled when the hold starts; it comes at BEE_AT). */
  beeDue: number;
  /** Frames left of the curious bee (BEE_TOTAL..0): the hold is paused and the stick ignored while it is above 0. */
  beeT: number;
  /** Frames left of the honey flood after its bang (screens/hiveGags.ts floodTotal..0): coated, the stick only straining. */
  floodT: number;
  /** The skep that flooded this seat (an index into SKEP_X) while floodT runs, or -1: where the wave is drawn from. */
  floodSkep: number;
}

/** One straw skep on the bench, indexed like SKEP_X. */
export interface Skep {
  /** Frames until it has honey again; 0 = full, and only a full skep can be dipped. */
  refill: number;
  /** 1 while a seat has its dipper in this skep, so a second seat cannot start on the same honey. */
  held: number;
  /** 1 while it is full and OVERFULL (dealt one fill in OVER_ODDS): it oozes, and a hold that lands on it floods. */
  over: number;
}

/** The swarm: one cloud of bees drifting over the bench, the meadow's one moving piece of scenery. */
export interface Swarm {
  /** The orbit counter, 0..31, indexed into art/hiveProps.ts's tables (no trig in the simulation). */
  phase: number;
  /** Where the cloud is. */
  x: number;
  /** The x it is drifting toward, re-rolled off the rng as it arrives. */
  tx: number;
}

/** Where the dipper head landed in the seat being drawn, for the honey strand. Draw-only (see drawStrand). */
const TIP = { x: 0, y: 0 };

export class HiveScreen extends Screen {
  // The fields, for the checker only, in enter() order. `declare` for the reason game.ts gives over its own
  // block: a plain field declaration would emit a class field per name (es2022 defines them before the
  // constructor body runs, and a screen's own declaration would also define a base field back to undefined), and
  // this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** The backdrop, pre-rendered once (art/backgrounds/hive.ts hiveLayers) and blitted per frame. */
  declare layers: HiveLayers;
  /** The clover stream's own generator: cosmetic, so it never draws from the gameplay rng singleton. */
  declare vis: RngInstance;
  /** The clover spawn options, built once in enter() and handed to particles.spawn every CLOVER_EVERY frames. */
  declare cloverOpts: { color: string; color2: string; size: number; life: number; vx: number; vy: number; screen: boolean };
  /** One seat per party member, in party order (not slot order); each on its own lane. */
  declare seats: HiveSeat[];
  /** The five skeps, indexed like SKEP_X. */
  declare skeps: Skep[];
  /** The swarm drifting over the bench for the whole round. */
  declare swarm: Swarm;
  /** Bees that have landed on a nose this round (the first joke's count, for the tests and the desync canary). */
  declare bees: number;
  /** Skeps that have burped their honey over a dipper this round (the second joke's count, the same two readers). */
  declare floods: number;
  /** Honey the round is played to: what the order still needs, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Honey in the party's crate right now. */
  declare total: number;
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

  constructor(game: Game) { super(game, 'hive'); this.seats = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = hiveLayers();
    particles.clear();
    clearGags();
    this.vis = makeRng(CLOVER_SEED);
    this.cloverOpts = { color: HIVE.cloverPale, color2: HIVE.clover, size: 3, life: 150, vx: -0.25, vy: 0.4, screen: true };
    this.seats = makeSeats<HiveSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      // every seat starts standing at a skep, spread across the whole bench: one seat takes the middle one, four
      // take skeps 0, 1, 3 and 4. A party of two ends up at the two ends, which is the right answer here - each of
      // them owns half the bench and they meet in the middle as skeps empty.
      s.x = SKEP_X[n === 1 ? 2 : R(i * (SKEP_X.length - 1) / (n - 1))];
      s.rig.weapon = HONEY_DIPPER; s.rig.dipperWet = 0;
      s.player.setOverlay(HIVE_ANIMS);
      s.dipT = 0; s.dipSkep = -1; s.beeDue = 0; s.beeT = 0; s.floodT = 0; s.floodSkep = -1;
      seatAnim(s, 'carry');
    }
    this.bees = 0; this.floods = 0;
    this.skeps = [];
    // the bench the truck pulls up to is five fills like any other, so each is dealt: a round of two jars is played
    // on these five alone, and a flood that waited for the first refill would never be seen in it
    for (let i = 0; i < SKEP_X.length; i++) this.skeps.push({ refill: 0, held: 0, over: this.dealOver() });
    this.swarm = { phase: 0, x: VIEW_W / 2, tx: VIEW_W / 2 };
    const need = run ? run.need('honey') : null;
    // the remainder, not the whole order: the map may already have banked some (every mini-game agrees)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MOVE: LEFT/RIGHT   DIP: HOLD ' + game.input.keyText(0, 'action') + ' AT A HIVE';
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
    if (this.frame % CLOVER_EVERY === 0) particles.spawn('leaf', this.vis.int(-16, VIEW_W + 16), this.vis.int(ROWS.ground, ROWS.band), this.cloverOpts);
    const clock = this.clock;
    if (clock.phase === 0) {
      this.stepSwarm();
      this.updateSkeps();
      this.updateSeats(input);
      if (this.total >= this.target) this.finish();
    } else {
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('honey', this.total);
        game.replace('map');
        return;
      }
    }
    tickClock(clock);
  }

  /** The swarm: drift and spin, nothing else. Its x is rng-driven, so it stays in the sim and in the checksum. */
  stepSwarm(): void {
    const sw = this.swarm;
    sw.phase = (sw.phase + SWARM_SPIN[CALM]) & 31;
    const dx = sw.tx - sw.x;
    if (dx > DRIFT) sw.x += DRIFT;
    else if (dx < -DRIFT) sw.x -= DRIFT;
    else { sw.x = sw.tx; sw.tx = rng.int(SWARM_X_MIN, SWARM_X_MAX); }
  }

  /** A dipped skep counts itself back up; at 0 it is full again, wears the sparkle, and is dealt: overfull or not. */
  updateSkeps(): void {
    for (let i = 0; i < this.skeps.length; i++) {
      const k = this.skeps[i];
      if (k.refill > 0 && --k.refill === 0) k.over = this.dealOver();
    }
  }

  /** The flood's deal, one roll per fill: 1 when this fill comes in overfull (one in OVER_ODDS). */
  dealOver(): number { return rng.int(1, OVER_ODDS) === 1 ? 1 : 0; }

  /** Every seat: a joke first (it owns the seat), then the hold (a held dip ignores the stick), then the stick, then the anim. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.bumpT > 0) { s.bumpT--; s.moving = false; s.player.tick(); continue; }
      // the curious bee: everything waits, the hold included, until the critter is back on its feet
      if (s.beeT > 0) { stepBee(this, s); s.moving = false; s.player.tick(); continue; }
      // the honey flood: stuck to the spot (the stick only strains), or licking it off
      if (s.floodT > 0) { stepFlood(this, s, input); s.moving = false; s.player.tick(); continue; }
      const held = input.held(s.slot, 'action');
      if (held) {
        // holding at a full skep: the first held frame takes the skep (dipT 1), every one after it climbs the
        // dipper, and the DIP_HOLDth lands the honey. A seat with its dipper in a skep ignores the stick.
        const was = s.dipT;
        if (was === 0) this.tryDip(s);
        else if (++s.dipT >= DIP_HOLD) this.landDip(s);
        else if (s.beeDue && s.dipT === BEE_AT) beeComes(this, s);
        else if (s.dipT === SWELL_AT && this.skeps[s.dipSkep].over) floodSwells(this, s);
        if (was > 0 || s.dipT > 0) { s.moving = false; s.player.tick(); continue; }
      } else if (s.dipT > 0) this.letGo(s);
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED * s.walk;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      seatAnim(s, s.moving ? 'creep' : 'carry');
      s.player.tick();
    }
  }

  /**
   * The nearest FULL skep within REACH takes the dip. The skep is claimed here, on the first frame of the hold, not
   * at the end of it: two seats standing at one skep must not both be promised the same honey. A hold with no full
   * skep in reach does nothing at all.
   */
  tryDip(s: HiveSeat): void {
    let best = -1, bestD = REACH + 1;
    for (let i = 0; i < this.skeps.length; i++) {
      if (this.skeps[i].refill > 0 || this.skeps[i].held) continue;
      const x = SKEP_X[i], d = s.x > x ? s.x - x : x - s.x;
      if (d <= REACH && d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    const k = this.skeps[best];
    k.held = 1;
    s.dipT = 1; s.dipSkep = best; s.moving = false;
    // the deal: one dip in BEE_ODDS has a visitor - but never at an overfull skep, whose honey is joke enough (and
    // whose dip draws no roll at all: one joke on a seat at a time)
    s.beeDue = !k.over && rng.int(1, BEE_ODDS) === 1 ? 1 : 0;
    s.facing = SKEP_X[best] >= s.x ? 1 : -1;
    seatAnim(s, 'dip', true);
    burstDust(SKEP_X[best], ROWS.bench - 4, 2, 0.9, true);
    this.game.audio.play('dip');
  }

  /** The button came up short of the honey: the dipper comes out clean and the skep is anyone's again. */
  letGo(s: HiveSeat): void {
    if (s.dipSkep >= 0) this.skeps[s.dipSkep].held = 0;
    s.dipT = 0; s.dipSkep = -1;
    seatAnim(s, 'carry', true);
  }

  /**
   * The dipper comes out full: +1 to the seat and to the party, a ring at the doorway, a jar in the crate, and that
   * skep empties. At an OVERFULL skep that is all still true - the flood never costs the jar - and then the skep
   * burps the rest of its honey over the dipper (screens/hiveGags.ts floodLands); the jar's pip waits for the gloop.
   */
  landDip(s: HiveSeat): void {
    const i = s.dipSkep, k = this.skeps[i], x = SKEP_X[i], y = ROWS.bench - 8;
    k.refill = REFILL_FRAMES; k.held = 0;
    s.dipT = 0; s.dipSkep = -1;
    // a gulped dip skips the jar and the +1, but an overfull skep still burps its honey over the dipper
    if (gulps(s)) gulp(this.game, s, x, y - 14);
    else {
      s.count++; this.setTotal(this.total + 1);
      ringAt(x, y, 3, 12, UI.cream, 2, 12, false, true);
      floatText(x, y - 14, PLUS_ONE, s.colour, 1, true);
      burstSparkle(CRATE_X, CRATE_Y - 14, 3, UI.cream, true);
      this.game.audio.play('jar');
    }
    if (k.over) { k.over = 0; floodLands(this, s, i); this.game.audio.play('jar', JAR_AFTER_GLOOP); return; }
    seatAnim(s, 'carry', true);
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with honey cheers, one with none sulks. A joke mid-beat is simply over. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.dipSkep >= 0) this.skeps[s.dipSkep].held = 0;
      s.moving = false; s.bumpT = 0; s.dipT = 0; s.dipSkep = -1;
      s.beeDue = 0; s.beeT = 0; s.floodT = 0; s.floodSkep = -1;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame, seats = this.seats;
    const sw = this.swarm, sh = SWARM_SHAPE[CALM];
    SWARM_PT.x = R(sw.x + (VIEW_W / 2 - sw.x) * sh.centre); SWARM_PT.y = R(sh.cy);
    // the WORLD rides the jokes' bump (game/gags.ts gagShakeY) - backdrop, bench, swarm, critters, particles - and
    // the paper never does: the plates, the cards, the ticket and the sign stay where they were printed. A bumped
    // world leaves a row or two of the frame's edge uncovered and nothing ever clears this canvas, so under a bump
    // the meadow is laid down at rest first and the shifted one painted over it.
    const bump = gagShakeY();
    if (bump !== 0) { blitAt(ctx, L.far.L, 0, L.far.y); blitAt(ctx, L.ground.L, 0, L.ground.y); blitAt(ctx, L.near.L, 0, L.near.y); }
    ctx.save(); ctx.translate(0, bump);
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    // the bench's furniture: contact shadows on the plank, then the skeps and the party's crate. All of it stands
    // behind every lane, so it is drawn before the sorted pass and never sorted with it.
    for (let i = 0; i < this.skeps.length; i++) drawShadow(ctx, SKEP_X[i], ROWS.bench + 1, 34, 0.3, 0);
    drawShadow(ctx, CRATE_X, CRATE_Y + 1, 32, 0.3, 0);
    for (let i = 0; i < this.skeps.length; i++) this.drawSkepAt(ctx, i, f);
    drawHoneyCrate(ctx, CRATE_X, CRATE_Y, this.total);
    drawSwarm(ctx, SWARM_PT.x, SWARM_PT.y, sh.halfW, sh.halfH, sh.rx, sh.ry, sh.stride, sw.phase, f);
    // ground contact first (a critter flat on its back casts its shadow along its length, behind its feet), the
    // honey a flooded critter stands in, then the sorted pass. The lanes are fixed per seat index (LANE_Y0 -
    // i * LANE_GAP), so sorting back to front is walking the seats in reverse - the orchard's pass, and it never
    // flickers because the key can never change.
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i], back = lieBack(s);
      drawShadow(ctx, s.x - s.facing * back / 2, s.y, s.rig.width + 6 + back, 0.4, 0);
    }
    for (let i = 0; i < seats.length; i++) drawFloodPool(ctx, seats[i]);
    for (let i = seats.length - 1; i >= 0; i--) this.drawSeat(ctx, seats[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    ctx.restore();
    // plates front lane first, each stacked clear of the ones already down: ragged row, no buried name
    resetPlates();
    for (let i = 0; i < seats.length; i++) drawSeatPlate(ctx, seats[i], PLATES);
    // the honey runs AFTER the plates, the pond's rule for its caught trout: the payoff of the only beat that
    // scores must never be hidden by a name card, and the strand's whole job is to be read. The flood's burp and
    // the jokes' bees go over with it for the same reason, and all of it is world, so it rides the bump too.
    ctx.save(); ctx.translate(0, bump);
    for (let i = 0; i < seats.length; i++) this.drawStrand(ctx, seats[i]);
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      if (s.floodSkep >= 0) drawFloodWave(ctx, s, SKEP_X[s.floodSkep], ROWS.bench - 5);
      drawCuriousBee(ctx, s, f, SWARM_PT.x, SWARM_PT.y, false);
      drawHoneyBees(ctx, s, f, SWARM_PT.x, SWARM_PT.y);
    }
    ctx.restore();
    drawGags(ctx);
    drawClock(ctx, this.countStr, this.total / this.target, clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /**
   * One seat, with the dipper wet for the second half of its hold (the beat pays off on the item too). A critter a
   * bee has toppled is raised by half its width so it lies ON the grass (hiveGags lieLift), the bee's circle passes
   * behind its head before it is drawn, and a flooded one is drawn in its honey (hiveGags drawFloodSeat).
   */
  drawSeat(ctx: CanvasRenderingContext2D, s: HiveSeat): void {
    const rig = s.rig, o = s.opts;
    rig.dipperWet = s.dipT * 2 >= DIP_HOLD ? 1 : 0;
    o.x = s.x; o.y = s.y - lieLift(s); o.facing = s.facing;
    drawCuriousBee(ctx, s, this.frame, SWARM_PT.x, SWARM_PT.y, true);
    if (s.floodT > 0) drawFloodSeat(ctx, s, this.frame);
    else drawRig(ctx, rig, s.player.pose, o);
  }

  /**
   * The honey running from the skep being dipped into that seat's raised dipper (art/hiveProps.js drawHoneyStrand).
   * The dipper head is read out of the seat's OWN rig, which still holds the joints of its last drawRig this frame -
   * minigame.js drawSeatPlate reads the head joint the same way. It used to be written onto the seat object by
   * drawSeat, which made draw() the only writer of a field on a simulation object: harmless while nothing read it
   * back, but a headless peer never draws, so the first rule to use the tip would have diverged silently
   * (ARCHITECTURE section 0 / 5). The scratch belongs to the draw pass, like SHAPE above and orchard.js's PAW.
   */
  drawStrand(ctx: CanvasRenderingContext2D, s: HiveSeat): void {
    if (s.dipT <= 0 || s.dipSkep < 0) return;
    const x = SKEP_X[s.dipSkep], k = s.dipT / DIP_HOLD;
    // from the moment a bee has the critter go rigid until it is back on its feet the dipper is out of the skep:
    // no strand from a doorway to a critter flat on the grass. The bar keeps the hold's fill all the while.
    if (s.beeT === 0 || BEE_TOTAL - s.beeT < BEE_RIGID) {
      const tip = jointScreen(s.rig, 'weaponTip', TIP);
      drawHoneyStrand(ctx, x, ROWS.bench - 5, R(tip.x), R(tip.y), k);
    }
    // and the bar over the skep's knob: the hold made visible as a fill, so "keep holding" is never a guess
    drawBar(ctx, x - DIP_BAR_W / 2, SKEP_TOP - DIP_BAR_ABOVE, DIP_BAR_W, DIP_BAR_H, k, DIP_BAR);
  }

  /**
   * A skep, and - when it still has honey - the SIGNAL.hive sparkle above its knob: the same 6x6 gold mark the
   * coop's fresh egg wears, on the same index-hashed blink, because it means the same thing. The index hash keeps
   * the five skeps off one beat, so the bench twinkles instead of flashing. An overfull one oozes (the flood's tell,
   * art/hiveProps.ts drawOoze) and still wears the sparkle: it is full, and the honey in it is real.
   */
  drawSkepAt(ctx: CanvasRenderingContext2D, i: number, f: number): void {
    const x = SKEP_X[i], k = this.skeps[i], full = k.refill === 0, sw = this.swellOf(i, f);
    drawSkep(ctx, x, ROWS.bench, full, sw);
    if (full && k.over) drawOoze(ctx, x, ROWS.bench, sw > 0 ? sw : 0, f + i * 11, COAT.honey);
    if (!full || !(((f + i * 7) >> 3) & 1)) return;
    ctx.fillStyle = SIGNAL.hive;
    ctx.fillRect(x - 1, SKEP_TOP - 17 - sw, 2, 8);
    ctx.fillRect(x - 4, SKEP_TOP - 14 - sw, 8, 2);
  }

  /**
   * How far skep i bulges this frame (draw-only, off the seats' sim fields): out by up to SWELL_PX over the last
   * SWELL_FRAMES of a hold at it while it is overfull, throbbing a pixel every four frames - the flood's wind-up -
   * and in by a couple of rows for a moment after it has burped (hiveGags floodSag).
   */
  swellOf(i: number, f: number): number {
    for (let k = 0; k < this.seats.length; k++) {
      const s = this.seats[k];
      if (s.dipSkep === i && s.dipT >= SWELL_AT && this.skeps[i].over) return R(SWELL_PX * (s.dipT - SWELL_AT) / SWELL_FRAMES) + ((f >> 2) & 1);
      const sag = floodSag(s, i);
      if (sag) return sag;
    }
    return 0;
  }

  override summary() {
    const sw = this.swarm;
    return {
      honey: this.total, target: this.target, elapsed: this.clock.elapsed, phase: this.clock.phase, sign: this.clock.signText,
      bees: this.bees, floods: this.floods,
      swarm: { x: R(sw.x) },
      seats: this.seats.map((s) => [s.slot, R(s.x), s.count, s.dipT, s.bumpT, s.beeT, s.floodT]),
      // [x, refill, over] per skep: a headless test needs the x to drive a seat to one, the refill to see it empty,
      // and the overfull flag to see the flood's tell
      skeps: this.skeps.map((k, i) => [SKEP_X[i], k.refill, k.over]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js), in one reused array. */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    const sw = this.swarm;
    f.push(this.clock.elapsed, this.clock.phase, this.clock.signT, this.total, this.bees, this.floods);
    // the swarm's whole state: its x is rng-driven, so these three numbers reproduce the drawn cloud
    f.push(sw.phase, sw.x, sw.tx);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.dipT, s.dipSkep, s.bumpT, s.moving ? 1 : 0, s.beeDue, s.beeT, s.floodT, s.floodSkep);
    }
    for (let i = 0; i < this.skeps.length; i++) f.push(this.skeps[i].refill, this.skeps[i].held, this.skeps[i].over);
    return f;
  }
}
