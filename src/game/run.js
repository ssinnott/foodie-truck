// The run: one order, from the phone call to the plate (docs/GDD.md section 3, docs/ARCHITECTURE.md section 5).
//
// This is the ONLY state shared between screens, and it is deliberately plain data so that netplay can
// hash it (net/checksum.js) and every peer can rebuild it from the START packet (seed + party) alone.
// Screens read it, call the few mutators below, and hand off to the next screen through `nextScreen()`.
//
//   title -> (lobby) -> select -> map -> <landmark mini-game> -> map -> ... -> kitchen -> results -> map
//
// Nothing in here draws, and nothing in here reads the clock or Math.random: every random choice goes
// through the seeded rng so that four machines running the same inputs make the same decisions.
import { rng } from '../engine/rng.js';
import { ORDERS, INGREDIENTS } from '../content/recipes.js';
import { PLACES } from '../content/places.js';

/** Scene indices for the START packet (net/protocol.js): the screen a match opens on. */
export const SCENES = Object.freeze(['map', 'orchard', 'pond', 'coop', 'kitchen']);

/**
 * Start a run: seat the party, pick (or take) the order, mark every ingredient as missing.
 * @param {object} game
 * @param {{ seed?: number, critters: number[], order?: number }} o critters = cast index per seat, in slot order
 */
export function startRun(game, o) {
  const cast = game.critters;
  const party = o.critters.slice(0, 4).map((ci, slot) => ({ slot, critter: cast[ci % cast.length].id, score: 0 }));
  const orderIndex = o.order != null && o.order > 0 ? (o.order - 1) % ORDERS.length : 0;
  const run = {
    seed: o.seed || 1,
    party,
    orderIndex,
    /** { id, dish, customer, needs: [{ id, amount, have }] } */
    order: makeOrder(orderIndex),
    /** How many orders the truck has served this session. */
    served: 0,
    /** Total run score. */
    score: 0,
    /** World-map state the map screen keeps between visits (truck position, heading, which place it is at). */
    truck: { x: 0, y: 0, heading: 0, at: 'home' },
    /** Frames spent in the run (a clock the kitchen and results can read). */
    frame: 0,
    /** Mutators */
    have(id) { const n = run.order.needs.find((x) => x.id === id); return n ? n.have : 0; },
    /** Add `amount` of an ingredient (clamped to what the order needs). Returns true when that line is complete. */
    gather(id, amount = 1) {
      const n = run.order.needs.find((x) => x.id === id);
      if (!n) return false;
      n.have = Math.min(n.amount, n.have + amount);
      return n.have >= n.amount;
    },
    /** True when every ingredient of the order is in the truck. */
    complete() { return run.order.needs.every((n) => n.have >= n.amount); },
    /** The ingredients still missing, in order. */
    missing() { return run.order.needs.filter((n) => n.have < n.amount); },
    /** The landmark that supplies an ingredient id ('orchard' | 'pond' | 'coop' | ...). */
    placeFor(id) { const ing = INGREDIENTS[id]; return ing ? ing.place : ''; },
    /** Which screen a landmark opens: its mini-game if it supplies a missing ingredient, else nothing. */
    screenForPlace(placeId) {
      const p = PLACES.find((x) => x.id === placeId);
      if (!p) return '';
      if (placeId === 'home') return run.complete() ? 'kitchen' : '';
      const need = run.missing().find((n) => run.placeFor(n.id) === placeId);
      return need && p.screen ? p.screen : '';
    },
    /** Called by results: bank the order and roll the next one. */
    serve(stars) {
      run.served++;
      run.score += stars * 100;
      run.orderIndex = (run.orderIndex + 1 + rng.int(0, ORDERS.length - 2)) % ORDERS.length;
      run.order = makeOrder(run.orderIndex);
      run.truck.at = 'home';
    },
    summary() {
      return { seed: run.seed, party: run.party.map((p) => p.critter), dish: run.order.dish, customer: run.order.customer,
        needs: run.order.needs.map((n) => `${n.id}:${n.have}/${n.amount}`), complete: run.complete(), served: run.served, score: run.score, truckAt: run.truck.at };
    },
  };
  game.run = run;
  return run;
}

function makeOrder(index) {
  const o = ORDERS[index % ORDERS.length];
  return { id: o.id, dish: o.dish, customer: o.customer, line: o.line, steps: o.steps.slice(), needs: o.needs.map((n) => ({ id: n.id, amount: n.amount, have: 0 })) };
}
