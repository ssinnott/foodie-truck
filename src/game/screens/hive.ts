// THE HIVES - HONEY, and the verb is CREEP (docs/GDD.md sections 3 and 5; docs/ART_STYLE.md section 1). A clover
// meadow at the warm end of the afternoon: five straw skeps stand at fixed x along a low bench at the back, every
// seat walks left and right in front of them on its own depth lane with a honey dipper in its paw, and `action`
// within REACH of a skep that still has honey dips it - a DIP_FRAMES reach beat, then +1, a ring, a jar in the
// party's crate, and that skep goes empty for REFILL_FRAMES. Nothing else in the game plays like this, because the
// whole scene is one shared hazard on a seeded cycle:
//
//   CALM  rng.int(CALM_MIN, CALM_MAX)   the swarm drones low and wide over the bench: move freely.
//   WARY  WARY_FRAMES                   THE TELEGRAPH. The swarm REARS into a tight column, its orbit tightens and
//                                       triples in speed, a SIGNAL.hot ring pulses out of it and the band across
//                                       the top of the play area grows a jagged hot crest. Shape AND colour, because
//                                       a colour-only tell fails the squint test (ART_STYLE 0.10).
//   ALERT rng.int(ALERT_MIN, ALERT_MAX) the swarm drops and fans out over the whole meadow. Any movement or any
//                                       action press from a seat stings it: the shared `bump` beat, a shove back
//                                       toward the near edge, one banked honey gone, two angry bees, then a grace.
//
// Standing still through ALERT is completely safe, and a seat already mid-dip when ALERT starts finishes that dip
// and banks it - punishing a press that had already happened would be a lie. The round ends when the party's total
// reaches the order's remainder or the 40-second clock runs out; the HONEY sign drops, is held, then run.gather()
// and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the skeps, the seats and the swarm are fixed pools of plain sim
// objects built in enter(); every random number comes from the rng singleton inside update(); the swarm's orbit is
// an integer counter indexed into art/hiveProps.js's tables, so there is no trig anywhere in the simulation and
// nothing in draw() is read back. The clover drift, the rings, the float text, the dust and the angry bees are
// cosmetic and stay out of checksumFields().
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
import { drawText, measureText } from '../../engine/text.ts';
import { F } from '../../content/critters/common.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { hiveLayers, HIVE, ROWS, SKEP_X, CRATE_X } from '../../art/backgrounds/hive.ts';
import { drawSkep, drawBee, drawSwarm, drawHoneyCrate, drawHoneyStrand, HONEY_DIPPER, SWARM_SHAPE, SWARM_SPIN, SKEP_H } from '../../art/hiveProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawHint } from '../ui.ts';

const R = Math.round, TAU = Math.PI * 2;
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
 * The dip. REACH is half the drawn skep (18 px) less a couple, so a seat has to be standing essentially under its
 * doorway - the backdrop wears a scuffed dip spot at every SKEP_X exactly that wide, which is the only teaching
 * this rule gets. DIP_FRAMES is the length of the `dip` overlay below (6 + 10), so the honey lands on the frame the
 * dipper comes back out.
 */
const REACH = 16, DIP_FRAMES = 16;
/**
 * A dipped skep is empty for this long. 150 frames is less than one calm window (204 usable, see the arithmetic
 * below), so a skep dipped at the top of a window is back before the window ends - the party is pushed ALONG the
 * bench rather than locked out of it, which is the pressure this mini-game is made of.
 */
const REFILL_FRAMES = 150;
/**
 * The swarm's cycle, and the arithmetic the target is checked against (GDD section 5: 2400 frames).
 *
 *   The round OPENS on a fixed CALM_MAX window, not a seeded one: the first thing a player ever does in this scene
 *   must not be punished, and a seeded opening could have handed them 180 frames and a sting.
 *   After it, one cycle = CALM (mean 240) + WARY 36 + ALERT (mean 95) = 371 frames.
 *   (2400 - 300) / 371 = 5.66, so a solo player gets the opening window plus five more: SIX calm windows.
 *   A window is worth CALM - WARY_FRAMES = 204 frames of movement if the player spends the whole telegraph
 *   stopping (the conservative floor; a dip committed during WARY completes safely, so the real figure is higher).
 *   One honey costs the walk to the nearest full skep plus the dip: worst case one pitch, 126 / 1.8 = 70 frames,
 *   + DIP_FRAMES 16 = 86. 204 / 86 = 2.3, so TWO honey per window even when every near skep is empty.
 *   6 windows x 2 = 12 honey solo, against a fallback target of 3 and the HONEY LOAF order's remainder of 2.
 *   Comfortable by 4x at the worst play the numbers allow, and a four-seat party finishes on the total long before
 *   the clock does - which is the orchard's shape too.
 */
const CALM_MIN = 180, CALM_MAX = 300, WARY_FRAMES = 36, ALERT_MIN = 70, ALERT_MAX = 120;
const CALM = 0, WARY = 1, ALERT = 2;
const STATE_NAMES = Object.freeze(['calm', 'wary', 'alert']);
/** How long the drawn swarm takes to morph between two shapes. Ten frames: long enough to read as the cloud moving
 *  rather than teleporting, short enough that WARY's 36 frames are still mostly the WARY silhouette. */
const MORPH_N = 10;
/** The swarm's drift while it is a cloud over the bench, and the span of x it drifts across. */
const DRIFT = 0.6, SWARM_X_MIN = 130, SWARM_X_MAX = 510;
/**
 * The sting: the shared bump beat (4/10/6 frames of `bump`, the orchard's and the coop's 21), a shove of PUSH px
 * toward the nearer edge, and a grace long enough to outlast the beat by 39 frames so a stung seat that lets go of
 * the stick is safe, and one that does NOT is stung again about twice in a long ALERT.
 */
const BUMP_FRAMES = 21, PUSH = 10, SAFE_FRAMES = 60;
/**
 * The angry bees a sting throws off: a fixed cosmetic pool, two per sting, riding a 24-step outward spiral built
 * once at module load. Draw-only from end to end - the pool is not in summary() and not in checksumFields(), which
 * is why building its table with Math.cos costs nothing (docs/ARCHITECTURE.md section 0 bans the trig that reaches
 * SIMULATION state, and none of this does).
 */
const ANGRY_N = 6, ANGRY_T = 24;
const ANGRY_DX = new Int8Array(ANGRY_T), ANGRY_DY = new Int8Array(ANGRY_T);
for (let i = 0; i < ANGRY_T; i++) {
  const r = 2 + i * 0.9;
  ANGRY_DX[i] = R(Math.cos(i * 0.62) * r); ANGRY_DY[i] = R(Math.sin(i * 0.62) * r) - i;
}
/** Clover drifting across the meadow: a cosmetic stream off the hive's own seed block, never the rng singleton. */
const CLOVER_EVERY = 9, CLOVER_SEED = 195;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', MINUS_ONE = '-1', OUCH = 'OUCH!';
const TITLE = 'CLOVER HIVES', SIGN_PREFIX = 'HONEY: ';
const HONEY_HEX = INGREDIENTS.honey.hex;

/**
 * The swarm band across the top of the play area (NOT in the clock ticket, which game/minigame.js owns). A player
 * whose eyes are on their own critter still has to know the swarm's state, so this is the one HUD element the scene
 * adds, and it says the same thing three ways:
 *   CALM   a flat paper strip carrying a FUSE OF FOURTEEN DISCRETE TICKS that go out one at a time from the right
 *          as the window runs out, label CREEP. The green is the same "good timing on paper, ink-outlined" fill
 *          ART_STYLE section 4 names, so the band adds no new hue - but it must not add the same WIDGET either: the
 *          clock ticket 6 rows above is already draining a solid green bar (minigame.js drawBar), and this shipped
 *          as a second solid green bar four times its width directly under it, two clocks with no way to tell which
 *          was the 40 seconds and which was the calm window. Ticks against a bar is that difference, in form.
 *   WARY   hot chevrons marching across the paper and a jagged hot crest growing UP off the strip, label STEADY.
 *   ALERT  the strip goes solid SIGNAL.hot with the crest hanging DOWN off it, label FREEZE.
 * Flat / spiky-up / spiky-down is the silhouette ladder: at a squint, with the colour thrown away, the three states
 * are still three different shapes.
 */
const BAND_X = 110, BAND_Y = 52, BAND_W = 420, BAND_H = 18, BAND_TEETH = 14, TOOTH_H = 8;
/** The calm fuse: FUSE_N ticks of FUSE_W with 6 px of paper between, spanning the band's inner width exactly. */
const FUSE_N = 14, FUSE_W = 24, FUSE_STEP = 30;
const BAND_LABEL = Object.freeze(['CREEP', 'STEADY', 'FREEZE']);
const BAND_TEXT = Object.freeze({ size: 1, color: UI.ink, align: 'center', shadow: false });
const BAND_TEXT_HOT = Object.freeze({ size: 1, color: UI.cream, align: 'center', shadow: false });
/** Label plate widths, measured ONCE at module load: nothing in draw() may measure a string (ARCHITECTURE 8). */
const BAND_LABEL_W = BAND_LABEL.map((t) => measureText(t, 1) + 12);

/**
 * The scene's own animation overlay (art/animation.js AnimPlayer.setOverlay, the coop's COOP_ANIMS pattern). None
 * of it belongs in content/critters/common.js: only this mini-game creeps, dips and freezes.
 *
 *   creep   the verb. 36 frames against the shared walk's 28, crouched (root +2), leaning forward, with SHORT steps
 *           (16/-14 against the walk's 26/-22) and the head tipped UP - every critter in this scene is watching the
 *           swarm, and the walk has to look like it is being got away with.
 *   dip     the reach up into a skep's doorway. The near paw carries the dipper, so this is the shared `reach`'s
 *           shape rather than the coop's reachNest: the skeps are above the seat, not behind it, and at [114, 22]
 *           the paw lands beside the muzzle with the dipper standing past it (ART_STYLE 0.7). Its 6 + 10 frames ARE
 *           DIP_FRAMES; changing one changes the other.
 *   freeze  standing still through ALERT. Braced and low, both arms in at the sides, `grit`, and a 1 px tremble
 *           over 40 frames - held rigid it broke ART_STYLE 0.9, and anything bigger read as movement, which is the
 *           one thing this pose has to say it is not doing.
 */
const HIVE_ANIMS = Object.freeze({
  creep: { loop: true, frames: [
    F(9, { armR: [46, 44], armL: [-16, 10], weapon: 90, legR: [16, 10], legL: [-14, 16], torso: 8, head: -4, root: [0, 2] }),
    F(9, { armR: [48, 46], armL: [-14, 10], weapon: 90, legR: [3, 20], legL: [-2, 5], torso: 8, head: -4, root: [0, 3], squash: 1.03 }),
    F(9, { armR: [46, 44], armL: [-16, 10], weapon: 90, legR: [-14, 16], legL: [16, 10], torso: 8, head: -4, root: [0, 2] }),
    F(9, { armR: [48, 46], armL: [-14, 10], weapon: 90, legR: [-2, 5], legL: [3, 20], torso: 8, head: -4, root: [0, 3], squash: 1.03 }),
  ] },
  dip: { loop: false, frames: [
    F(6, { armR: [114, 22], armL: [-140, -14], weapon: -28, torso: -4, head: -10, root: [0, 0], stretch: 1.02, face: 'grit' }, { ease: 'in' }),
    F(10, { armR: [122, 16], armL: [-150, -18], weapon: -34, torso: -7, head: -13, root: [0, -2], stretch: 1.04, face: 'happy' }, { ease: 'out' }),
  ] },
  freeze: { loop: true, frames: [
    F(20, { armR: [10, 16], armL: [-14, 12], weapon: 90, legR: [8, 16], legL: [-8, 16], torso: 10, head: -8, root: [0, 3], squash: 1.04, face: 'grit' }),
    F(20, { armR: [11, 17], armL: [-13, 13], weapon: 90, legR: [8, 16], legL: [-8, 16], torso: 11, head: -8, root: [0, 4], squash: 1.05, face: 'grit' }),
  ] },
});

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
 * A seat at the hives: the shared mini-game seat plus the dip beat and the sting grace this screen keeps for it.
 * The per-screen extension minigame.ts documents, so `makeSeats<HiveSeat>` hands these back with the screen's own
 * fields as typed as the shared ones.
 */
export interface HiveSeat extends Seat {
  /** Frames left of the dip beat; the stick is locked while it runs, and it banks on the frame it reaches 0. */
  dipT: number;
  /** The skep being dipped (an index into SKEP_X), or -1. */
  dipSkep: number;
  /** Frames of sting grace left: the swarm cannot sting this seat again while it is up. */
  safeT: number;
}

/** One straw skep on the bench, indexed like SKEP_X. */
export interface Skep {
  /** Frames until it has honey again; 0 = full, and only a full skep can be dipped. */
  refill: number;
}

/** An angry bee thrown off a sting, riding the ANGRY_DX / ANGRY_DY spiral (cosmetic). */
export interface AngryBee {
  /** Steps into the spiral; ANGRY_T means the slot is free. */
  t: number;
  /** Where it left the stung seat. */
  x: number;
  y: number;
  /** Which way its spiral leans: the shove direction, or against it for every other bee of a sting. */
  dir: number;
}

/** The shared hazard: one swarm on the CALM -> WARY -> ALERT cycle, which every seat reads. */
export interface Swarm {
  /** CALM, WARY or ALERT - also the SWARM_SHAPE / SWARM_SPIN index. */
  state: number;
  /** The state it is morphing out of. */
  prev: number;
  /** Frames left of the current state. */
  t: number;
  /** How long the current state was rolled for; the calm fuse is `t / len`. */
  len: number;
  /** Frames into the shape morph; MORPH_N means it has settled. */
  mx: number;
  /** The orbit counter, 0..31, indexed into art/hiveProps.ts's tables (no trig in the simulation). */
  phase: number;
  /** Where the cloud is. */
  x: number;
  /** The x it is drifting toward, re-rolled off the rng as it arrives. */
  tx: number;
}

/**
 * The drawn swarm, morphed between the shape it is leaving and the shape it is in. One module-scope scratch object,
 * mutated in draw() and never allocated (ARCHITECTURE section 8). `stride` steps at the halfway point instead of
 * lerping because it indexes an integer table.
 */
const SHAPE = { cx: 0, cy: 0, halfW: 0, halfH: 0, rx: 0, ry: 0, stride: 0 };
/** Where the dipper head landed in the seat being drawn, for the honey strand. Draw-only, like SHAPE (see drawStrand). */
const TIP = { x: 0, y: 0 };
function morphShape(sw: Swarm) {
  const a = SWARM_SHAPE[sw.prev], b = SWARM_SHAPE[sw.state], k = sw.mx / MORPH_N;
  SHAPE.cy = a.cy + (b.cy - a.cy) * k;
  SHAPE.halfW = a.halfW + (b.halfW - a.halfW) * k;
  SHAPE.halfH = a.halfH + (b.halfH - a.halfH) * k;
  SHAPE.rx = a.rx + (b.rx - a.rx) * k;
  SHAPE.ry = a.ry + (b.ry - a.ry) * k;
  SHAPE.stride = k < 0.5 ? a.stride : b.stride;
  const centre = a.centre + (b.centre - a.centre) * k;
  SHAPE.cx = sw.x + (VIEW_W / 2 - sw.x) * centre;
  return SHAPE;
}

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
  /** The angry-bee pool (cosmetic): ANGRY_N slots handed out in turn. */
  declare angry: AngryBee[];
  /** The next angry-bee slot to reuse. */
  declare angryCursor: number;
  /** The shared hazard: one swarm for the whole round. */
  declare swarm: Swarm;
  /** Stings the party has taken this round (the playtest reads it). */
  declare stings: number;
  /** Honey the round is played to: what the order still needs, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Honey in the party's crate right now. */
  declare total: number;
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
  /** The hint line along the bottom. */
  declare hint: string;
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
      s.dipT = 0; s.dipSkep = -1; s.safeT = 0;
      seatAnim(s, 'carry');
    }
    this.skeps = [];
    for (let i = 0; i < SKEP_X.length; i++) this.skeps.push({ refill: 0 });
    this.angry = [];
    for (let i = 0; i < ANGRY_N; i++) this.angry.push({ t: ANGRY_T, x: 0, y: 0, dir: 1 });
    this.angryCursor = 0;
    // the opening window is fixed, not seeded (see the arithmetic above)
    this.swarm = { state: CALM, prev: CALM, t: CALM_MAX, len: CALM_MAX, mx: MORPH_N, phase: 0, x: VIEW_W / 2, tx: VIEW_W / 2 };
    this.stings = 0;
    const need = run ? run.order.needs.find((x) => x.id === 'honey') : null;
    // the remainder, not the whole order: the map may already have banked some (every mini-game agrees)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'CREEP: ARROWS   DIP: ' + game.input.keyText(0, 'action') + '   FREEZE ON RED';
    this.clock = makeClock();
    this.fields = [];
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    if (this.frame % CLOVER_EVERY === 0) particles.spawn('leaf', this.vis.int(-16, VIEW_W + 16), this.vis.int(ROWS.ground, ROWS.band), this.cloverOpts);
    for (let i = 0; i < this.angry.length; i++) if (this.angry[i].t < ANGRY_T) this.angry[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      // the swarm first, so the frame it turns to ALERT is the first frame a seat can be stung by it
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
    if (tickClock(clock)) this.finish();
  }

  /** The shared hazard: drift, spin, and the CALM -> WARY -> ALERT -> CALM cycle. Every seat reads this one object. */
  stepSwarm(): void {
    const sw = this.swarm;
    if (sw.mx < MORPH_N) sw.mx++;
    sw.phase = (sw.phase + SWARM_SPIN[sw.state]) & 31;
    const dx = sw.tx - sw.x;
    if (dx > DRIFT) sw.x += DRIFT;
    else if (dx < -DRIFT) sw.x -= DRIFT;
    else { sw.x = sw.tx; sw.tx = rng.int(SWARM_X_MIN, SWARM_X_MAX); }
    if (--sw.t > 0) return;
    sw.prev = sw.state; sw.mx = 0;
    if (sw.state === CALM) { sw.state = WARY; sw.len = WARY_FRAMES; }
    else if (sw.state === WARY) { sw.state = ALERT; sw.len = rng.int(ALERT_MIN, ALERT_MAX); }
    else { sw.state = CALM; sw.len = rng.int(CALM_MIN, CALM_MAX); sw.tx = rng.int(SWARM_X_MIN, SWARM_X_MAX); }
    sw.t = sw.len;
  }

  /** A dipped skep counts itself back up; at 0 it is full again and wears the sparkle. */
  updateSkeps(): void {
    for (let i = 0; i < this.skeps.length; i++) if (this.skeps[i].refill > 0) this.skeps[i].refill--;
  }

  /** Every seat: the beats first (they lock the stick), then the sting test, then the stick, the dip, the anim. */
  updateSeats(input: Input): void {
    const alert = this.swarm.state === ALERT;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.safeT > 0) s.safeT--;
      if (s.bumpT > 0) { s.bumpT--; s.moving = false; s.player.tick(); continue; }
      if (s.dipT > 0) {
        // COMMITTED. The press already happened, so the swarm turning mid-reach cannot take it back; the honey
        // lands on the frame the dipper comes out.
        if (--s.dipT === 0) this.landDip(s);
        s.moving = false; s.player.tick(); continue;
      }
      const ax = input.axisX(s.slot), act = input.pressed(s.slot, 'action');
      // Movement is read as the X stick only, never up/down: this scene never moves a seat vertically, and stinging
      // a player for a button that does nothing the rest of the time would be a rule they could not learn.
      if (alert && s.safeT === 0 && (ax !== 0 || act)) { this.sting(s); s.player.tick(); continue; }
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      if (act) this.tryDip(s);
      if (s.dipT === 0) seatAnim(s, s.moving ? 'creep' : (alert ? 'freeze' : 'carry'));
      s.player.tick();
    }
  }

  /**
   * The nearest FULL skep within REACH takes the dip. The skep is emptied here, on the press, not at the end of the
   * beat: two seats standing at one skep must not both be promised the same honey, and an emptying skep under a
   * raised dipper is the right read anyway.
   */
  tryDip(s: HiveSeat): void {
    let best = -1, bestD = REACH + 1;
    for (let i = 0; i < this.skeps.length; i++) {
      if (this.skeps[i].refill > 0) continue;
      const x = SKEP_X[i], d = s.x > x ? s.x - x : x - s.x;
      if (d <= REACH && d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    this.skeps[best].refill = REFILL_FRAMES;
    s.dipT = DIP_FRAMES; s.dipSkep = best; s.moving = false;
    s.facing = SKEP_X[best] >= s.x ? 1 : -1;
    seatAnim(s, 'dip', true);
    burstDust(SKEP_X[best], ROWS.bench - 4, 2, 0.9, true);
  }

  /** The dipper comes back out: +1 to the seat and to the party, a ring at the doorway and a jar in the crate. */
  landDip(s: HiveSeat): void {
    const x = SKEP_X[s.dipSkep], y = ROWS.bench - 8;
    s.count++; this.setTotal(this.total + 1);
    ringAt(x, y, 3, 12, UI.cream, 2, 12, false, true);
    floatText(x, y - 14, PLUS_ONE, s.colour, 1, true);
    burstSparkle(CRATE_X, CRATE_Y - 14, 3, UI.cream, true);
    s.dipSkep = -1;
  }

  /**
   * Stung. The shove is toward the NEAR edge - whichever side of the meadow the seat is already on - so a stung
   * critter is driven out of the bench's middle rather than across it, and two stung seats never collide in the
   * centre. One banked honey goes (the orchard's wormy-apple cost), and the grace starts immediately.
   */
  sting(s: HiveSeat): void {
    const dir = s.x < VIEW_W / 2 ? -1 : 1;
    s.bumpT = BUMP_FRAMES; s.safeT = SAFE_FRAMES; s.moving = false; s.dipT = 0; s.dipSkep = -1;
    s.x += dir * PUSH;
    if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
    s.facing = -dir;
    seatAnim(s, 'bump', true);
    if (s.count > 0) { s.count--; this.setTotal(this.total - 1); floatText(s.x - dir * 14, s.y - 58, MINUS_ONE, s.colour, 1, true); }
    ringAt(s.x, s.y - 40, 4, 18, SIGNAL.hot, 2, 14, false, true);
    floatText(s.x, s.y - 74, OUCH, UI.cream, 1, true);
    burstDust(s.x, s.y, 3, 1.2, true);
    for (let k = 0; k < 2; k++) {
      const a = this.angry[this.angryCursor]; this.angryCursor = (this.angryCursor + 1) % this.angry.length;
      a.t = 0; a.x = R(s.x) + dir * 6; a.y = R(s.y) - 34 - k * 9; a.dir = k & 1 ? -dir : dir;
    }
    this.stings++;
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat with honey cheers, one with none sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    // a dip that was still running when the round ended banks anyway, BEFORE the sign's number is built: the
    // promise this scene makes about a committed dip has no exception for the last frame of the clock
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; if (s.dipT > 0) { s.dipT = 0; this.landDip(s); } }
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.moving = false; s.bumpT = 0; s.dipT = 0; s.dipSkep = -1;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y);
    blitAt(ctx, L.ground.L, 0, L.ground.y);
    particles.draw(ctx, null, 'back');
    // the bench's furniture: contact shadows on the plank, then the skeps and the party's crate. All of it stands
    // behind every lane, so it is drawn before the sorted pass and never sorted with it.
    for (let i = 0; i < this.skeps.length; i++) drawShadow(ctx, SKEP_X[i], ROWS.bench + 1, 34, 0.3, 0);
    drawShadow(ctx, CRATE_X, CRATE_Y + 1, 32, 0.3, 0);
    for (let i = 0; i < this.skeps.length; i++) this.drawSkepAt(ctx, i, f);
    drawHoneyCrate(ctx, CRATE_X, CRATE_Y, this.total);
    this.drawSwarmAt(ctx, f);
    // ground contact first, then the sorted pass. The lanes are fixed per seat index (LANE_Y0 - i * LANE_GAP), so
    // sorting back to front is walking the seats in reverse - the orchard's pass, and it never flickers because the
    // key can never change.
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; drawShadow(ctx, s.x, s.y, s.rig.width + 6, 0.4, 0); }
    for (let i = this.seats.length - 1; i >= 0; i--) this.drawSeat(ctx, this.seats[i]);
    for (let i = 0; i < this.angry.length; i++) this.drawAngry(ctx, this.angry[i], i, f);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    // plates front lane first, each stacked clear of the ones already down: ragged row, no buried name
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    // the honey runs AFTER the plates, the pond's rule for its caught trout: the payoff of the only beat that
    // scores must never be hidden by a name card, and the strand's whole job is to be read
    for (let i = 0; i < this.seats.length; i++) this.drawStrand(ctx, this.seats[i]);
    // the band BEFORE the shared ticket. The WARY crest rears TOOTH_H 8 px off the band's top edge into the 6 px of
    // air between the band and the ticket, so painted last it put four hot teeth through the ticket's paper and its
    // bottom border for the whole 36-frame telegraph. game/minigame.js owns that ticket (ARCHITECTURE section 5)
    // and nothing this scene adds may sit on top of it: the four middle teeth now pass behind it instead.
    this.drawBand(ctx, f);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** One seat, with the dipper wet for the second half of its reach (the beat pays off on the item too). */
  drawSeat(ctx: CanvasRenderingContext2D, s: HiveSeat): void {
    const rig = s.rig, o = s.opts;
    rig.dipperWet = s.dipT > 0 && s.dipT <= DIP_FRAMES - 6 ? 1 : 0;
    o.x = s.x; o.y = s.y; o.facing = s.facing;
    drawRig(ctx, rig, s.player.pose, o);
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
    const tip = jointScreen(s.rig, 'weaponTip', TIP);
    drawHoneyStrand(ctx, SKEP_X[s.dipSkep], ROWS.bench - 5, R(tip.x), R(tip.y), (DIP_FRAMES - s.dipT) / DIP_FRAMES);
  }

  /**
   * A skep, and - when it still has honey - the SIGNAL.hive sparkle above its knob: the same 6x6 gold mark the
   * coop's fresh egg wears, on the same index-hashed blink, because it means the same thing. The index hash keeps
   * the five skeps off one beat, so the bench twinkles instead of flashing.
   */
  drawSkepAt(ctx: CanvasRenderingContext2D, i: number, f: number): void {
    const x = SKEP_X[i], full = this.skeps[i].refill === 0;
    drawSkep(ctx, x, ROWS.bench, full);
    if (!full || !(((f + i * 7) >> 3) & 1)) return;
    ctx.fillStyle = SIGNAL.hive;
    ctx.fillRect(x - 1, SKEP_TOP - 17, 2, 8);
    ctx.fillRect(x - 4, SKEP_TOP - 14, 8, 2);
  }

  /**
   * The swarm, plus the heat the screen (not the prop module) decides to show:
   *   WARY  a SIGNAL.hot ring pulsing out of the column every 12 frames - the telegraph's second channel, on top of
   *         the shape change, because this 36-frame window is the only warning the player gets.
   *   ALERT an inked hot rule drawn right under the fanned-out swarm, the length of its whole spread: a line across
   *         the meadow that says where the swarm is looking. Solid, never blinking - a blinking danger mark is off
   *         for half the frames a player might glance in.
   */
  drawSwarmAt(ctx: CanvasRenderingContext2D, f: number): void {
    const sw = this.swarm, sh = morphShape(sw), cx = R(sh.cx), cy = R(sh.cy);
    if (sw.state === ALERT && sw.mx >= MORPH_N) {
      // 6 px under the bar of bees, which lands it on the skeps' knobs: a lid coming down on the hives. Round 1 put
      // it 8 px lower, straight through the doorways, and it hid the comb the full/empty read is made of. It runs
      // the FULL width rather than the swarm's own spread: a rule that stopped short of the end skeps looked like a
      // place you could still work, and there is no such place - during ALERT the sting follows the seat, not the x.
      const ry = cy + R(sh.halfH) + 6;
      ctx.fillStyle = UI.ink; ctx.fillRect(0, ry - 1, VIEW_W, 5);
      ctx.fillStyle = SIGNAL.hot; ctx.fillRect(0, ry, VIEW_W, 3);
    }
    if (sw.state === WARY) {
      const k = ((WARY_FRAMES - sw.t) % 12) / 12, prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * (1 - k);
      ctx.strokeStyle = SIGNAL.hot; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 20 + k * 44, 0, TAU); ctx.stroke();
      ctx.globalAlpha = prev;
    }
    drawSwarm(ctx, cx, cy, sh.halfW, sh.halfH, sh.rx, sh.ry, sh.stride, sw.phase, f);
  }

  /** An angry bee spiralling off a stung seat on the ANGRY_DX/DY table. Cosmetic: never in checksumFields(). */
  drawAngry(ctx: CanvasRenderingContext2D, a: AngryBee, i: number, f: number): void {
    if (a.t >= ANGRY_T) return;
    drawBee(ctx, a.x + a.dir * ANGRY_DX[a.t], a.y + ANGRY_DY[a.t], (f + i * 3) & 2 ? 1 : 0);
  }

  /** The swarm band (see BAND_X above for what each state has to say and why it says it three ways). */
  drawBand(ctx: CanvasRenderingContext2D, f: number): void {
    const st = this.swarm.state;
    if (st !== CALM) this.drawCrest(ctx, st === WARY ? -1 : 1);
    ctx.fillStyle = UI.ink; ctx.fillRect(BAND_X - 2, BAND_Y - 2, BAND_W + 4, BAND_H + 4);
    ctx.fillStyle = st === ALERT ? SIGNAL.hot : UI.paper;
    ctx.fillRect(BAND_X, BAND_Y, BAND_W, BAND_H);
    if (st === CALM) {
      const sw = this.swarm, k = sw.len > 0 ? sw.t / sw.len : 0, lit = Math.ceil(FUSE_N * k);
      ctx.fillStyle = SIGNAL.good;
      for (let i = 0; i < lit; i++) ctx.fillRect(BAND_X + 3 + i * FUSE_STEP, BAND_Y + 2, FUSE_W, BAND_H - 4);
    } else if (st === WARY) {
      ctx.save();
      ctx.beginPath(); ctx.rect(BAND_X + 2, BAND_Y + 2, BAND_W - 4, BAND_H - 4); ctx.clip();
      ctx.fillStyle = SIGNAL.hot;
      for (let x = BAND_X - 24 + ((f * 2) % 24); x < BAND_X + BAND_W; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, BAND_Y + 3); ctx.lineTo(x + 7, BAND_Y + 9); ctx.lineTo(x, BAND_Y + 15);
        ctx.lineTo(x - 5, BAND_Y + 15); ctx.lineTo(x + 2, BAND_Y + 9); ctx.lineTo(x - 5, BAND_Y + 3);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // CALM's fuse and WARY's chevrons both run under the word, so the word gets its own paper plate to stand on.
    // ALERT keeps cream straight on the hot field: a plate there would have broken the one solid block of danger.
    if (st !== ALERT) {
      const lw = BAND_LABEL_W[st], lx = R(BAND_X + BAND_W / 2 - lw / 2);
      ctx.fillStyle = UI.ink; ctx.fillRect(lx - 1, BAND_Y + 2, lw + 2, BAND_H - 4);
      ctx.fillStyle = UI.paper; ctx.fillRect(lx, BAND_Y + 3, lw, BAND_H - 6);
    }
    drawText(ctx, BAND_LABEL[st], BAND_X + BAND_W / 2, BAND_Y + 6, st === ALERT ? BAND_TEXT_HOT : BAND_TEXT);
  }

  /** The band's jagged crest: `dir` -1 rears it UP off the top edge (WARY), +1 hangs it DOWN off the bottom (ALERT). */
  drawCrest(ctx: CanvasRenderingContext2D, dir: number): void {
    const y = dir < 0 ? BAND_Y - 2 : BAND_Y + BAND_H + 2, w = BAND_W / BAND_TEETH;
    ctx.beginPath();
    ctx.moveTo(BAND_X - 2, y);
    for (let i = 0; i < BAND_TEETH; i++) {
      ctx.lineTo(BAND_X + (i + 0.5) * w, y + dir * TOOTH_H);
      ctx.lineTo(BAND_X + (i + 1) * w, y);
    }
    ctx.lineTo(BAND_X + BAND_W + 2, y);
    ctx.closePath();
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = SIGNAL.hot; ctx.fill();
  }

  override summary() {
    const sw = this.swarm;
    return {
      honey: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText,
      stings: this.stings,
      swarm: { state: STATE_NAMES[sw.state], t: sw.t, len: sw.len, x: R(sw.x) },
      seats: this.seats.map((s) => [s.slot, R(s.x), s.count, s.dipT, s.bumpT]),
      // [x, refill] per skep: a headless test needs the x to drive a seat to one, and the refill to see it empty
      skeps: this.skeps.map((k, i) => [SKEP_X[i], k.refill]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js), in one reused array. */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    const sw = this.swarm;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.stings);
    // the swarm's whole state, position included: its x is rng-driven and its y is a pure function of state + morph,
    // so these five numbers reproduce the drawn cloud as well as the rule
    f.push(sw.state, sw.prev, sw.t, sw.len, sw.mx, sw.phase, sw.x, sw.tx);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.x, s.facing, s.count, s.dipT, s.dipSkep, s.bumpT, s.safeT, s.moving ? 1 : 0);
    }
    for (let i = 0; i < this.skeps.length; i++) f.push(this.skeps[i].refill);
    return f;
  }
}
