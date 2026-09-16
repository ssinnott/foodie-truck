// The millpond mini-game, FISH (docs/GDD.md section 5, docs/ART_STYLE.md section 1 "Pond"): the crew stands on the
// near bank at fixed spots, one float column each, and casts. Per seat a small state machine:
//   idle -> cast (the rod whip; the float arcs out on the parabola table and lands) -> wait (a seeded 90..240 frames)
//   -> nibble (the telegraph: two 2 px dips over 30 frames) -> bite (the float drops 5 px, a mint ring opens: the
//   18-frame window) -> hooked (the trout arcs into the bucket) | missed (early: PLOP, late: GONE) -> idle after 40.
// Everything in update() is deterministic: input by seat only, the wait from `rng`, positions from integer tables and
// + - * /; the bob, the dips, the fish arc and the particles are visual and read the timers in draw(). Each seat's
// state, timer, float position and count plus the clock feed the desync canary.
import { VIEW_W, UI, SIGNAL } from '../../constants.js';
import { Screen } from '../game.js';
import { rng } from '../../engine/rng.js';
import { particles } from '../../engine/particles.js';
import { drawShadow, ringAt, floatText, burstDrops } from '../../art/fx.js';
import { drawRig, jointScreen } from '../../art/rig.js';
import { blitAt } from '../../art/layers.js';
import { critterRig } from '../../content/critters/common.js';
import { getCritter } from '../../content/critters/index.js';
import { ITEMS } from '../../content/critters/items.js';
import { INGREDIENTS } from '../../content/recipes.js';
import { AnimPlayer } from '../animation.js';
import { drawTicket, drawBar, drawSign, drawNamePlate, drawHint, ROW } from '../ui.js';
import { drawFood } from '../../art/food.js';
import { drawText } from '../../engine/text.js';
import { POND, ROWS, SEAT_X, FLOAT_X, SURFACE_Y, GLINTS, pondLayers } from '../../art/backgrounds/pond.js';
import {
  PARA_N, PARA_T, PARA_H, BOB, NIBBLE, POND_ANIMS, POND_ANIMS_CAST, CAST_LAUNCH, drawLine, drawFloat, drawTrout, drawBucket,
} from '../../art/fishing.js';

const IDLE = 0, CAST = 1, WAIT = 2, NIBBLE_S = 3, BITE = 4, HOOKED = 5, MISSED = 6;
const STATE_NAMES = Object.freeze(['idle', 'cast', 'wait', 'nibble', 'bite', 'hooked', 'missed']);
const ROUND_FRAMES = 2400, WAIT_MIN = 90, WAIT_MAX = 240, NIBBLE_FRAMES = 30, BITE_FRAMES = 18, RESULT_FRAMES = 40;
const FISH_ARC = 20, SIGN_FRAMES = 60, FALLBACK_TARGET = 3;
/** Where the float leaves the rod tip (sim-side constants; the drawn tip is a hair off, the line hides it). */
const LAUNCH_DX = 40, LAUNCH_Y = 196;
/** The bucket's left edge sits this far in front of the feet; the fish arcs to its rim. */
const BUCKET_DX = 20, BUCKET_TOP = 12;
/** Name-plate height above the head centre, in head radii, per species: the tallest head part (toque, ears, hat). */
const PLATE_K = { sheep: 1.5, mouse: 2.5, hare: 2.55, frog: 2.3 };
const FISH_HEX = INGREDIENTS.fish.hex;
const TICKET_X = 8, TICKET_Y = 8, TICKET_W = 112, TICKET_H = 44;

export class PondScreen extends Screen {
  constructor(game) { super(game, 'pond'); this.seats = []; this.sum = []; }
  enter(params) {
    super.enter(params);
    const run = this.game.run;
    particles.clear();
    pondLayers();
    this.timer = ROUND_FRAMES; this.total = 0; this.ending = false; this.signTimer = 0; this.left = false;
    const need = run.order.needs.find((n) => n.id === 'fish');
    this.target = need ? need.amount : FALLBACK_TARGET;
    this.countText = ''; this.setCount();
    this.signText = '';
    this.hint = `CAST / HOOK: ${this.game.input.keyText(0, 'action')}`;
    this.seats.length = 0;
    for (let i = 0; i < run.party.length && i < SEAT_X.length; i++) {
      const p = run.party[i], def = getCritter(p.critter), rig = critterRig(def, p.slot), player = new AnimPlayer(def.anims);
      rig.weapon = ITEMS.rod;
      // the pond's stances ride an overlay; a critter with its own `cast` (the forager) keeps it
      player.setOverlay(player.has('cast') ? POND_ANIMS : POND_ANIMS_CAST);
      player.play('rodIdle');
      const plateText = `P${p.slot + 1} ${def.name}`;
      this.seats.push({
        slot: p.slot, def, rig, player, plateText, plateK: PLATE_K[def.species] || 2.2,
        x: SEAT_X[i], fx: SEAT_X[i] + LAUNCH_DX, fy: LAUNCH_Y, tx: FLOAT_X[i], state: IDLE, t: 0, count: 0, early: false,
        tip: { x: 0, y: 0 }, head: { x: 0, y: 0 },
      });
    }
    this.sum.length = 2 + this.seats.length * 5;
  }
  setCount() { this.countText = `TROUT ${this.total}/${this.target}`; }

  update() {
    super.update();
    const inp = this.game.input, game = this.game;
    if (inp.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (const s of this.seats) s.player.tick();
    if (this.ending) {
      // the sign hangs: the seats play out whatever beat they are in (no input counts), then the map
      for (const s of this.seats) this.stepSeat(s, false);
      if (this.signTimer > 0) this.signTimer--;
      if (this.signTimer === 0 && !this.left) { this.left = true; game.fadeTo(() => game.replace('map')); }
      return;
    }
    this.timer--;
    for (const s of this.seats) this.stepSeat(s, inp.pressed(s.slot, 'action'));
    if (this.timer <= 0 || this.total >= this.target) this.finish();
  }
  stepSeat(s, pressed) {
    switch (s.state) {
      case IDLE:
        if (pressed) { s.state = CAST; s.t = 0; s.fx = s.x + LAUNCH_DX; s.fy = LAUNCH_Y; s.player.play('cast', { restart: true }); }
        break;
      case CAST: {
        s.t++;
        const i = s.t - CAST_LAUNCH;
        if (i >= 0 && i < PARA_N) {
          const lx = s.x + LAUNCH_DX;
          s.fx = Math.round(lx + (s.tx - lx) * PARA_T[i]);
          s.fy = Math.round(LAUNCH_Y + (SURFACE_Y - LAUNCH_Y) * PARA_T[i]) - PARA_H[i];
        }
        if (i >= PARA_N - 1) {
          s.fx = s.tx; s.fy = SURFACE_Y;
          ringAt(s.fx, s.fy, 3, 9, UI.cream, 2, 12, true, true); burstDrops(s.fx, s.fy, 2, true);
          s.state = WAIT; s.t = rng.int(WAIT_MIN, WAIT_MAX); s.player.play('rodWait');
        }
        break;
      }
      case WAIT:
        if (pressed) this.miss(s, true);
        else if (--s.t <= 0) { s.state = NIBBLE_S; s.t = NIBBLE_FRAMES; }
        break;
      case NIBBLE_S:
        if (pressed) this.miss(s, true);
        else if (--s.t <= 0) { s.state = BITE; s.t = BITE_FRAMES; ringAt(s.fx, s.fy + 5, 4, 16, SIGNAL.pond, 2, BITE_FRAMES, false, true); }
        break;
      case BITE:
        if (pressed) this.hook(s);
        else if (--s.t <= 0) this.miss(s, false);
        break;
      case HOOKED: case MISSED:
        if (--s.t <= 0) { s.state = IDLE; s.t = 0; s.fx = s.x + LAUNCH_DX; s.fy = LAUNCH_Y; s.player.play('rodIdle'); }
        break;
      default: break;
    }
  }
  hook(s) {
    s.state = HOOKED; s.t = RESULT_FRAMES; s.count++; this.total++; this.setCount();
    s.player.play('pull', { restart: true });
    burstDrops(s.fx, s.fy, 6, true); ringAt(s.fx, s.fy, 4, 14, UI.cream, 2, 14, true, true);
    floatText(s.fx, s.fy - 24, '+1', UI.cream, 1, true);
  }
  miss(s, early) {
    s.state = MISSED; s.t = RESULT_FRAMES; s.early = early;
    s.player.play('bump', { restart: true });
    if (early) { floatText(s.fx, s.fy - 26, 'PLOP', UI.cream, 1, true); burstDrops(s.fx, s.fy, 2, true); }
    else {
      for (let k = 0; k < 3; k++) ringAt(s.fx, s.fy + 5, 4 + k * 4, 14 + k * 6, SIGNAL.pond, 2, 18 + k * 6, true, true);
      floatText(s.fx, s.fy - 26, 'GONE', UI.cream, 1, true);
    }
  }
  finish() {
    this.ending = true; this.signTimer = SIGN_FRAMES;
    this.signText = `FISH: ${this.total}`;
    this.game.run.gather('fish', this.total);
  }

  draw(ctx) {
    const L = pondLayers(), f = this.frame;
    blitAt(ctx, L.far.L, 0, L.far.y); blitAt(ctx, L.mid.L, 0, L.mid.y); blitAt(ctx, L.ground.L, 0, L.ground.y);
    // the water's twinkle: 2x1 cream glints, index-hashed so a quarter of them are lit on any frame
    ctx.globalAlpha = 0.6; ctx.fillStyle = POND.glint;
    for (let i = 0; i < GLINTS.length; i++) if (((f + i * 7) >> 4) & 1) ctx.fillRect(GLINTS[i][0], GLINTS[i][1], 2, 1);
    ctx.globalAlpha = 1;
    particles.draw(ctx, null, 'back');
    // shadows first, then the sorted pass: every seat stands on the same lip, so seat order is the y-sort tiebreak.
    // Every float lies to the right of the whole crew, so a seat's line and fish draw right after its own rig and
    // UNDER the seats in front of it: the line ducks behind a neighbour instead of being drawn across their face.
    for (const s of this.seats) drawShadow(ctx, s.x + 2, ROWS.feet, 30, 0.35);
    for (const s of this.seats) {
      drawBucket(ctx, s.x + BUCKET_DX, ROWS.feet, s.slot, s.count);
      drawRig(ctx, s.rig, s.player.pose, { x: s.x, y: ROWS.feet, facing: 1 });
      jointScreen(s.rig, 'weaponTip', s.tip); jointScreen(s.rig, 'head', s.head);
      this.drawTackle(ctx, s, f);
    }
    // the caught trout flies OVER the crew (twice the cast's lift, so it clears the heads), the payoff every seat sees
    for (const s of this.seats) if (s.state === HOOKED) this.drawCatch(ctx, s);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    for (const s of this.seats) drawNamePlate(ctx, s.slot, s.plateText, s.head.x, s.head.y - s.rig.p.headR * s.plateK - 12);
    this.drawHud(ctx, f);
  }
  /** The line, the float (with its bob / dips / drop by state) and the caught trout for one seat. */
  drawTackle(ctx, s, f) {
    const tx = Math.round(s.tip.x), ty = Math.round(s.tip.y);
    const st = s.state;
    if (st === IDLE || (st === CAST && s.t < CAST_LAUNCH) || st === MISSED && s.t < RESULT_FRAMES - 10) {
      // the float dangles under the rod tip
      drawLine(ctx, tx, ty, tx, ty + 8); drawFloat(ctx, tx, ty + 14, s.slot);
      return;
    }
    if (st === HOOKED) { if (RESULT_FRAMES - s.t >= FISH_ARC) drawLine(ctx, tx, ty, tx, ty + 8); return; }
    let dy = 0;
    if (st === WAIT) dy = BOB[(f >> 1) & 31];
    else if (st === NIBBLE_S) dy = NIBBLE[NIBBLE_FRAMES - s.t];
    else if (st === BITE) dy = 5;
    else if (st === MISSED && s.early) dy = -4;   // the early pop; a late miss leaves the float sitting there, fishless
    drawLine(ctx, tx, ty, s.fx, s.fy + dy - 4);
    drawFloat(ctx, s.fx, s.fy + dy, s.slot);
  }
  /** The hooked trout: from the float to the bucket's rim on the cast parabola at twice its lift, nose first, on its line. */
  drawCatch(ctx, s) {
    const k = RESULT_FRAMES - s.t;
    if (k >= FISH_ARC) return;
    const i = Math.round(k * (PARA_N - 1) / (FISH_ARC - 1));
    const bx = s.x + BUCKET_DX + 7, by = ROWS.feet - BUCKET_TOP;
    const fx = Math.round(s.fx + (bx - s.fx) * PARA_T[i]), fy = Math.round(s.fy + (by - s.fy) * PARA_T[i]) - PARA_H[i] * 2;
    drawLine(ctx, Math.round(s.tip.x), Math.round(s.tip.y), fx + 8, fy);
    drawTrout(ctx, fx, fy, -1);
  }
  drawHud(ctx, f) {
    const top = drawTicket(ctx, TICKET_X, TICKET_Y, TICKET_W, TICKET_H, { title: 'MILLPOND' });
    drawFood(ctx, 'fish', TICKET_X + 12, top + 6, 4, FISH_HEX);
    // the count on the first rule, the paper timer on the second: a green bar draining over the 40 seconds
    drawTextRow(ctx, this.countText, TICKET_X + 22, top + 2);
    drawBar(ctx, TICKET_X + 8, top + ROW + 4, TICKET_W - 16, 5, this.timer / ROUND_FRAMES, { color: SIGNAL.good });
    drawHint(ctx, this.hint);
    if (this.ending) {
      const k = SIGN_FRAMES - this.signTimer, e = k >= 10 ? 1 : 1 - (1 - k / 10) * (1 - k / 10);
      drawSign(ctx, VIEW_W / 2, Math.round(-60 + 90 * e), 132, 30, this.signText, { swing: Math.sin(f * 0.05) * 0.02 });
    }
  }

  summary() {
    return {
      timer: this.timer, total: this.total, target: this.target, ending: this.ending,
      seats: this.seats.map((s) => ({ slot: s.slot, state: STATE_NAMES[s.state], t: s.t, count: s.count, fx: s.fx, fy: s.fy })),
    };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  checksumFields() {
    const o = this.sum;
    o[0] = this.timer; o[1] = this.total;
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i], k = 2 + i * 5; o[k] = s.state; o[k + 1] = s.t; o[k + 2] = s.fx; o[k + 3] = s.fy; o[k + 4] = s.count; }
    return o;
  }
}

/** Size-1 ink text on a rule (shadow off); one shared options object so the HUD allocates nothing per frame. */
const TEXT_OPTS = { size: 1, color: UI.ink, shadow: false };
function drawTextRow(ctx, text, x, y) { drawText(ctx, text, x, y, TEXT_OPTS); }
