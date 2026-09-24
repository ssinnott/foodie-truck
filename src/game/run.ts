// The run: one DAY of the food truck, from opening to closing (docs/GDD.md section 3, docs/ARCHITECTURE.md
// section 5).
//
// This is the ONLY state shared between screens, and it is deliberately plain data so that netplay can
// hash it (net/checksum.js) and every peer can rebuild it from the START packet (seed + party) alone.
// Screens read it, call the few mutators below, and hand off to the next screen through `nextScreen()`.
//
//   title -> (lobby) -> select -> stage (OPEN THE TRUCK) -> map -> <mini-game> -> map -> ... (the pantry fills)
//         -> map -> line -> kitchen -> results -> map -> line -> kitchen -> results ... -> stage (CLOSED)
//
// A DAY is planned once from the seed (`planDay`): RECIPES_PER_DAY recipes drawn from content/recipes.js ORDERS,
// and LINES_PER_DAY queues of LINE_LENGTH customers, each queue waiting at a different landmark and each customer
// ordering one of the day's recipes. The SHOPPING LIST (`needs`) is every ingredient of every order in every
// line, summed: the truck drives round the landmarks until the pantry holds all of it, and only then do the
// lines open. Arriving at a landmark with a line opens the `line` screen; everyone in the queue orders at once,
// the kitchen cooks every dish in turn, and results hands them all out together and banks the stars. When the third line has been served the
// day is done - `dayComplete()` - and the board closes the truck for the night. That is the game's end.
//
// Nothing in here draws, and nothing in here reads the clock or Math.random: the day plan is drawn from its own
// seeded stream (never the gameplay singleton, whose call count the checksum hashes), so four machines given the
// same seed lay the same day out.
import { ORDERS, INGREDIENTS, ingredientsAt } from '../content/recipes.ts';
import { PLACES } from '../content/places.ts';
import { CROSSING_SPOTS } from '../art/backgrounds/map.ts';
import { makeRng } from '../lib/engine/rng.ts';
import type { RngInstance } from '../lib/engine/rng.ts';
import type { Order, OrderNeed, Run, RunLine, RunCustomer, DayPlan, DayPlanLine, DayPlanCrossing, DayShape, Crossing, Cart } from './game.ts';

/**
 * Scene indices for the START packet (net/protocol.js): the screen a match opens on. Scenes finished after the
 * first pass are APPENDED rather than filed next to their neighbours: the index is what crosses the wire, so
 * inserting 'dairy' after 'coop' would silently move 'kitchen' under every peer already holding the old table.
 */
export const SCENES = Object.freeze(['map', 'orchard', 'pond', 'coop', 'kitchen', 'dairy', 'mill', 'hive', 'garden', 'stage', 'line', 'bramble', 'beach', 'holt', 'wood', 'terrace']);
/** The scene an online match opens on: the day board, so the party reads the day's plan together and opens the truck. */
export const START_SCENE = SCENES.indexOf('stage');

/**
 * THE TIP (docs/GDD.md sections 7 and 13): what one dish earns, in coins, by its stars (index 0 is unreachable -
 * stars are clamped to 1 - but keeps the lookup flat). Coins are the game's one money: the receipt counts them,
 * the day's takings are them, and the garage sells for them. content/garage.ts prices its pieces against a week
 * of these, so a change here moves how often the garage can sell something.
 */
export const TIP_COINS: readonly number[] = Object.freeze([0, 4, 8, 12]);

/** The day's shape (docs/GDD.md section 3): how many recipes are on the menu, how many lines form, how long each is. */
export const RECIPES_PER_DAY = 3, LINES_PER_DAY = 3, LINE_LENGTH = 2;
/**
 * THE WEEK (docs/GDD.md section 3). A run is DAYS_PER_WEEK days, and what makes one day different from the last
 * is its SHAPE and not only its seed: how many queues form and how long each is, how big the menu is, whether
 * twists are dealt at all, and what the weather is allowed to do.
 *
 * Day 1 is short and plain, so a first day teaches the loop without being labelled a tutorial. MARKET DAY keeps
 * three queues but cuts the menu, so the village wants the same things and the day is two long gathers instead
 * of eight short ones. Day 4 is always wet, so the fog and the mud patch - one day in five by chance today - are
 * guaranteed once a week. THE FETE is four queues, one of them three deep, on a menu drawn from what this week
 * has already served: the last customer of the week orders Monday's dish.
 *
 * Shapes are APPENDED, never filed in between: the day index crosses the wire (net/protocol.ts) and is written
 * into the save record (game/week.ts), so inserting a day would move every week already in progress.
 */
/** The ordinary day's queues, built from the constants above so those three numbers stay load-bearing. */
const ORDINARY_LINES: readonly number[] = Object.freeze(new Array(LINES_PER_DAY).fill(LINE_LENGTH));
export const DAY_SHAPES: readonly DayShape[] = Object.freeze([
  Object.freeze({ name: 'OPENING DAY', lines: Object.freeze([2, 2]), recipes: 2, twists: false, weather: 'clear' }),
  Object.freeze({ name: '', lines: ORDINARY_LINES, recipes: RECIPES_PER_DAY, twists: true, weather: 'roll' }),
  Object.freeze({ name: 'MARKET DAY', lines: ORDINARY_LINES, recipes: 2, twists: true, weather: 'roll' }),
  Object.freeze({ name: '', lines: ORDINARY_LINES, recipes: RECIPES_PER_DAY, twists: true, weather: 'wet' }),
  Object.freeze({ name: 'THE FETE', lines: Object.freeze([...ORDINARY_LINES, LINE_LENGTH + 1]), recipes: RECIPES_PER_DAY, twists: true, weather: 'clear', fromWeek: true }),
]) as readonly DayShape[];
export const DAYS_PER_WEEK = DAY_SHAPES.length;
/** The ordinary day, and the shape a bare `planDay()` lays out: today's game, unchanged. */
export const NORMAL_DAY = 1;
/** A drizzle day and a fog day are equally likely on a shape that is always wet. */
export const WET_DRIZZLE_ODDS = 0.5;
/** The shape of day `d`, clamped into the week. */
export function shapeOf(day: number): DayShape { return DAY_SHAPES[Math.max(0, Math.min(DAYS_PER_WEEK - 1, day | 0))]; }
/** How many dishes a day's shape asks for, which is how many customers queue across all of its lines. */
export function dishesIn(shape: DayShape): number { let n = 0; for (const len of shape.lines) n += len; return n; }
/** Crossings on the road per day (docs/CONTENT_ROADMAP.md section B): distinct lane spots, one out at a time, in this order. */
export const CROSSINGS_PER_DAY = 3;
/** Sheep: 0, ducks: 1. About a third of crossings are the duck parade; a flock is 5..9, the ducks a mother and six. */
export const CROSSING_SHEEP = 0, CROSSING_DUCKS = 1, DUCK_ODDS = 0.35, FLOCK_MIN = 5, FLOCK_MAX = 9, DUCK_FAMILY = 7;
/** The day's weather: three days in five are clear, one drizzles (wet lanes, a mud patch), one is foggy (the view shrinks, the lanterns glow). */
export const WEATHER_CLEAR = 0, WEATHER_DRIZZLE = 1, WEATHER_FOG = 2;
/**
 * ORDER TWISTS (docs/CONTENT_ROADMAP.md section C): one customer in TWIST_ODDS wants their dish a little different,
 * and the twist is on the board, in the bubble at the hatch and in the kitchen:
 *   crunchy  EXTRA CRUNCHY: the CHOP step takes CHOP_TAPS_CRUNCHY taps instead of CHOP_TAPS (only a dish that chops)
 *   big      A BIG ONE: one more of every ingredient, on the order and so on the shopping list
 *   herb     WITH <HERB> ON TOP: one sprig of mint, chives or rosemary is added to the order, which is the reason
 *            the truck goes to Thyme Terrace on a day nobody ordered a herb dish
 * A dev-jump day (?order= or ?recipes=) never carries a twist: those promise a known dish and a known list.
 */
export const TWIST_ODDS = 4, CHOP_TAPS = 10, CHOP_TAPS_CRUNCHY = 15;
export const HERBS = Object.freeze(['mint', 'chive', 'rosemary']);
export const TWISTS: Readonly<Record<string, { tag: string; say: string }>> = Object.freeze({
  crunchy: { tag: ', CRUNCHY', say: 'EXTRA CRUNCHY!' },
  big: { tag: ', BIG', say: 'A BIG ONE!' },
  herb: { tag: '', say: 'WITH {HERB} ON TOP.' },
});
/** The board's short tag for a customer's twist (', BIG'; '+MINT' for a herb), or ''. */
export function twistTag(c: { twist: string; extra: string }): string {
  if (!c.twist) return '';
  if (c.twist === 'herb') return ' +' + (INGREDIENTS[c.extra] ? INGREDIENTS[c.extra].name : c.extra.toUpperCase());
  return TWISTS[c.twist] ? TWISTS[c.twist].tag : '';
}
/** What the customer adds at the hatch for their twist ('EXTRA CRUNCHY!'), or ''. */
export function twistSay(c: { twist: string; extra: string }): string {
  if (!c.twist || !TWISTS[c.twist]) return '';
  return TWISTS[c.twist].say.replace('{HERB}', INGREDIENTS[c.extra] ? INGREDIENTS[c.extra].name : c.extra.toUpperCase());
}
/** An order's needs with its twist applied: one more of everything for BIG, a sprig of the herb for HERB. */
export function needsOf(c: { recipe: string; twist: string; extra: string }): { id: string; amount: number }[] {
  const rec = recipeOf(c.recipe);
  const out = rec.needs.map((n) => ({ id: n.id, amount: n.amount + (c.twist === 'big' ? 1 : 0) }));
  if (c.twist === 'herb' && c.extra) out.push({ id: c.extra, amount: 1 });
  return out;
}

/** The village diners who queue, by content/critters/customers.js id. */
export const DINERS = Object.freeze(['owl', 'otter', 'goat']);
/** Salt mixed into the run seed for the plan's own rng stream, so the same seed never draws the plan and the first apple alike. */
const PLAN_SALT = 0x1d2b;

/** Fisher-Yates over a copy, on the given stream. */
function shuffle<T>(r: RngInstance, list: readonly T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = r.int(0, i); const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}

/**
 * Lay out a day from a seed: which recipes are on the menu, where the lines form and who is in them.
 *
 * `o.order` (1-based, the ?order= dev jump) forces that recipe onto the menu AND into the first customer's paws, so
 * a capture or a test can stand on a known dish; `o.recipes` (0-based ORDERS indices, the ?recipes= dev jump)
 * replaces the draw with exactly those recipes, so a scenario can keep a day to the landmarks it can play.
 * Every recipe on the menu is ordered at least once (the orders are the menu dealt round until the lines are full).
 */
function planOneDay(r: RngInstance, shape: DayShape, o: { order?: number; recipes?: number[] }, weekMenu?: readonly string[]): DayPlan {
  const n = ORDERS.length;
  const want = Math.max(1, Math.min(shape.recipes, n));
  let recipes: number[];
  if (o.recipes && o.recipes.length) {
    recipes = [];
    for (const i of o.recipes) { const k = ((i % n) + n) % n; if (recipes.indexOf(k) < 0) recipes.push(k); }
  } else if (shape.fromWeek && weekMenu && weekMenu.length) {
    // the fete cooks the week again: the menu is drawn from what days before it already served
    const pool: number[] = [];
    for (const id of weekMenu) { const i = ORDERS.findIndex((x) => x.id === id); if (i >= 0) pool.push(i); }
    recipes = shuffle(r, pool).slice(0, Math.min(want, pool.length));
  } else {
    recipes = shuffle(r, ORDERS.map((_, i) => i)).slice(0, want);
  }
  if (o.order != null && o.order > 0) {
    const forced = (o.order - 1) % n;
    const at = recipes.indexOf(forced);
    if (at >= 0) recipes.splice(at, 1); else if (recipes.length >= want) recipes.pop();
    recipes.unshift(forced);
  }
  // the lines: one per entry of the shape, each at a distinct supply landmark (never home: the truck's own yard has no queue)
  const supply = PLACES.filter((p) => p.id !== 'home').map((p) => p.id);
  const places = shuffle(r, supply).slice(0, Math.min(shape.lines.length, supply.length));
  // the orders: the menu dealt round until every seat in every line has one, then shuffled - except that a forced
  // recipe stays at the front of the first line, which is what ?order= promises
  const fixed = !!(o.order != null && o.order > 0) || !!(o.recipes && o.recipes.length);
  let total = 0;
  for (let i = 0; i < places.length; i++) total += shape.lines[i];
  const dealt: number[] = [];
  for (let k = 0; k < total; k++) dealt.push(recipes[k % recipes.length]);
  const orders = o.order != null && o.order > 0 ? [dealt[0]].concat(shuffle(r, dealt.slice(1))) : shuffle(r, dealt);
  const lines: DayPlanLine[] = [];
  let k = 0, last = -1;
  for (let li = 0; li < places.length; li++) {
    const customers: { customer: string; recipe: string; twist: string; extra: string }[] = [];
    for (let c = 0; c < shape.lines[li]; c++) {
      let d = r.int(0, DINERS.length - 1);
      if (d === last) d = (d + 1) % DINERS.length;    // nobody queues behind their own twin
      last = d;
      const rec = ORDERS[orders[k++]];
      // the twist: one customer in TWIST_ODDS, never on a dev-jump day and never on a shape that deals none;
      // crunchy only on a dish that chops
      let twist = '', extra = '';
      if (!fixed && shape.twists && r.int(1, TWIST_ODDS) === 1) {
        const kind = r.int(0, 2);
        twist = kind === 0 ? (rec.steps.indexOf('chop') >= 0 ? 'crunchy' : 'big') : kind === 1 ? 'big' : 'herb';
        if (twist === 'herb') extra = HERBS[r.int(0, HERBS.length - 1)];
      }
      customers.push({ customer: DINERS[d], recipe: rec.id, twist, extra });
    }
    lines.push({ place: places[li], customers });
  }
  // the crossings: CROSSINGS_PER_DAY distinct lane spots, drawn after the lines so an older seed's lines are unmoved
  const spots = shuffle(r, CROSSING_SPOTS.map((_, i) => i)).slice(0, Math.min(CROSSINGS_PER_DAY, CROSSING_SPOTS.length));
  const crossings: DayPlanCrossing[] = spots.map((spot) => {
    const kind = r.chance(DUCK_ODDS) ? CROSSING_DUCKS : CROSSING_SHEEP;
    return { spot, kind, herd: kind === CROSSING_DUCKS ? DUCK_FAMILY : r.int(FLOCK_MIN, FLOCK_MAX) };
  });
  // the tipped cart: one more lane spot, never one a crossing stands on (the spots were shuffled above, so it is the next one along)
  const rest = shuffle(r, CROSSING_SPOTS.map((_, i) => i)).filter((i) => spots.indexOf(i) < 0);
  const cart = rest.length ? rest[0] : -1;
  // the weather, and on a drizzle day the mud patch on one more spot. A shape that is always wet never draws
  // clear; a clear shape draws nothing at all.
  let weather = WEATHER_CLEAR;
  if (shape.weather === 'wet') weather = r.chance(WET_DRIZZLE_ODDS) ? WEATHER_DRIZZLE : WEATHER_FOG;
  else if (shape.weather === 'roll') { const w = r.int(0, 4); weather = w === 3 ? WEATHER_DRIZZLE : w === 4 ? WEATHER_FOG : WEATHER_CLEAR; }
  const mud = weather === WEATHER_DRIZZLE && rest.length > 1 ? rest[1] : -1;
  return { recipes: recipes.map((i) => ORDERS[i].id), lines, crossings, cart, weather, mud };
}

/**
 * Lay ONE ordinary day out from a seed, which is what this function has always done. `planWeek` is what a run
 * uses; this is the single-day door the scenarios and the captures come in by, and a shape can be named to lay
 * any day of the week out on its own.
 */
export function planDay(seed: number, o: { order?: number; recipes?: number[] } = {}, shape: DayShape = DAY_SHAPES[NORMAL_DAY]): DayPlan {
  return planOneDay(makeRng((((seed | 0) ^ PLAN_SALT) >>> 0) || 1), shape, o);
}

/**
 * Lay the WHOLE WEEK out from a seed, purely, before day 0 opens.
 *
 * All five days are planned up front for two reasons. THE FETE draws its menu from the recipes days 1-4 actually
 * serve, which is only possible if those days are already on the table - a planner that laid day N out when day N
 * opened would have to read play state to do it. And resuming a week is then `planWeek(seed)[day]`: two integers
 * rebuild any day of any week, which is why the save record (game/week.ts) holds no plan at all.
 *
 * Every day is drawn from ONE stream in day order, so a day is a pure function of the seed and the days before
 * it, and four peers given the same seed lay the same week out. The dev jumps (`?order=`, `?recipes=`) apply to
 * the day `o.day` names - the one being jumped to - and never to the rest of the week.
 */
export function planWeek(seed: number, o: { order?: number; recipes?: number[]; day?: number } = {}): DayPlan[] {
  const r = makeRng((((seed | 0) ^ PLAN_SALT) >>> 0) || 1);
  const jump = Math.max(0, Math.min(DAYS_PER_WEEK - 1, (o.day || 0) | 0));
  const week: DayPlan[] = [];
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    const shape = DAY_SHAPES[d];
    let served: string[] | undefined;
    if (shape.fromWeek) { served = []; for (const p of week) for (const id of p.recipes) if (served.indexOf(id) < 0) served.push(id); }
    week.push(planOneDay(r, shape, d === jump ? o : {}, served));
  }
  return week;
}

/**
 * Start a run: seat the party, plan the day, write the shopping list, park the truck at home with an empty pantry.
 * @param {object} game
 * @param {{ seed?: number, critters: number[], order?: number, recipes?: number[] }} o critters = cast index per seat, in slot order
 */
/**
 * The shopping list for a set of queues: every ingredient of every order in every one of them, summed per
 * ingredient, in INGREDIENTS order.
 */
function listFor(lines: RunLine[]): OrderNeed[] {
  const needs: OrderNeed[] = [];
  for (const id of Object.keys(INGREDIENTS)) {
    let amount = 0;
    for (const l of lines) for (const c of l.customers) for (const n of needsOf(c)) if (n.id === id) amount += n.amount;
    if (amount > 0) needs.push({ id, amount, have: 0, used: 0 });
  }
  return needs;
}

/** A day plan's queues as the run holds them: nobody served and nobody rated yet. */
function linesFor(plan: DayPlan): RunLine[] {
  return plan.lines.map((l) => ({ place: l.place, served: false, customers: l.customers.map((c) => ({ customer: c.customer, recipe: c.recipe, twist: c.twist, extra: c.extra, stars: 0 })) }));
}

/** The road as a day plan lays it out: the crossings (the first already on its lane), the cart, the mud patch. */
function roadFor(run: Run, plan: DayPlan): void {
  run.crossings = plan.crossings.map((c, i): Crossing => { const sp = CROSSING_SPOTS[c.spot]; return { ...c, x: sp.x, y: sp.y, dx: sp.dx, dy: sp.dy, state: i === 0 ? 1 : 0, t: 0, waved: 0 }; });
  run.cart = plan.cart >= 0 ? ({ x: CROSSING_SPOTS[plan.cart].x, y: CROSSING_SPOTS[plan.cart].y, taken: 0 } as Cart) : null;
  run.weather = plan.weather;
  run.mud = plan.mud >= 0 ? { x: CROSSING_SPOTS[plan.mud].x, y: CROSSING_SPOTS[plan.mud].y } : null;
  run.muddy = 0;
}

/**
 * OPEN A DAY on a run that is already going: its menu, its queues, its shopping list, an empty pantry, the road
 * laid out fresh, and the truck back in the yard. `nextDay` is the only caller; `startRun` builds day 0 inline
 * from the same three helpers.
 *
 * `run.truck` is mutated in PLACE rather than replaced, because the map screen keeps a reference to it between
 * visits (screens/map.ts) and a fresh object would leave it steering yesterday's truck. Zeroing x and y is what
 * parks it: the map re-parks a truck that is sitting at the origin.
 */
function loadDay(run: Run, plan: DayPlan): void {
  run.recipes = plan.recipes;
  run.lines = linesFor(plan);
  run.needs = listFor(run.lines);
  run.line = 0;
  run.customer = 0;
  run.order = makeOrder(run.lines[0].customers[0]);
  run.served = 0;
  run.lastServed = -1;
  run.truck.x = 0; run.truck.y = 0; run.truck.heading = 0; run.truck.at = 'home';
  roadFor(run, plan);
}

export function startRun(game, o) {
  const cast = game.critters;
  const party = o.critters.slice(0, 4).map((ci, slot) => ({ slot, critter: cast[ci % cast.length].id, score: 0 }));
  const seed = o.seed || 1;
  const day = Math.max(0, Math.min(DAYS_PER_WEEK - 1, (o.day || 0) | 0));
  // the WHOLE WEEK, laid out before the first day opens: the run carries the plan and re-derives nothing
  const week = planWeek(seed, { order: o.order, recipes: o.recipes, day });
  const plan = week[day];
  const lines = linesFor(plan);
  const run: Run = {
    seed,
    party,
    /** Which day of the week the truck is on, 0-based (DAY_SHAPES). A resumed week opens on its saved day. */
    day,
    /** The week, planned once from the seed before day 0 opened: `week[day]` is today. */
    week,
    /** The stars each CLOSED day earned, in day order; today's land in it as the board shuts. */
    weekStars: [],
    /** The takings each CLOSED day earned, in coins, in day order. */
    weekTakings: [],
    /** The day's menu: the ORDERS ids on it, in the order the board prints them. */
    recipes: plan.recipes,
    /** The queues, one per entry of the day's shape: where each waits, who is in it and what they ordered. */
    lines,
    /** The shopping list: `have` is what the pantry holds, `used` what the kitchen has taken back out of it. */
    needs: listFor(lines),
    /** The line the truck is serving (an index into `lines`): the last one it pulled up at. */
    line: 0,
    /** The customer at the hatch (an index into that line's customers). */
    customer: 0,
    /** { id, dish, customer, needs } - what the customer at the hatch ordered. */
    order: makeOrder(lines[0].customers[0]),
    /** How many dishes the truck has served today. */
    served: 0,
    /** The line `serve()` finished last, so the map can say so on arrival; -1 before the first one. */
    lastServed: -1,
    /** The week's takings in coins (TIP_COINS per dish served): every day's, running. */
    score: 0,
    /** World-map state the map screen keeps between visits (truck position, heading, which place it is at). */
    truck: { x: 0, y: 0, heading: 0, at: 'home' },
    /** The day's crossings: the first is out on its lane from the start, the rest come out one at a time as each clears. */
    crossings: plan.crossings.map((c, i): Crossing => { const sp = CROSSING_SPOTS[c.spot]; return { ...c, x: sp.x, y: sp.y, dx: sp.dx, dy: sp.dy, state: i === 0 ? 1 : 0, t: 0, waved: 0 }; }),
    /** The tipped cart on the road, untouched until the truck drives over its spill. */
    cart: plan.cart >= 0 ? ({ x: CROSSING_SPOTS[plan.cart].x, y: CROSSING_SPOTS[plan.cart].y, taken: 0 } as Cart) : null,
    /** The weather, the mud patch (a drizzle day), and whether the truck has been through it. */
    weather: plan.weather,
    mud: plan.mud >= 0 ? { x: CROSSING_SPOTS[plan.mud].x, y: CROSSING_SPOTS[plan.mud].y } : null,
    muddy: 0,
    /** Frames spent in the run (a clock the kitchen and results can read). */
    frame: 0,
    /** Mutators */
    /** The shopping-list line for an ingredient, or null when the day never asks for it. */
    need(id) { const n = run.needs.find((x) => x.id === id); return n || null; },
    have(id) { const n = run.need(id); return n ? n.have : 0; },
    /** What is left in the pantry: gathered, less what the kitchen has cooked with. */
    stock(id) { const n = run.need(id); return n ? n.have - n.used : 0; },
    /** Add `amount` of an ingredient (clamped to what the day needs). Returns true when that line is complete. */
    gather(id, amount = 1) {
      const n = run.need(id);
      if (!n) return false;
      n.have = Math.min(n.amount, n.have + amount);
      return n.have >= n.amount;
    },
    /** True when the whole shopping list is in the truck: the gathering is done and the lines open. */
    complete() { return run.needs.every((n) => n.have >= n.amount); },
    /** The shopping-list lines still short, in order. */
    missing() { return run.needs.filter((n) => n.have < n.amount); },
    /** The landmark that supplies an ingredient id (a content/places.js PLACES id, never 'home'). */
    placeFor(id) { const ing = INGREDIENTS[id]; return ing ? ing.place : ''; },
    /** The line still waiting at a landmark (an index into `lines`), or -1. */
    lineAt(placeId) { for (let i = 0; i < run.lines.length; i++) if (run.lines[i].place === placeId && !run.lines[i].served) return i; return -1; },
    /**
     * Which screen a landmark opens. While the pantry is short: its mini-game, if it supplies something still
     * missing. Once the pantry is full: the line, if one is waiting there. Otherwise nothing but a sign.
     */
    screenForPlace(placeId) {
      const p = PLACES.find((x) => x.id === placeId);
      if (!p) return '';
      if (!run.complete()) {
        const need = run.missing().find((n) => run.placeFor(n.id) === placeId);
        return need && p.screen && placeId !== 'home' ? p.screen : '';
      }
      return run.lineAt(placeId) >= 0 ? 'line' : '';
    },
    /** Called by the map on pulling up at a line: stand on it, with its first customer at the hatch. */
    startLine(i) {
      run.line = ((i % run.lines.length) + run.lines.length) % run.lines.length;
      run.customer = 0;
      run.order = makeOrder(run.lines[run.line].customers[0]);
      return run.order;
    },
    /** Called by results: bank the stars (and their tip) against the customer at the hatch, take their dish out of the pantry, and call the next. */
    serve(stars) {
      const ln = run.lines[run.line], c = ln.customers[run.customer];
      const st = Math.max(1, Math.min(3, stars | 0));
      run.served++;
      run.score += TIP_COINS[st];
      if (c) c.stars = st;
      for (const n of run.order.needs) { const s = run.need(n.id); if (s) s.used += n.amount; }
      run.customer++;
      if (run.customer >= ln.customers.length) { ln.served = true; run.lastServed = run.line; }
      else run.order = makeOrder(ln.customers[run.customer]);
    },
    /** What customer `k` of the line the truck stands at ordered (clamped into the line), as the kitchen cooks it. */
    orderFor(k) {
      const ln = run.lines[run.line];
      if (!ln || !ln.customers.length) return run.order;
      return makeOrder(ln.customers[Math.max(0, Math.min(ln.customers.length - 1, k | 0))]);
    },
    /**
     * THE WHOLE LINE SERVED AT ONCE: the kitchen cooks every order in the queue before anyone is handed a plate,
     * and results banks them together - `stars[i]` against the i-th customer still waiting, front first. Each is
     * `serve()` in turn, so the pantry, the takings and the line's served flag move exactly as they always did.
     */
    serveAll(stars) {
      const ln = run.lines[run.line];
      if (!ln) return;
      run.order = makeOrder(ln.customers[Math.min(run.customer, ln.customers.length - 1)]);
      for (let i = 0; i < stars.length && run.customer < ln.customers.length; i++) run.serve(stars[i]);
    },
    /** True once everyone in the line the truck stands at has been served. */
    lineDone() { const ln = run.lines[run.line]; return !ln || run.customer >= ln.customers.length; },
    /** How many lines have been served, and the day's star total. */
    linesServed() { let n = 0; for (const l of run.lines) if (l.served) n++; return n; },
    stars() { let n = 0; for (const l of run.lines) for (const c of l.customers) n += c.stars; return n; },
    /** The day is done when every line has been served. */
    dayComplete() { return run.lines.every((l) => l.served); },
    /** The shape of the day the truck is on (DAY_SHAPES): its name, its queues, how big its menu is. */
    shape() { return shapeOf(run.day); },
    /**
     * Bank today's stars and takings into the week's record, by DAY INDEX rather than by pushing, so calling it
     * twice is calling it once: the board can open closed, be left and be come back to without double-counting.
     */
    closeDay() {
      if (!run.dayComplete()) return false;
      run.weekStars[run.day] = run.stars();
      let prior = 0;
      for (let i = 0; i < run.day; i++) prior += run.weekTakings[i] || 0;
      run.weekTakings[run.day] = run.score - prior;
      return true;
    },
    /** The week's stars so far: every day banked by `closeDay`, today included once its board has shut. */
    weekStarsTotal() { let n = 0; for (const v of run.weekStars) n += v || 0; return n; },
    /** The week is over when the LAST day has been served: the end of the game. */
    weekComplete() { return run.day >= DAYS_PER_WEEK - 1 && run.dayComplete(); },
    /**
     * Close tonight and open tomorrow. Banks the day first (`closeDay`), then rebuilds every per-day field from
     * the week's own plan - a new menu, a new shopping list, an empty pantry, the road laid out again and the
     * truck back in the yard. What carries is the week's record, the takings and the party, and nothing else:
     * the pantry deliberately does not, or the board would stop being the whole truth about the day.
     *
     * Refuses on the last day of the week, where `weekComplete()` is the answer instead.
     */
    nextDay() {
      if (!run.dayComplete() || run.day >= DAYS_PER_WEEK - 1) return false;
      run.closeDay();
      run.day++;
      loadDay(run, run.week[run.day]);
      return true;
    },
    summary() {
      return {
        seed: run.seed, party: run.party.map((p) => p.critter), phase: run.dayComplete() ? 'closed' : run.complete() ? 'serve' : 'gather',
        day: run.day, days: DAYS_PER_WEEK, dayName: run.shape().name, weekStars: run.weekStars.slice(), weekTakings: run.weekTakings.slice(),
        weekComplete: run.weekComplete(),
        recipes: run.recipes.slice(), lines: run.lines.map((l) => ({ place: l.place, served: l.served, customers: l.customers.map((c) => `${c.customer}:${c.recipe}:${c.stars}` + (c.twist ? `:${c.twist}${c.extra ? '/' + c.extra : ''}` : '')) })),
        twist: run.order.twist, extra: run.order.extra, chops: run.order.chops,
        line: run.line, customer: run.customer, dish: run.order.dish, customerId: run.order.customer,
        needs: run.needs.map((n) => `${n.id}:${n.have}/${n.amount}`), stock: run.needs.map((n) => `${n.id}:${n.have - n.used}`),
        complete: run.complete(), served: run.served, score: run.score, linesServed: run.linesServed(), stars: run.stars(),
        dayComplete: run.dayComplete(), truckAt: run.truck.at,
        crossings: run.crossings.map((c) => ({ x: c.x, y: c.y, kind: c.kind, herd: c.herd, state: c.state, t: c.t })),
        cart: run.cart ? { x: run.cart.x, y: run.cart.y, taken: run.cart.taken } : null,
        weather: run.weather, mud: run.mud ? { x: run.mud.x, y: run.mud.y } : null, muddy: run.muddy,
      };
    },
  };
  game.run = run;
  return run;
}

/**
 * Which ingredient a mini-game gathers this visit (docs/GDD.md section 5). A landmark can supply several (the
 * orchard drops apples, pears, peaches and avocados; the farm pulls seven roots), and two landmarks can
 * share one screen (the cove borrows the pond's jetty), so the screen asks with the landmark it stands at -
 * `place` is the map's hand-off param, or a ?place= dev jump - and its own id as the fallback:
 *   1. the landmark's ingredients, in INGREDIENTS order, or every ingredient of every landmark that opens `screen`
 *      when no landmark was named (a bare ?skipTo=orchard);
 *   2. the first of those the shopping list is still SHORT of, else the first the list asks for at all, else the
 *      first listed - so a dev jump with no order still catches apples, and a garden round on the carrot soup
 *      pulls carrots even once the list has them.
 * Returns the ingredient id; `run` may be null (a screen booted without a run gathers into nothing).
 */
export function gatherTarget(run: Run | null, place: string | undefined, screen: string): string {
  let ids: string[] = place ? ingredientsAt(place) : [];
  if (!ids.length) for (const p of PLACES) if (p.screen === screen && p.id !== 'home') ids = ids.concat(ingredientsAt(p.id));
  if (!ids.length) ids = Object.keys(INGREDIENTS);
  if (run) {
    const short = ids.find((id) => { const n = run.need(id); return !!n && n.have < n.amount; });
    if (short) return short;
    const asked = ids.find((id) => !!run.need(id));
    if (asked) return asked;
  }
  return ids[0];
}

/** An ORDERS entry by id; an unknown id gets the first, so a stale plan still cooks. */
export function recipeOf(id: string) { return ORDERS.find((o) => o.id === id) || ORDERS[0]; }

/** The order a customer placed, as the kitchen and results read it: the pantry already holds every line of it. */
function makeOrder(c: RunCustomer): Order {
  const o = recipeOf(c.recipe), say = twistSay(c);
  return {
    id: o.id, dish: o.dish, customer: c.customer, line: say ? o.line + ' ' + say : o.line, steps: o.steps.slice(),
    needs: needsOf(c).map((n) => ({ id: n.id, amount: n.amount, have: n.amount, used: 0 })),
    chops: c.twist === 'crunchy' ? CHOP_TAPS_CRUNCHY : CHOP_TAPS, twist: c.twist || '', extra: c.extra || '',
  };
}
