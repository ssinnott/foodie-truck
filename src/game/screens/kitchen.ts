// KITCHEN - COOK (docs/GDD.md section 6; docs/ART_STYLE.md section 1 "Kitchen"). The truck's interior, side-on,
// camera locked: one critter per seat walks the counter between the six stations (content/places.js STATIONS) and
// the steps are worked IN ORDER. The first seat to interact at the current step's station owns it (its slot colour
// fills the paper tag over the station); its input alone drives the step:
//   FRIDGE one press per item the orders want, any rhythm: each tap pulls the next ingredient out of the door and
//          sends it flying along the counter to the station its dish uses next (a graphic, never a choice); the
//          last one closes the door
//   CHOP  ten presses (fifteen if anyone ordered EXTRA CRUNCHY), any rhythm: every tap is a chop
//   MIX   hold for 240 frames while a dial fills; letting go pauses it, and it picks up where it left off
//   STOVE hold for 240 frames while a bar fills; letting go pauses it the same way
//   OVEN  hold for 240 frames while the bake runs; letting go pauses it the same way
//   PLATE a press at the hatch rings the bell: ORDER UP!, and results serves the whole line
// THE WHOLE LINE IS COOKED AT THE SAME TIME. The kitchen is handed every order still waiting in the queue (`orders`,
// front first) and their steps are MERGED into one run of the counter (`mergeSteps`): the fridge once for every
// item of every order, then each station ONCE for every dish that uses it, then one bell that plates them all. Each
// dish keeps its own route through that run (`routes`), so the pie's apples go from the board to the bowl to the
// oven while the fish cakes beside them go from the bowl to the stove, and each lands on ITS OWN plate on the
// hatch shelf. The ticket on the rail lists every customer and what they ordered, and the whole queue crowds the
// hatch window, the front customer leaning in and the rest peering over their shoulder.
// THE FOOD MOVES DOWN THE LINE: every unit (one apple, one egg) is bound for exactly one step at a time (`uAt`).
// The fridge sends each to its dish's first cooking step, and the frame a step completes, everything at its station
// takes off on a stagger and arcs into the prop of the step ITS dish takes next (`flights`, kitchenProps.ts
// `intake`). A prop draws itself loaded only while some unit is in it. A graphic: no step waits for a landing.
// Every step completed is worth its full 2 (there is no way to burn, miss or spoil anything), so every dish is
// three stars: stars = max(1, round(its steps' total / (2 * its steps) * 3)). Barley's gag: on every completed
// step, a seeded one-in-six chance he eats an ingredient (crumbs, NOM, no score change) - and the first push of his
// stick or press of his button ends it, so the joke never holds a player up.
//
// Determinism (docs/ARCHITECTURE.md section 0): every sim field is an integer or a px/frame sum driven by seat input;
// the only random call is the gag, through `rng`; the steam, glow, rings, float text and the flights are cosmetic
// and stay out of checksumFields() (a flight is launched by a sim event and timed by an integer counter, so every
// peer draws the same one, but nothing reads it back). Rigs and the flight pool are built once, never in draw().
import { VIEW_W, UI, SIGNAL, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { CritterDef, Game, Input, Order, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt, INK } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstCrumbs, burstSparkle, burstSteam } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { DrawRigOpts, Rig, RigWeapon } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import type { PartialPose } from '../../lib/art/poses.ts';
import { drawBust, idlePoseOf } from '../../art/portraits.ts';
import { drawDish } from '../../art/dishes.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { STATIONS } from '../../content/places.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawNamePlate, drawHint, drawStamp, ROW } from '../ui.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { twistTag } from '../run.ts';
import { kitchenLayer, ROWS, BUST, STATION_X, PROP_X, AT_RANGE, X_MIN, X_MAX, TICKET, RECIPE } from '../../art/backgrounds/kitchen.ts';
import {
  PROPS, paintStations, drawStationFocus, drawChopItem, drawBowlContents, drawStove, drawOvenWindow, drawPlate, drawBellRing,
  drawFridge, drawPile, drawFlight, intake, drawPullBar, drawChopBar, drawDial, drawStoveBar, drawOvenTimer, drawPlatePrompt, drawTag, drawKettleSteam,
  PLATE, BELL, POT, OVEN, FRIDGE, BOARD,
} from '../../art/kitchenProps.ts';

/** The HOW TO PLAY card's pictograms per station (game/controlcard.ts): walk, then the station's own verb. */
const SCHEMES: Record<string, readonly CardScheme[]> = { fridge: ['move', 'mash'], chop: ['move', 'mash'], mix: ['move', 'hold'], stove: ['move', 'hold'], oven: ['move', 'hold'], plate: ['move', 'tap'] };
/** Where the HOW TO PLAY card rests in the kitchen: up on the rail between the two papers. */
const CARD_TOP_Y = 12;
const R = Math.round;
const FRIDGE_S = 0, CHOP = 1, MIX = 2, STOVE = 3, OVEN_S = 4, PLATE_S = 5;
const STATION_IDX = { fridge: FRIDGE_S, chop: CHOP, mix: MIX, stove: STOVE, oven: OVEN_S, plate: PLATE_S };
/** Walking: px/frame along the feet line. */
const SPEED = 2.0;
/** The steps' lengths (docs/GDD.md section 6): taps on the board, frames of holding everywhere else; the fridge
 *  takes as many taps as the orders have items. */
const CHOP_HITS = 10;
/** The door stands open this long after a pull. */
const DOOR_FRAMES = 30;
const MIX_FRAMES = 240;
const STOVE_FRAMES = 240;
const OVEN_FRAMES = 240;
/** A flight between two stations is FLY_FRAMES in the air; a batch takes off one unit every FLY_STAGGER frames.
 *  The pool holds every unit of a three-order line twice over, which is more than can ever be in the air. */
const FLY_FRAMES = 28, FLY_STAGGER = 3, FLY_POOL = 48;
/** A plate squashes for this long under a component that has just landed on it. */
const LAND_SQUASH = 3;
/** After the bell: the stamp slams, then results. */
const SERVE_FRAMES = 96, STAMP_AT = 40;
/** The plates on the hatch shelf, one per order: the front customer's where the plate always stood, the rest
 *  right of the bell, PASS_PITCH apart. */
const PASS_PITCH = 30;
/** The queue at the hatch: each customer behind the front one CROWD_DX further right and CROWD_DY higher, drawn
 *  first so they peer over the shoulder of the one in front. A queue of three moves the front one CROWD_DX left of
 *  the bust box, so the one at the back still has a face on screen. */
const CROWD_DX = 26, CROWD_DY = 6;
/** The sound each hold station makes while its button is down, and the frames between replays (by station). */
const HOLD_SOUND = { [MIX]: 'stir', [STOVE]: 'sizzle', [OVEN_S]: 'bake' };
const HOLD_SOUND_EVERY = { [MIX]: 14, [STOVE]: 18, [OVEN_S]: 24 };
/** The ORDER UP! stamp's resting row: the wall's clear band between the station signs (104..121) and the props
 *  that stand on the counter (156..200). At its old row 110 it printed straight across the MIX and STOVE signs. */
const STAMP_Y = 140;
/** The reach beat's hold, the eat gag's length, the chop anim's length. */
const ACT_FRAMES = 20, EAT_FRAMES = 42, CHOP_ANIM = 21, GAG_CHANCE = 1 / 6;
/**
 * The two beats for the crew who are not Barley (docs/CONTENT_ROADMAP.md section A), on the same seeded one-in-six
 * as the bite: the pot lid that rattles and lifts on its own for LID_FRAMES when a STOVE step completes, and the
 * cloud of flour out of the oven door when an OVEN step completes. Both are draw-side: nothing about them scores.
 */
const LID_FRAMES = 40, LID_STEAM_EVERY = 5, CLOUD_PUFFS = 14;
const POOF = 'POOF!';
/** Segments on each station's paper tag; the fridge's is the orders' own item count (`segs`). */
const SEGS = [1, CHOP_HITS, 4, 4, 4, 1];
/** Rows a critter's tallest head part reaches above its skull (ears, toque, sunhat), for the name plate. */
const CROWN = { barley: 6, sorrel: 20, chicory: 22, cress: 18, rowan: 18 };
/** The lowest row a name plate's top may take: the module's own contract is that nothing to read sits in rows
 *  156..200, where the pot, the bowl and the board's ingredient are. A tall crown lifts a plate above this. */
const PLATE_Y_MAX = 160;
const HINTS = { fridge: 'FRIDGE: TAP TO PULL IT ALL OUT', chop: 'CHOP: TAP OVER AND OVER', mix: 'MIX: HOLD TO STIR', stove: 'STOVE: HOLD TO COOK', oven: 'OVEN: HOLD TO BAKE', plate: 'PLATE: RING THE BELL' };
const PERFECT = 'PERFECT!', DONE = 'DONE', NOM = 'NOM', ORDER_UP = 'ORDER UP!', RING = 'RING!';
const CARD_X = RECIPE.x, CARD_Y = RECIPE.y, CARD_W = RECIPE.w;
// the recipe card is the SMALLER paper: it hangs below the rail on two strings and carries no perforated top, so
// it never reads as the order ticket's twin at the other end of the same rail (the two papers used to match)
const CARD_TEXT = { size: 1, color: UI.ink, shadow: false }, CARD_OPTS = { title: 'RECIPE', perforated: false };
/** The orders ticket: two rows per customer (their dish's picture and their name, then the dish), and the dish
 *  glyph's size. A tick goes on a customer's dish row once their plate is dished. */
const TICKET_TEXT = { size: 1, color: UI.ink, shadow: false }, TICKET_GLYPH_S = 3;
/** The empty ingredient table a dished plate is drawn with: the dish is the picture, not a stack. */
const NO_ICONS: string[] = [];

/**
 * THE MERGED RUN OF THE COUNTER: every order's own steps (as station indices) laid into one sequence that keeps
 * each order's steps in that order's own order, each station appearing once wherever the orders allow it. At each
 * turn the candidates are the next step of every order; the one taken is the lowest station that no order still
 * wants LATER than its next step (so taking it now never puts it before something an order needs first). Only if
 * every candidate is wanted later by someone - two orders that want two stations in opposite orders - is the lowest
 * taken anyway, and the station comes round a second time for the order that needed it after.
 */
export function mergeSteps(routes: readonly (readonly number[])[]): number[] {
  const pos = routes.map(() => 0), out: number[] = [];
  for (let guard = 0; guard < 64; guard++) {
    let pick = -1, fallback = -1;
    for (let r = 0; r < routes.length; r++) {
      if (pos[r] >= routes[r].length) continue;
      const h = routes[r][pos[r]];
      if (fallback < 0 || h < fallback) fallback = h;
      let later = false;
      for (let q = 0; q < routes.length && !later; q++) for (let k = pos[q] + 1; k < routes[q].length; k++) if (routes[q][k] === h) { later = true; break; }
      if (!later && (pick < 0 || h < pick)) pick = h;
    }
    if (fallback < 0) break;
    if (pick < 0) pick = fallback;
    out.push(pick);
    for (let r = 0; r < routes.length; r++) if (pos[r] < routes[r].length && routes[r][pos[r]] === pick) pos[r]++;
  }
  return out;
}

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
  /** Frames left of the eat gag; any input from the seat ends it early. */
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

/**
 * One item on its way between two stations: a slot of the pool `fly()` fills and `stepFlights()` lands. Cosmetic
 * (never checksummed), but timed by an integer counter so every peer draws the same arc.
 */
export interface Flight {
  /** False while the slot is free. */
  active: boolean;
  /** Index into `pullIcons` / `pullHexes`: which unit of which order this is. */
  unit: number;
  /** Where it took off from and where it lands (kitchenProps.ts `intake`). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Frames since take-off; negative while it waits its turn on the batch's stagger. Lands at FLY_FRAMES. */
  t: number;
  /** The STATION it took off from, so that station's prop stays loaded while it waits its turn. */
  from: number;
  /** The STEP it lands at (an index into `steps`): it is counted in only if the unit is still bound there. */
  dest: number;
}

/** One customer at the hatch window: their rig, the player driving their idle, and the pose the bust anchors on. */
export interface HatchCustomer {
  rig: Rig;
  player: AnimPlayer;
  pose: PartialPose | null;
  opts: { facing: number; margin: number };
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
  /** The flight pool, FLY_POOL slots built once in the constructor and reused in place. */
  declare flights: Flight[];
  /** Scratch for the intake points, refilled by fly(); never reallocated. */
  declare pt: Point;
  /** The room, pre-rendered once (art/backgrounds/kitchen.ts kitchenLayer) and blitted per frame. */
  declare layer: { canvas: HTMLCanvasElement; w: number; h: number };
  /** Every order still waiting in the line, front first: all of them are cooked at the same time. */
  declare orders: Order[];
  /** The merged run of the counter (mergeSteps): station indices (FRIDGE_S..PLATE_S), worked in this order. */
  declare steps: number[];
  /** Those steps' station names, one recipe-card row each. */
  declare stepNames: string[];
  /** Per order: the indices into `steps` its own recipe takes, in order (the fridge first, the plate last). */
  declare routes: number[][];
  /** 0..2 per step, -1 until the step has been scored. */
  declare scores: number[];
  /** The slot that owns each step, -1 until one claims it. */
  declare owners: number[];
  /** Per order: its ingredients as food glyph ids (art/food.ts) and their base hexes, in `needs` order. */
  declare dishIcons: string[][];
  declare dishHexes: string[][];
  /** Every ITEM every order wants, one entry per unit (four apples, two eggs), order by order: what comes out of
   *  the fridge, in that order. */
  declare pullIcons: string[];
  declare pullHexes: string[];
  /** Which order each unit belongs to, and which of that order's `needs` it is (its plate stacks by this). */
  declare unitOrder: number[];
  declare unitDish: number[];
  /** Per order: the first unit of each of its `needs` entries (a component is on the plate once that unit is). */
  declare dishFirst: number[][];
  /** Per unit: the step it is at or on its way to (-1 while it is still in the fridge), and 1 once it has landed. */
  declare uAt: number[];
  declare uIn: number[];
  /** Per unit: its place among the things sent to its step (0 is ON the board; the rest pile up beside it). */
  declare uRank: number[];
  /** Per step: how many units have been sent to it so far (a unit's place on the board or in the pile). */
  declare arrivals: number[];
  /** The board's items in the order they were sent to it: unit 0 goes ON the board, the rest pile up beside it. */
  declare boardIcons: string[];
  declare boardHexes: string[];
  /** How many items have been pulled out of the fridge so far (0..pullIcons.length). */
  declare pulled: number;
  /** Frames since the last pull (the door's swing is timed off it); large when idle. */
  declare pullT: number;
  /** Frames since a unit last landed on a plate (the squash), capped, and which order's plate it was. */
  declare landT: number;
  declare landOrder: number;
  /** The step being worked: an index into `steps`, `steps.length` once every step is done. */
  declare stepIdx: number;
  /** The score banked so far, 0..2 per completed step. */
  declare total: number;
  /** The current step's state. */
  declare st: StepState;
  /** Taps the CHOP step takes: the most any order asks for (EXTRA CRUNCHY is more). */
  declare chops: number;
  /** Frames left of the pot lid rattling; and the two gags' counts, for the tests. */
  declare lidT: number;
  declare lids: number;
  declare poofs: number;
  /** True from the bell to the results screen. */
  declare served: boolean;
  /** Frames since the bell (the components land, then the stamp slams). */
  declare serveT: number;
  /** Per order, 1..3, set by serve() from the scores on its route; and their average, for the summary. */
  declare dishStars: number[];
  declare stars: number;
  /** Frames of oven afterglow left, 0..60 (cosmetic). */
  declare ovenGlow: number;
  /** Frames left of the board's knife flash (cosmetic). */
  declare tak: number;
  /** Frames into the bell's ring, 0..60; -1 before it has rung (cosmetic). */
  declare ringT: number;
  /** The action key's label for the hint line (engine/input.ts keyText). */
  declare keyName: string;
  /** The whole queue at the hatch window, front first. */
  declare custs: HatchCustomer[];
  /** The orders ticket: its title, one name row and one dish row per customer, and its width. */
  declare ticketTitle: string;
  declare ticketNames: string[];
  declare ticketDishes: string[];
  declare ticketW: number;
  /** The x each order's plate stands at on the hatch shelf. */
  declare plateX: number[];
  /** The hint line under the counter, rebuilt by setHint() as each step comes up. */
  declare hint: string;
  /** The frame the current step came up on: the HOW TO PLAY card is raised again for every step. */
  declare stepFrame: number;
  /** The card's pictograms for the current step. */
  declare schemes: readonly CardScheme[];

  constructor(game: Game) {
    super(game, 'kitchen'); this.seats = []; this.fields = [];
    this.flights = [];
    for (let i = 0; i < FLY_POOL; i++) this.flights.push({ active: false, unit: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, from: 0, dest: -1 });
    this.pt = { x: 0, y: 0 };
  }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layer = kitchenLayer(paintStations);
    particles.clear();
    // the orders: everyone still waiting in the line, front first, all cooked at once
    this.orders = [];
    const ln = run.lines[run.line];
    if (ln) for (let k = run.customer; k < ln.customers.length; k++) this.orders.push(run.orderFor(k));
    if (!this.orders.length) this.orders.push(run.order);
    run.order = this.orders[0];
    // the merged run of the counter, and each order's own route through it
    const own = this.orders.map((o) => o.steps.map((id) => STATION_IDX[id] != null ? STATION_IDX[id] : PLATE_S));
    this.steps = mergeSteps(own);
    this.routes = own.map((r) => { const out: number[] = []; let p = 0; for (let i = 0; i < this.steps.length && p < r.length; i++) if (this.steps[i] === r[p]) { out.push(i); p++; } return out; });
    this.stepNames = this.steps.map((k) => STATIONS[k].name);
    this.scores = this.steps.map(() => -1);
    this.owners = this.steps.map(() => -1);
    this.chops = CHOP_HITS;
    for (const o of this.orders) if (o.steps.indexOf('chop') >= 0 && (o.chops || CHOP_HITS) > this.chops) this.chops = o.chops;
    this.lidT = 0; this.lids = 0; this.poofs = 0;
    // what the fridge holds: one entry per unit, order by order, each order's in its own order
    this.dishIcons = []; this.dishHexes = []; this.dishFirst = [];
    this.pullIcons = []; this.pullHexes = []; this.unitOrder = []; this.unitDish = []; this.uAt = []; this.uIn = []; this.uRank = [];
    for (let d = 0; d < this.orders.length; d++) {
      const needs = this.orders[d].needs, first: number[] = [];
      this.dishIcons.push(needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).icon));
      this.dishHexes.push(needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).hex));
      for (let i = 0; i < needs.length; i++) {
        first.push(this.pullIcons.length);
        for (let k = 0; k < needs[i].amount; k++) {
          this.pullIcons.push(this.dishIcons[d][i]); this.pullHexes.push(this.dishHexes[d][i]);
          this.unitOrder.push(d); this.unitDish.push(i); this.uAt.push(-1); this.uIn.push(0); this.uRank.push(0);
        }
      }
      this.dishFirst.push(first);
    }
    this.arrivals = this.steps.map(() => 0); this.boardIcons = []; this.boardHexes = [];
    this.pulled = 0; this.pullT = DOOR_FRAMES;
    for (const fl of this.flights) fl.active = false;
    this.landT = LAND_SQUASH; this.landOrder = -1;
    this.stepIdx = 0; this.total = 0;
    this.st = { phase: 0, t: 0, count: 0 };
    this.served = false; this.serveT = 0; this.dishStars = []; this.stars = 0;
    this.ovenGlow = 0;
    this.tak = 0; this.ringT = -1;
    this.keyName = game.input.keyText(0, 'action');
    // the whole queue at the hatch window, front first
    this.custs = this.orders.map((o) => {
      const def = getCustomer(o.customer), player = new AnimPlayer(def.anims);
      player.play('idle');
      return { rig: critterRig(def, -1), player, pose: idlePoseOf(def), opts: { facing: -1, margin: BUST.margin } };
    });
    for (let i = 1; i < this.custs.length; i++) for (let t = 0; t < i * 13; t++) this.custs[i].player.tick();
    // the ticket: every customer and what they ordered (with a twist's tag), sized to its longest row
    this.ticketTitle = this.orders.length > 1 ? `${this.orders.length} ORDERS` : 'ORDER';
    this.ticketNames = this.orders.map((o) => getCustomer(o.customer).name);
    this.ticketDishes = this.orders.map((o) => o.dish + twistTag(o));
    let tw = 0;
    for (let d = 0; d < this.orders.length; d++) tw = Math.max(tw, measureText(this.ticketNames[d], 1), measureText(this.ticketDishes[d], 1));
    this.ticketW = Math.max(TICKET.w, tw + 46);
    this.plateX = this.orders.map((_, d) => d === 0 ? PLATE.x + 13 : BELL.x + BELL.w + 14 + (d - 1) * PASS_PITCH);
    this.setHint();
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
    this.schemes = SCHEMES[id] || SCHEMES.plate;
    this.stepFrame = this.frame;
  }

  override update(): void {
    super.update();
    const game = this.game, inp = game.input;
    if (inp.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    if (this.lidT > 0) { if (--this.lidT % LID_STEAM_EVERY === 0) particles.spawn('steam', PROP_X[STOVE] + ((this.lidT >> 2) & 1 ? 8 : -8), ROWS.counterTop - 40, { screen: true }); }
    this.stepFlights();
    for (const c of this.custs) c.player.tick();
    if (this.tak > 0) this.tak--;
    if (this.pullT < DOOR_FRAMES) this.pullT++;
    if (this.ringT >= 0 && this.ringT < 60) this.ringT++;
    if (this.ovenGlow > 0 && !(this.currentStation() === OVEN_S && this.st.phase === 1)) this.ovenGlow--;
    this.updateSeats(inp);
    if (!this.served) this.stepStation(inp);
    // the whole line is cooked and plated: results hands every dish out at once
    else if (++this.serveT >= SERVE_FRAMES) { game.replace('results', { stars: this.dishStars.slice(), score: this.total }); return; }
    for (let i = 0; i < this.seats.length; i++) this.pickAnim(this.seats[i]);
  }

  currentStation(): number { return this.stepIdx < this.steps.length ? this.steps[this.stepIdx] : -1; }

  /** Every seat: read its stick, walk the lane, find the station it stands at, hold the item that station suggests. */
  updateSeats(inp: Input): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.player.tick();
      if (s.actT > 0) s.actT--;
      const ax = inp.axisX(s.slot);
      s.moving = ax !== 0;
      // the gag plays out on its own unless the seat does anything at all, in which case it is over this frame: a
      // joke that held a player still was the one thing left in the game that could get in a player's way. On its
      // last frame the ITEM goes with the state, or the reconcile below (guarded by `want !== s.weapon`) leaves the
      // apple in his paw for ever at any spot that suggests no item
      if (s.eatT > 0) {
        if (s.moving || inp.pressed(s.slot, 'action')) { s.eatT = 0; this.clearItem(s); }
        else { s.eatT--; if (s.eatT === 0) this.clearItem(s); continue; }
      }
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
    const station = this.currentStation(), st = this.st, audio = this.game.audio;
    if (station < 0) { this.serve(null); return; }
    const holdStation = station === MIX || station === STOVE || station === OVEN_S;
    const s = this.actor(inp, station, holdStation);
    const pressed = s ? inp.pressed(s.slot, 'action') : false, held = s ? inp.held(s.slot, 'action') : false;
    switch (station) {
      case FRIDGE_S:
        // one item out per tap, every order's items in line order; the door swings, the item arcs along the counter
        // into the first cooking step ITS dish takes
        if (pressed) {
          st.count++; this.pullT = 0;
          if (this.pulled < this.pullIcons.length) { this.moveOn(this.pulled, 0, FRIDGE_S, 0); this.pulled++; }
          s.facing = 1; s.actT = ACT_FRAMES; this.playAnim(s, 'reach', true);
          ringAt(FRIDGE.x + FRIDGE.w / 2, FRIDGE.doorY + 20, 3, 12, UI.cream, 2, 10, false, true);
          audio.play('fridge');
          if (st.count >= this.segs(FRIDGE_S)) this.completeStep(2, s);
        }
        break;
      case CHOP:
        if (pressed) {
          st.count++; this.tak = 6; s.facing = 1; s.actT = CHOP_ANIM; this.playAnim(s, 'chop', true);
          ringAt(PROP_X[CHOP], ROWS.counterTop - 8, 3, 12, UI.cream, 2, 10, false, true);
          audio.play('chop');
          if (st.count >= this.chops) this.completeStep(2, s);
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
          // the station's own noise, replayed on a period of its own while the button is down
          if (st.t % HOLD_SOUND_EVERY[station] === 1) audio.play(HOLD_SOUND[station]);
          if (st.t >= need) this.completeStep(2, s);
        } else st.phase = 0;
        break;
      }
      default:   // PLATE
        if (pressed) { s.actT = ACT_FRAMES; s.facing = 1; this.playAnim(s, 'reach', true); this.completeStep(2, s); this.serve(s); }
        break;
    }
  }

  /** How many segments a station's tag and tally carry: the fridge's is every order's item count, the rest are fixed. */
  segs(k: number): number { return k === FRIDGE_S ? Math.max(1, this.pullIcons.length) : k === CHOP ? this.chops : SEGS[k]; }

  /** Bank a step's score, say so over the station, roll the gag, move on. */
  completeStep(score: number, s: Seat | null): void {
    const idx = this.stepIdx, station = this.steps[idx];
    this.scores[idx] = score; this.total += score;
    const px = PROP_X[station], py = ROWS.counterTop - 40;
    if (score === 2) { floatText(px, py, PERFECT, UI.cream, 1, true); burstSparkle(px, py + 10, 5, UI.cream, true); this.game.audio.play('perfect'); }
    else { floatText(px, py, DONE, UI.cream, 1, true); this.game.audio.play('done'); }
    this.stepIdx++;
    this.st.phase = 0; this.st.t = 0; this.st.count = 0;
    this.setHint();
    // the food moves on: everything at this station takes off for the step ITS dish takes next (the fridge's items
    // are already on their way, one per tap, and the plates are the end of the line)
    if (station !== FRIDGE_S && station !== PLATE_S) this.launchFrom(idx);
    // the room's own two jokes, one in six each: the pot lid rattles after a stove step, a cloud of flour comes out
    // of the oven after an oven step (the roll is made whether or not it lands, so every peer draws the same day)
    if (station === STOVE && rng.chance(GAG_CHANCE)) { this.lidT = LID_FRAMES; this.lids++; this.game.audio.play('rattle'); }
    if (station === OVEN_S && rng.chance(GAG_CHANCE)) {
      this.poofs++;
      particles.burst('dust', PROP_X[OVEN_S], ROWS.counterTop - 20, CLOUD_PUFFS, { color: UI.cream, speed: 1.6, up: 1.2, size: 4, life: 36, gravity: -0.01, screen: true });
      floatText(PROP_X[OVEN_S], ROWS.counterTop - 56, POOF, UI.cream, 1, true);
      this.game.audio.play('poof');
    }
    // the hungry one: a seeded one-in-six bite on every completed step, whoever completed it
    for (let i = 0; i < this.seats.length; i++) {
      const b = this.seats[i];
      if (b.def.id !== 'barley' || b.eatT > 0) continue;
      if (!rng.chance(GAG_CHANCE)) continue;
      b.eatT = EAT_FRAMES; b.weapon = 'food';
      b.rig.weapon = ITEMS.food as RigWeapon; b.rig.heldIcon = this.pullIcons[0]; b.rig.heldHex = this.pullHexes[0];   // `as` for the same reason as in updateSeats
      this.playAnim(b, 'eat', true);
      burstCrumbs(b.x + b.facing * 8, ROWS.feet - 40, ROWS.feet, this.pullHexes[0], 6, true);
      floatText(b.x, ROWS.feet - 70, NOM, UI.cream, 1, true);
      this.game.audio.play('nom', { delay: 0.25 });
    }
    void s;
  }

  /** The bell: every dish is served, each rated on its own route's steps; the stamp slams, then results. */
  serve(s: Seat | null): void {
    if (this.served) return;
    this.served = true; this.serveT = 0; this.ringT = 0;
    this.dishStars = this.routes.map((route) => {
      let t = 0; for (const i of route) t += Math.max(0, this.scores[i]);
      return Math.max(1, Math.min(3, R(t / (2 * Math.max(1, route.length)) * 3)));
    });
    let sum = 0; for (const v of this.dishStars) sum += v;
    this.stars = Math.max(1, Math.min(3, R(sum / this.dishStars.length)));
    ringAt(BELL.x + BELL.w / 2, BELL.y + 4, 4, 22, UI.cream, 2, 16, false, true);
    this.game.audio.play('bell');
    this.game.audio.play('stamp', { delay: STAMP_AT / 60 });
    void s;
  }

  /**
   * Send unit `u` on from the step it is at (`fromIdx`, or 0 for the fridge) to the step its dish takes next, after
   * `delay` frames. A unit whose dish has no next step (never, in practice: the plate is last) stays where it is.
   */
  moveOn(u: number, fromIdx: number, fromStation: number, delay: number): void {
    const route = this.routes[this.unitOrder[u]];
    let next = -1;
    for (let k = 0; k < route.length; k++) if (route[k] > fromIdx) { next = route[k]; break; }
    if (next < 0) return;
    const fromRank = this.uRank[u], rank = this.arrivals[next]++;
    this.uAt[u] = next; this.uIn[u] = 0; this.uRank[u] = rank;
    if (this.steps[next] === CHOP) { this.boardIcons[rank] = this.pullIcons[u]; this.boardHexes[rank] = this.pullHexes[u]; }
    this.fly(u, fromStation, fromRank, next, rank, delay);
  }

  /** Everything bound for step `idx` takes off for the step its own dish takes next, one unit every FLY_STAGGER frames. */
  launchFrom(idx: number): void {
    const station = this.steps[idx];
    let k = 0;
    for (let u = 0; u < this.uAt.length; u++) if (this.uAt[u] === idx) this.moveOn(u, idx, station, (k++) * FLY_STAGGER);
    // the board is wiped clean: a few bits of the ingredient hop on it as the dice leave
    if (station === CHOP && k > 0) burstCrumbs(PROP_X[CHOP], BOARD.y - 6, BOARD.y - 1, this.boardHexes[0], 4, true);
  }

  /** Put unit `u` in the air from its place at station `from` to step `dest`'s intake, the `rank`-th thing sent there. */
  fly(u: number, from: number, fromRank: number, dest: number, rank: number, delay: number): void {
    let fl: Flight | null = null;
    for (const f of this.flights) if (f.active && f.unit === u) { fl = f; break; }   // a unit re-sent before it landed
    if (!fl) for (const f of this.flights) if (!f.active) { fl = f; break; }
    if (!fl) { fl = this.flights[0]; this.land(fl); }   // never in practice (FLY_POOL); the oldest lands early
    const p = this.pt, to = this.steps[dest], d = this.unitOrder[u];
    intake(from, fromRank, this.unitDish[u], p); fl.x0 = p.x; fl.y0 = p.y;
    intake(to, rank, this.unitDish[u], p);
    // each order's components stack on its own plate
    if (to === PLATE_S) p.x += this.plateX[d] - (PLATE.x + 13);
    fl.x1 = p.x; fl.y1 = p.y;
    fl.active = true; fl.unit = u; fl.t = -delay; fl.from = from; fl.dest = dest;
  }

  /** Advance every flight a frame; the ones that reach FLY_FRAMES land. */
  stepFlights(): void {
    for (const fl of this.flights) {
      if (!fl.active) continue;
      if (++fl.t >= FLY_FRAMES) this.land(fl);
    }
    if (this.landT < LAND_SQUASH) this.landT++;
  }

  /** A unit lands: it joins what is at its step (if it is still bound there), with a ring, and a puff of steam off
   *  the pot. The last one onto a plate turns that plate's stack into the finished dish, with a sparkle. */
  land(fl: Flight): void {
    fl.active = false;
    const u = fl.unit;
    if (this.uAt[u] === fl.dest) {
      this.uIn[u] = 1;
      if (this.steps[fl.dest] === PLATE_S) { const d = this.unitOrder[u]; this.landT = 0; this.landOrder = d; if (this.dished(d)) burstSparkle(fl.x1, fl.y1 - 6, 6, UI.cream, true); }
    }
    ringAt(fl.x1, fl.y1, 2, 9, UI.cream, 2, 10, false, true);
    if (this.steps[fl.dest] === STOVE) burstSteam(fl.x1, fl.y1 - 4, 2, true);
  }

  /** How many units have landed at station `k` and are still there. */
  landedAt(k: number): number { let n = 0; for (let u = 0; u < this.uAt.length; u++) if (this.uIn[u] && this.uAt[u] >= 0 && this.steps[this.uAt[u]] === k) n++; return n; }

  /** True once every unit of order `d` is on its plate: it is the dish now, not a stack of what went into it. */
  dished(d: number): boolean {
    for (let u = 0; u < this.uAt.length; u++) if (this.unitOrder[u] === d && !(this.uIn[u] && this.steps[this.uAt[u]] === PLATE_S)) return false;
    return true;
  }

  /** True while station `k`'s prop has food in it: something landed there, or something still waiting to leave it. */
  loaded(k: number): boolean {
    if (this.landedAt(k) > 0) return true;
    for (const fl of this.flights) if (fl.active && fl.t < 0 && fl.from === k) return true;
    return false;
  }

  /** The hex of the first thing in the pot, for the colour over its rim (null = an empty pot). */
  potHex(): string | null {
    for (let u = 0; u < this.uAt.length; u++) if (this.uIn[u] && this.uAt[u] >= 0 && this.steps[this.uAt[u]] === STOVE) return this.pullHexes[u];
    return null;
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
    // the queue crowds the RIGHT half of the hatch, clipped to the opening so the shelf stays in front of them and
    // the cook plating at the shelf's left half is never drawn through them, AT THE CAST'S OWN 1x draw scale
    // (BUST.scale): the ones behind first, a little further along and higher, peering over the front one's shoulder
    for (let i = this.custs.length - 1; i >= 0; i--) {
      const c = this.custs[i];
      const dx = (i - Math.max(0, this.custs.length - 2)) * CROWD_DX;
      drawBust(ctx, c.rig, c.player.pose, c.pose, BUST.x + dx, BUST.y - i * CROWD_DY, BUST.w, BUST.h + i * CROWD_DY, BUST.scale, c.opts);
    }
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
    this.drawFlights(ctx);   // over the cooks: a tossed apple crosses in front of whoever is at the counter
    particles.draw(ctx, null, 'front');
    for (let i = 0; i < this.steps.length; i++) drawTag(ctx, this.steps[i], this.owners[i], this.segs(this.steps[i]), this.tagFill(i));
    for (let i = this.seats.length - 1; i >= 0; i--) {
      const s = this.seats[i], py = R(s.head.y - s.rig.p.headR - s.crown) - 14;
      drawNamePlate(ctx, s.slot, s.name, R(s.head.x), py < PLATE_Y_MAX ? py : PLATE_Y_MAX);
    }
    if (!this.served) this.drawWidget(ctx, st, station);
    this.drawHud(ctx, f);
    // between the order ticket and the recipe card, clear of the station signs the player is about to read
    if (!this.served) drawControlCard(ctx, f, f - this.stepFrame, this.schemes, this.keyName, CARD_TOP_Y);
  }

  /** The pot lid, rattling: an inked enamel disc over the pot that hops on alternate frames, steam getting out under it. */
  drawLid(ctx: CanvasRenderingContext2D, f: number): void {
    const x = PROP_X[STOVE], y = ROWS.counterTop - 42, up = ((f >> 1) & 1) ? 5 : 1;
    ctx.beginPath(); ctx.ellipse(x, y - up, 20, 5, 0, 0, Math.PI * 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.enamel; ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(x - 2, y - up - 6, 4, 3);
  }

  /** True once a step at station `k` has been scored and none still to come is at `k`. */
  done(k: number): boolean {
    let seen = false;
    for (let i = 0; i < this.steps.length; i++) if (this.steps[i] === k) { if (this.scores[i] < 0) return false; seen = true; }
    return seen;
  }

  /** The per-frame marks on the stations: only the ones the orders use. */
  drawStations(ctx: CanvasRenderingContext2D, f: number, st: StepState, station: number): void {
    // the fridge: the door open for a beat after each pull
    drawFridge(ctx, DOOR_FRAMES - this.pullT, this.pullIcons, this.pullHexes, this.pulled);
    // the board: the first thing sent to it ON it, whole then halves then dice as the chops land, and the rest piled
    // beside it - while it is here. The last chop clears it
    const onBoard = this.landedAt(CHOP);
    if (onBoard > 0 && this.boardIcons.length) {
      const cut = station === CHOP ? (st.count < 2 ? 0 : st.count < 4 ? 1 : 2) : 0;
      drawChopItem(ctx, this.boardIcons[0], this.boardHexes[0], cut, 0, this.tak > 0);
      drawPile(ctx, this.boardIcons, this.boardHexes, onBoard);
    }
    // the bowl: lumps once something has dropped in, the stir's own progress while it runs, empty once it has gone
    const mixFill = !this.loaded(MIX) ? 0 : station === MIX ? Math.max(0.1, st.t / MIX_FRAMES) : this.done(MIX) ? 1 : 0.1;
    drawBowlContents(ctx, mixFill);
    const stoveOn = station === STOVE || this.done(STOVE);
    drawStove(ctx, stoveOn, station === STOVE ? st.t / STOVE_FRAMES : 1, f, this.potHex());
    // the tray is in the window while anything is in the oven; the glow follows the hold and lingers after it
    const baking = station === OVEN_S && st.t > 0;
    drawOvenWindow(ctx, baking ? st.t / OVEN_FRAMES : this.ovenGlow / 60, this.loaded(OVEN_S));
    // the plates, one per order along the hatch shelf: a component is on one once the first unit of that ingredient
    // has landed there, and the whole order landed is the finished dish itself (art/dishes.ts)
    for (let d = 0; d < this.orders.length; d++) {
      let plated = 0;
      const firsts = this.dishFirst[d];
      for (let j = 0; j < firsts.length; j++) { const u = firsts[j]; if (this.uIn[u] && this.steps[this.uAt[u]] === PLATE_S) plated++; }
      const squash = plated > 0 && this.landOrder === d && this.landT < LAND_SQUASH ? 1.25 : 1;
      drawPlate(ctx, this.plateX[d], PLATE.y, this.dishIcons[d], this.dishHexes[d], plated, squash, this.dished(d) ? this.orders[d].id : null);
    }
    drawBellRing(ctx, this.ringT);
    drawKettleSteam(ctx, f);   // the room's pilot light: one plume that never stops, whatever the party is doing
    if (this.lidT > 0) this.drawLid(ctx, f);
  }

  /** Every unit in the air on its arc; the ones still waiting their turn off the board sit where they were. */
  drawFlights(ctx: CanvasRenderingContext2D): void {
    for (const fl of this.flights) {
      if (!fl.active) continue;
      if (fl.t < 0) { if (fl.from === CHOP) drawFlight(ctx, this.pullIcons[fl.unit], this.pullHexes[fl.unit], fl.x0, fl.y0, fl.x1, fl.y1, 0); continue; }
      drawFlight(ctx, this.pullIcons[fl.unit], this.pullHexes[fl.unit], fl.x0, fl.y0, fl.x1, fl.y1, fl.t / FLY_FRAMES);
    }
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
    const k = this.steps[i], segs = this.segs(k);
    if (this.scores[i] >= 0) return segs;
    if (i !== this.stepIdx) return 0;
    const st = this.st;
    if (k === CHOP || k === FRIDGE_S) return st.count;
    if (k === MIX) return Math.floor(st.t * segs / MIX_FRAMES);
    if (k === STOVE) return Math.floor(st.t * segs / STOVE_FRAMES);
    if (k === OVEN_S) return Math.floor(st.t * segs / OVEN_FRAMES);
    return 0;
  }

  drawWidget(ctx: CanvasRenderingContext2D, st: StepState, station: number): void {
    const slot = this.liveSlot(station);
    if (station === FRIDGE_S) drawPullBar(ctx, st.count, this.segs(FRIDGE_S), slot);
    else if (station === CHOP) drawChopBar(ctx, st.count, this.chops, slot);
    else if (station === MIX) drawDial(ctx, st.t / MIX_FRAMES, st.phase === 0 && st.t > 0, slot);
    else if (station === STOVE) drawStoveBar(ctx, st.t / STOVE_FRAMES, slot);
    else if (station === OVEN_S) drawOvenTimer(ctx, st.t / OVEN_FRAMES, slot);
    else if (station === PLATE_S) drawPlatePrompt(ctx, RING, slot);
  }

  drawHud(ctx: CanvasRenderingContext2D, f: number): void {
    this.drawOrders(ctx);
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

  /** The orders ticket on the rail: every customer in the line, front first - their dish's picture and their name,
   *  then what they ordered - with an ink tick on the dish row once their plate is dished. */
  drawOrders(ctx: CanvasRenderingContext2D): void {
    const x = TICKET.x, w = this.ticketW, n = this.orders.length, h = 16 + ROW * 2 * n + 4;
    const top = drawTicket(ctx, x, TICKET.y, w, h, { title: this.ticketTitle });
    for (let d = 0; d < n; d++) {
      const ry = top + 2 + ROW * 2 * d;
      if (d > 0) { ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 4, ry - 2, w - 8, 1); }
      drawDish(ctx, this.orders[d].id, x + 12, ry + 6, TICKET_GLYPH_S);
      drawText(ctx, this.ticketNames[d], x + 24, ry, TICKET_TEXT);
      drawText(ctx, this.ticketDishes[d], x + 24, ry + ROW, TICKET_TEXT);
      if (this.dished(d)) { const ty = ry + ROW; ctx.fillStyle = UI.ink; ctx.fillRect(x + w - 14, ty + 3, 2, 3); ctx.fillRect(x + w - 12, ty + 1, 2, 5); ctx.fillRect(x + w - 10, ty - 1, 2, 3); }
    }
  }

  override summary() {
    const at: number[] = [];
    for (let k = 0; k <= PLATE_S; k++) at.push(this.landedAt(k));
    return {
      orders: this.orders.map((o) => o.id), routes: this.routes.map((r) => r.map((i) => this.stepNames[i])), dished: this.orders.map((o, d) => this.dished(d) ? o.id : ''),
      dishStars: this.dishStars.slice(), custs: this.custs.length,
      step: this.stepIdx, steps: this.stepNames, scores: this.scores.slice(), owners: this.owners.slice(), total: this.total, stars: this.stars, served: this.served,
      phase: this.st.phase, t: this.st.t, count: this.st.count, pulled: this.pulled, pulls: this.pullIcons.length,
      chops: this.chops, lidT: this.lidT, lids: this.lids, poofs: this.poofs,
      at, flying: this.flights.reduce((n, fl) => n + (fl.active ? 1 : 0), 0),
      seats: this.seats.map((s) => [s.slot, R(s.x), s.station, s.anim, s.eatT, s.rig.weapon ? 1 : 0]),
    };
  }

  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.orders.length, this.stepIdx, this.total, this.st.phase, this.st.t, this.st.count, this.pulled, this.served ? 1 : 0, this.serveT, this.stars);
    for (let i = 0; i < this.steps.length; i++) f.push(this.steps[i], this.scores[i], this.owners[i]);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.station, s.moving ? 1 : 0, s.actT, s.eatT); }
    return f;
  }
}
