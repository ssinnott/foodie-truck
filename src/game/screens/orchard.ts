// ORCHARD - CATCH (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Orchard"). Side view, daylight: every seat
// runs left and right along its own depth lane with a basket held in front, apples drop out of the canopy at a
// seeded x and a seeded speed, and the basket's rim is the catch box. A missed apple splats on the grass and costs
// nothing. Three kinds fall:
//   ripe   +1 and a ring;
//   wormy  bruised, with a grub climbing out: the shared bump beat and a dazed face, but nothing lost;
//   bomb   a ripe apple with a burning fuse. Caught, it is the scene's joke: the critter holds it up and watches
//          the fuse burn down (HOLD_FRAMES), it goes off in a cloud of smoke and embers, and the critter stands there
//          blackened and dazed with smoke coming off its ears (SINGED_FRAMES) before shaking it off and carrying on.
//          Nothing is lost but the time.
// The round ends when the party's total reaches the order's amount or the 40-second clock runs out; a wooden sign
// drops in on ropes, is held a second, then run.gather() and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the apples are a fixed array of plain sim objects, every random
// number comes from the rng singleton inside update(), the sway is dsin, the catch boxes are built once in enter()
// with dsin/dcos from the rig's proportions (pawRoot, below) and never read back from a draw. The petals,
// splats, rings and float text are cosmetic and stay out of checksumFields().
import { VIEW_W, UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng, makeRng } from '../../lib/engine/rng.ts';
import type { RngInstance } from '../../lib/engine/rng.ts';
import { dsin, dcos } from '../../lib/engine/trig.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt } from '../../art/fx.ts';
import { drawFood, foodTones } from '../../art/food.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { gatherTarget } from '../run.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F } from '../../content/critters/common.ts';
import { makeOrchardLayers, ORCHARD, GRASS_Y, FENCE_Y, BLEED_X, PARALLAX } from '../../art/backgrounds/orchard.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates, RIBBON_BASKET } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';

/** The HOW TO PLAY card's pictograms (game/controlcard.ts), in the order they are read. */
const SCHEMES: readonly CardScheme[] = Object.freeze(['move']);
const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;
/** Movement: px/frame, and the lane's ends (a basket's width in from each edge). */
const SPEED = 2.2, X_MIN = 24, X_MAX = 616;
/** Seat i stands with its feet at LANE_Y0 - i * LANE_GAP: P1 in front, four lanes 8 px apart so bodies stack. */
const LANE_Y0 = 316, LANE_GAP = 8;
/**
 * Apples: a fixed pool, spawned every 30..60 frames, falling 1.4..2.4 px/frame with a 3 px sway.
 *
 * Row 66 is where an apple can honestly be said to hang IN the leaves: the canopy covers 58 % of the width at row
 * 50 and 78 % at row 60 (18 % at row 40, which is why it used to pop out of open sky), and the crowns' top edges
 * run 46..62, so row 56 — where the apples used to be seeded — put half of them on the rim with their stalks in
 * open sky. Ten rows lower the apple sits on green with its stalk inside the mass, and it is still well clear of
 * the clock ticket's bottom edge at ~47 (the ticket draws after the apples).
 */
const MAX_APPLES = 12, SPAWN_MIN = 30, SPAWN_MAX = 60, APPLE_Y0 = 66, VY_MIN = 1.4, VY_MAX = 2.4, SWAY = 3, SWAY_RATE = 0.06;
/**
 * ...but an apple that BEGINS at row 56 materialises out of blank leaves: the canopy is a smooth green mass and the
 * only red in the frame is fruit already falling through open air, so the scene never says "apple orchard" and its
 * best beat - the apple letting go - has no before-state to let go from. Every apple now hangs on its branch at the
 * spawn point for HANG frames first, on a 2 px ink stalk that runs up into the leaves, and shivers 1 px on alternate
 * frames for the last SHIVER before it drops. The signal red stays an emitter (ART_STYLE section 4): it is the same
 * apple the player is about to chase, held one beat earlier, not a red fleck painted into the backdrop.
 */
const HANG_FRAMES = 22, SHIVER_FRAMES = 6, HANG_STEM = 6;
/**
 * Drawn at s 7 (a 14 px apple): a step up from the 10 px it shipped at, because at 1x on a television across a
 * room the falling apple was the smallest thing on the screen and the whole game is chasing it.
 */
const APPLE_S = 7;
/** The three kinds, and the deal: one apple in ten is wormy and one in ten carries a fuse. */
const RIPE = 0, WORMY = 1, BOMB = 2, KIND_ROLL = 10;
/**
 * The bomb's sequence, as one countdown on the seat (`boomT`, from BOOM_TOTAL down to 0):
 *   boomT > SINGED_FRAMES   the HOLD: the apple is up in the paw, the fuse burns down, the critter watches it;
 *   boomT == SINGED_FRAMES  the BANG: smoke, embers, a flash, BOOM!, and the apple is gone;
 *   0 < boomT <= SINGED     SINGED: the rig is painted soot, `dazed`, smoke coming off it, then it shakes it off.
 * 40 + 90 frames is a hair over two seconds, which is a joke and not a penalty.
 */
const HOLD_FRAMES = 40, SINGED_FRAMES = 90, BOOM_TOTAL = HOLD_FRAMES + SINGED_FRAMES;
/** The bang's flash: a cream burst over the paw for this many frames; and a smoke puff off the singed critter every SMOKE_EVERY. */
const FLASH_FRAMES = 4, SMOKE_EVERY = 12;
/** The soot the singed critter is painted in: the rig's flash path (the mill whitened the same way), near-ink plum. */
const SOOT = '#3A3340';
/** The fuse: a bent 2 px wick standing this far off the stem, with a spark at its tip. It burns to nothing through the hold. */
const FUSE_H = 7;
/** Where a missed apple lands: in front of the front lane, outside the clean band, above the fence. */
const APPLE_FLOOR = 330;
/**
 * The catch box is the whole critter AND its basket: BODY_HALF either side of the feet and BODY_TOP rows up from
 * them (plus the BOX_BELOW rows under the feet so a fast apple never skips it), or the basket's rim - BOX_HALF
 * either side of the rim point RIM_BELOW_PAW under the near paw, from the rig's own proportions, and the rows just
 * around it. It used to be the rim and nothing else, and a small player could stand right under an apple and watch
 * it fall past their shoulder: if any part of the critter or the basket is under the apple, the critter has it.
 * The rim is still where the ring and the +1 are drawn, so the catch still reads as a catch.
 */
const BODY_HALF = 22, BODY_TOP = 52, BOX_BELOW = 4, BOX_HALF = 11, BOX_ABOVE = 2, RIM_BELOW_PAW = 8;
/** The catch beat (basket squash 1.15) and the bump beat (4/10/6 frames of the shared `bump` anim, movement locked). */
const CATCH_FRAMES = 3, BUMP_FRAMES = 21;
/** Splats: a missed apple as one inked flat ellipse stepping down a size every 5 frames, gone in 20. */
const SPLAT_FRAMES = 20, SPLAT_STEP = 5, MAX_SPLATS = 8;
const SPLAT_RX = Int8Array.of(8, 6, 4, 3), SPLAT_RY = Int8Array.of(3, 3, 2, 2);
/** Petals: a cosmetic stream (seed from the orchard block), one every few frames so about two dozen are in the air. */
const PETAL_EVERY = 6, PETAL_SEED = 105, PETAL_PALE = '#F1E4C8';
const PLUS_ONE = '+1', BOOM = 'BOOM!', TITLE = 'PIPPIN ORCHARD';
/** The bang's particles, built once. */
const SMOKE_OPTS = { speed: 2.2, up: 1.2, sizeJitter: 2, screen: true }, EMBER_OPTS = { speed: 3, up: 1.6, screen: true };
const PUFF_OPTS = { speed: 0.5, up: 0.9, sizeJitter: 1, screen: true };

/**
 * The orchard's own two poses, on top of the shared table (the coop's COOP_ANIMS pattern):
 *   holdBomb  the apple up in the near paw at muzzle height, the head tipped to look at it: `neutral` for the first
 *             key and `grit` for the second as the fuse gets short. The near arm at 96 puts the paw BESIDE the
 *             muzzle, not over it (ART_STYLE 0.7), and the far arm stays down so both paws read.
 *   singed    stood bolt upright with both arms out a little, `dazed`, a 1 px tremble on alternate keys and a
 *             whisker of squash: shocked, not hurt.
 */
const ORCHARD_ANIMS = Object.freeze({
  holdBomb: { loop: true, frames: [
    F(20, { armR: [96, 30], armL: [-16, 8], torso: -2, head: 10, root: [0, 0], face: 'neutral' }),
    F(20, { armR: [98, 28], armL: [-14, 8], torso: -3, head: 12, root: [0, -1], face: 'grit' }),
  ] },
  singed: { loop: true, frames: [
    F(4, { armR: [34, 6], armL: [-34, 6], legR: [6, 0], legL: [-6, 0], torso: -2, head: -4, root: [0, 0], squash: 1.03, face: 'dazed' }),
    F(4, { armR: [36, 6], armL: [-36, 6], legR: [6, 0], legL: [-6, 0], torso: -2, head: -4, root: [1, 0], squash: 1.03, face: 'dazed' }),
  ] },
});
/** Where the held bomb is drawn: the near paw of the seat being drawn, read off its rig after drawRig (draw-only). */
const PAW_PT: Point = { x: 0, y: 0 };
/** The shared anim keys the boxes are built from (content/critters/common.js CARRY / catch frame 0). */
const CATCH_POSE = { torso: -4, upper: 72, lower: 48 }, WALK_POSE = { torso: 6, upper: 60, lower: 50 };

/**
 * The orchard's backdrop: the five layers makeOrchardLayers pre-renders (far, mid, ground, near, eaves), each
 * blitted at its own parallax factor. Taken off the painter rather than restated here, so a layer added there is
 * a layer this screen can blit without a second edit.
 */
export type OrchardLayers = ReturnType<typeof makeOrchardLayers>;

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS: OrchardLayers | null = null;
/** Reused by pawRoot so the catch-box maths allocates nothing (it runs four times, in enter()). */
const PAW: Point = { x: 0, y: 0 };

/**
 * Root-space position of the near paw for a torso lean and arm angles (degrees): the same chain as
 * art/rig.js computeJoints but through the deterministic trig, so the catch box built from it in enter() is
 * bit-identical on every peer. y is down-positive with the feet at 0 (so the paw's y is negative).
 *
 * This lives here, not in game/minigame.js, because the coop does not catch anything: minigame.js is shared with
 * another owner's screen now, and only furniture BOTH screens use belongs in it.
 */
function pawRoot(rig: Rig, torsoRot: number, upper: number, lower: number): Point {
  const p = rig.p, hipY = rig.hipY;
  const c = dcos(torsoRot * DEG), s = dsin(torsoRot * DEG), shY = -(p.torsoH - 5);
  const sx = p.shoulderX * c - shY * s, sy = hipY + p.shoulderX * s + shY * c;
  const u = (torsoRot + upper) * DEG, l = (torsoRot + upper + lower) * DEG;
  const ex = sx + dsin(u) * p.upperArm, ey = sy + dcos(u) * p.upperArm;
  const wx = ex + dsin(l) * p.lowerArm, wy = ey + dcos(l) * p.lowerArm;
  PAW.x = wx + dsin(l) * p.handR * 0.6; PAW.y = wy + dcos(l) * p.handR * 0.6;
  return PAW;
}

/** The ground-contact ellipse every sprite draws before the sorted pass. */
function drawSeatShadow(ctx: CanvasRenderingContext2D, seat: OrchardSeat): void { drawShadow(ctx, seat.x, seat.y, seat.rig.width + 6, 0.4, 0); }

/** Draw one seat's critter at its feet position with its held basket state. */
function drawSeat(ctx: CanvasRenderingContext2D, seat: OrchardSeat, fill: number): void {
  const rig = seat.rig, o = seat.opts;
  rig.basketFill = fill; rig.basketSquash = seat.catchT > 0 ? 1.15 : 1;
  // painted soot from the bang to the recovery: the rig's flash path replaces every fill (the mill whitened the same way)
  rig.override = seat.boomT > 0 && seat.boomT <= SINGED_FRAMES ? SOOT : null;
  o.x = seat.x; o.y = seat.y; o.facing = seat.facing;
  drawRig(ctx, rig, seat.player.pose, o);
  rig.override = null;
}

/**
 * One seat catching in its own lane: the shared mini-game seat plus the two catch boxes enter() builds for it out
 * of the rig's proportions. These are the extra fields `Seat` documents a screen keeping more per seat should
 * declare for itself, and `makeSeats` is generic so enter() gets them back typed.
 */
export interface OrchardSeat extends Seat {
  /** Frames left of the bomb sequence (BOOM_TOTAL..0); the seat neither moves nor catches while it runs. */
  boomT: number;
  /** Rim x offset from the feet in the catch pose, in screen px; `facing` mirrors it. Where the ring is drawn, not the catch test. */
  boxCatchX: number;
  /** Rim y offset from the feet in that pose (negative = above the feet). */
  boxCatchY: number;
  /** Rim x offset while the seat is walking, whose arms hold the basket further out. */
  boxWalkX: number;
  /** Rim y offset in that pose. */
  boxWalkY: number;
}

/** One apple of the fixed pool: on its branch, then falling, then free for the next spawn. */
export interface Apple {
  /** False while the slot is free for the next spawn. */
  active: boolean;
  /** Where it is drawn: `x0` plus the sway, or plus the 1 px shiver while it still hangs. */
  x: number;
  /** The seeded x it hangs on and sways about. */
  x0: number;
  /** The row its centre is drawn on, from APPLE_Y0 down. */
  y: number;
  /** Fall speed in px/frame (VY_MIN..VY_MAX). */
  vy: number;
  /** RIPE, WORMY or BOMB. */
  kind: number;
  /** The sway phase: seeded at spawn, held while it hangs, counted up once it falls. */
  t: number;
  /** Frames left on the branch; 0 once it has let go. */
  hang: number;
}

/** A missed apple's mark on the grass: a slot of the cosmetic pool, stepping down a size every SPLAT_STEP. */
export interface Splat {
  /** Frames into the splat; SPLAT_FRAMES means the slot is free. */
  t: number;
  x: number;
  y: number;
}

export class OrchardScreen extends Screen {
  // The fields, for the checker only, in enter() order. `declare` for the reason game.ts gives over its own
  // block: a plain field declaration would emit a class field per name (es2022 defines them before the
  // constructor body runs, and a screen's own declaration would also define a base field back to undefined), and
  // this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the one that shipped.

  /** The backdrop, pre-rendered once (art/backgrounds/orchard.ts makeOrchardLayers) and blitted per frame. */
  declare layers: OrchardLayers;
  /** The petal stream's own generator (PETAL_SEED): cosmetic only, never the sim. */
  declare vis: RngInstance;
  /** The petal spawn options, built once in enter() and handed to particles.spawn every PETAL_EVERY frames. */
  declare petalOpts: { color: string; color2: string; size: number; life: number; vx: number; vy: number; screen: boolean };
  /** One seat per party member, in party order (not slot order): one depth lane each, P1 in front. */
  declare seats: OrchardSeat[];
  /** The apple pool: MAX_APPLES slots, reused in place, never reallocated. */
  declare apples: Apple[];
  /**
   * What this visit gathers (game/run.js gatherTarget): apples, or the pears, peaches or avocados the orchard's other trees drop, all caught the same way. `icon`/`hex` are its glyph, the sign prefix its name.
   */
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** The splat pool (cosmetic): MAX_SPLATS slots handed out in turn. */
  declare splats: Splat[];
  /** The next splat slot to reuse. */
  declare splatCursor: number;
  /** Frames until the next apple is seeded on a branch (SPAWN_MIN..SPAWN_MAX). */
  declare nextSpawn: number;
  /** Apples the round is played to: what the order still needs, or 4 with no run. */
  declare target: number;
  /** Apples in the party's baskets right now. */
  declare total: number;
  /** Bombs that have gone off in somebody's paw this round (the playtest reads it). */
  declare booms: number;
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
  /** What the action key is called on seat 0's device, for the HOW TO PLAY card. */
  declare cardKey: string;
  /** The round's clock and its ending (game/minigame.ts). */
  declare clock: Clock;
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];

  constructor(game: Game) { super(game, 'orchard'); }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    if (!LAYERS) LAYERS = makeOrchardLayers();
    this.layers = LAYERS;
    particles.clear();
    this.vis = makeRng(PETAL_SEED);
    this.petalOpts = { color: PETAL_PALE, color2: ORCHARD.fallen, size: 4, life: 130, vx: -0.3, vy: 0.5, screen: true };
    this.ing = gatherTarget(run, params.place, 'orchard');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.apple;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    this.seats = makeSeats<OrchardSeat>(game, (i) => LANE_Y0 - i * LANE_GAP);
    const n = this.seats.length, pitch = Math.min(120, R((X_MAX - X_MIN) / (n + 1)));
    for (let i = 0; i < n; i++) {
      const s = this.seats[i];
      s.x = R(VIEW_W / 2 + (i - (n - 1) / 2) * pitch);
      // catch boxes in root space (feet at 0, y down): the rim is RIM_BELOW_PAW under the near paw
      const c = pawRoot(s.rig, CATCH_POSE.torso, CATCH_POSE.upper, CATCH_POSE.lower);
      s.boxCatchX = R(c.x * s.rig.scale); s.boxCatchY = R((c.y + RIM_BELOW_PAW) * s.rig.scale);
      const w = pawRoot(s.rig, WALK_POSE.torso, WALK_POSE.upper, WALK_POSE.lower);
      s.boxWalkX = R(w.x * s.rig.scale); s.boxWalkY = R((w.y + RIM_BELOW_PAW) * s.rig.scale);
      s.boomT = 0;
      s.rig.basketIcon = this.icon; s.rig.basketHex = this.hex;
      s.player.setOverlay(ORCHARD_ANIMS);
      seatAnim(s, 'catch');
    }
    this.apples = [];
    for (let i = 0; i < MAX_APPLES; i++) this.apples.push({ active: false, x: 0, x0: 0, y: 0, vy: 0, kind: RIPE, t: 0, hang: 0 });
    this.splats = [];
    for (let i = 0; i < MAX_SPLATS; i++) this.splats.push({ t: SPLAT_FRAMES, x: 0, y: 0 });
    this.splatCursor = 0;
    this.nextSpawn = SPAWN_MIN;
    const need = run ? run.need(this.ing) : null;
    this.target = need ? Math.max(1, need.amount - need.have) : 4;
    this.total = 0;
    this.booms = 0;
    this.countStr = '0/' + this.target;
    this.clock = makeClock();
    this.fields = [];
    this.cardKey = game.input.keyText(0, 'action');
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    if (this.frame % PETAL_EVERY === 0) particles.spawn('leaf', this.vis.int(-20, VIEW_W + 20), this.vis.int(20, 60), this.petalOpts);
    for (let i = 0; i < this.splats.length; i++) if (this.splats[i].t < SPLAT_FRAMES) this.splats[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      this.updateSeats(input);
      this.updateApples();
      if (this.total >= this.target) this.finish();
    } else {
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather(this.ing, this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /** Every seat: the beats first (they lock the stick), then the stick, the anim, the catch beat. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.catchT > 0) s.catchT--;
      if (s.boomT > 0) { this.stepBoom(s); s.moving = false; s.player.tick(); continue; }
      if (s.bumpT > 0) { s.bumpT--; s.moving = false; s.player.tick(); continue; }
      const ax = input.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      seatAnim(s, s.moving ? 'carryWalk' : 'catch');
      s.player.tick();
    }
  }

  /** Spawn, fall, sway; then the catch test against every seat's rim, then the miss. */
  updateApples(): void {
    if (--this.nextSpawn <= 0) {
      this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
      for (let i = 0; i < this.apples.length; i++) {
        const a = this.apples[i];
        if (a.active) continue;
        a.active = true; a.x0 = rng.int(X_MIN + 8, X_MAX - 8); a.x = a.x0; a.y = APPLE_Y0;
        a.vy = rng.range(VY_MIN, VY_MAX); a.t = rng.int(0, 100);
        const roll = rng.int(1, KIND_ROLL); a.kind = roll === 1 ? WORMY : roll === 2 ? BOMB : RIPE;
        a.hang = HANG_FRAMES;
        break;
      }
    }
    for (let i = 0; i < this.apples.length; i++) {
      const a = this.apples[i];
      if (!a.active) continue;
      // on the branch: no fall, no catch test, and a.t held at its seeded sway phase until the apple lets go
      if (a.hang > 0) { a.hang--; a.x = a.x0 + (a.hang < SHIVER_FRAMES && (a.hang & 1) ? 1 : 0); continue; }
      a.t++; a.y += a.vy; a.x = a.x0 + dsin(a.t * SWAY_RATE) * SWAY;
      const bottom = a.y + APPLE_S;
      let caught = false;
      for (let k = 0; k < this.seats.length && !caught; k++) {
        const s = this.seats[k];
        if (s.bumpT > 0 || s.boomT > 0) continue;
        const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
        const onBody = a.x >= s.x - BODY_HALF && a.x <= s.x + BODY_HALF && bottom >= s.y - BODY_TOP && bottom < s.y + BOX_BELOW;
        const onRim = a.x >= bx - BOX_HALF && a.x <= bx + BOX_HALF && bottom >= by - BOX_ABOVE && bottom < by + BOX_BELOW;
        if (!onBody && !onRim) continue;
        caught = true;
        a.active = false;
        if (a.kind === RIPE) {
          s.count++; s.catchT = CATCH_FRAMES;
          this.setTotal(this.total + 1);
          ringAt(bx, by, 4, 14, UI.cream, 2, 12, false, true);
          floatText(bx, by - 12, PLUS_ONE, s.colour, 1, true);
          this.game.audio.play('catch');
        } else if (a.kind === WORMY) {
          // the grub: a flinch and a dazed face, and that is all it costs
          s.bumpT = BUMP_FRAMES; s.moving = false;
          seatAnim(s, 'bump', true);
          this.game.audio.play('wormy');
        } else this.lightFuse(s);
      }
      if (!caught && bottom >= APPLE_FLOOR) {
        a.active = false;
        this.game.audio.play('splat');
        const sp = this.splats[this.splatCursor]; this.splatCursor = (this.splatCursor + 1) % this.splats.length;
        sp.t = 0; sp.x = R(a.x); sp.y = APPLE_FLOOR;
      }
    }
  }

  /** A bomb in the paw: the basket goes down, the apple comes up, and the fuse starts to burn. */
  lightFuse(s: OrchardSeat): void {
    s.boomT = BOOM_TOTAL; s.moving = false; s.catchT = 0;
    s.rig.weapon = null;
    seatAnim(s, 'holdBomb', true);
    this.game.audio.play('fuse');
  }

  /** One frame of the bomb sequence: the hold, the bang on the one frame it lands, the singed stand, the recovery. */
  stepBoom(s: OrchardSeat): void {
    s.boomT--;
    if (s.boomT === SINGED_FRAMES) this.bang(s);
    else if (s.boomT < SINGED_FRAMES && s.boomT > 0 && s.boomT % SMOKE_EVERY === 0) particles.burst('smoke', s.x, s.y - 52, 1, PUFF_OPTS);
    else if (s.boomT === 0) this.recover(s);
  }

  /** The bang: smoke and embers off the paw, a hot ring, BOOM!, and the critter turns to soot. */
  bang(s: OrchardSeat): void {
    const px = s.x + s.facing * 14, py = s.y - 44;
    this.booms++;
    particles.burst('smoke', px, py, 10, SMOKE_OPTS);
    particles.burst('ember', px, py, 12, EMBER_OPTS);
    ringAt(px, py, 6, 34, SIGNAL.hot, 3, 14, false, true);
    ringAt(px, py, 4, 20, UI.cream, 2, 10, false, true);
    floatText(px, py - 20, BOOM, UI.cream, 1, true);
    seatAnim(s, 'singed', true);
    this.game.audio.play('boom');
  }

  /** Shaken off: the soot goes, the basket is back in the paw, and the seat is a player again. */
  recover(s: OrchardSeat): void {
    s.rig.weapon = RIBBON_BASKET;
    seatAnim(s, 'catch', true);
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign, and every seat with something in its basket cheers. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total, this.game.audio);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.moving = false; s.bumpT = 0;
      if (s.boomT > 0) { s.boomT = 0; s.rig.weapon = RIBBON_BASKET; }
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, cam = 0;
    blitAt(ctx, L.far, -BLEED_X - R(cam * PARALLAX.far), 0);
    blitAt(ctx, L.mid, -BLEED_X - R(cam * PARALLAX.mid), 0);
    blitAt(ctx, L.ground, -BLEED_X - R(cam * PARALLAX.ground), GRASS_Y);
    particles.draw(ctx, null, 'back');
    // shadows first: every seat on its lane, every apple on the ground it will land on (shrinking with height)
    for (let i = 0; i < this.seats.length; i++) drawSeatShadow(ctx, this.seats[i]);
    for (let i = 0; i < this.apples.length; i++) { const a = this.apples[i]; if (a.active) drawShadow(ctx, a.x, APPLE_FLOOR, 14, 0.3, APPLE_FLOOR - a.y); }
    // the sorted pass: back lane to front lane, then the splats (they land in front of the front lane) and the
    // apples over everyone (they fall in front of the trees)
    for (let i = this.seats.length - 1; i >= 0; i--) { const s = this.seats[i]; drawSeat(ctx, s, this.target ? s.count / this.target : 0); this.drawHeld(ctx, s); }
    for (let i = 0; i < this.splats.length; i++) this.drawSplat(ctx, this.splats[i]);
    for (let i = 0; i < this.apples.length; i++) this.drawApple(ctx, this.apples[i], this.frame);
    blitAt(ctx, L.near, -BLEED_X - R(cam * PARALLAX.near), FENCE_Y);
    blitAt(ctx, L.eaves, -BLEED_X - R(cam * PARALLAX.near), 0);
    particles.draw(ctx, null, 'front');
    // plates front lane first, each one stacked clear of the ones already down: ragged row, no buried name
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.clock, this.countStr, this.clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawEndSign(ctx, this.clock, this.frame);
    if (this.game.options.debug) this.drawBoxes(ctx);
  }

  /**
   * The apple: on its branch with a stalk into the leaves, then falling. Three looks for three kinds:
   *   ripe   the food glyph with a 3 px cream pip on its lit top-left, which clears every plane the apple falls
   *          across (canopy, plum wood, haze floor, grass) by value alone - red #D9463B against the canopy #4F6B3A
   *          is only 0.17 apart, and without the pip it sank into the leaves;
   *   wormy  a bruised body two value steps below the grass, an ink bite hole on its shoulder that takes the stem
   *          and the leaf with it, and a grub of two inked cream beads climbing out over the rim (a broken
   *          silhouette survives the squint where a colour swap did not);
   *   bomb   the ripe apple exactly, plus a bent ink fuse standing off its stem with a spark on the tip that
   *          flickers HOT / cream on alternate frames - the one HOT mark in the orchard, and it is a warning.
   */
  drawApple(ctx: CanvasRenderingContext2D, a: Apple, f: number): void {
    if (!a.active) return;
    const x = R(a.x), y = R(a.y);
    // the branch it is still holding on to: a 2 px ink stalk (the 2 px floor, ART_STYLE 0.8) from the apple's own
    // stem up into the leaves, so a hanging apple reads as fruit ON the tree and not fruit stuck in mid-air
    if (a.hang > 0) { ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - APPLE_S - HANG_STEM, 2, HANG_STEM + 2); }
    if (a.kind === WORMY) {
      drawFood(ctx, this.icon, x, y, APPLE_S, ORCHARD.wormy);
      ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.arc(x + 3, y - 2, 3, 0, TAU); ctx.fill();          // the bite hole
      ctx.beginPath(); ctx.arc(x + 3, y - 4, 3, 0, TAU); ctx.fill();                                  // the grub, inked...
      ctx.beginPath(); ctx.arc(x + 6, y - 7, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = UI.cream;
      ctx.beginPath(); ctx.arc(x + 3, y - 4, 2, 0, TAU); ctx.fill();                                  // ...then its two beads
      ctx.beginPath(); ctx.arc(x + 6, y - 7, 2, 0, TAU); ctx.fill();
      return;
    }
    drawFood(ctx, this.icon, x, y, APPLE_S, this.hex);
    ctx.fillStyle = UI.cream; ctx.fillRect(x - 4, y - 4, 3, 3);
    if (a.kind === BOMB) this.drawFuse(ctx, x, y - APPLE_S, FUSE_H, f);
  }

  /** The fuse: a bent 2 px wick `h` px tall off the stem at (x, y), and a 3 px spark flickering on its tip. */
  drawFuse(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, f: number): void {
    if (h <= 0) return;
    const bend = h > 3 ? 3 : h;
    ctx.fillStyle = UI.ink;
    ctx.fillRect(x + 1, y - bend, 2, bend + 1);
    if (h > 3) ctx.fillRect(x + 2, y - h, 3, h - bend + 1);
    ctx.fillStyle = f & 1 ? SIGNAL.hot : UI.cream;
    ctx.fillRect(x + 3 - (h > 3 ? 0 : 2), y - h - 2, 3, 3);
  }

  /**
   * What a seat holds through the bomb sequence: the bomb apple up in its paw with the fuse burning down through
   * the hold, then the flash for the first frames after the bang. Read off the rig's own joints from the drawRig
   * that just ran, so it is drawn where the paw actually is (draw-only, like the hive's honey strand).
   */
  drawHeld(ctx: CanvasRenderingContext2D, s: OrchardSeat): void {
    if (s.boomT <= 0) return;
    const p = jointScreen(s.rig, 'handN', PAW_PT), x = R(p.x), y = R(p.y) - 2;
    if (s.boomT > SINGED_FRAMES) {
      drawFood(ctx, this.icon, x, y, APPLE_S, this.hex);
      ctx.fillStyle = UI.cream; ctx.fillRect(x - 4, y - 4, 3, 3);
      const left = s.boomT - SINGED_FRAMES;
      this.drawFuse(ctx, x, y - APPLE_S, Math.ceil(FUSE_H * left / HOLD_FRAMES), this.frame);
    } else if (s.boomT > SINGED_FRAMES - FLASH_FRAMES) {
      const k = SINGED_FRAMES - s.boomT, r = 14 + k * 6;
      ctx.fillStyle = UI.cream; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = SIGNAL.hot; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
    }
  }

  /**
   * A missed apple's mark: one inked splat, flat on the grass, stepping down a size every 5 frames until it is gone.
   * Nothing in this scene fades — ART_STYLE section 5 keeps soft marks for steam and smoke, and 0.2 wants a line
   * round every object — so it is stepped, not alpha-blended. It is deliberately a wide, flat ellipse and never a
   * disc: a round red disc lying on the grass is an apple, and the player would go for it. It draws after the seats
   * because it lands in front of the front lane.
   */
  drawSplat(ctx: CanvasRenderingContext2D, sp: Splat): void {
    if (sp.t >= SPLAT_FRAMES) return;
    const k = (sp.t / SPLAT_STEP) | 0, rx = SPLAT_RX[k], ry = SPLAT_RY[k];
    ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SIGNAL.orchard; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = foodTones(this.hex).sh;   // the splat's shade band: the fruit's own shadow tone (cached per hex)
    ctx.beginPath(); ctx.ellipse(sp.x + 1, sp.y + 1, rx - 1, ry - 1, 0, 0, TAU); ctx.fill();
  }

  /** ?debug=1: the catch boxes. */
  drawBoxes(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      ctx.strokeRect(s.x - BODY_HALF + 0.5, s.y - BODY_TOP + 0.5, BODY_HALF * 2, BODY_TOP + BOX_BELOW);
      const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
      ctx.strokeRect(bx - BOX_HALF + 0.5, by - BOX_ABOVE + 0.5, BOX_HALF * 2, BOX_ABOVE + BOX_BELOW);
    }
  }

  override summary() {
    return {
      caught: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText, booms: this.booms,
      seats: this.seats.map((s) => [s.slot, R(s.x), s.count, s.bumpT, s.boomT]), apples: this.apples.filter((a) => a.active).length,
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.nextSpawn, this.booms);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.bumpT, s.boomT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.apples.length; i++) { const a = this.apples[i]; f.push(a.active ? 1 : 0, a.x, a.y, a.vy, a.kind, a.t); }
    return f;
  }
}

