// The millpond mini-game, FISH (docs/GDD.md section 5, docs/ART_STYLE.md section 1 "Pond"): the crew stands at
// fixed spots on the jetty, one float column each, and casts. Per seat a small state machine:
//   idle -> cast (the rod whip; the float arcs out on the parabola table and lands) -> wait (a seeded 90..240 frames)
//   -> nibble (the telegraph: the rod tip dips twice over 30 frames, the float with it) -> bite (the float drops
//   5 px, its waterline lights mint and a mint ring opens: the 18-frame window) -> hooked (the trout arcs into the
//   bucket) | missed (early: PLOP, late: GONE) -> idle after 40.
// The seats, the clock, the name plates and the end sign are game/minigame.js, the same furniture the orchard and
// the coop stand on, so the three mini-games wear one HUD; only the rod, the float, the trout and the bucket are
// the pond's own.
// Everything in update() is deterministic: input by seat only, the wait from `rng`, positions from integer tables and
// + - * /; the bob, the dips, the fish arc and the particles are visual and read the timers in draw(). Each seat's
// state, timer, float position and count plus the clock feed the desync canary.
import { UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { drawShadow, ringAt, floatText, burstDrops } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { RigWeapon } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { blitAt } from '../../art/layers.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { drawHint } from '../ui.ts';
import { drawFood } from '../../art/food.ts';
import { POND, ROWS, SEAT_X, SEAT_PITCH, FLOAT_DX, FLOAT_Y, GLINTS, SUN_GLINTS, pondLayers } from '../../art/backgrounds/pond.ts';
import { PARA_N, PARA_T, PARA_H, BOB, NIBBLE, POND_ANIMS_CAST, CAST_LAUNCH, drawLine, drawFloat, drawTrout, drawBucket } from '../../art/fishing.ts';
import {
  makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates,
} from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';

const R = Math.round;
const IDLE = 0, CAST = 1, WAIT = 2, NIBBLE_S = 3, BITE = 4, HOOKED = 5, MISSED = 6;
const STATE_NAMES = Object.freeze(['idle', 'cast', 'wait', 'nibble', 'bite', 'hooked', 'missed']);
/** GDD section 5's windows. The 40 seconds and the sign's slam/hold belong to minigame.js. */
const WAIT_MIN = 90, WAIT_MAX = 240, NIBBLE_FRAMES = 30, BITE_FRAMES = 18, RESULT_FRAMES = 40;
const FISH_ARC = 20, FALLBACK_TARGET = 3;
/** Where the float leaves the rod tip (sim-side constants; the drawn tip is a hair off, the line hides it). */
const LAUNCH_DX = 40, LAUNCH_Y = ROWS.feet - 40;
/** The bucket's left edge sits this far in front of the feet; the fish arcs to its rim. */
const BUCKET_DX = 20, BUCKET_TOP = 12;
/**
 * Where a seat's float rests between casts. Round 1 dangled it 14 px under the rod tip, which parked it in mid-air
 * over the bank turf with the line hidden along the rod's own shaft: the panel read four bobbers glued to the
 * backdrop. It now sits ON the water just clear of the deck's bottom edge, so the line is a long visible stroke
 * from the tip to it and the float is cream on blue instead of cream on green. `REST_STEP` drops the odd seats a
 * little deeper so the four never line up into a row.
 */
const REST_Y = ROWS.surface + 2, REST_STEP = 4;
/** A miss reels in: the float sits on the water for REEL_AT frames, then travels to the tip over REEL_N. */
const REEL_AT = 15, REEL_N = 6;
/** The bucket's rim squashes for this many frames when a trout drops in, 3 % per frame left. */
const LAND_FRAMES = 4, LAND_K = 0.03;
/**
 * The catch arc's lift, as a fraction of the cast's. Round 1 had the floats pooled in the right two thirds while the
 * crew stood in the left third, so every trout flew the width of the party and the arc had to be flattened to 0.6 to
 * duck under four muzzles. Now each float sits FLOAT_DX px right of its own seat, so the trout only ever crosses its
 * owner's own patch of water: a full 0.8 arc peaks around y 236, well under the chins (about y 190) and clear of
 * every other seat. Director note 8 / round-1 known issue: the fish no longer flies across the crew's faces.
 */
const CATCH_LIFT = 0.8;
/** The contact ellipse: narrow, and 2 px below the feet, so it lands on the planks and never in the water. */
const SHADOW_W = 24;
const TITLE = 'MILLPOND', SIGN_PREFIX = 'FISH: ';
const FISH_HEX = INGREDIENTS.fish.hex;
const PLOP = 'PLOP', GONE = 'GONE', PLUS_ONE = '+1';

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { drawFood(ctx, 'fish', x, y, 4, FISH_HEX); }

/**
 * One seat on the jetty: the shared mini-game seat plus this screen's own state, which is the little machine at the
 * top of this file. Every field is written in enter() and stepped by stepSeat() - none is optional, and the five
 * that checksumFields() hashes (`state`, `t`, `fx`, `fy`, plus the shared `count`) are all plain integers.
 */
export interface PondSeat extends Seat {
  /** Where this seat's cast lands: the head of its own float column, FLOAT_DX px right of its feet. */
  tx: number;
  /** The waterline that column sits on (FLOAT_Y), which is the row a landed float rests at. */
  sy: number;
  /** IDLE | CAST | WAIT | NIBBLE_S | BITE | HOOKED | MISSED. */
  state: number;
  /** Frames left of the current state - or frames INTO it while casting, where `t` counts up to the parabola. */
  t: number;
  /** Which miss is playing out: true = pressed early (PLOP), false = let the window close (GONE). */
  early: boolean;
  /** Frames left of the bucket rim's squash after a trout drops in. */
  landT: number;
  /** The float in screen space: on the water, on the parabola, or dangling at the rod tip. */
  fx: number;
  fy: number;
  /** The row this seat's float rests on between casts (REST_Y, odd seats REST_STEP deeper). */
  restY: number;
  /** The rod tip in screen space, read off the rig by each draw; one point per seat, written in place. */
  tip: Point;
}

/** Where the caught trout is on frame `k` of its arc; one shared point so the two draw passes allocate nothing. */
const CATCH_P = { x: 0, y: 0 };
function catchPoint(s: PondSeat, k: number): Point {
  const i = R(k * (PARA_N - 1) / (FISH_ARC - 1));
  const bx = s.x + BUCKET_DX + 7, by = ROWS.feet - BUCKET_TOP;
  CATCH_P.x = R(s.fx + (bx - s.fx) * PARA_T[i]);
  CATCH_P.y = R(s.fy + (by - s.fy) * PARA_T[i]) - R(PARA_H[i] * CATCH_LIFT);
  return CATCH_P;
}

export class PondScreen extends Screen {
  // The fields, for the checker only, in the order enter() writes them. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name (es2022 defines them before
  // the constructor body runs, so a declaration here would also define a base field back to undefined), and this
  // screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild (tools/build.js,
  // tools/server.js) and under Node's type stripping alike, so the emitted class is the one that shipped.

  /** One seat per party member, in party order (not slot order): one float column each. */
  declare seats: PondSeat[];
  /** The checksum scratch array, sized in enter() and refilled by checksumFields(); never reallocated. */
  declare sum: number[];
  /** Trout in the party's buckets right now. */
  declare total: number;
  /** The round's clock and its ending (game/minigame.ts). */
  declare clock: Clock;
  /** Trout the round is played to: what the order still needs, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** "0/3" for the clock ticket, rebuilt by hook() as the count changes. */
  declare countStr: string;
  /** The one-line control prompt under the panel, built once in enter() off seat 0's key. */
  declare hint: string;

  constructor(game: Game) { super(game, 'pond'); this.seats = []; this.sum = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    particles.clear();
    pondLayers();
    this.total = 0;
    this.clock = makeClock();
    const need = run ? run.order.needs.find((n) => n.id === 'fish') : null;
    // the remainder, not the whole order: the map may already have banked some (the orchard and the coop agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.countStr = '0/' + this.target;
    this.hint = `CAST / HOOK: ${game.input.keyText(0, 'action')}`;
    this.seats = makeSeats<PondSeat>(game, () => ROWS.feet);
    const shift = R((SEAT_X.length - this.seats.length) * SEAT_PITCH / 2);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      // `as RigWeapon`: content/critters/items.ts is not typed yet, so its `attach: 'handR'` widens to `string`
      // and its entries miss RigWeapon's `attach?: HandName` by that one field. The table IS a table of rig
      // weapons - rig.ts reads exactly these keys back off it - so the assertion says what items.ts cannot yet.
      s.rig.weapon = ITEMS.rod as RigWeapon;
      // every seat casts with the pond's own whip, authored for a rod and ending on the rodWait pose
      s.player.setOverlay(POND_ANIMS_CAST);
      // SEAT_X is the four-seat layout; a smaller party keeps the same pitch and slides to the middle of the bank
      s.x = SEAT_X[i % SEAT_X.length] + shift;
      s.tx = s.x + FLOAT_DX;
      s.sy = FLOAT_Y[i % FLOAT_Y.length];
      s.state = IDLE; s.t = 0; s.count = 0; s.early = false; s.landT = 0;
      s.fx = s.x + LAUNCH_DX; s.fy = LAUNCH_Y;
      s.restY = REST_Y + (i & 1) * REST_STEP;
      s.tip = { x: 0, y: 0 };
      seatAnim(s, 'rodIdle', true);
      // the crew is four people waiting, not one pose printed four times: each seat starts its breath a beat later
      // (deterministic, pose only — nothing in summary() or the checksum reads the anim clock)
      for (let k = i * 13; k > 0; k--) s.player.tick();
    }
    this.sum.length = 3 + this.seats.length * 5;
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    const clock = this.clock;
    if (clock.phase === 0) {
      for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; this.stepSeat(s, input.pressed(s.slot, 'action')); s.player.tick(); }
      if (this.total >= this.target) this.finish();
    } else {
      // the sign hangs: the crew holds its last beat, nothing is stepped, no input counts
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('fish', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  stepSeat(s: PondSeat, pressed: boolean): void {
    if (s.landT > 0) s.landT--;
    switch (s.state) {
      case IDLE:
        if (pressed) { s.state = CAST; s.t = 0; s.fx = s.x + LAUNCH_DX; s.fy = LAUNCH_Y; seatAnim(s, 'cast', true); }
        break;
      case CAST: {
        s.t++;
        const i = s.t - CAST_LAUNCH;
        if (i >= 0 && i < PARA_N) {
          const lx = s.x + LAUNCH_DX;
          s.fx = R(lx + (s.tx - lx) * PARA_T[i]);
          s.fy = R(LAUNCH_Y + (s.sy - LAUNCH_Y) * PARA_T[i]) - PARA_H[i];
        }
        if (i >= PARA_N - 1) {
          s.fx = s.tx; s.fy = s.sy;
          ringAt(s.fx, s.fy, 3, 9, UI.cream, 2, 12, true, true); burstDrops(s.fx, s.fy, 2, true);
          s.state = WAIT; s.t = rng.int(WAIT_MIN, WAIT_MAX); seatAnim(s, 'rodWait', true);
        }
        break;
      }
      case WAIT:
        if (pressed) this.miss(s, true);
        else if (--s.t <= 0) { s.state = NIBBLE_S; s.t = NIBBLE_FRAMES; seatAnim(s, 'rodNibble', true); }
        break;
      case NIBBLE_S:
        if (pressed) this.miss(s, true);
        else if (--s.t <= 0) {
          s.state = BITE; s.t = BITE_FRAMES; seatAnim(s, 'rodBite', true);
          ringAt(s.fx, s.fy + 5, 4, 16, SIGNAL.pond, 2, BITE_FRAMES, false, true);
        }
        break;
      case BITE:
        if (pressed) this.hook(s);
        else if (--s.t <= 0) this.miss(s, false);
        break;
      case HOOKED:
        if (RESULT_FRAMES - s.t === FISH_ARC) s.landT = LAND_FRAMES;   // the trout drops in: the rim takes the hit
        if (--s.t <= 0) this.rest(s);
        break;
      case MISSED:
        if (--s.t <= 0) this.rest(s);
        break;
      default: break;
    }
  }

  /** Back to the rod-low stance with the float dangling under the tip. */
  rest(s: PondSeat): void { s.state = IDLE; s.t = 0; s.fx = s.x + LAUNCH_DX; s.fy = LAUNCH_Y; seatAnim(s, 'rodIdle', true); }

  hook(s: PondSeat): void {
    s.state = HOOKED; s.t = RESULT_FRAMES; s.count++;
    this.total++; this.countStr = this.total + '/' + this.target;
    seatAnim(s, 'pull', true);
    burstDrops(s.fx, s.fy, 6, true); ringAt(s.fx, s.fy, 4, 14, UI.cream, 2, 14, true, true);
    floatText(s.fx, s.fy - 24, PLUS_ONE, UI.cream, 1, true);
  }

  miss(s: PondSeat, early: boolean): void {
    s.state = MISSED; s.t = RESULT_FRAMES; s.early = early;
    seatAnim(s, 'bump', true);
    if (early) { floatText(s.fx, s.fy - 26, PLOP, UI.cream, 1, true); burstDrops(s.fx, s.fy, 2, true); }
    else {
      // paper-dark rings, not mint: SIGNAL.pond says "press now" and must never also say "you lost it" (ART_STYLE 4)
      for (let k = 0; k < 3; k++) ringAt(s.fx, s.fy + 5, 4 + k * 4, 14 + k * 6, UI.paperDark, 2, 18 + k * 6, true, true);
      floatText(s.fx, s.fy - 26, GONE, UI.cream, 1, true);
    }
  }

  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    // everyone holds one pose under the sign: rod up for a full bucket, rod low for an empty one
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; s.state = IDLE; s.t = 0; s.fx = s.x + LAUNCH_DX; s.fy = LAUNCH_Y; seatAnim(s, s.count > 0 ? 'pull' : 'rodIdle', true); }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = pondLayers(), f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y); blitAt(ctx, L.mid.L, 0, L.mid.y); blitAt(ctx, L.ground.L, 0, L.ground.y);
    // the water's twinkle: 2x1 cream glints, index-hashed so a quarter of them are lit on any frame
    ctx.globalAlpha = 0.6; ctx.fillStyle = POND.glint;
    for (let i = 0; i < GLINTS.length; i++) if (((f + i * 7) >> 4) & 1) ctx.fillRect(GLINTS[i][0], GLINTS[i][1], 2, 1);
    // inside the sun's reflection column the water is actually catching the light, so it twinkles brighter and on
    // a faster beat than the ambient glints: the one thing that moves on 640 px of water
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < SUN_GLINTS.length; i++) { const g = SUN_GLINTS[i]; if (((f + i * 5) >> 3) & 1) ctx.fillRect(g[0], g[1], g[2], 2); }
    ctx.globalAlpha = 1;
    particles.draw(ctx, null, 'back');
    // shadows first, on the planks (never in the water), then the sorted pass: every seat stands on the same deck,
    // so seat order is the y-sort tiebreak. Every float lies to the right of the whole crew, so a seat's line draws
    // right after its own rig and UNDER the seats in front of it: it ducks behind a neighbour, never across a face.
    for (let i = 0; i < this.seats.length; i++) drawShadow(ctx, this.seats[i].x, ROWS.feet + 2, SHADOW_W, 0.35, 0);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i], o = s.opts;
      // the fish is still in the air on the arc's frames, so the bucket holds one behind until it lands
      const flying = s.state === HOOKED && RESULT_FRAMES - s.t < FISH_ARC;
      drawBucket(ctx, s.x + BUCKET_DX, ROWS.feet, s.slot, flying ? s.count - 1 : s.count, s.landT > 0 ? 1 + s.landT * LAND_K : 1);
      o.x = s.x; o.y = ROWS.feet; o.facing = 1;
      drawRig(ctx, s.rig, s.player.pose, o);
      jointScreen(s.rig, 'weaponTip', s.tip);
      this.drawTackle(ctx, s, f);
    }
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    // the caught trout flies over the crew AFTER the plates: the payoff is never hidden by a name card
    for (let i = 0; i < this.seats.length; i++) if (this.seats[i].state === HOOKED) this.drawCatch(ctx, this.seats[i]);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /** The line, the float (with its bob / dips / drop by state) and, on a miss, the reel back to the rod tip. */
  drawTackle(ctx: CanvasRenderingContext2D, s: PondSeat, f: number): void {
    const tx = R(s.tip.x), ty = R(s.tip.y), st = s.state;
    const k = RESULT_FRAMES - s.t;
    // The rod is up in the `pull` stance (the catch, and the hold under the end sign): a bare line, no float on the
    // ear. The catch's line is drawn HERE, inside the sorted pass, not with the trout after the plates: it runs from
    // one seat's tip across every seat to its right, and a 2 px line over a neighbour's eyes is the one thing this
    // draw order exists to prevent. The seats in front cover it; the trout itself still flies over everyone.
    if (st === HOOKED) {
      if (k >= FISH_ARC) { drawLine(ctx, tx, ty, tx, ty + 8); return; }
      const p = catchPoint(s, k);
      drawLine(ctx, tx, ty, p.x - 9, p.y);   // the line ends at the mouth, which leads the travel
      return;
    }
    if (s.player.name === 'pull') { drawLine(ctx, tx, ty, tx, ty + 8); return; }
    // The dangle. Through the whip it reels IN to the tip (round-1 known issue: on the wind-up key the rod swings
    // back over the shoulder and a float hanging a slack 14 px under that tip ended up on the neighbour's muzzle).
    // Seats are now a full SEAT_PITCH apart, and the line tightens to nothing by CAST_LAUNCH, so nothing hangs
    // anywhere near another critter at any frame of the cast.
    if (st === IDLE) { this.drawDangle(ctx, s, tx, ty, 1, f); return; }
    if (st === CAST && s.t < CAST_LAUNCH) { this.drawDangle(ctx, s, tx, ty, 1 - s.t / CAST_LAUNCH, f); return; }
    if (st === MISSED && k >= REEL_AT) {
      // reeled in over REEL_N frames, not teleported: the float travels from the water to the dangle
      const home = s.restY;
      const e = k >= REEL_AT + REEL_N ? 1 : (k - REEL_AT) / REEL_N;
      const fx = R(s.fx + (tx - s.fx) * e), fy = R(s.fy + (home - s.fy) * e);
      drawLine(ctx, tx, ty, fx, fy - 5); drawFloat(ctx, fx, fy, s.slot, false);
      return;
    }
    let dy = 0;
    if (st === WAIT) dy = BOB[(f >> 1) & 31];
    else if (st === NIBBLE_S) dy = NIBBLE[NIBBLE_FRAMES - s.t];
    else if (st === BITE) dy = 5;
    else if (st === MISSED && s.early) dy = -4;   // the early pop; a late miss leaves the float sitting there, fishless
    drawLine(ctx, tx, ty, s.fx, s.fy + dy - 5);
    drawFloat(ctx, s.fx, s.fy + dy, s.slot, true, st === BITE);
  }

  /**
   * The float at rest, sitting on the water below the rod tip with the line running the whole way down to it: no
   * slot tag down here (the cap carries the colour), and `k` reels it back up to the tip through the cast's wind-up.
   */
  drawDangle(ctx: CanvasRenderingContext2D, s: PondSeat, tx: number, ty: number, k: number, f: number): void {
    // once it is down on the water it rides the same bob as a cast float, each seat on its own phase
    const fy = R(ty + (s.restY - ty) * k) + (k === 1 ? BOB[((f + s.slot * 9) >> 1) & 31] : 0);
    drawLine(ctx, tx, ty, tx, fy - 5);
    drawFloat(ctx, tx, fy, s.slot, false);
  }

  /** The hooked trout: float to the bucket's rim on the cast parabola, nose first toward the bucket it is flying to. */
  drawCatch(ctx: CanvasRenderingContext2D, s: PondSeat): void {
    const k = RESULT_FRAMES - s.t;
    if (k >= FISH_ARC) return;
    const p = catchPoint(s, k);
    drawTrout(ctx, p.x, p.y, 1);
  }

  override summary() {
    return {
      timer: this.clock.timer, total: this.total, target: this.target, ending: this.clock.phase !== 0, sign: this.clock.signText,
      seats: this.seats.map((s) => ({ slot: s.slot, state: STATE_NAMES[s.state], t: s.t, count: s.count, fx: s.fx, fy: s.fy })),
    };
  }

  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const o = this.sum;
    o[0] = this.clock.timer; o[1] = this.clock.phase; o[2] = this.total;
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i], k = 3 + i * 5; o[k] = s.state; o[k + 1] = s.t; o[k + 2] = s.fx; o[k + 3] = s.fy; o[k + 4] = s.count; }
    return o;
  }
}
