// KITCHEN - COOK (docs/GDD.md section 6; docs/ART_STYLE.md section 1 "Kitchen"). The truck's interior, side-on,
// camera locked: one critter per seat walks the counter between the five stations (content/places.js STATIONS) and
// the order's steps are worked IN ORDER. The first seat to interact at the current step's station owns it (its slot
// colour fills the paper tag over the station); its input alone drives the step:
//   CHOP  ten presses, any rhythm: every tap is a chop and the tenth finishes the board
//   MIX   hold for 240 frames while a dial fills; letting go pauses it, and it picks up where it left off
//   STOVE hold for 240 frames while a bar fills; letting go pauses it the same way
//   OVEN  hold for 240 frames while the bake runs; letting go pauses it the same way
//   PLATE a press at the hatch plates the dish and rings the bell: ORDER UP!, then results
// Every step completed is worth its full 2 (there is no way to burn, miss or spoil anything), so a served dish is
// always three stars: stars = max(1, round(total / (2 * steps) * 3)). Barley's gag: on every completed step, a
// seeded one-in-six chance he eats an ingredient (crumbs, NOM, no score change).
//
// Determinism (docs/ARCHITECTURE.md section 0): every sim field is an integer or a px/frame sum driven by seat input;
// the only random call is the gag, through `rng`; the steam, glow, rings and float text are cosmetic and stay out of
// checksumFields(). Rigs are built once in enter(), never in draw().
import { VIEW_W, UI, SIGNAL, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { CritterDef, Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstCrumbs, burstSparkle } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { DrawRigOpts, Rig, RigWeapon } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import type { PartialPose } from '../../lib/art/poses.ts';
import { drawBust, idlePoseOf } from '../../art/portraits.ts';
import { drawFood } from '../../art/food.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { STATIONS } from '../../content/places.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawOrderTicket, drawNamePlate, drawHint, drawStamp, ROW } from '../ui.ts';
import type { OrderTicketOpts } from '../ui.ts';
import { drawText } from '../../engine/text.ts';
import { kitchenLayer, ROWS, BUST, STATION_X, PROP_X, AT_RANGE, X_MIN, X_MAX, TICKET, RECIPE } from '../../art/backgrounds/kitchen.ts';
import {
  paintStations, drawStationFocus, drawChopItem, drawBowlContents, drawStove, drawOvenWindow, drawPlate, drawBellRing,
  drawChopBar, drawDial, drawStoveBar, drawOvenTimer, drawPlatePrompt, drawTag, drawKettleSteam, PLATE, BELL, POT, OVEN,
} from '../../art/kitchenProps.ts';

const R = Math.round;
const CHOP = 0, MIX = 1, STOVE = 2, OVEN_S = 3, PLATE_S = 4;
const STATION_IDX = { chop: CHOP, mix: MIX, stove: STOVE, oven: OVEN_S, plate: PLATE_S };
/** Walking: px/frame along the feet line. */
const SPEED = 2.0;
/** The steps' lengths (docs/GDD.md section 6): taps on the board, frames of holding everywhere else. */
const CHOP_HITS = 10;
const MIX_FRAMES = 240;
const STOVE_FRAMES = 240;
const OVEN_FRAMES = 240;
/** After the bell: one component lands on the plate every DROP_FRAMES, the stamp slams, then results. */
const SERVE_FRAMES = 96, DROP_FRAMES = 12, STAMP_AT = 40;
/** The ORDER UP! stamp's resting row: the wall's clear band between the station signs (104..121) and the props
 *  that stand on the counter (156..200). At its old row 110 it printed straight across the MIX and STOVE signs. */
const STAMP_Y = 140;
/** The reach beat's hold, the eat gag's length, the chop anim's length. */
const ACT_FRAMES = 20, EAT_FRAMES = 42, CHOP_ANIM = 21, GAG_CHANCE = 1 / 6;
/** Segments on each station's paper tag. */
const SEGS = [CHOP_HITS, 4, 4, 4, 1];
/** Rows a critter's tallest head part reaches above its skull (ears, toque, sunhat), for the name plate. */
const CROWN = { barley: 6, sorrel: 20, chicory: 22, cress: 18 };
/** The lowest row a name plate's top may take: the module's own contract is that nothing to read sits in rows
 *  156..200, where the pot, the bowl and the board's ingredient are. A tall crown lifts a plate above this. */
const PLATE_Y_MAX = 160;
const HINTS = { chop: 'CHOP: TAP OVER AND OVER', mix: 'MIX: HOLD TO STIR', stove: 'STOVE: HOLD TO COOK', oven: 'OVEN: HOLD TO BAKE', plate: 'PLATE: RING THE BELL' };
const PERFECT = 'PERFECT!', DONE = 'DONE', NOM = 'NOM', ORDER_UP = 'ORDER UP!', RING = 'RING!';
const CARD_X = RECIPE.x, CARD_Y = RECIPE.y, CARD_W = RECIPE.w;
// the recipe card is the SMALLER paper: it hangs below the rail on two strings and carries no perforated top, so
// it never reads as the order ticket's twin at the other end of the same rail (the two papers used to match)
const CARD_TEXT = { size: 1, color: UI.ink, shadow: false }, CARD_OPTS = { title: 'RECIPE', perforated: false };

/**
 * A critter's rig as this game hands it round: art/rig.ts's own rig plus the two fields the food item reads back
 * off it (content/critters/items.ts `ITEMS.food` draws `rig.heldIcon` in `rig.heldHex`). Optional because
 * `buildRig` never writes them - a rig carries them only while its owner is holding something.
 */
export interface CritterRig extends Rig {
  /** Food glyph id (art/food.ts) in the paw, or null. */
  heldIcon?: string | null;
  /** That glyph's base hex, or null. */
  heldHex?: string | null;
}

/** One party member working the counter: what `enter()` builds per `run.party` seat, in party order. */
export interface Seat {
  /** Player slot 0..3: its colour, its keys, and the id written into `owners` when it claims a step. */
  slot: number;
  /** The cast entry this seat plays (content/critters/index.ts). */
  def: CritterDef;
  /** Built once in enter(), never in draw(): the apron carries the slot colour. */
  rig: CritterRig;
  player: AnimPlayer;
  /** Name plate text. */
  name: string;
  /** Rows its tallest head part reaches above the skull (CROWN), for the name plate. */
  crown: number;
  /** px along the counter: the feet centre, clamped to X_MIN..X_MAX. */
  x: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  /** True on any frame its stick is off centre. */
  moving: boolean;
  /** The station it stands at (CHOP..PLATE_S), or -1 between them. */
  station: number;
  /** The animation name `pickAnim` last played. */
  anim: string;
  /** Frames left of the current reach / chop / stir beat. */
  actT: number;
  /** Frames left of the eat gag; the seat is locked while this runs. */
  eatT: number;
  /** Which ITEMS entry is in its paws ('knife' | 'spoon' | 'plate' | 'food'), '' for empty paws. */
  weapon: string;
  /** The drawRig options, reused every frame (this file allocates nothing in draw()). */
  opts: DrawRigOpts;
  /** Scratch for the screen-space head joint, refilled by jointScreen() every draw. */
  head: Point;
}

/** The current step's state (`st`), zeroed by completeStep() as the next step comes up. */
export interface StepState {
  /** 0 = waiting or paused, 1 = the MIX / STOVE / OVEN hold is running this frame. */
  phase: number;
  /** Frames the MIX / STOVE / OVEN hold has run for so far. */
  t: number;
  /** Chops landed on the board. */
  count: number;
}

export class KitchenScreen extends Screen {
  // The fields, for the checker only, in constructor then enter() order. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name (es2022 defines them before
  // the constructor body runs, and a screen's own declaration would also define a base field back to undefined),
  // and this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** One seat per party member, in party order (not slot order). */
  declare seats: Seat[];
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The room, pre-rendered once (art/backgrounds/kitchen.ts kitchenLayer) and blitted per frame. */
  declare layer: { canvas: HTMLCanvasElement; w: number; h: number };
  /** The order's steps as station indices (CHOP..PLATE_S), worked in this order. */
  declare steps: number[];
  /** Those steps' station names, one recipe-card row each. */
  declare stepNames: string[];
  /** 0..2 per step, -1 until the step has been scored. */
  declare scores: number[];
  /** The slot that owns each step, -1 until one claims it. */
  declare owners: number[];
  /** The order's ingredients as food glyph ids (art/food.ts), in order. */
  declare icons: string[];
  /** Those ingredients' base hexes, in the same order. */
  declare hexes: string[];
  /** Per-ingredient glyph and hex tables for the order ticket (game/ui.ts drawOrderTicket). */
  declare ticketOpts: OrderTicketOpts;
  /** Which stations this order uses, indexed by station: the stations that draw their per-frame marks. */
  declare has: boolean[];
  /** The step being worked: an index into `steps`, `steps.length` once every step is done. */
  declare stepIdx: number;
  /** The score banked so far, 0..2 per completed step. */
  declare total: number;
  /** The current step's state. */
  declare st: StepState;
  /** True from the bell to the results screen. */
  declare served: boolean;
  /** Frames since the bell (the components land, then the stamp slams). */
  declare serveT: number;
  /** 1..3, set by serve() from `total`. */
  declare stars: number;
  /** Frames of oven afterglow left, 0..60 (cosmetic). */
  declare ovenGlow: number;
  /** Frames left of the board's knife flash (cosmetic). */
  declare tak: number;
  /** Frames into the bell's ring, 0..60; -1 before it has rung (cosmetic). */
  declare ringT: number;
  /** The action key's label for the hint line (engine/input.ts keyText). */
  declare keyName: string;
  /** The customer leaning into the hatch: their rig, ... */
  declare custRig: Rig;
  /** ... the player driving their idle, ... */
  declare custPlayer: AnimPlayer;
  /** ... the pose the bust is anchored on (their idle's first frame), ... */
  declare custPose: PartialPose | null;
  /** ... and the drawBust options that face and inset them. */
  declare custOpts: { facing: number; margin: number };
  /** The hint line under the counter, rebuilt by setHint() as each step comes up. */
  declare hint: string;

  constructor(game: Game) { super(game, 'kitchen'); this.seats = []; this.fields = []; }

  override enter(params: ScreenParams): void {
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
    this.st = { phase: 0, t: 0, count: 0 };
    this.served = false; this.serveT = 0; this.stars = 0;
    this.ovenGlow = 0;
    this.tak = 0; this.ringT = -1;
    this.keyName = game.input.keyText(0, 'action');
    this.setHint();
    // the customer leaning into the hatch
    const cust = getCustomer(order.customer);
    this.custRig = critterRig(cust, -1); this.custPlayer = new AnimPlayer(cust.anims); this.custPlayer.play('idle');
    this.custPose = idlePoseOf(cust); this.custOpts = { facing: -1, margin: BUST.margin };
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

  setHint(): void {
    const id = this.stepIdx < this.steps.length ? STATIONS[this.steps[this.stepIdx]].id : 'plate';
    this.hint = `${HINTS[id]}   (${this.keyName})   WALK: ← →`;
  }

  override update(): void {
    super.update();
    const game = this.game, inp = game.input;
    if (inp.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    this.custPlayer.tick();
    if (this.tak > 0) this.tak--;
    if (this.ringT >= 0 && this.ringT < 60) this.ringT++;
    if (this.ovenGlow > 0 && !(this.currentStation() === OVEN_S && this.st.phase === 1)) this.ovenGlow--;
    this.updateSeats(inp);
    if (!this.served) this.stepStation(inp);
    else if (++this.serveT >= SERVE_FRAMES) { game.replace('results', { stars: this.stars, score: this.total }); return; }
    for (let i = 0; i < this.seats.length; i++) this.pickAnim(this.seats[i]);
  }

  currentStation(): number { return this.stepIdx < this.steps.length ? this.steps[this.stepIdx] : -1; }

  /** Every seat: read its stick, walk the lane, find the station it stands at, hold the item that station suggests. */
  updateSeats(inp: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.player.tick();
      if (s.actT > 0) s.actT--;
      // the gag locks the seat; on its last frame the ITEM goes with the state, or the reconcile below (guarded
      // by `want !== s.weapon`) leaves the apple in his paw for ever at any spot that suggests no item
      if (s.eatT > 0) { s.eatT--; s.moving = false; if (s.eatT === 0) this.clearItem(s); continue; }
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
      // `as RigWeapon`: content/critters/items.ts is not typed yet, so its `attach: 'handR'` widens to `string`
      // and its entries miss RigWeapon's `attach?: HandName` by that one field. The table IS a table of rig
      // weapons - rig.ts reads exactly these keys back off it - so the assertion says what items.ts cannot yet.
      if (want !== s.weapon) { if (!want) this.clearItem(s); else { s.weapon = want; s.rig.weapon = ITEMS[want] as RigWeapon; } }
    }
  }

  /** Empty a seat's paws: the state and the rig always go together (an item left on a rig never comes off). */
  clearItem(s: Seat): void { s.weapon = ''; s.rig.weapon = null; s.rig.heldIcon = null; s.rig.heldHex = null; }

  /** The seat driving the current step: its owner if it is at the station, else the first seat there that acts (and claims it). */
  actor(inp: Input, station: number, hold: boolean): Seat | null {
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
  stepStation(inp: Input): void {
    const station = this.currentStation(), st = this.st;
    if (station < 0) { this.serve(null); return; }
    const holdStation = station === MIX || station === STOVE || station === OVEN_S;
    const s = this.actor(inp, station, holdStation);
    const pressed = s ? inp.pressed(s.slot, 'action') : false, held = s ? inp.held(s.slot, 'action') : false;
    switch (station) {
      case CHOP:
        if (pressed) {
          st.count++; this.tak = 6; s.facing = 1; s.actT = CHOP_ANIM; this.playAnim(s, 'chop', true);
          ringAt(PROP_X[CHOP], ROWS.counterTop - 8, 3, 12, UI.cream, 2, 10, false, true);
          if (st.count >= CHOP_HITS) this.completeStep(2, s);
        }
        break;
      case MIX:
      case STOVE:
      case OVEN_S: {
        // one rule for the three holds: the bar runs while the button is down, pauses while it is up, and the step
        // is done the frame it fills. Nothing is lost by letting go.
        const need = station === MIX ? MIX_FRAMES : station === STOVE ? STOVE_FRAMES : OVEN_FRAMES;
        if (held) {
          st.phase = 1; st.t++; s.facing = 1; s.actT = 2;
          if (station === OVEN_S) this.ovenGlow = 60;
          if (st.t >= need) this.completeStep(2, s);
        } else st.phase = 0;
        break;
      }
      default:   // PLATE
        if (pressed) { s.actT = ACT_FRAMES; s.facing = 1; this.playAnim(s, 'reach', true); this.completeStep(2, s); this.serve(s); }
        break;
    }
  }

  /** Bank a step's score, say so over the station, roll the gag, move on. */
  completeStep(score: number, s: Seat | null): void {
    const idx = this.stepIdx, station = this.steps[idx];
    this.scores[idx] = score; this.total += score;
    const px = PROP_X[station], py = ROWS.counterTop - 40;
    if (score === 2) { floatText(px, py, PERFECT, UI.cream, 1, true); burstSparkle(px, py + 10, 5, UI.cream, true); }
    else floatText(px, py, DONE, UI.cream, 1, true);
    this.stepIdx++;
    this.st.phase = 0; this.st.t = 0; this.st.count = 0;
    this.setHint();
    // the hungry one: a seeded one-in-six bite on every completed step, whoever completed it
    for (let i = 0; i < this.seats.length; i++) {
      const b = this.seats[i];
      if (b.def.id !== 'barley' || b.eatT > 0) continue;
      if (!rng.chance(GAG_CHANCE)) continue;
      b.eatT = EAT_FRAMES; b.moving = false; b.weapon = 'food';
      b.rig.weapon = ITEMS.food as RigWeapon; b.rig.heldIcon = this.icons[0]; b.rig.heldHex = this.hexes[0];   // `as` for the same reason as in updateSeats
      this.playAnim(b, 'eat', true);
      burstCrumbs(b.x + b.facing * 8, ROWS.feet - 40, ROWS.feet, this.hexes[0], 6, true);
      floatText(b.x, ROWS.feet - 70, NOM, UI.cream, 1, true);
    }
    void s;
  }

  /** The bell: the dish is served, the stamp slams, results follow after the components have landed. */
  serve(s: Seat | null): void {
    if (this.served) return;
    this.served = true; this.serveT = 0; this.ringT = 0;
    const n = Math.max(1, this.steps.length);
    this.stars = Math.max(1, Math.min(3, R(this.total / (2 * n) * 3)));
    ringAt(BELL.x + BELL.w / 2, BELL.y + 4, 4, 22, UI.cream, 2, 16, false, true);
    void s;
  }

  playAnim(s: Seat, name: string, restart: boolean): void { s.anim = name; s.player.play(name, { restart, fallback: 'idle' }); }

  /** idle / walk / stir / reach / chop / eat by what the seat is doing; loops keep their phase, beats play out. */
  pickAnim(s: Seat): void {
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

  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame, st = this.st, station = this.currentStation();
    blitAt(ctx, this.layer, 0, 0);
    // the customer leans into the RIGHT half of the hatch, clipped to the opening so the shelf stays in front of
    // them and the cook plating at the shelf's left half is never drawn through them, AT THE CAST'S OWN 1x draw
    // scale (BUST.scale): one flat side-on shot may hold exactly one size of the face kit
    drawBust(ctx, this.custRig, this.custPlayer.pose, this.custPose, BUST.x, BUST.y, BUST.w, BUST.h, BUST.scale, this.custOpts);
    if (station >= 0 && !this.served) drawStationFocus(ctx, station, f);
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
    for (let i = this.seats.length - 1; i >= 0; i--) {
      const s = this.seats[i], py = R(s.head.y - s.rig.p.headR - s.crown) - 14;
      drawNamePlate(ctx, s.slot, s.name, R(s.head.x), py < PLATE_Y_MAX ? py : PLATE_Y_MAX);
    }
    if (!this.served) this.drawWidget(ctx, st, station);
    this.drawHud(ctx, f);
  }

  /** The per-frame marks on the stations: only the ones this order uses. */
  /** True once the step that uses station `k` has been scored. */
  done(k: number): boolean { for (let i = 0; i < this.steps.length; i++) if (this.steps[i] === k) return this.scores[i] >= 0; return false; }

  drawStations(ctx: CanvasRenderingContext2D, f: number, st: StepState, station: number): void {
    if (this.has[CHOP]) {
      const cut = this.done(CHOP) ? 2 : station === CHOP ? (st.count < 2 ? 0 : st.count < 4 ? 1 : 2) : 0;
      drawChopItem(ctx, this.icons[0], this.hexes[0], cut, 0, this.tak > 0);
    }
    if (this.has[MIX]) drawBowlContents(ctx, this.done(MIX) ? 1 : station === MIX ? st.t / MIX_FRAMES : 0);
    const stoveOn = station === STOVE || this.done(STOVE);
    drawStove(ctx, stoveOn, station === STOVE ? st.t / STOVE_FRAMES : 1, f);
    // the tray is in from the first frame of the bake; the glow follows the hold and lingers after it
    const baking = station === OVEN_S && st.t > 0;
    drawOvenWindow(ctx, baking ? st.t / OVEN_FRAMES : this.ovenGlow / 60, baking);
    const plated = this.served ? Math.min(this.icons.length, Math.floor(this.serveT / DROP_FRAMES) + 1) : 0;
    drawPlate(ctx, PLATE.x + 13, PLATE.y, this.icons, this.hexes, plated, plated > 0 && this.serveT % DROP_FRAMES < 3 ? 1.25 : 1);
    drawBellRing(ctx, this.ringT);
    drawKettleSteam(ctx, f);   // the room's pilot light: one plume that never stops, whatever the party is doing
  }

  /**
   * Whose colour the live timing tag wears: the seat that has claimed the step, or - before anyone has - the seat
   * standing at its station, so the card the player must act on carries a player colour from the first frame.
   */
  liveSlot(station: number): number {
    const o = this.stepIdx < this.owners.length ? this.owners[this.stepIdx] : -1;
    if (o >= 0) return o;
    for (let i = 0; i < this.seats.length; i++) if (this.seats[i].station === station) return this.seats[i].slot;
    return -1;
  }

  /** How many of a step's tag segments are lit: all when done, its progress while current, none before. */
  tagFill(i: number): number {
    const k = this.steps[i], segs = SEGS[k];
    if (this.scores[i] >= 0) return segs;
    if (i !== this.stepIdx) return 0;
    const st = this.st;
    if (k === CHOP) return st.count;
    if (k === MIX) return Math.floor(st.t * segs / MIX_FRAMES);
    if (k === STOVE) return Math.floor(st.t * segs / STOVE_FRAMES);
    if (k === OVEN_S) return Math.floor(st.t * segs / OVEN_FRAMES);
    return 0;
  }

  drawWidget(ctx: CanvasRenderingContext2D, st: StepState, station: number): void {
    const slot = this.liveSlot(station);
    if (station === CHOP) drawChopBar(ctx, st.count, CHOP_HITS, slot);
    else if (station === MIX) drawDial(ctx, st.t / MIX_FRAMES, st.phase === 0 && st.t > 0, slot);
    else if (station === STOVE) drawStoveBar(ctx, st.t / STOVE_FRAMES, slot);
    else if (station === OVEN_S) drawOvenTimer(ctx, st.t / OVEN_FRAMES, slot);
    else if (station === PLATE_S) drawPlatePrompt(ctx, RING, slot);
  }

  drawHud(ctx: CanvasRenderingContext2D, f: number): void {
    const run = this.game.run;
    drawOrderTicket(ctx, run, TICKET.x, TICKET.y, TICKET.w, drawFood, this.ticketOpts);
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
    drawHint(ctx, this.hint);
    if (this.served && this.serveT >= STAMP_AT) drawStamp(ctx, ORDER_UP, VIEW_W / 2, STAMP_Y, (this.serveT - STAMP_AT) / 24);
  }

  override summary() {
    return {
      step: this.stepIdx, steps: this.stepNames, scores: this.scores.slice(), owners: this.owners.slice(), total: this.total, stars: this.stars, served: this.served,
      phase: this.st.phase, t: this.st.t, count: this.st.count,
      seats: this.seats.map((s) => [s.slot, R(s.x), s.station, s.anim, s.eatT, s.rig.weapon ? 1 : 0]),
    };
  }

  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.stepIdx, this.total, this.st.phase, this.st.t, this.st.count, this.served ? 1 : 0, this.serveT, this.stars);
    for (let i = 0; i < this.steps.length; i++) f.push(this.scores[i], this.owners[i]);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.station, s.moving ? 1 : 0, s.actT, s.eatT); }
    return f;
  }
}
