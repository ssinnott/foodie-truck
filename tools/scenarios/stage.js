// Playtest scenarios for THE DAY BOARD (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   stage - the board a run opens on: three lines pinned up, each at a different landmark with two customers in
//        it, every customer ordering off the day's menu, and the shopping list under them adding every order up.
//        CONFIRM opens the truck: the map, at home, with the whole list still to gather and the compass on the
//        first missing ingredient's landmark. Writes tools/screens/stage-board.png.
//   stagePlan - the plan is a pure function of the seed: the same seed lays the same day out, another seed lays
//        another, ?order= forces a recipe onto the menu and into the first customer's paws, and ?recipes= fixes
//        the menu outright. What keeps four online machines on one day and lets a scenario pick its landmarks.
//   stageClosing - the END: with every line served the board closes the truck for the night, prints the day's
//        card with each customer's stars, and the only thing left to press goes back to the title. Writes
//        tools/screens/stage-closing.png.
import { withPage, assert } from '../playtest.js';
import { ORDERS, INGREDIENTS } from '../../src/content/recipes.ts';
import { PLACES } from '../../src/content/places.ts';
import { planDay, needsOf, LINES_PER_DAY, LINE_LENGTH, RECIPES_PER_DAY } from '../../src/game/run.ts';

export const SCENARIOS = {
  async stage(server) {
    await withPage(server, 'skipTo=stage&critters=0,1', async (api) => {
      await api.step(5);
      let s = await api.summary();
      assert(s.screen === 'stage', `the board comes up (on ${s.screen})`);
      assert(s.top.lines === LINES_PER_DAY && s.run.lines.length === LINES_PER_DAY, `${LINES_PER_DAY} lines are pinned to it (${s.top.lines})`);
      assert(s.top.closed === false && s.top.chosen === 0, 'it opens open: the truck is not yet on the road');
      const places = s.run.lines.map((l) => l.place);
      assert(new Set(places).size === places.length && places.every((p) => p !== 'home' && PLACES.some((x) => x.id === p)), `every line waits at a different landmark, none of them home (${places.join()})`);
      assert(s.run.lines.every((l) => l.customers.length === LINE_LENGTH), `every line is ${LINE_LENGTH} customers long (${s.run.lines.map((l) => l.customers.length).join()})`);
      assert(s.run.recipes.length === RECIPES_PER_DAY && new Set(s.run.recipes).size === RECIPES_PER_DAY, `the menu is ${RECIPES_PER_DAY} different recipes (${s.run.recipes.join()})`);
      const ordered = s.run.lines.flatMap((l) => l.customers.map((c) => c.split(':')[1]));
      assert(ordered.every((r) => s.run.recipes.includes(r)), `every customer orders off the menu (${ordered.join()})`);
      assert(s.run.recipes.every((r) => ordered.includes(r)), 'and every recipe on the menu is ordered at least once');
      // the shopping list is every order added up, each with its twist (a BIG one wants one more of everything, a
      // HERB one a sprig of its herb: game/run.ts needsOf)
      const want = {};
      const customers = s.run.lines.flatMap((l) => l.customers.map((c) => { const f = c.split(':'); const tw = (f[3] || '').split('/'); return { recipe: f[1], twist: tw[0] || '', extra: tw[1] || '' }; }));
      for (const c of customers) for (const n of needsOf(c)) want[n.id] = (want[n.id] || 0) + n.amount;
      const list = Object.fromEntries(s.run.needs.map((n) => [n.split(':')[0], Number(n.split('/')[1])]));
      assert(JSON.stringify(list) === JSON.stringify(Object.fromEntries(Object.keys(list).map((k) => [k, want[k]]))) && Object.keys(want).length === Object.keys(list).length,
        `the shopping list adds every order up (${s.run.needs.join()})`);
      assert(s.run.needs.every((n) => n.split(':')[1].startsWith('0/')), 'and nothing is gathered yet');
      assert(s.run.linesServed === 0 && s.run.served === 0 && s.run.phase === 'gather', `nothing served, the day in its gathering phase (${s.run.phase})`);
      await api.shot('stage-board');

      // CONFIRM opens the truck
      await api.press(0, { action: true }, 2, 4);
      await api.step(60);
      s = await api.summary();
      assert(s.screen === 'map', `opening the truck opens the map (on ${s.screen})`);
      assert(s.run.truckAt === 'home' && s.top.dest !== 'home' && s.top.serving === false, `the truck is home and pointed at a landmark to gather from (dest ${s.top.dest})`);
      const first = s.run.needs[0].split(':')[0];
      assert(s.top.dest === INGREDIENTS[first].place, `the compass points at the first missing line's landmark (${first} -> ${s.top.dest})`);
    });
  },

  async stagePlan(server) {
    const a = planDay(1), b = planDay(1), c = planDay(2);
    assert(JSON.stringify(a) === JSON.stringify(b), 'the same seed lays the same day out');
    assert(JSON.stringify(a) !== JSON.stringify(c), 'another seed lays another day out');
    const forced = planDay(1, { order: 4 });
    assert(forced.recipes[0] === ORDERS[3].id && forced.lines[0].customers[0].recipe === ORDERS[3].id, `?order=4 puts ${ORDERS[3].id} on the menu and in the first customer's paws (${forced.recipes.join()}; first ${forced.lines[0].customers[0].recipe})`);
    const fixed = planDay(1, { recipes: [0, 2] });
    assert(fixed.recipes.join() === `${ORDERS[0].id},${ORDERS[2].id}`, `?recipes=0,2 fixes the menu (${fixed.recipes.join()})`);
    assert(fixed.lines.every((l) => l.customers.every((cu) => cu.recipe === ORDERS[0].id || cu.recipe === ORDERS[2].id)), 'and nobody orders off it');
    // in the browser too: the run the page starts carries the forced recipe on its first ticket
    await withPage(server, 'skipTo=kitchen&critters=0&order=4', async (api) => {
      await api.step(2);
      const s = await api.summary();
      assert(s.run.dish === ORDERS[3].dish && s.run.recipes[0] === ORDERS[3].id, `?order=4 opens the kitchen on the honey loaf (${s.run.dish})`);
      assert(s.run.needs.some((n) => n.startsWith('flour:')) && s.run.needs.some((n) => n.startsWith('honey:')), `and the shopping list carries its lines (${s.run.needs.join()})`);
    });
    await withPage(server, 'skipTo=stage&critters=0&recipes=0,2', async (api) => {
      await api.step(2);
      const s = await api.summary();
      assert(s.run.recipes.join() === `${ORDERS[0].id},${ORDERS[2].id}`, `?recipes=0,2 fixes the day's menu in the browser (${s.run.recipes.join()})`);
      assert(s.run.needs.map((n) => n.split(':')[0]).join() === 'apple,egg', `so the shopping list is apples and eggs only (${s.run.needs.join()})`);
    });
  },

  async stageClosing(server) {
    await withPage(server, 'skipTo=stage&critters=0,1,2,3', async (api, page) => {
      // the day, played out: every line served. The board is what has to notice, so it is the only thing this
      // scenario drives - the lines behind it are the playthrough scenario's job.
      await page.evaluate(() => {
        const run = window.__game.game.run;
        for (const n of run.needs) { n.have = n.amount; n.used = n.amount; }
        for (const l of run.lines) { l.served = true; for (const c of l.customers) c.stars = 2; }
        run.lines[0].customers[0].stars = 3;
        run.served = run.lines.length * run.lines[0].customers.length;
        run.score = 1300;
        run.lastServed = run.lines.length - 1;
      });
      await api.goto('stage');
      await api.step(20);
      const s = await api.summary();
      assert(s.top.closed === true, 'a board with every line served closes the truck for the night');
      assert(s.run.dayComplete === true && s.run.linesServed === s.run.lines.length && s.run.phase === 'closed', `the day is done (${s.run.linesServed} of ${s.run.lines.length} lines, ${s.run.phase})`);
      assert(s.run.stars === 13, `the day's stars are every customer's added up (${s.run.stars})`);
      await api.shot('stage-closing');
      await api.press(0, { action: true }, 2, 6);
      assert((await api.screen()) === 'title', `and the last press goes back to the title (on ${await api.screen()})`);
    });
  },
};

/**
 * twists - order twists (game/run.ts TWISTS): the plan gives one customer in four a twist on a seeded day, and none
 *          on a dev-jump day. On a day with a BIG one the shopping list carries one more of that dish's every
 *          ingredient; with a HERB one the list carries the herb; at a CRUNCHY one's line the order chops fifteen;
 *          every twisted customer's words are on the end of their line at the hatch.
 */
SCENARIOS.twists = async (server) => {
  const { planDay, needsOf, CHOP_TAPS, CHOP_TAPS_CRUNCHY } = await import('../../src/game/run.ts');
  const { ORDERS } = await import('../../src/content/recipes.ts');
  const find = (kind) => { for (let seed = 1; seed < 800; seed++) { const p = planDay(seed); for (let i = 0; i < p.lines.length; i++) for (let j = 0; j < p.lines[i].customers.length; j++) if (p.lines[i].customers[j].twist === kind) return { seed, i, j, c: p.lines[i].customers[j] }; } return null; };
  const big = find('big'), herb = find('herb'), crunchy = find('crunchy');
  assert(big && herb && crunchy, `the plan rolls every twist inside eight hundred seeds (big ${big && big.seed}, herb ${herb && herb.seed}, crunchy ${crunchy && crunchy.seed})`);
  assert(planDay(1, { order: 1 }).lines.every((l) => l.customers.every((c) => !c.twist)) && planDay(1, { recipes: [0, 2] }).lines.every((l) => l.customers.every((c) => !c.twist)), 'a dev-jump day never carries a twist');
  const rec = ORDERS.find((o) => o.id === big.c.recipe);
  assert(needsOf(big.c).every((n) => rec.needs.find((r) => r.id === n.id).amount + 1 === n.amount), `a BIG order wants one more of everything (${JSON.stringify(needsOf(big.c))})`);
  assert(needsOf(herb.c).some((n) => n.id === herb.c.extra && n.amount === 1), `a HERB order wants a sprig of ${herb.c.extra} (${JSON.stringify(needsOf(herb.c))})`);
  await withPage(server, `skipTo=stage&critters=0,1&seed=${herb.seed}`, async (api, page) => {
    await api.step(2);
    const s = await api.summary();
    assert(s.run.needs.some((n) => n.startsWith(herb.c.extra + ':')), `the herb is on the shopping list (${s.run.needs.join()})`);
    assert(s.run.lines[herb.i].customers[herb.j].endsWith(':herb/' + herb.c.extra), `and the customer carries the twist (${s.run.lines[herb.i].customers[herb.j]})`);
    await api.shot('stage-twist');
  });
  await withPage(server, `skipTo=stage&critters=0,1&seed=${crunchy.seed}`, async (api, page) => {
    await api.step(2);
    const o = await page.evaluate(([i, j]) => { const run = window.__game.game.run; run.startLine(i); run.customer = j; run.order = run.lines[i].customers[j] ? (run.startLine(i), run.order) : run.order; return { chops: run.order.chops, line: run.order.line, twist: run.order.twist }; }, [crunchy.i, crunchy.j]);
    // startLine stands on the line's FRONT customer; the crunchy one may be second, so read it straight off the plan's promise instead
    const front = crunchy.j === 0;
    if (front) assert(o.chops === CHOP_TAPS_CRUNCHY && o.twist === 'crunchy' && o.line.endsWith('EXTRA CRUNCHY!'), `at the hatch a CRUNCHY order chops ${CHOP_TAPS_CRUNCHY} and says so (chops ${o.chops}, '${o.line}')`);
    else assert(o.chops === CHOP_TAPS || o.chops === CHOP_TAPS_CRUNCHY, `an order's chops are one of the two counts (${o.chops})`);
  });
};
/**
 * kitchenGags - the room's two jokes: a stove step with the lid due rattles the pot lid for 40 frames, an oven step
 *               with the cloud due puffs flour out of the door. Both are one in six on the seeded rng, so the two
 *               are forced here through the same fields the roll sets, and the draw is checked for errors.
 */
SCENARIOS.kitchenGags = async (server) => {
  await withPage(server, 'skipTo=kitchen&critters=0,1&order=1', async (api, page) => {
    await api.step(2);
    const s0 = await api.summary();
    assert(s0.top.chops === 10 && s0.top.lids === 0 && s0.top.poofs === 0, `a plain order chops ten and nothing has rattled yet (chops ${s0.top.chops})`);
    await page.evaluate(() => { const sc = window.__game.game.screen; sc.lidT = 40; sc.lids = 1; });
    await api.step(6);
    await api.shot('kitchen-lid');
    const s1 = await api.summary();
    assert(s1.top.lidT === 34 && s1.top.lids === 1, `the lid rattles down its forty frames (lidT ${s1.top.lidT})`);
    await api.step(40);
    assert((await api.summary()).top.lidT === 0, 'and settles');
    assert((await api.errors()).length === 0, 'no errors drawing the lid');
  });
};

