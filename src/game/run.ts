// The run: one DAY of the food truck, from opening to closing (docs/GDD.md section 3, docs/ARCHITECTURE.md
// section 5).
//
// This is the ONLY state shared between screens, and it is deliberately plain data so that netplay can
// hash it (net/checksum.js) and every peer can rebuild it from the START packet (seed + party) alone.
// Screens read it, call the few mutators below, and hand off to the next screen through `nextScreen()`.
//
//   title -> (lobby) -> select -> stage (OPEN THE TRUCK) -> map -> <mini-game> -> map -> ... (the pantry fills)
//         -> map -> line -> kitchen -> results -> line -> kitchen -> results -> map -> line ... -> stage (CLOSED)
//
// A DAY is planned once from the seed (`planDay`): RECIPES_PER_DAY recipes drawn from content/recipes.js ORDERS,
// and LINES_PER_DAY queues of LINE_LENGTH customers, each queue waiting at a different landmark and each customer
// ordering one of the day's recipes. The SHOPPING LIST (`needs`) is every ingredient of every order in every
// line, summed: the truck drives round the landmarks until the pantry holds all of it, and only then do the
// lines open. Arriving at a landmark with a line opens the `line` screen; the customer at its front orders, the
// kitchen cooks, results banks the stars and the next in line steps up. When the third line has been served the
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
import type { Order, OrderNeed, Run, RunLine, RunCustomer, DayPlan, DayPlanLine, DayPlanCrossing, Crossing, Cart } from './game.ts';

/**
 * Scene indices for the START packet (net/protocol.js): the screen a match opens on. Scenes finished after the
 * first pass are APPENDED rather than filed next to their neighbours: the index is what crosses the wire, so
 * inserting 'dairy' after 'coop' would silently move 'kitchen' under every peer already holding the old table.
 */
export const SCENES = Object.freeze(['map', 'orchard', 'pond', 'coop', 'kitchen', 'dairy', 'mill', 'hive', 'garden', 'stage', 'line', 'bramble', 'beach', 'holt', 'wood', 'terrace']);
/** The scene an online match opens on: the day board, so the party reads the day's plan together and opens the truck. */
export const START_SCENE = SCENES.indexOf('stage');

/** The day's shape (docs/GDD.md section 3): how many recipes are on the menu, how many lines form, how long each is. */
export const RECIPES_PER_DAY = 3, LINES_PER_DAY = 3, LINE_LENGTH = 2;
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
export function planDay(seed: number, o: { order?: number; recipes?: number[] } = {}): DayPlan {
  const r = makeRng((((seed | 0) ^ PLAN_SALT) >>> 0) || 1);
  const n = ORDERS.length;
  let recipes: number[];
  if (o.recipes && o.recipes.length) {
    recipes = [];
    for (const i of o.recipes) { const k = ((i % n) + n) % n; if (recipes.indexOf(k) < 0) recipes.push(k); }
  } else {
    recipes = shuffle(r, ORDERS.map((_, i) => i)).slice(0, Math.min(RECIPES_PER_DAY, n));
  }
  if (o.order != null && o.order > 0) {
    const forced = (o.order - 1) % n;
    const at = recipes.indexOf(forced);
    if (at >= 0) recipes.splice(at, 1); else if (recipes.length >= RECIPES_PER_DAY) recipes.pop();
    recipes.unshift(forced);
  }
  // the lines: LINES_PER_DAY distinct supply landmarks (never home: the truck's own yard has no queue)
  const supply = PLACES.filter((p) => p.id !== 'home').map((p) => p.id);
  const places = shuffle(r, supply).slice(0, Math.min(LINES_PER_DAY, supply.length));
  // the orders: the menu dealt round until every seat in every line has one, then shuffled - except that a forced
  // recipe stays at the front of the first line, which is what ?order= promises
  const fixed = !!(o.order != null && o.order > 0) || !!(o.recipes && o.recipes.length);
  const total = places.length * LINE_LENGTH, dealt: number[] = [];
  for (let k = 0; k < total; k++) dealt.push(recipes[k % recipes.length]);
  const orders = o.order != null && o.order > 0 ? [dealt[0]].concat(shuffle(r, dealt.slice(1))) : shuffle(r, dealt);
  const lines: DayPlanLine[] = [];
  let k = 0, last = -1;
  for (const place of places) {
    const customers: { customer: string; recipe: string; twist: string; extra: string }[] = [];
    for (let c = 0; c < LINE_LENGTH; c++) {
      let d = r.int(0, DINERS.length - 1);
      if (d === last) d = (d + 1) % DINERS.length;    // nobody queues behind their own twin
      last = d;
      const rec = ORDERS[orders[k++]];
      // the twist: one customer in TWIST_ODDS, never on a dev-jump day; crunchy only on a dish that chops
      let twist = '', extra = '';
      if (!fixed && r.int(1, TWIST_ODDS) === 1) {
        const kind = r.int(0, 2);
        twist = kind === 0 ? (rec.steps.indexOf('chop') >= 0 ? 'crunchy' : 'big') : kind === 1 ? 'big' : 'herb';
        if (twist === 'herb') extra = HERBS[r.int(0, HERBS.length - 1)];
      }
      customers.push({ customer: DINERS[d], recipe: rec.id, twist, extra });
    }
    lines.push({ place, customers });
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
  // the weather, and on a drizzle day the mud patch on one more spot
  const w = r.int(0, 4), weather = w === 3 ? WEATHER_DRIZZLE : w === 4 ? WEATHER_FOG : WEATHER_CLEAR;
  const mud = weather === WEATHER_DRIZZLE && rest.length > 1 ? rest[1] : -1;
  return { recipes: recipes.map((i) => ORDERS[i].id), lines, crossings, cart, weather, mud };
}

/**
 * Start a run: seat the party, plan the day, write the shopping list, park the truck at home with an empty pantry.
 * @param {object} game
 * @param {{ seed?: number, critters: number[], order?: number, recipes?: number[] }} o critters = cast index per seat, in slot order
 */
export function startRun(game, o) {
  const cast = game.critters;
  const party = o.critters.slice(0, 4).map((ci, slot) => ({ slot, critter: cast[ci % cast.length].id, score: 0 }));
  const seed = o.seed || 1;
  const plan = planDay(seed, { order: o.order, recipes: o.recipes });
  const lines: RunLine[] = plan.lines.map((l) => ({ place: l.place, served: false, customers: l.customers.map((c) => ({ customer: c.customer, recipe: c.recipe, twist: c.twist, extra: c.extra, stars: 0 })) }));
  // the shopping list: every line of every order in every queue, summed per ingredient, in INGREDIENTS order
  const needs: OrderNeed[] = [];
  for (const id of Object.keys(INGREDIENTS)) {
    let amount = 0;
    for (const l of lines) for (const c of l.customers) for (const n of needsOf(c)) if (n.id === id) amount += n.amount;
    if (amount > 0) needs.push({ id, amount, have: 0, used: 0 });
  }
  const run: Run = {
    seed,
    party,
    /** The day's menu: the ORDERS ids on it, in the order the board prints them. */
    recipes: plan.recipes,
    /** The queues, one per LINES_PER_DAY landmark: where each waits, who is in it and what they ordered. */
    lines,
    /** The shopping list: `have` is what the pantry holds, `used` what the kitchen has taken back out of it. */
    needs,
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
    /** Total run score. */
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
    /** Called by results: bank the stars against the customer at the hatch, take their dish out of the pantry, and call the next. */
    serve(stars) {
      const ln = run.lines[run.line], c = ln.customers[run.customer];
      run.served++;
      run.score += stars * 100;
      if (c) c.stars = Math.max(1, Math.min(3, stars | 0));
      for (const n of run.order.needs) { const s = run.need(n.id); if (s) s.used += n.amount; }
      run.customer++;
      if (run.customer >= ln.customers.length) { ln.served = true; run.lastServed = run.line; }
      else run.order = makeOrder(ln.customers[run.customer]);
    },
    /** True once everyone in the line the truck stands at has been served. */
    lineDone() { const ln = run.lines[run.line]; return !ln || run.customer >= ln.customers.length; },
    /** How many lines have been served, and the day's star total. */
    linesServed() { let n = 0; for (const l of run.lines) if (l.served) n++; return n; },
    stars() { let n = 0; for (const l of run.lines) for (const c of l.customers) n += c.stars; return n; },
    /** The day is done when every line has been served: the game's end. */
    dayComplete() { return run.lines.every((l) => l.served); },
    summary() {
      return {
        seed: run.seed, party: run.party.map((p) => p.critter), phase: run.dayComplete() ? 'closed' : run.complete() ? 'serve' : 'gather',
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
