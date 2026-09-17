// The run: one day's orders, each from the phone call to the plate (docs/GDD.md section 3, docs/ARCHITECTURE.md
// section 5).
//
// This is the ONLY state shared between screens, and it is deliberately plain data so that netplay can
// hash it (net/checksum.js) and every peer can rebuild it from the START packet (seed + party) alone.
// Screens read it, call the few mutators below, and hand off to the next screen through `nextScreen()`.
//
//   title -> (lobby) -> select -> stage -> map -> <landmark mini-game> -> map -> ... -> kitchen -> results -> stage
//
// A DAY is the seven stages of content/recipes.js ORDERS, each one a customer and the dish they phone in. The
// order board (game/screens/stage.js) picks which one the truck works on; `serve()` banks its stars against that
// stage and hands the board back. When every stage carries stars the day is over - `dayComplete()` - and the
// board closes the truck for the night. That is the game's end: the run is a finite card, not an endless roll.
//
// Nothing in here draws, and nothing in here reads the clock or Math.random: every random choice goes
// through the seeded rng so that four machines running the same inputs make the same decisions.
import { ORDERS, INGREDIENTS } from '../content/recipes.js';
import { PLACES } from '../content/places.js';

/**
 * Scene indices for the START packet (net/protocol.js): the screen a match opens on. Scenes finished after the
 * first pass are APPENDED rather than filed next to their neighbours: the index is what crosses the wire, so
 * inserting 'dairy' after 'coop' would silently move 'kitchen' under every peer already holding the old table.
 */
export const SCENES = Object.freeze(['map', 'orchard', 'pond', 'coop', 'kitchen', 'dairy', 'mill', 'hive', 'garden', 'stage']);
/** The scene an online match opens on: the order board, so the party picks the customer and the dish together. */
export const START_SCENE = SCENES.indexOf('stage');

/**
 * Start a run: seat the party, lay out the day's stages, stand on one of them, mark every ingredient as missing.
 * @param {object} game
 * @param {{ seed?: number, critters: number[], order?: number }} o critters = cast index per seat, in slot order
 */
export function startRun(game, o) {
  const cast = game.critters;
  const party = o.critters.slice(0, 4).map((ci, slot) => ({ slot, critter: cast[ci % cast.length].id, score: 0 }));
  const stage = o.order != null && o.order > 0 ? (o.order - 1) % ORDERS.length : 0;
  const run = {
    seed: o.seed || 1,
    party,
    /** The day's card, one entry per ORDERS stage in that order: `stars` is 0 until the stage has been served. */
    stages: ORDERS.map((x) => ({ id: x.id, stars: 0 })),
    /** Which stage the truck is working on (an index into ORDERS): what the order board last chose. */
    stage,
    /** { id, dish, customer, needs: [{ id, amount, have }] } - the chosen stage's order. */
    order: makeOrder(stage),
    /** How many dishes the truck has served this session (a stage played twice counts twice). */
    served: 0,
    /** The stage `serve()` banked last, so the board can slam its stamp on arrival; -1 before the first one. */
    lastServed: -1,
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
    /** The landmark that supplies an ingredient id ('orchard' | 'pond' | 'coop' | 'dairy' | 'mill' | 'hive' | 'garden'). */
    placeFor(id) { const ing = INGREDIENTS[id]; return ing ? ing.place : ''; },
    /** Which screen a landmark opens: its mini-game if it supplies a missing ingredient, else nothing. */
    screenForPlace(placeId) {
      const p = PLACES.find((x) => x.id === placeId);
      if (!p) return '';
      if (placeId === 'home') return run.complete() ? 'kitchen' : '';
      const need = run.missing().find((n) => run.placeFor(n.id) === placeId);
      return need && p.screen ? p.screen : '';
    },
    /** Called by the order board: take stage `i` off the board with a fresh, empty order and the truck at home. */
    setStage(i) {
      run.stage = ((i % ORDERS.length) + ORDERS.length) % ORDERS.length;
      run.order = makeOrder(run.stage);
      run.truck.at = 'home';
      return run.order;
    },
    /** Called by results: bank the stars against the stage that was cooked and hand the board back. */
    serve(stars) {
      const st = run.stages[run.stage];
      run.served++;
      run.score += stars * 100;
      if (st && stars > st.stars) st.stars = stars;      // a stage played again keeps its best night
      run.lastServed = run.stage;
      run.truck.at = 'home';
    },
    /** How many stages carry stars, and the day's star total. */
    cleared() { let n = 0; for (const s of run.stages) if (s.stars > 0) n++; return n; },
    stars() { let n = 0; for (const s of run.stages) n += s.stars; return n; },
    /** The day is done when every stage on the board has been served at least once: the game's end. */
    dayComplete() { return run.stages.every((s) => s.stars > 0); },
    /** The next stage still to be served, starting after `from`, or -1 when the day is complete. */
    nextStage(from = run.stage) {
      for (let k = 1; k <= run.stages.length; k++) {
        const i = (from + k) % run.stages.length;
        if (run.stages[i].stars === 0) return i;
      }
      return run.stages[from] && run.stages[from].stars === 0 ? from : -1;
    },
    summary() {
      return { seed: run.seed, party: run.party.map((p) => p.critter), stage: run.stage, dish: run.order.dish, customer: run.order.customer,
        needs: run.order.needs.map((n) => `${n.id}:${n.have}/${n.amount}`), complete: run.complete(), served: run.served, score: run.score,
        stars: run.stages.map((s) => s.stars), cleared: run.cleared(), dayComplete: run.dayComplete(), truckAt: run.truck.at };
    },
  };
  game.run = run;
  return run;
}

function makeOrder(index) {
  const o = ORDERS[index % ORDERS.length];
  return { id: o.id, dish: o.dish, customer: o.customer, line: o.line, steps: o.steps.slice(), needs: o.needs.map((n) => ({ id: n.id, amount: n.amount, have: 0 })) };
}
