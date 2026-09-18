// ORCHARD - CATCH (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Orchard"). Side view, daylight: every seat
// runs left and right along its own depth lane with a basket held in front, apples drop out of the canopy at a
// seeded x and a seeded speed, the basket's rim is the catch box, one apple in eight is wormy and costs one. The
// round ends when the party's total reaches the order's amount or the 40-second clock runs out; a wooden sign drops
// in on ropes, is held a second, then run.gather() and back to the map.
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
import { drawRig } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { makeOrchardLayers, ORCHARD, GRASS_Y, FENCE_Y, BLEED_X, PARALLAX } from '../../art/backgrounds/orchard.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';

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
/** Drawn at s 5 (a 10 px apple); one in eight is wormy. */
const APPLE_S = 5, WORMY_IN = 8;
/** Where a missed apple lands: in front of the front lane, outside the clean band, above the fence. */
const APPLE_FLOOR = 330;
/** The catch box: the basket's drawn rim is 22 px across, so the box is too, and the rows below the rim an apple's bottom counts in (vy < 4 never skips it). */
const BOX_HALF = 11, BOX_ABOVE = 2, BOX_BELOW = 4, RIM_BELOW_PAW = 8;
/** The catch beat (basket squash 1.15) and the bump beat (4/10/6 frames of the shared `bump` anim, movement locked). */
const CATCH_FRAMES = 3, BUMP_FRAMES = 21;
/** Splats: a missed apple as one inked flat ellipse stepping down a size every 5 frames, gone in 20. */
const SPLAT_FRAMES = 20, SPLAT_STEP = 5, MAX_SPLATS = 8;
const SPLAT_RX = Int8Array.of(8, 6, 4, 3), SPLAT_RY = Int8Array.of(3, 3, 2, 2);
/** Petals: a cosmetic stream (seed from the orchard block), one every few frames so about two dozen are in the air. */
const PETAL_EVERY = 6, PETAL_SEED = 105, PETAL_PALE = '#F1E4C8';
const PLUS_ONE = '+1', MINUS_ONE = '-1', TITLE = 'PIPPIN ORCHARD', SIGN_PREFIX = 'APPLES: ';
/** The shared anim keys the boxes are built from (content/critters/common.js CARRY / catch frame 0). */
const CATCH_POSE = { torso: -4, upper: 72, lower: 48 }, WALK_POSE = { torso: 6, upper: 60, lower: 50 };

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { drawFood(ctx, 'apple', x, y, 4); }
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
  o.x = seat.x; o.y = seat.y; o.facing = seat.facing;
  drawRig(ctx, rig, seat.player.pose, o);
}

/**
 * One seat catching in its own lane: the shared mini-game seat plus the two catch boxes enter() builds for it out
 * of the rig's proportions. These are the extra fields `Seat` documents a screen keeping more per seat should
 * declare for itself, and `makeSeats` is generic so enter() gets them back typed.
 */
export interface OrchardSeat extends Seat {
  /** Rim x offset from the feet in the catch pose, in screen px; `facing` mirrors it. */
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
  /** 0 = ripe, 1 = wormy. */
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
  /** Ripe red or wormy brown, taken from the apple that made it. */
  hex: string;
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
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
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
      seatAnim(s, 'catch');
    }
    this.apples = [];
    for (let i = 0; i < MAX_APPLES; i++) this.apples.push({ active: false, x: 0, x0: 0, y: 0, vy: 0, kind: 0, t: 0, hang: 0 });
    this.splats = [];
    for (let i = 0; i < MAX_SPLATS; i++) this.splats.push({ t: SPLAT_FRAMES, x: 0, y: 0, hex: SIGNAL.orchard });
    this.splatCursor = 0;
    this.nextSpawn = SPAWN_MIN;
    const need = run ? run.order.needs.find((x) => x.id === 'apple') : null;
    this.target = need ? Math.max(1, need.amount - need.have) : 4;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.clock = makeClock();
    this.fields = [];
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
        if (game.run) game.run.gather('apple', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /** Every seat: read its stick, move along its lane, pick the anim, tick the beats. */
  updateSeats(input: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.catchT > 0) s.catchT--;
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
        a.vy = rng.range(VY_MIN, VY_MAX); a.kind = rng.int(1, WORMY_IN) === 1 ? 1 : 0; a.t = rng.int(0, 100);
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
        if (s.bumpT > 0) continue;
        const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
        if (a.x < bx - BOX_HALF || a.x > bx + BOX_HALF || bottom < by - BOX_ABOVE || bottom >= by + BOX_BELOW) continue;
        caught = true;
        a.active = false;
        if (a.kind === 0) {
          s.count++; s.catchT = CATCH_FRAMES;
          this.setTotal(this.total + 1);
          ringAt(bx, by, 4, 14, UI.cream, 2, 12, false, true);
          floatText(bx, by - 12, PLUS_ONE, s.colour, 1, true);
        } else {
          if (s.count > 0) { s.count--; this.setTotal(this.total - 1); }
          s.bumpT = BUMP_FRAMES; s.moving = false;
          seatAnim(s, 'bump', true);
          floatText(bx, by - 12, MINUS_ONE, UI.cream, 1, true);
        }
      }
      if (!caught && bottom >= APPLE_FLOOR) {
        a.active = false;
        const sp = this.splats[this.splatCursor]; this.splatCursor = (this.splatCursor + 1) % this.splats.length;
        sp.t = 0; sp.x = R(a.x); sp.y = APPLE_FLOOR; sp.hex = a.kind ? ORCHARD.wormy : SIGNAL.orchard;
      }
    }
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign, and every seat with something in its basket cheers. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; s.moving = false; s.bumpT = 0; seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true); }
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
    for (let i = this.seats.length - 1; i >= 0; i--) { const s = this.seats[i]; drawSeat(ctx, s, this.target ? s.count / this.target : 0); }
    for (let i = 0; i < this.splats.length; i++) this.drawSplat(ctx, this.splats[i]);
    for (let i = 0; i < this.apples.length; i++) this.drawApple(ctx, this.apples[i]);
    blitAt(ctx, L.near, -BLEED_X - R(cam * PARALLAX.near), FENCE_Y);
    blitAt(ctx, L.eaves, -BLEED_X - R(cam * PARALLAX.near), 0);
    particles.draw(ctx, null, 'front');
    // plates front lane first, each one stacked clear of the ones already down: ragged row, no buried name
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawEndSign(ctx, this.clock, this.frame);
    if (this.game.options.debug) this.drawBoxes(ctx);
  }

  /**
   * The apple, and the one the player must NOT catch.
   *
   * A colour swap alone was not a tell: the old dull brown was the same value as the grass it fell across, and the
   * worm was a 4x2 cream rect with a square end that read as a price sticker. The wormy one now differs three ways
   * at a squint — a bruised body two value steps below the grass, the canopy and the trodden band; an ink bite hole
   * on its shoulder that takes the stem and the leaf with it (a ripe apple always keeps its leaf); and a grub of two
   * inked cream beads climbing out of that hole and over the rim, so the silhouette breaks too. Each bead carries
   * its own 1 px ink (ART_STYLE 0.2: separate objects, separate lines) and is 3 px across, over the 2 px floor.
   */
  drawApple(ctx: CanvasRenderingContext2D, a: Apple): void {
    if (!a.active) return;
    const x = R(a.x), y = R(a.y);
    // the branch it is still holding on to: a 2 px ink stalk (the 2 px floor, ART_STYLE 0.8) from the apple's own
    // stem up into the leaves, so a hanging apple reads as fruit ON the tree and not fruit stuck in mid-air
    if (a.hang > 0) { ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - APPLE_S - HANG_STEM, 2, HANG_STEM + 2); }
    if (a.kind === 0) {
      drawFood(ctx, 'apple', x, y, APPLE_S);
      // The one highlight (ART_STYLE 0.5 allows exactly one): art/food.js only caps a ball at r >= 6 and the falling
      // apple is r 4.6, so a 10 px red ball crossing the canopy carried no light at all - red #D9463B against the
      // canopy #4F6B3A is 0.17 apart by value, under the 0.25 the ladder asks for, and at 1x it sank into the leaves.
      // A 3 px cream pip on the lit top-left clears every plane the apple falls across (canopy, plum wood, haze
      // floor, grass) by value alone, and it doubles as the ripe/wormy tell: a ripe apple is shiny, the bruised one
      // stays dull.
      ctx.fillStyle = UI.cream; ctx.fillRect(x - 3, y - 3, 3, 3);
      return;
    }
    drawFood(ctx, 'apple', x, y, APPLE_S, ORCHARD.wormy);
    ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.arc(x + 2, y - 1, 2.5, 0, TAU); ctx.fill();        // the bite hole
    ctx.beginPath(); ctx.arc(x + 2, y - 3, 2.6, 0, TAU); ctx.fill();                                // the grub, inked...
    ctx.beginPath(); ctx.arc(x + 4.5, y - 5.5, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = UI.cream;
    ctx.beginPath(); ctx.arc(x + 2, y - 3, 1.6, 0, TAU); ctx.fill();                                // ...then its two beads
    ctx.beginPath(); ctx.arc(x + 4.5, y - 5.5, 1.6, 0, TAU); ctx.fill();
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
    ctx.fillStyle = sp.hex; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = foodTones(sp.hex).sh;
    ctx.beginPath(); ctx.ellipse(sp.x + 1, sp.y + 1, rx - 1, ry - 1, 0, 0, TAU); ctx.fill();
  }

  /** ?debug=1: the catch boxes. */
  drawBoxes(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
      ctx.strokeRect(bx - BOX_HALF + 0.5, by - BOX_ABOVE + 0.5, BOX_HALF * 2, BOX_ABOVE + BOX_BELOW);
    }
  }

  override summary() {
    return {
      caught: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText,
      seats: this.seats.map((s) => [s.slot, R(s.x), s.count]), apples: this.apples.filter((a) => a.active).length,
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.nextSpawn);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.bumpT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.apples.length; i++) { const a = this.apples[i]; f.push(a.active ? 1 : 0, a.x, a.y, a.vy, a.kind, a.t); }
    return f;
  }
}

