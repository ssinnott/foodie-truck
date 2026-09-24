// KITCHEN - COOK (docs/GDD.md section 6; docs/ART_STYLE.md section 1 "Kitchen"). The truck's interior, side-on,
// camera locked: one critter per seat walks the counter between the six stations (content/places.js STATIONS) and
// the order's steps are worked IN ORDER. The first seat to interact at the current step's station owns it (its slot
// colour fills the paper tag over the station); its input alone drives the step:
//   FRIDGE one press per item the order wants, any rhythm: each tap pulls the next ingredient out of the door and
//          sends it flying along the counter to the station that uses it next (a graphic, never a choice); the
//          last one closes the door
//   CHOP  ten presses, any rhythm: every tap is a chop and the tenth finishes the board
//   MIX   hold for 240 frames while a dial fills; letting go pauses it, and it picks up where it left off
//   STOVE hold for 240 frames while a bar fills; letting go pauses it the same way
//   OVEN  hold for 240 frames while the bake runs; letting go pauses it the same way
//   PLATE a press at the hatch plates the dish and rings the bell
// THE WHOLE LINE IS COOKED IN ONE GO: the kitchen is handed every order still waiting in the queue (`batch`, front
// first) and works them one after another at the same counter. The bell on every dish but the last stamps NEXT UP!
// and the next order comes to the hatch - its customer leaning in, its ticket on the rail, its steps on the card -
// with the crew left standing where they were; the bell on the last stamps ORDER UP! and hands every dish's stars
// to results together, which serves the whole line at once. The finished dishes wait on the pass beside the bell.
// THE FOOD MOVES DOWN THE LINE: the order's items are one batch that is always at exactly one station (`batchAt`).
// The fridge sends them to the first cooking step, and the frame a step completes, everything at its station -
// the pile and the item on the board, what is in the bowl, in the pot, on the oven's tray - takes off on a
// stagger and arcs into the next step's prop (`flights`, kitchenProps.ts `intake`), so the board is CLEARED by
// the tenth chop, the bowl is emptied by the stir, and the plate at the hatch is stacked by the time the bell
// rings. A prop draws itself loaded only while the batch is in it. A graphic: no step waits for a landing.
// Every step completed is worth its full 2 (there is no way to burn, miss or spoil anything), so a served dish is
// always three stars: stars = max(1, round(total / (2 * steps) * 3)). Barley's gag: on every completed step, a
// seeded one-in-six chance he eats an ingredient (crumbs, NOM, no score change) - and the first push of his stick
// or press of his button ends it, so the joke never holds a player up.
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
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawText } from '../../engine/text.ts';
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
 *  takes as many taps as the order has items. */
const CHOP_HITS = 10;
/** The door stands open this long after a pull. */
const DOOR_FRAMES = 30;
const MIX_FRAMES = 240;
const STOVE_FRAMES = 240;
const OVEN_FRAMES = 240;
/** A flight between two stations is FLY_FRAMES in the air; a batch takes off one unit every FLY_STAGGER frames.
 *  The pool holds two batches of the biggest order (six units), which is more than can ever be in the air. */
const FLY_FRAMES = 28, FLY_STAGGER = 4, FLY_POOL = 16;
/** The plate squashes for this long under a component that has just landed on it. */
const LAND_SQUASH = 3;
/** After the bell: the stamp slams, then results - or, with more of the line still to cook, the next order comes up. */
const SERVE_FRAMES = 96, NEXT_FRAMES = 72, STAMP_AT = 40;
/** The finished dishes waiting on the pass: along the hatch shelf right of the bell, PASS_PITCH apart. */
const PASS_PITCH = 30;
/** The empty ingredient table a finished dish's plate is drawn with: the dish is the picture, not a stack. */
const NO_ICONS: string[] = [];
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
/** Segments on each station's paper tag; the fridge's is the order's own item count (`segs`). */
const SEGS = [1, CHOP_HITS, 4, 4, 4, 1];
/** Rows a critter's tallest head part reaches above its skull (ears, toque, sunhat), for the name plate. */
const CROWN = { barley: 6, sorrel: 20, chicory: 22, cress: 18, rowan: 18 };
/** The lowest row a name plate's top may take: the module's own contract is that nothing to read sits in rows
 *  156..200, where the pot, the bowl and the board's ingredient are. A tall crown lifts a plate above this. */
const PLATE_Y_MAX = 160;
const HINTS = { fridge: 'FRIDGE: TAP TO PULL IT OUT', chop: 'CHOP: TAP OVER AND OVER', mix: 'MIX: HOLD TO STIR', stove: 'STOVE: HOLD TO COOK', oven: 'OVEN: HOLD TO BAKE', plate: 'PLATE: RING THE BELL' };
const PERFECT = 'PERFECT!', DONE = 'DONE', NOM = 'NOM', ORDER_UP = 'ORDER UP!', NEXT_UP = 'NEXT UP!', RING = 'RING!';
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
 * One item of the order on its way between two stations: a slot of the pool `fly()` fills and `stepFlights()`
 * lands. Cosmetic (never checksummed), but timed by an integer counter so every peer draws the same arc.
 */
export interface Flight {
  /** False while the slot is free. */
  active: boolean;
  /** Index into `pullIcons` / `pullHexes`: which unit of the order this is. */
  unit: number;
  /** Where it took off from and where it lands (kitchenProps.ts `intake`). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Frames since take-off; negative while it waits its turn on the batch's stagger. Lands at FLY_FRAMES. */
  t: number;
  /** The station it lands at: counted into `landed` only if the batch is still bound there. */
  dest: number;
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
  /** Every order still waiting in the line, front first: the kitchen cooks them all before anyone is served. */
  declare batch: Order[];
  /** The one on the counter now: an index into `batch`. */
  declare dish: number;
  /** The stars each finished dish of the batch earned, in batch order: what results hands out. */
  declare dishStars: number[];
  /** Every finished dish's banked step score, summed. */
  declare banked: number;
  /** The finished dishes waiting on the pass: their ORDERS ids, in batch order. */
  declare passIds: string[];
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
  /** Every ITEM the order wants, one entry per unit (four apples, two eggs): what comes out of the fridge, in order. */
  declare pullIcons: string[];
  declare pullHexes: string[];
  /** How many items have been pulled out of the fridge so far (0..pullIcons.length). */
  declare pulled: number;
  /** The station the pulls fly into: the step after the fridge (CHOP for a recipe that chops, else MIX). */
  declare pullDest: number;
  /** Frames since the last pull (the door's swing is timed off it); large when idle. */
  declare pullT: number;
  /** The flight pool, FLY_POOL slots built once in the constructor and reused in place. */
  declare flights: Flight[];
  /** Which of the order's `needs` each unit of the batch is: the plate stacks by this. */
  declare unitDish: number[];
  /** The first unit of each `needs` entry: a component is on the plate once that unit has landed there. */
  declare dishFirst: number[];
  /** The station the batch is at or on its way to: the fridge's destination first, then each completed step's successor. */
  declare batchAt: number;
  /** The station the batch last took off from; its prop stays loaded while any unit is still waiting to go. */
  declare batchFrom: number;
  /** Units of the batch that have landed at `batchAt` so far. */
  declare landed: number;
  /** Flights still waiting on the stagger this frame (recounted by stepFlights). */
  declare waiting: number;
  /** Frames since a unit last landed on the plate (the squash), capped. */
  declare landT: number;
  /** The order's id: which finished dish (art/dishes.ts) the plate shows once the whole batch has landed on it. */
  declare dishId: string;
  /** Scratch for the intake points, refilled by fly(); never reallocated. */
  declare pt: Point;
  /** Per-ingredient glyph and hex tables for the order ticket (game/ui.ts drawOrderTicket). */
  declare ticketOpts: OrderTicketOpts;
  /** The ticket's two head rows, worded once: whose order it is and the dish. */
  declare ticketHead: string[];
  /** The step being worked: an index into `steps`, `steps.length` once every step is done. */
  declare stepIdx: number;
  /** The score banked so far, 0..2 per completed step. */
  declare total: number;
  /** The current step's state. */
  declare st: StepState;
  /** Taps the CHOP step takes this order (the order's `chops`: more on an EXTRA CRUNCHY one). */
  declare chops: number;
  /** Frames left of the pot lid rattling; and the two gags' counts, for the tests. */
  declare lidT: number;
  declare lids: number;
  declare poofs: number;
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
  /** The frame the current step came up on: the HOW TO PLAY card is raised again for every step. */
  declare stepFrame: number;
  /** The card's pictograms for the current step. */
  declare schemes: readonly CardScheme[];

  constructor(game: Game) {
    super(game, 'kitchen'); this.seats = []; this.fields = [];
    this.flights = [];
    for (let i = 0; i < FLY_POOL; i++) this.flights.push({ active: false, unit: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dest: -1 });
    this.pt = { x: 0, y: 0 };
  }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layer = kitchenLayer(paintStations);
    particles.clear();
    // the batch: everyone still waiting in the line, front first, all cooked before anyone is served
    this.batch = [];
    const ln = run.lines[run.line];
    if (ln) for (let k = run.customer; k < ln.customers.length; k++) this.batch.push(run.orderFor(k));
    if (!this.batch.length) this.batch.push(run.order);
    this.dish = 0; this.dishStars = []; this.banked = 0; this.passIds = []; this.lids = 0; this.poofs = 0;
    this.keyName = game.input.keyText(0, 'action');
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
    this.loadOrder();
  }

  /**
   * Put `batch[dish]` on the counter: its steps on the recipe card, its items in the fridge, its ticket on the rail
   * and its customer in the hatch, every step unclaimed. The crew stay where they stand.
   */
  loadOrder(): void {
    const run = this.game.run, order = this.batch[this.dish];
    run.order = order;
    this.steps = order.steps.map((id) => STATION_IDX[id] != null ? STATION_IDX[id] : PLATE_S);
    this.chops = order.chops || CHOP_HITS; this.lidT = 0;
    this.stepNames = order.steps.map((id) => (STATIONS.find((s) => s.id === id) || STATIONS[0]).name);
    this.scores = this.steps.map(() => -1);
    this.owners = this.steps.map(() => -1);
    this.icons = order.needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).icon);
    this.hexes = order.needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).hex);
    // what the fridge holds for this order: one entry per unit, in the order's own order
    this.pullIcons = []; this.pullHexes = []; this.unitDish = []; this.dishFirst = [];
    for (let i = 0; i < order.needs.length; i++) {
      this.dishFirst.push(this.pullIcons.length);
      for (let k = 0; k < order.needs[i].amount; k++) { this.pullIcons.push(this.icons[i]); this.pullHexes.push(this.hexes[i]); this.unitDish.push(i); }
    }
    this.pulled = 0; this.pullT = DOOR_FRAMES;
    const fk = this.steps.indexOf(FRIDGE_S);
    this.pullDest = fk >= 0 && fk + 1 < this.steps.length ? this.steps[fk + 1] : (this.steps.length ? this.steps[0] : CHOP);
    if (this.pullDest === FRIDGE_S) this.pullDest = CHOP;
    // the batch is bound for the fridge's destination from the first frame; nothing is in the air yet
    for (const fl of this.flights) fl.active = false;
    this.batchAt = this.pullDest; this.batchFrom = FRIDGE_S; this.landed = 0; this.waiting = 0; this.landT = LAND_SQUASH;
    this.dishId = order.id;
    this.ticketOpts = { icons: {}, hexes: {}, title: this.batch.length > 1 ? `DISH ${this.dish + 1} OF ${this.batch.length}` : undefined };
    this.ticketHead = [`FOR ${getCustomer(order.customer).name}`, order.dish];
    for (const n of order.needs) { const ing = INGREDIENTS[n.id]; if (ing) { this.ticketOpts.icons[n.id] = ing.icon; this.ticketOpts.hexes[n.id] = ing.hex; } }
    this.stepIdx = 0; this.total = 0;
    this.st = { phase: 0, t: 0, count: 0 };
    this.served = false; this.serveT = 0; this.stars = 0;
    this.ovenGlow = 0;
    this.tak = 0; this.ringT = -1;
    this.setHint();
    // the customer leaning into the hatch
    const cust = getCustomer(order.customer);
    this.custRig = critterRig(cust, -1); this.custPlayer = new AnimPlayer(cust.anims); this.custPlayer.play('idle');
    this.custPose = idlePoseOf(cust); this.custOpts = { facing: -1, margin: BUST.margin };
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
    this.custPlayer.tick();
    if (this.tak > 0) this.tak--;
    if (this.pullT < DOOR_FRAMES) this.pullT++;
    if (this.ringT >= 0 && this.ringT < 60) this.ringT++;
    if (this.ovenGlow > 0 && !(this.currentStation() === OVEN_S && this.st.phase === 1)) this.ovenGlow--;
    this.updateSeats(inp);
    if (!this.served) this.stepStation(inp);
    else if (++this.serveT >= (this.lastDish() ? SERVE_FRAMES : NEXT_FRAMES)) {
      // the whole line is cooked: results hands every dish out at once. Otherwise the next order comes up
      if (this.lastDish()) { game.replace('results', { stars: this.dishStars.slice(), score: this.banked }); return; }
      this.dish++;
      this.loadOrder();
    }
    for (let i = 0; i < this.seats.length; i++) this.pickAnim(this.seats[i]);
  }

  /** True while the dish on the counter is the last of the line's batch. */
  lastDish(): boolean { return this.dish >= this.batch.length - 1; }

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
        // one item out per tap, in the order's own order; the door swings, the item arcs along the counter into
        // the first cooking step's prop
        if (pressed) {
          st.count++; this.pullT = 0;
          if (this.pulled < this.pullIcons.length) { this.fly(this.pulled, FRIDGE_S, this.pullDest, 0); this.pulled++; }
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

  /** How many segments a station's tag and tally carry: the fridge's is the order's item count, the rest are fixed. */
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
    // the food moves on: everything at this station takes off for the next step's prop (the fridge's items are
    // already on their way, one per tap, and the plate is the end of the line)
    if (station !== FRIDGE_S && station !== PLATE_S && idx + 1 < this.steps.length) this.launchBatch(station, this.steps[idx + 1]);
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
      b.rig.weapon = ITEMS.food as RigWeapon; b.rig.heldIcon = this.icons[0]; b.rig.heldHex = this.hexes[0];   // `as` for the same reason as in updateSeats
      this.playAnim(b, 'eat', true);
      burstCrumbs(b.x + b.facing * 8, ROWS.feet - 40, ROWS.feet, this.hexes[0], 6, true);
      floatText(b.x, ROWS.feet - 70, NOM, UI.cream, 1, true);
      this.game.audio.play('nom', { delay: 0.25 });
    }
    void s;
  }

  /** The bell: the dish is served, the stamp slams, results follow after the components have landed. */
  serve(s: Seat | null): void {
    if (this.served) return;
    this.served = true; this.serveT = 0; this.ringT = 0;
    const n = Math.max(1, this.steps.length);
    this.stars = Math.max(1, Math.min(3, R(this.total / (2 * n) * 3)));
    this.dishStars.push(this.stars); this.banked += this.total; this.passIds.push(this.dishId);
    ringAt(BELL.x + BELL.w / 2, BELL.y + 4, 4, 22, UI.cream, 2, 16, false, true);
    this.game.audio.play('bell');
    this.game.audio.play('stamp', { delay: STAMP_AT / 60 });
    void s;
  }

  /**
   * Send the whole batch from station `from` into station `to`'s prop, one unit every FLY_STAGGER frames: the
   * board's item and its pile, or what is in the bowl, the pot or the oven, all of it. The batch is bound to
   * `to` from this frame, so the prop it left draws itself empty (bar the units still waiting their turn) and
   * the one it is bound for fills as they land.
   */
  launchBatch(from: number, to: number): void {
    this.batchFrom = from; this.batchAt = to; this.landed = 0;
    for (let u = 0; u < this.pullIcons.length; u++) this.fly(u, from, to, u * FLY_STAGGER);
    // the board is wiped clean: a few bits of the ingredient hop on it as the dice leave
    if (from === CHOP) burstCrumbs(PROP_X[CHOP], BOARD.y - 6, BOARD.y - 1, this.hexes[0], 4, true);
  }

  /** Put unit `u` of the order in the air from station `from`'s intake to station `to`'s, after `delay` frames. */
  fly(u: number, from: number, to: number, delay: number): void {
    let fl: Flight | null = null;
    for (const f of this.flights) if (!f.active) { fl = f; break; }
    if (!fl) { fl = this.flights[0]; this.land(fl); }   // never in practice (FLY_POOL); the oldest lands early
    const p = this.pt;
    intake(from, u, this.unitDish[u], p); fl.x0 = p.x; fl.y0 = p.y;
    intake(to, u, this.unitDish[u], p); fl.x1 = p.x; fl.y1 = p.y;
    fl.active = true; fl.unit = u; fl.t = -delay; fl.dest = to;
  }

  /** Advance every flight a frame; the ones that reach FLY_FRAMES land. */
  stepFlights(): void {
    let waiting = 0;
    for (const fl of this.flights) {
      if (!fl.active) continue;
      if (++fl.t < 0) waiting++;
      else if (fl.t >= FLY_FRAMES) this.land(fl);
    }
    this.waiting = waiting;
    if (this.landT < LAND_SQUASH) this.landT++;
  }

  /** A unit lands: it joins what is at its station (if the batch is still bound there), with a ring, and a puff of
   *  steam off the pot. The last one onto the plate turns the stack into the finished dish, with a sparkle. */
  land(fl: Flight): void {
    fl.active = false;
    if (fl.dest === this.batchAt) {
      this.landed++;
      if (fl.dest === PLATE_S) { this.landT = 0; if (this.dished()) burstSparkle(fl.x1, fl.y1 - 6, 6, UI.cream, true); }
    }
    ringAt(fl.x1, fl.y1, 2, 9, UI.cream, 2, 10, false, true);
    if (fl.dest === STOVE) burstSteam(fl.x1, fl.y1 - 4, 2, true);
  }

  /** True once the whole batch is on the plate: it is the dish now, not a stack of what went into it. */
  dished(): boolean { return this.batchAt === PLATE_S && this.landed >= this.pullIcons.length; }

  /** True while station `k`'s prop has the batch in it: bound there with something landed, or still seeing it off. */
  loaded(k: number): boolean { return (this.batchAt === k && this.landed > 0) || (this.batchFrom === k && this.waiting > 0); }

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

  /** The per-frame marks on the stations: only the ones this order uses. */
  /** True once the step that uses station `k` has been scored. */
  done(k: number): boolean { for (let i = 0; i < this.steps.length; i++) if (this.steps[i] === k) return this.scores[i] >= 0; return false; }

  drawStations(ctx: CanvasRenderingContext2D, f: number, st: StepState, station: number): void {
    // the fridge: the door open for a beat after each pull
    drawFridge(ctx, DOOR_FRAMES - this.pullT, this.pullIcons, this.pullHexes, this.pulled);
    // the board: the first unit on it, whole then halves then dice as the chops land, and the rest piled beside
    // it - while the batch is here. The tenth chop clears it: the dice and the pile are in the air by then, and
    // the units still waiting their turn sit where they were (drawFlights draws them in place)
    if (this.batchAt === CHOP && this.landed > 0) {
      const cut = station === CHOP ? (st.count < 2 ? 0 : st.count < 4 ? 1 : 2) : 0;
      drawChopItem(ctx, this.icons[0], this.hexes[0], cut, 0, this.tak > 0);
      drawPile(ctx, this.pullIcons, this.pullHexes, this.landed);
    }
    // the bowl: lumps once something has dropped in, the stir's own progress while it runs, empty once it has gone
    const mixFill = !this.loaded(MIX) ? 0 : this.done(MIX) ? 1 : station === MIX ? Math.max(0.1, st.t / MIX_FRAMES) : 0.1;
    drawBowlContents(ctx, mixFill);
    const stoveOn = station === STOVE || this.done(STOVE);
    drawStove(ctx, stoveOn, station === STOVE ? st.t / STOVE_FRAMES : 1, f, this.loaded(STOVE) ? this.hexes[0] : null);
    // the tray is in the window while the batch is in the oven; the glow follows the hold and lingers after it
    const baking = station === OVEN_S && st.t > 0;
    drawOvenWindow(ctx, baking ? st.t / OVEN_FRAMES : this.ovenGlow / 60, this.loaded(OVEN_S));
    // the plate: a component is on it once the first unit of that ingredient has landed there, and the whole
    // batch landed is the finished dish itself (art/dishes.ts)
    let plated = 0;
    if (this.batchAt === PLATE_S) for (let j = 0; j < this.dishFirst.length; j++) if (this.landed > this.dishFirst[j]) plated++;
    drawPlate(ctx, PLATE.x + 13, PLATE.y, this.icons, this.hexes, plated, plated > 0 && this.landT < LAND_SQUASH ? 1.25 : 1, this.dished() ? this.dishId : null);
    // the finished dishes of the line so far, waiting on the pass beside the bell for the whole line to be cooked
    // (the one just belled is still on the plate until the next order comes up)
    const waiting = this.passIds.length - (this.served ? 1 : 0);
    for (let k = 0; k < waiting; k++) drawPlate(ctx, BELL.x + BELL.w + 14 + k * PASS_PITCH, PLATE.y, NO_ICONS, NO_ICONS, 0, 1, this.passIds[k]);
    drawBellRing(ctx, this.ringT);
    drawKettleSteam(ctx, f);   // the room's pilot light: one plume that never stops, whatever the party is doing
    if (this.lidT > 0) this.drawLid(ctx, f);
  }

  /** Every unit in the air on its arc; the ones still waiting their turn off the board sit where they were. */
  drawFlights(ctx: CanvasRenderingContext2D): void {
    for (const fl of this.flights) {
      if (!fl.active) continue;
      if (fl.t < 0) { if (this.batchFrom === CHOP) drawFlight(ctx, this.pullIcons[fl.unit], this.pullHexes[fl.unit], fl.x0, fl.y0, fl.x1, fl.y1, 0); continue; }
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
    const run = this.game.run;
    drawOrderTicket(ctx, run, TICKET.x, TICKET.y, TICKET.w, this.ticketHead, drawFood, this.ticketOpts);
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
    if (this.served && this.serveT >= STAMP_AT) drawStamp(ctx, this.lastDish() ? ORDER_UP : NEXT_UP, VIEW_W / 2, STAMP_Y, (this.serveT - STAMP_AT) / 24);
  }

  override summary() {
    return {
      dish: this.dished() ? this.dishId : '', dishes: this.batch.length, cooking: this.dish, dishStars: this.dishStars.slice(), pass: this.passIds.slice(),
      step: this.stepIdx, steps: this.stepNames, scores: this.scores.slice(), owners: this.owners.slice(), total: this.total, stars: this.stars, served: this.served,
      phase: this.st.phase, t: this.st.t, count: this.st.count, pulled: this.pulled, pulls: this.pullIcons.length, pullDest: this.pullDest,
      chops: this.chops, lidT: this.lidT, lids: this.lids, poofs: this.poofs,
      batchAt: this.batchAt, landed: this.landed, flying: this.flights.reduce((n, fl) => n + (fl.active ? 1 : 0), 0),
      seats: this.seats.map((s) => [s.slot, R(s.x), s.station, s.anim, s.eatT, s.rig.weapon ? 1 : 0]),
    };
  }

  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.dish, this.dishStars.length, this.banked, this.stepIdx, this.total, this.st.phase, this.st.t, this.st.count, this.pulled, this.served ? 1 : 0, this.serveT, this.stars);
    for (let i = 0; i < this.steps.length; i++) f.push(this.scores[i], this.owners[i]);
    for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; f.push(s.x, s.facing, s.station, s.moving ? 1 : 0, s.actT, s.eatT); }
    return f;
  }
}
