// ORCHARD - CATCH (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Orchard"). Side view, daylight: every seat
// runs left and right along its own depth lane with a basket held in front, apples drop out of the canopy at a
// seeded x and a seeded speed, the basket's rim is the catch box, one apple in eight is wormy and costs one. The
// round ends when the party's total reaches the order's amount or the 40-second clock runs out; a wooden sign drops
// in on ropes, is held a second, then run.gather() and back to the map.
//
// Determinism (docs/ARCHITECTURE.md section 0): the apples are a fixed array of plain sim objects, every random
// number comes from the rng singleton inside update(), the sway is dsin, the catch boxes are built once in enter()
// with dsin/dcos from the rig's proportions (game/minigame.js pawRoot) and never read back from a draw. The petals,
// splats, rings and float text are cosmetic and stay out of checksumFields().
import { VIEW_W, UI, SIGNAL } from '../../constants.js';
import { Screen } from '../game.js';
import { rng, makeRng } from '../../engine/rng.js';
import { dsin } from '../../engine/trig.js';
import { particles } from '../../engine/particles.js';
import { blitAt } from '../../art/layers.js';
import { drawShadow, floatText, ringAt } from '../../art/fx.js';
import { drawFood } from '../../art/food.js';
import { makeOrchardLayers, ORCHARD, GRASS_Y, FENCE_Y, BLEED_X, PARALLAX } from '../../art/backgrounds/orchard.js';
import { makeSeats, seatAnim, drawSeatShadow, drawSeat, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, pawRoot } from '../minigame.js';

const R = Math.round;
/** Movement: px/frame, and the lane's ends (a basket's width in from each edge). */
const SPEED = 2.2, X_MIN = 24, X_MAX = 616;
/** Seat i stands with its feet at LANE_Y0 - i * LANE_GAP: P1 in front, four lanes 8 px apart so bodies stack. */
const LANE_Y0 = 316, LANE_GAP = 8;
/** Apples: a fixed pool, spawned every 30..60 frames at y 40 above the canopy, falling 1.4..2.4 px/frame with a 3 px sway. */
const MAX_APPLES = 12, SPAWN_MIN = 30, SPAWN_MAX = 60, APPLE_Y0 = 40, VY_MIN = 1.4, VY_MAX = 2.4, SWAY = 3, SWAY_RATE = 0.06;
/** Drawn at s 5 (a 10 px apple); one in eight is wormy. */
const APPLE_S = 5, WORMY_IN = 8;
/** Where a missed apple lands: in front of the front lane, outside the clean band, above the fence. */
const APPLE_FLOOR = 330;
/** The catch box: the basket's rim, 16 wide, and the rows below the rim an apple's bottom counts in (vy < 4 never skips it). */
const BOX_HALF = 8, BOX_ABOVE = 2, BOX_BELOW = 4, RIM_BELOW_PAW = 8;
/** The catch beat (basket squash 1.15) and the bump beat (4/10/6 frames of the shared `bump` anim, movement locked). */
const CATCH_FRAMES = 3, BUMP_FRAMES = 21;
/** Splats: a missed apple as three flat discs fading over 20 frames. */
const SPLAT_FRAMES = 20, MAX_SPLATS = 8;
/** Petals: a cosmetic stream (seed from the orchard block), one every few frames so about two dozen are in the air. */
const PETAL_EVERY = 6, PETAL_SEED = 105;
const PLUS_ONE = '+1', MINUS_ONE = '-1', TITLE = 'PIPPIN ORCHARD', SIGN_PREFIX = 'APPLES: ';
/** The shared anim keys the boxes are built from (content/critters/common.js CARRY / catch frame 0). */
const CATCH_POSE = { torso: -4, upper: 72, lower: 48 }, WALK_POSE = { torso: 6, upper: 60, lower: 50 };

function clockIcon(ctx, x, y) { drawFood(ctx, 'apple', x, y, 4); }
/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;

export class OrchardScreen extends Screen {
  constructor(game) { super(game, 'orchard'); }

  enter(params) {
    super.enter(params);
    const game = this.game, run = game.run;
    if (!LAYERS) LAYERS = makeOrchardLayers();
    this.layers = LAYERS;
    particles.clear();
    this.vis = makeRng(PETAL_SEED);
    this.petalOpts = { color: '#F1E4C8', color2: ORCHARD.straw, size: 4, life: 130, vx: -0.3, vy: 0.5, screen: true };
    this.seats = makeSeats(game, (i) => LANE_Y0 - i * LANE_GAP);
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
    for (let i = 0; i < MAX_APPLES; i++) this.apples.push({ active: false, x: 0, x0: 0, y: 0, vy: 0, kind: 0, t: 0 });
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

  update() {
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
  updateSeats(input) {
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
  updateApples() {
    if (--this.nextSpawn <= 0) {
      this.nextSpawn = rng.int(SPAWN_MIN, SPAWN_MAX);
      for (let i = 0; i < this.apples.length; i++) {
        const a = this.apples[i];
        if (a.active) continue;
        a.active = true; a.x0 = rng.int(X_MIN + 8, X_MAX - 8); a.x = a.x0; a.y = APPLE_Y0;
        a.vy = rng.range(VY_MIN, VY_MAX); a.kind = rng.int(1, WORMY_IN) === 1 ? 1 : 0; a.t = rng.int(0, 100);
        break;
      }
    }
    for (let i = 0; i < this.apples.length; i++) {
      const a = this.apples[i];
      if (!a.active) continue;
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

  setTotal(n) { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign, and every seat with something in its basket cheers. */
  finish() {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; s.moving = false; s.bumpT = 0; seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true); }
  }

  draw(ctx) {
    const L = this.layers, cam = 0;
    blitAt(ctx, L.far, -BLEED_X - R(cam * PARALLAX.far), 0);
    blitAt(ctx, L.mid, -BLEED_X - R(cam * PARALLAX.mid), 0);
    blitAt(ctx, L.ground, -BLEED_X - R(cam * PARALLAX.ground), GRASS_Y);
    particles.draw(ctx, null, 'back');
    // shadows first: every seat on its lane, every apple on the ground it will land on (shrinking with height)
    for (let i = 0; i < this.seats.length; i++) drawSeatShadow(ctx, this.seats[i]);
    for (let i = 0; i < this.apples.length; i++) { const a = this.apples[i]; if (a.active) drawShadow(ctx, a.x, APPLE_FLOOR, 14, 0.3, APPLE_FLOOR - a.y); }
    for (let i = 0; i < this.splats.length; i++) this.drawSplat(ctx, this.splats[i]);
    // the sorted pass: back lane to front lane, then the apples over everyone (they fall in front of the trees)
    for (let i = this.seats.length - 1; i >= 0; i--) { const s = this.seats[i]; drawSeat(ctx, s, this.target ? s.count / this.target : 0); }
    for (let i = 0; i < this.apples.length; i++) this.drawApple(ctx, this.apples[i]);
    blitAt(ctx, L.near, -BLEED_X - R(cam * PARALLAX.near), FENCE_Y);
    blitAt(ctx, L.eaves, -BLEED_X - R(cam * PARALLAX.near), 0);
    particles.draw(ctx, null, 'front');
    for (let i = this.seats.length - 1; i >= 0; i--) drawSeatPlate(ctx, this.seats[i]);   // the front seat's plate wins an overlap
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawEndSign(ctx, this.clock, this.frame);
    if (this.game.options.debug) this.drawBoxes(ctx);
  }

  drawApple(ctx, a) {
    if (!a.active) return;
    const x = R(a.x), y = R(a.y);
    if (a.kind === 0) drawFood(ctx, 'apple', x, y, APPLE_S);
    else {
      drawFood(ctx, 'apple', x, y, APPLE_S, ORCHARD.wormy);
      ctx.fillStyle = UI.ink; ctx.fillRect(x + 2, y - 2, 6, 4);   // the worm: a 4x2 cream body poking out of the side
      ctx.fillStyle = UI.cream; ctx.fillRect(x + 3, y - 1, 4, 2);
    }
  }

  /** Three flat discs, no outline: the one soft mark in the scene, gone in 20 frames. */
  drawSplat(ctx, sp) {
    if (sp.t >= SPLAT_FRAMES) return;
    const a = ctx.globalAlpha, k = 1 - sp.t / SPLAT_FRAMES;
    ctx.globalAlpha = a * 0.85 * k; ctx.fillStyle = sp.hex;
    ctx.beginPath();
    ctx.ellipse(sp.x - 5, sp.y + 1, 4, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(sp.x + 4, sp.y + 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(sp.x, sp.y - 2, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
  }

  /** ?debug=1: the catch boxes. */
  drawBoxes(ctx) {
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
      ctx.strokeRect(bx - BOX_HALF + 0.5, by - BOX_ABOVE + 0.5, BOX_HALF * 2, BOX_ABOVE + BOX_BELOW);
    }
  }

  summary() {
    return {
      caught: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText,
      seats: this.seats.map((s) => [s.slot, R(s.x), s.count]), apples: this.apples.filter((a) => a.active).length,
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  checksumFields() {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.nextSpawn);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.count, s.bumpT, s.moving ? 1 : 0); }
    for (let i = 0; i < this.apples.length; i++) { const a = this.apples[i]; f.push(a.active ? 1 : 0, a.x, a.y, a.vy, a.kind, a.t); }
    return f;
  }
}

