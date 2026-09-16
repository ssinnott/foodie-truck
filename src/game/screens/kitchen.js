// KITCHEN - COOK (docs/GDD.md section 6; docs/ART_STYLE.md section 1 "Kitchen"). The truck's interior, side-on,
// camera locked: one critter per seat walks the counter between the five stations (content/places.js STATIONS) and
// the order's steps are worked IN ORDER. The first seat to interact at the current step's station owns it (its slot
// colour fills the paper tag over the station); its input alone drives the step:
//   CHOP  five presses on the beat of a sliding bar (a 40-frame sweep, a press within 6 frames of centre counts)
//   MIX   hold for 180 frames while a dial fills; letting go pauses it
//   STOVE hold while a bar fills; let go inside the hot band (last 20 %) for perfect, before it for done, over = burnt
//   OVEN  a press loads the tray; 300 frames run; a press in the last 40 is perfect, earlier is done, none is burnt
//   PLATE a press at the hatch plates the dish and rings the bell: ORDER UP!, then results
// Each step scores 0..2; stars = max(1, round(total / (2 * steps) * 3)). Barley's gag: on every completed step, a
// seeded one-in-six chance he eats an ingredient (crumbs, NOM, no score change).
//
// Determinism (docs/ARCHITECTURE.md section 0): every sim field is an integer or a px/frame sum driven by seat input;
// the only random call is the gag, through `rng`; the steam, glow, rings and float text are cosmetic and stay out of
// checksumFields(). Rigs are built once in enter(), never in draw().
import { VIEW_W, UI, SIGNAL, PLAYER_COLORS } from '../../constants.js';
import { Screen } from '../game.js';
import { rng } from '../../engine/rng.js';
import { particles } from '../../engine/particles.js';
import { blitAt } from '../../art/layers.js';
import { drawShadow, floatText, ringAt, burstCrumbs, burstSparkle } from '../../art/fx.js';
import { drawRig, jointScreen } from '../../art/rig.js';
import { drawBust, idlePoseOf } from '../../art/portraits.js';
import { drawFood } from '../../art/food.js';
import { critterRig } from '../../content/critters/common.js';
import { getCritter } from '../../content/critters/index.js';
import { getCustomer } from '../../content/critters/customers.js';
import { ITEMS } from '../../content/critters/items.js';
import { STATIONS } from '../../content/places.js';
import { INGREDIENTS } from '../../content/recipes.js';
import { AnimPlayer } from '../animation.js';
import { drawTicket, drawOrderTicket, drawNamePlate, drawHint, drawStamp, ROW } from '../ui.js';
import { drawText } from '../../engine/text.js';
import { kitchenLayer, ROWS, HATCH, STATION_X, PROP_DX, AT_RANGE, X_MIN, X_MAX } from '../../art/backgrounds/kitchen.js';
import {
  paintStations, drawStationGlow, drawChopItem, drawBowlContents, drawStove, drawOvenWindow, drawPlate, drawBellRing,
  drawChopBar, drawDial, drawStoveBar, drawOvenTimer, drawPlatePrompt, drawTag, PLATE, BELL, POT, OVEN,
} from '../../art/kitchenProps.js';

const R = Math.round;
const CHOP = 0, MIX = 1, STOVE = 2, OVEN_S = 3, PLATE_S = 4;
const STATION_IDX = { chop: CHOP, mix: MIX, stove: STOVE, oven: OVEN_S, plate: PLATE_S };
/** Walking: px/frame along the feet line. */
const SPEED = 2.0;
/** The timing windows (docs/GDD.md section 6). */
const CHOP_HITS = 5, CHOP_SWEEP = 40, CHOP_BEAT = 20, CHOP_WINDOW = 6;
const MIX_FRAMES = 180;
const STOVE_FRAMES = 150, STOVE_BAND = 0.8, STOVE_DONE = 0.5;
const OVEN_FRAMES = 300, OVEN_WINDOW = 40;
/** After the bell: one component lands on the plate every DROP_FRAMES, the stamp slams, then results. */
const SERVE_FRAMES = 96, DROP_FRAMES = 12, STAMP_AT = 40;
/** The reach beat's hold, the eat gag's length, the chop anim's length. */
const ACT_FRAMES = 20, EAT_FRAMES = 42, CHOP_ANIM = 21, GAG_CHANCE = 1 / 6;
/** Segments on each station's paper tag. */
const SEGS = [CHOP_HITS, 4, 4, 4, 1];
/** Rows a critter's tallest head part reaches above its skull (ears, toque, sunhat), for the name plate. */
const CROWN = { barley: 6, sorrel: 20, chicory: 22, cress: 18 };
const HINTS = { chop: 'CHOP: TAP ON THE BEAT', mix: 'MIX: HOLD TO STIR', stove: 'STOVE: HOLD, LET GO IN THE RED', oven: 'OVEN: LOAD, THEN TAKE OUT IN THE GREEN', plate: 'PLATE: RING THE BELL' };
const PERFECT = 'PERFECT!', DONE = 'DONE', BURNT = 'BURNT!', NOM = 'NOM', ORDER_UP = 'ORDER UP!', RING = 'RING!';
const CARD_X = 384, CARD_Y = 12, CARD_W = 108, TICKET_X = 8, TICKET_Y = 12, TICKET_W = 112;
const CARD_TEXT = { size: 1, color: UI.ink, shadow: false }, CARD_OPTS = { title: 'RECIPE' };

/** A 4x6 wooden peg clipping a ticket to the rail, drawn over the paper. */
function peg(ctx, x, y) { ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - 5, 6, 8); ctx.fillStyle = UI.wood; ctx.fillRect(x, y - 4, 4, 6); }

export class KitchenScreen extends Screen {
  constructor(game) { super(game, 'kitchen'); this.seats = []; this.fields = []; }

  enter(params) {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layer = kitchenLayer(paintStations);
    particles.clear();
    // the order: its steps as station indices, the ingredients' glyphs for the board and the plate
    const order = run.order;
    this.steps = order.steps.map((id) => STATION_IDX[id] != null ? STATION_IDX[id] : PLATE_S);
    this.stepNames = order.steps.map((id) => (STATIONS.find((s) => s.id === id) || STATIONS[0]).name);
    this.scores = this.steps.map(() => -1);
    this.owners = this.steps.map(() => -1);
    this.icons = order.needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).icon);
    this.hexes = order.needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).hex);
    this.ticketOpts = { icons: {}, hexes: {} };
    for (const n of order.needs) { const ing = INGREDIENTS[n.id]; if (ing) { this.ticketOpts.icons[n.id] = ing.icon; this.ticketOpts.hexes[n.id] = ing.hex; } }
    this.has = [false, false, false, false, false];
    for (const s of this.steps) this.has[s] = true;
    this.stepIdx = 0; this.total = 0;
    this.st = { phase: 0, t: 0, count: 0, miss: 0 };
    this.served = false; this.serveT = 0; this.stars = 0;
    this.stoveBurnt = 0; this.ovenBurnt = 0; this.ovenGlow = 0;
    this.tak = 0; this.wobbleT = 0; this.ringT = -1;
    this.keyName = game.input.keyText(0, 'action');
    this.setHint();
    // the customer leaning into the hatch
    const cust = getCustomer(order.customer);
    this.custRig = critterRig(cust, -1); this.custPlayer = new AnimPlayer(cust.anims); this.custPlayer.play('idle');
    this.custPose = idlePoseOf(cust); this.custOpts = { facing: -1, margin: 26 };
    // one seat per party member: rig, player, standing spot spread along the counter
    this.seats.length = 0;
    for (let i = 0; i < run.party.length; i++) {
      const p = run.party[i], def = getCritter(p.critter), rig = critterRig(def, p.slot), player = new AnimPlayer(def.anims);
      player.play('idle');
      this.seats.push({
        slot: p.slot, def, rig, player, name: def.name, crown: CROWN[def.id] != null ? CROWN[def.id] : 8,
        x: STATION_X[i % STATION_X.length], facing: 1, moving: false, station: -1, anim: 'idle', actT: 0, eatT: 0, weapon: '',
        opts: { x: 0, y: ROWS.feet, facing: 1 }, head: { x: 0, y: 0 },
      });
    }
    this.fields.length = 0;
  }

  setHint() {
    const id = this.stepIdx < this.steps.length ? STATIONS[this.steps[this.stepIdx]].id : 'plate';
    this.hint = `${HINTS[id]}   (${this.keyName})   WALK: ← →`;
  }

  update() {
    super.update();
    const game = this.game, inp = game.input;
    if (inp.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    this.custPlayer.tick();
    if (this.tak > 0) this.tak--;
    if (this.wobbleT > 0) this.wobbleT--;
    if (this.ringT >= 0 && this.ringT < 60) this.ringT++;
    if (this.ovenGlow > 0 && !(this.currentStation() === OVEN_S && this.st.phase === 1)) this.ovenGlow--;
    this.updateSeats(inp);
    if (!this.served) this.stepStation(inp);
    else if (++this.serveT >= SERVE_FRAMES) { game.replace('results', { stars: this.stars, score: this.total }); return; }
    for (let i = 0; i < this.seats.length; i++) this.pickAnim(this.seats[i]);
  }

  currentStation() { return this.stepIdx < this.steps.length ? this.steps[this.stepIdx] : -1; }

  /** Every seat: read its stick, walk the lane, find the station it stands at, hold the item that station suggests. */
  updateSeats(inp) {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.player.tick();
      if (s.actT > 0) s.actT--;
      if (s.eatT > 0) { s.eatT--; s.moving = false; if (s.eatT === 0) s.weapon = ''; continue; }   // the gag locks the seat
      const ax = inp.axisX(s.slot);
      s.moving = ax !== 0;
      if (s.moving) {
        s.facing = ax < 0 ? -1 : 1;
        s.x += ax * SPEED;
        if (s.x < X_MIN) s.x = X_MIN; else if (s.x > X_MAX) s.x = X_MAX;
      }
      s.station = -1;
      for (let k = 0; k < STATION_X.length; k++) { const d = s.x - STATION_X[k]; if (d >= -AT_RANGE && d <= AT_RANGE) { s.station = k; break; } }
      const want = s.station === CHOP ? 'knife' : s.station === MIX || s.station === STOVE ? 'spoon' : s.station === PLATE_S ? 'plate' : '';
      if (want !== s.weapon) { s.weapon = want; s.rig.weapon = want ? ITEMS[want] : null; }
    }
  }

  /** The seat driving the current step: its owner if it is at the station, else the first seat there that acts (and claims it). */
  actor(inp, station, hold) {
    const idx = this.stepIdx, owner = this.owners[idx];
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.station !== station || s.eatT > 0) continue;
      if (owner >= 0) { if (s.slot === owner) return s; continue; }
      if (inp.pressed(s.slot, 'action') || (hold && inp.held(s.slot, 'action'))) { this.owners[idx] = s.slot; return s; }
    }
    return null;
  }

  /** Advance the current step by the GDD's rules for its station. */
  stepStation(inp) {
    const station = this.currentStation(), st = this.st;
    if (station < 0) { this.serve(null); return; }
    const s = this.actor(inp, station, station === MIX || station === STOVE);
    const pressed = s ? inp.pressed(s.slot, 'action') : false, held = s ? inp.held(s.slot, 'action') : false;
    switch (station) {
      case CHOP:
        st.t = (st.t + 1) % CHOP_SWEEP;   // the marker sweeps whether or not anyone is there
        if (pressed) {
          const d = st.t - CHOP_BEAT;
          if (d >= -CHOP_WINDOW && d <= CHOP_WINDOW) {
            st.count++; this.tak = 6; s.facing = 1; s.actT = CHOP_ANIM; this.playAnim(s, 'chop', true);
            ringAt(STATION_X[CHOP] + PROP_DX, ROWS.counterTop - 8, 3, 12, UI.cream, 2, 10, false, true);
            if (st.count >= CHOP_HITS) this.completeStep(st.miss === 0 ? 2 : 1, s);
          } else { st.miss++; this.wobbleT = 8; }
        }
        break;
      case MIX:
        if (held) { st.phase = 1; st.t++; s.facing = 1; s.actT = 2; if (st.t >= MIX_FRAMES) this.completeStep(st.miss === 0 ? 2 : 1, s); }
        else if (st.phase === 1) { st.phase = 0; st.miss++; }
        break;
      case STOVE:
        if (held) {
          st.phase = 1; st.t++; s.facing = 1; s.actT = 2;
          if (st.t >= STOVE_FRAMES) { this.stoveBurnt = 1; this.smoke(STATION_X[STOVE] + PROP_DX, POT.y); this.completeStep(0, s); }
        } else if (st.phase === 1) {
          st.phase = 0;
          const k = st.t / STOVE_FRAMES;
          if (k >= STOVE_BAND) this.completeStep(2, null); else if (k >= STOVE_DONE) this.completeStep(1, null);
        }
        break;
      case OVEN_S:
        if (st.phase === 0) { if (pressed) { st.phase = 1; st.t = OVEN_FRAMES; this.ovenGlow = 60; s.actT = ACT_FRAMES; s.facing = 1; this.playAnim(s, 'reach', true); } }
        else {
          st.t--;
          if (pressed) { s.actT = ACT_FRAMES; s.facing = 1; this.playAnim(s, 'reach', true); this.completeStep(st.t <= OVEN_WINDOW ? 2 : 1, s); }
          else if (st.t <= 0) { this.ovenBurnt = 1; this.smoke(STATION_X[OVEN_S] + PROP_DX, OVEN.winY); this.completeStep(0, null); }
        }
        break;
      default:   // PLATE
        if (pressed) { s.actT = ACT_FRAMES; s.facing = 1; this.playAnim(s, 'reach', true); this.completeStep(2, s); this.serve(s); }
        break;
    }
  }

  /** Bank a step's score, say so over the station, roll the gag, move on. */
  completeStep(score, s) {
    const idx = this.stepIdx, station = this.steps[idx];
    this.scores[idx] = score; this.total += score;
    const px = STATION_X[station] + PROP_DX, py = ROWS.counterTop - 36;
    if (score === 2) { floatText(px, py, PERFECT, UI.cream, 1, true); burstSparkle(px, py + 10, 5, UI.cream, true); }
    else if (score === 1) floatText(px, py, DONE, UI.cream, 1, true);
    else floatText(px, py, BURNT, SIGNAL.hot, 1, true);
    this.stepIdx++;
    this.st.phase = 0; this.st.t = 0; this.st.count = 0; this.st.miss = 0;
    this.setHint();
    // the hungry one: a seeded one-in-six bite on every completed step, whoever completed it
    for (let i = 0; i < this.seats.length; i++) {
      const b = this.seats[i];
      if (b.def.id !== 'barley' || b.eatT > 0) continue;
      if (!rng.chance(GAG_CHANCE)) continue;
      b.eatT = EAT_FRAMES; b.moving = false; b.weapon = 'food';
      b.rig.weapon = ITEMS.food; b.rig.heldIcon = this.icons[0]; b.rig.heldHex = this.hexes[0];
      this.playAnim(b, 'eat', true);
      burstCrumbs(b.x + b.facing * 8, ROWS.feet - 40, ROWS.feet, this.hexes[0], 6, true);
      floatText(b.x, ROWS.feet - 70, NOM, UI.cream, 1, true);
    }
    void s;
  }

  /** The bell: the dish is served, the stamp slams, results follow after the components have landed. */
  serve(s) {
    if (this.served) return;
    this.served = true; this.serveT = 0; this.ringT = 0;
    const n = Math.max(1, this.steps.length);
    this.stars = Math.max(1, Math.min(3, R(this.total / (2 * n) * 3)));
    ringAt(BELL.x + BELL.w / 2, BELL.y + 4, 4, 22, UI.cream, 2, 16, false, true);
    void s;
  }

  /** Burnt: four dark puffs off the pot or the oven window (cosmetic). */
  smoke(x, y) { particles.burst('smoke', x, y, 4, { speed: 0.8, up: 1.6, sizeJitter: 1.5, screen: true }); }

  playAnim(s, name, restart) { s.anim = name; s.player.play(name, { restart, fallback: 'idle' }); }

  /** idle / walk / stir / reach / chop / eat by what the seat is doing; loops keep their phase, beats play out. */
  pickAnim(s) {
    if (s.eatT > 0) return;
    let name = 'idle';
    if (s.moving) name = 'walk';
    else if (s.actT > 0) {
      const station = this.currentStation();
      if (s.anim === 'chop' || s.anim === 'reach') return;   // a beat plays out
      name = station === MIX || station === STOVE ? 'stir' : 'reach';
    }
    if (name !== s.anim) this.playAnim(s, name, false);
  }

  draw(ctx) {
    const f = this.frame, st = this.st, station = this.currentStation();
    blitAt(ctx, this.layer, 0, 0);
    // the customer leans into the hatch, clipped to the opening so the shelf stays in front of them
    drawBust(ctx, this.custRig, this.custPlayer.pose, this.custPose, HATCH.x + 4, HATCH.y + 2, HATCH.w - 8, HATCH.shelfY - HATCH.y - 2, 2, this.custOpts);
    if (station >= 0 && !this.served) drawStationGlow(ctx, station, f);
    this.drawStations(ctx, f, st, station);
    particles.draw(ctx, null, 'back');
    // shadows, then the sorted pass: one feet line, so seat order is the tiebreak (seat 0 in front)
    for (let i = 0; i < this.seats.length; i++) drawShadow(ctx, this.seats[i].x, ROWS.feet, this.seats[i].rig.width + 6, 0.4, 0);
    for (let i = this.seats.length - 1; i >= 0; i--) {
      const s = this.seats[i], o = s.opts;
      o.x = s.x; o.facing = s.facing;
      drawRig(ctx, s.rig, s.player.pose, o);
      jointScreen(s.rig, 'head', s.head);
    }
    particles.draw(ctx, null, 'front');
    for (let i = 0; i < this.steps.length; i++) drawTag(ctx, this.steps[i], this.owners[i], SEGS[this.steps[i]], this.tagFill(i));
    for (let i = this.seats.length - 1; i >= 0; i--) { const s = this.seats[i]; drawNamePlate(ctx, s.slot, s.name, R(s.head.x), R(s.head.y - s.rig.p.headR - s.crown) - 14); }
    if (!this.served) this.drawWidget(ctx, st, station);
    this.drawHud(ctx, f);
  }

  /** The per-frame marks on the stations: only the ones this order uses. */
  /** True once the step that uses station `k` has been scored. */
  done(k) { for (let i = 0; i < this.steps.length; i++) if (this.steps[i] === k) return this.scores[i] >= 0; return false; }

  drawStations(ctx, f, st, station) {
    if (this.has[CHOP]) {
      const cut = this.done(CHOP) ? 2 : station === CHOP ? (st.count < 2 ? 0 : st.count < 4 ? 1 : 2) : 0;
      drawChopItem(ctx, this.icons[0], this.hexes[0], cut, this.wobbleT > 0 ? ((this.wobbleT & 2) ? 2 : -2) : 0, this.tak > 0);
    }
    if (this.has[MIX]) drawBowlContents(ctx, this.done(MIX) ? 1 : station === MIX ? st.t / MIX_FRAMES : 0);
    const stoveOn = station === STOVE || this.done(STOVE);
    drawStove(ctx, stoveOn, station === STOVE ? st.t / STOVE_FRAMES : 1, f, this.stoveBurnt === 1);
    const baking = station === OVEN_S && st.phase === 1;
    drawOvenWindow(ctx, baking ? 1 - st.t / OVEN_FRAMES : this.ovenGlow / 60, baking || this.ovenBurnt === 1, this.ovenBurnt === 1);
    const plated = this.served ? Math.min(this.icons.length, Math.floor(this.serveT / DROP_FRAMES) + 1) : 0;
    drawPlate(ctx, PLATE.x + 13, PLATE.y, this.icons, this.hexes, plated, plated > 0 && this.serveT % DROP_FRAMES < 3 ? 1.25 : 1);
    drawBellRing(ctx, this.ringT);
  }

  /** How many of a step's tag segments are lit: all when done, its progress while current, none before. */
  tagFill(i) {
    const k = this.steps[i], segs = SEGS[k];
    if (this.scores[i] >= 0) return segs;
    if (i !== this.stepIdx) return 0;
    const st = this.st;
    if (k === CHOP) return st.count;
    if (k === MIX) return Math.floor(st.t * segs / MIX_FRAMES);
    if (k === STOVE) return Math.floor(st.t * segs / STOVE_FRAMES);
    if (k === OVEN_S) return st.phase === 1 ? Math.floor((OVEN_FRAMES - st.t) * segs / OVEN_FRAMES) : 0;
    return 0;
  }

  drawWidget(ctx, st, station) {
    if (station === CHOP) drawChopBar(ctx, st.t, st.count, CHOP_HITS);
    else if (station === MIX) drawDial(ctx, st.t / MIX_FRAMES, st.phase === 0 && st.t > 0);
    else if (station === STOVE) drawStoveBar(ctx, st.t / STOVE_FRAMES);
    else if (station === OVEN_S) drawOvenTimer(ctx, st.phase === 1 ? 1 - st.t / OVEN_FRAMES : 0, OVEN_WINDOW / OVEN_FRAMES);
    else if (station === PLATE_S) drawPlatePrompt(ctx, RING);
  }

  drawHud(ctx, f) {
    const run = this.game.run;
    drawOrderTicket(ctx, run, TICKET_X, TICKET_Y, TICKET_W, drawFood, this.ticketOpts);
    // the recipe card: one row per step, the owner's 6x6 slot ring at the left, an ink tick when done, '>' on the current
    const n = this.steps.length, h = 16 + ROW * n + 6;
    const top = drawTicket(ctx, CARD_X, CARD_Y, CARD_W, h, CARD_OPTS);
    for (let i = 0; i < n; i++) {
      const ry = top + 2 + ROW * i, owner = this.owners[i];
      if (owner >= 0) { ctx.fillStyle = UI.ink; ctx.fillRect(CARD_X + 6, ry, 8, 8); ctx.fillStyle = PLAYER_COLORS[owner] || UI.paperDark; ctx.fillRect(CARD_X + 7, ry + 1, 6, 6); ctx.fillStyle = UI.paper; ctx.fillRect(CARD_X + 9, ry + 3, 2, 2); }
      drawText(ctx, this.stepNames[i], CARD_X + 26, ry, CARD_TEXT);
      if (this.scores[i] >= 0) { ctx.fillStyle = this.scores[i] === 0 ? SIGNAL.hot : UI.ink; ctx.fillRect(CARD_X + CARD_W - 16, ry + 3, 2, 3); ctx.fillRect(CARD_X + CARD_W - 14, ry + 1, 2, 5); ctx.fillRect(CARD_X + CARD_W - 12, ry - 1, 2, 3); }
      else if (i === this.stepIdx && !this.served) drawText(ctx, '>', CARD_X + 18 + ((f >> 4) & 1), ry, CARD_TEXT);
    }
    peg(ctx, TICKET_X + 20, TICKET_Y); peg(ctx, TICKET_X + TICKET_W - 24, TICKET_Y); peg(ctx, CARD_X + 20, CARD_Y); peg(ctx, CARD_X + CARD_W - 24, CARD_Y);
    drawHint(ctx, this.hint);
    if (this.served && this.serveT >= STAMP_AT) drawStamp(ctx, ORDER_UP, VIEW_W / 2, 110, (this.serveT - STAMP_AT) / 24);
  }

  summary() {
    return {
      step: this.stepIdx, steps: this.stepNames, scores: this.scores.slice(), owners: this.owners.slice(), total: this.total, stars: this.stars, served: this.served,
      phase: this.st.phase, t: this.st.t, count: this.st.count, miss: this.st.miss,
      seats: this.seats.map((s) => [s.slot, R(s.x), s.station, s.anim]),
    };
  }

  /** Every field that could diverge between peers (net/checksum.js). */
  checksumFields() {
    const f = this.fields; f.length = 0;
    f.push(this.stepIdx, this.total, this.st.phase, this.st.t, this.st.count, this.st.miss, this.served ? 1 : 0, this.serveT, this.stars, this.stoveBurnt, this.ovenBurnt);
    for (let i = 0; i < this.steps.length; i++) f.push(this.scores[i], this.owners[i]);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.station, s.moving ? 1 : 0, s.actT, s.eatT); }
    return f;
  }
}
