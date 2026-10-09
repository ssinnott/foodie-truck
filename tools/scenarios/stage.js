// Playtest scenarios for THE DAY BOARD (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   stage - the board a run opens on: ONE giant line pinned up (a wide ticket, the town stop it waits at and every
//        customer in it, all different animals), every customer ordering off the day's menu, and the shopping list
//        under it adding every order up.
//        CONFIRM opens the truck: the map, at home, with the whole list still to gather and the compass on the
//        first missing ingredient's landmark. Writes tools/screens/stage-board.png.
//   giantLine - the line screen on the fete's nine-long line: all nine diners stand in it (a front row along the lane
//        and the rest winding back in a second row) and ALL of them order at once - one bubble per dish with a tail
//        to every diner who asked for it - the next press takes the whole giant order into the kitchen, and the board
//        lays the nine out as one wide ticket. Writes tools/screens/giant-line.png and giant-line-board.png.
//   stagePlan - the plan is a pure function of the seed: the same seed lays the same day out, another seed lays
//        another, ?order= forces a recipe onto the menu and into the first customer's paws, and ?recipes= fixes
//        the menu outright. What keeps four online machines on one day and lets a scenario pick its landmarks.
//   stageClosing - the END: with every line served the board closes the truck for the night, prints the day's
//        card with each customer's stars, and the only thing left to press drives into the garage, whose way out
//        opens tomorrow. Writes tools/screens/stage-closing.png.
import { withPage, assert } from '../playtest.js';
import { ORDERS, INGREDIENTS } from '../../src/content/recipes.ts';
import { STOPS } from '../../src/content/places.ts';
import { planDay, planWeek, needsOf, dishGroups, DAY_SHAPES, DAYS_PER_WEEK, dishesIn } from '../../src/game/run.ts';

export const SCENARIOS = {
  async giantLine(server) {
    const total = DAY_SHAPES[DAYS_PER_WEEK - 1].lines[0];
    await withPage(server, 'skipTo=stage&critters=0,1&day=5', async (api) => {
      await api.step(5);
      const s = await api.summary();
      assert(s.top.lines === 1 && s.top.diners === total && s.top.cols[0] === 3, `the fete's board is one wide ticket of ${total} diners in three columns (${s.top.lines} ticket, ${s.top.diners} diners, ${s.top.cols})`);
      await api.shot('giant-line-board');
    });
    await withPage(server, 'skipTo=line&critters=0,1&day=5', async (api) => {
      await api.step(4);
      let s = await api.summary();
      const recipes = s.run.lines[s.run.line].customers.map((c) => c.split(':')[1]), dishes = dishGroups(recipes);
      assert(s.top.waiting === total, `all ${total} are in the line (${s.top.waiting})`);
      assert(new Set(s.top.diners).size === total, `${total} different animals (${s.top.diners.join()})`);
      const ys = new Set(s.top.spots.map((p) => p.split(',')[1]));
      assert(ys.size >= 2, `the line winds back in more than one row (${[...ys].join()})`);
      assert(s.top.bubbles.length === 0, `nobody has spoken before the line has waved (${s.top.bubbles.length} bubbles)`);
      // the whole line orders: a bubble per dish, each diner's tail joining their dish's as they wave, front to back
      await api.step(80);
      s = await api.summary();
      assert(s.top.chorus.length > 0 && s.top.chorus[0].joined > 0 && s.top.chorus.some((c) => c.joined < c.count), `the line is still joining in, front first (${s.top.chorus.map((c) => c.joined + '/' + c.count).join()})`);
      await api.step(80);
      s = await api.summary();
      assert(s.top.chorus.length === dishes.length && s.top.bubbles.length === dishes.length, `ONE bubble per dish of the order, not one per diner (${s.top.bubbles.length} bubbles for ${dishes.length} dishes)`);
      assert(s.top.chorus.every((c, k) => c.joined === c.count && c.count === dishes[k].members.length && c.title.startsWith(c.count + ' X ')),
        `every diner has joined their dish's bubble and its band counts them (${s.top.chorus.map((c) => c.title).join(' / ')})`);
      assert(s.top.dishes.every((g, i) => dishes[g].members.includes(i)), `every diner's tail hangs from the bubble of the dish they ordered (${s.top.dishes.join()})`);
      const boxes = s.top.chorus.map((c) => c.box);
      assert(boxes.every((b, k) => k === 0 || b[1] + b[3] < boxes[k - 1][1]), `the bubbles stack up the sky without overlapping (${boxes.map((b) => b.join(':')).join(' ')})`);
      assert((await api.errors()).length === 0, 'no errors drawing the line');
      await api.shot('giant-line');
      await api.press(0, { action: true }, 2, 4);
      for (let i = 0; i < 20 && (await api.screen()) !== 'kitchen'; i++) await api.step(6);
      s = await api.summary();
      assert(s.screen === 'kitchen' && s.top.orders.length === total && s.top.orders.join() === recipes.join(), `the kitchen takes the whole line's ${total} orders as one (${s.top.orders.length})`);
      assert(s.top.dishes.join() === dishes.map((g) => g.id).join() && s.top.counts.join() === dishes.map((g) => g.members.length).join(),
        `and reads them by dish, as the bubbles did (${s.top.ticket.join(' / ')})`);
    });
  },

  async stage(server) {
    await withPage(server, 'skipTo=stage&critters=0,1', async (api) => {
      await api.step(5);
      let s = await api.summary();
      assert(s.screen === 'stage', `the board comes up (on ${s.screen})`);
      const shape = DAY_SHAPES[0];
      assert(s.top.lines === shape.lines.length && s.run.lines.length === shape.lines.length, `the opening day pins up ${shape.lines.length} lines (${s.top.lines})`);
      assert(s.top.closed === false && s.top.chosen === 0, 'it opens open: the truck is not yet on the road');
      assert(s.run.day === 0 && s.run.days === DAYS_PER_WEEK, `a fresh run opens on day 1 of ${DAYS_PER_WEEK} (${s.run.day + 1})`);
      assert(s.top.head === `DAY 1 OF ${DAYS_PER_WEEK} - ${shape.name}`, `the sign over the board names the day (${s.top.head})`);
      const places = s.run.lines.map((l) => l.place);
      assert(new Set(places).size === places.length && places.every((p) => STOPS.some((x) => x.id === p)), `every line waits at a different stop in town (${places.join()})`);
      assert(s.run.lines.every((l, i) => l.customers.length === shape.lines[i]), `its lines are ${shape.lines.join()} customers long (${s.run.lines.map((l) => l.customers.length).join()})`);
      assert(s.run.recipes.length === shape.recipes && new Set(s.run.recipes).size === shape.recipes, `the menu is ${shape.recipes} different recipes (${s.run.recipes.join()})`);
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
    // and the WEEK, which is what a run actually plays: five days off one seed, every one of them pure
    const wa = planWeek(1), wb = planWeek(1), wc = planWeek(2);
    assert(JSON.stringify(wa) === JSON.stringify(wb) && JSON.stringify(wa) !== JSON.stringify(wc), 'the same seed lays the same week out, another another');
    assert(wa.length === DAYS_PER_WEEK, `a week is ${DAYS_PER_WEEK} days (${wa.length})`);
    const forced = planWeek(1, { order: 4 })[0];
    assert(forced.recipes[0] === ORDERS[3].id && forced.lines[0].customers[0].recipe === ORDERS[3].id, `?order=4 puts ${ORDERS[3].id} on the menu and in the first customer's paws (${forced.recipes.join()}; first ${forced.lines[0].customers[0].recipe})`);
    const fixed = planWeek(1, { recipes: [0, 2] })[0];
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
        run.served = run.lines.reduce((t, l) => t + l.customers.length, 0);
        run.score = 1300;
        run.lastServed = run.lines.length - 1;
      });
      await api.goto('stage');
      await api.step(20);
      const s = await api.summary();
      assert(s.top.closed === true, 'a board with every line served closes the truck for the night');
      assert(s.run.dayComplete === true && s.run.linesServed === s.run.lines.length && s.run.phase === 'closed', `the day is done (${s.run.linesServed} of ${s.run.lines.length} lines, ${s.run.phase})`);
      const want = 3 + (s.run.served - 1) * 2;
      assert(s.run.stars === want, `the day's stars are every customer's added up (${s.run.stars} of a wanted ${want})`);
      assert(s.top.weekDone === false, 'the FIRST day closing is not the week closing');
      assert(s.top.strip.length === DAYS_PER_WEEK && s.top.strip[0] === `${want}/${dishesIn(DAY_SHAPES[0]) * 3}`, `the week strip carries tonight's stars (${s.top.strip.join(' ')})`);
      assert(s.top.strip.slice(1).every((c) => c.startsWith('-')), 'and the days still to come are blank');
      await api.shot('stage-closing');
      // the hinge: the one press drives into the garage, and the garage's way out opens TOMORROW, not the title
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      const g = await api.summary();
      assert(g.screen === 'garage' && g.top.from === 'night' && g.top.exit === 'OPEN TOMORROW', `the press off a closed first day drives into the garage (on ${g.screen}, '${g.top.exit}')`);
      await api.press(0, { cancel: true }, 2, 6);
      await api.step(70);
      const t = await api.summary();
      assert(t.screen === 'stage', `leaving the garage opens the next board (on ${t.screen})`);
      assert(t.run.day === 1 && t.top.closed === false, `which is day 2, open (day ${t.run.day + 1}, closed ${t.top.closed})`);
      assert(t.run.needs.every((n) => n.split(':')[1].startsWith('0/')), 'with an empty pantry: nothing carries between days');
      assert(t.run.truckAt === 'home' && t.run.served === 0 && t.run.linesServed === 0, 'the truck back in the yard and nothing served');
      assert(t.top.strip[0] === `${want}/${dishesIn(DAY_SHAPES[0]) * 3}`, 'and yesterday still on the strip');
    });
  },

  /** The LAST day of the week is the one that ends the game: its board goes back to the title, not on to day six. */
  async stageWeekEnd(server) {
    await withPage(server, `skipTo=stage&critters=0,1&day=${DAYS_PER_WEEK}`, async (api, page) => {
      await api.step(2);
      let s = await api.summary();
      assert(s.run.day === DAYS_PER_WEEK - 1, `?day= opens the last day (${s.run.day + 1} of ${DAYS_PER_WEEK})`);
      assert(s.run.lines.length === DAY_SHAPES[DAYS_PER_WEEK - 1].lines.length, `with the fete's ${DAY_SHAPES[DAYS_PER_WEEK - 1].lines.length} queues (${s.run.lines.length})`);
      await page.evaluate(() => {
        const run = window.__game.game.run;
        for (const n of run.needs) { n.have = n.amount; n.used = n.amount; }
        for (const l of run.lines) { l.served = true; for (const c of l.customers) c.stars = 3; }
        run.served = run.lines.reduce((t, l) => t + l.customers.length, 0);
        run.score = 4200;
        run.lastServed = run.lines.length - 1;
      });
      await api.goto('stage');
      await api.step(20);
      s = await api.summary();
      assert(s.top.closed === true && s.top.weekDone === true, 'the last day closing closes the WEEK');
      assert(s.run.weekComplete === true, 'and the run says so');
      await api.shot('stage-week');
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      s = await api.summary();
      assert(s.screen === 'garage' && s.top.exit === 'SEE THE WEEK OUT', `the last night of the week still ends in the garage (on ${s.screen}, '${s.top.exit}')`);
      await api.press(0, { cancel: true }, 2, 6);
      await api.step(70);
      assert((await api.screen()) === 'title', `and the way out of it at the end of the week is the title (on ${await api.screen()})`);
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
  const { planDay, planWeek, needsOf, CHOP_TAPS, CHOP_TAPS_CRUNCHY, DAYS_PER_WEEK } = await import('../../src/game/run.ts');
  const { ORDERS } = await import('../../src/content/recipes.ts');
  // a twist lives on a day whose shape deals them, so the search walks the WEEK and remembers which day it found
  // one on - the page is then opened on that day with ?day=
  const find = (kind) => {
    for (let seed = 1; seed < 800; seed++) {
      const week = planWeek(seed);
      for (let d = 0; d < week.length; d++) {
        const p = week[d];
        for (let i = 0; i < p.lines.length; i++) for (let j = 0; j < p.lines[i].customers.length; j++) if (p.lines[i].customers[j].twist === kind) return { seed, day: d, i, j, c: p.lines[i].customers[j] };
      }
    }
    return null;
  };
  const big = find('big'), herb = find('herb'), crunchy = find('crunchy');
  assert(big && herb && crunchy, `the plan rolls every twist inside eight hundred seeds (big ${big && big.seed}, herb ${herb && herb.seed}, crunchy ${crunchy && crunchy.seed})`);
  assert(planWeek(1)[0].lines.every((l) => l.customers.every((c) => !c.twist)), 'and the opening day, whose shape deals none, never carries one');
  assert(planDay(1, { order: 1 }).lines.every((l) => l.customers.every((c) => !c.twist)) && planDay(1, { recipes: [0, 2] }).lines.every((l) => l.customers.every((c) => !c.twist)), 'a dev-jump day never carries a twist');
  const rec = ORDERS.find((o) => o.id === big.c.recipe);
  assert(needsOf(big.c).every((n) => rec.needs.find((r) => r.id === n.id).amount + 1 === n.amount), `a BIG order wants one more of everything (${JSON.stringify(needsOf(big.c))})`);
  assert(needsOf(herb.c).some((n) => n.id === herb.c.extra && n.amount === 1), `a HERB order wants a sprig of ${herb.c.extra} (${JSON.stringify(needsOf(herb.c))})`);
  await withPage(server, `skipTo=stage&critters=0,1&seed=${herb.seed}&day=${herb.day + 1}`, async (api, page) => {
    await api.step(2);
    const s = await api.summary();
    assert(s.run.needs.some((n) => n.startsWith(herb.c.extra + ':')), `the herb is on the shopping list (${s.run.needs.join()})`);
    assert(s.run.lines[herb.i].customers[herb.j].endsWith(':herb/' + herb.c.extra), `and the customer carries the twist (${s.run.lines[herb.i].customers[herb.j]})`);
    await api.shot('stage-twist');
  });
  await withPage(server, `skipTo=stage&critters=0,1&seed=${crunchy.seed}&day=${crunchy.day + 1}`, async (api, page) => {
    await api.step(2);
    const o = await page.evaluate(([i, j]) => { const run = window.__game.game.run; run.startLine(i); run.customer = j; run.order = run.lines[i].customers[j] ? (run.startLine(i), run.order) : run.order; return { chops: run.order.chops, line: run.order.line, twist: run.order.twist }; }, [crunchy.i, crunchy.j]);
    // startLine stands on the line's FRONT customer; the crunchy one may be second, so read it straight off the plan's promise instead
    const front = crunchy.j === 0;
    if (front) assert(o.chops === CHOP_TAPS_CRUNCHY && o.twist === 'crunchy' && o.line.endsWith('EXTRA CRUNCHY!'), `at the hatch a CRUNCHY order chops ${CHOP_TAPS_CRUNCHY} and says so (chops ${o.chops}, '${o.line}')`);
    else assert(o.chops === CHOP_TAPS || o.chops === CHOP_TAPS_CRUNCHY, `an order's chops are one of the two counts (${o.chops})`);
  });
};
/**
 * kitchenGags - the room's two jokes, bigger: a stove step with the lid due rattles the pot lid harder and harder with
 *               steam squirting out under it, blows it off - CLANG! - spinning up like a saucer, and clatters it home
 *               onto the pot; or, with a cook stood at the pot, down onto their head, the stars going round, before
 *               it hops home. An oven step with the flour due puffs a cloud out of the door - POOF! - that
 *               leaves whoever is at the oven flour-white and coughing while they cook on. One in three each on the
 *               seeded rng, so both are forced here through the calls their rolls make; nothing about either scores.
 *               Writes kitchen-lid-rattle / -lid / -lid-head / -flour / -flour-cough.png.
 */
SCENARIOS.kitchenGags = async (server) => {
  /** The lid's clock and the flour's (game/kitchenGags.ts): RATTLE rattling, then off with the CLANG!, UP, DOWN,
   *  CLATTER on the pot; on a head OW! OW_LATE in, LID_HAT there, HOP home. Floured FLOUR_FRAMES, the first cough
   *  COUGH_AT in. */
  const RATTLE = 32, UP = 14, DOWN = 16, CLATTER = 14, LID_HAT = 48, HOP = 16, OW_LATE = 28, FLOUR_FRAMES = 150, COUGH_AT = 58;
  /** The pot's x (art/kitchenProps.ts POT, the stove's prop), which is inside the oven's reach; the oven's station index. */
  const POT_X = 362, OVEN = 4;
  const cards = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());
  await withPage(server, 'skipTo=kitchen&critters=0,1&order=1', async (api, page) => {
    await api.step(2);
    const s0 = await api.summary();
    assert(s0.top.chops === 10 && s0.top.lids === 0 && s0.top.poofs === 0 && s0.top.lidT === -1, `a plain order chops ten and nothing has rattled yet (chops ${s0.top.chops}, lidT ${s0.top.lidT})`);
    const lid = () => page.evaluate(() => window.__game.game.screen.gags.lid());
    // THE LID, with nobody near the pot: the rattle builds, then it is off
    await lid();
    await api.step(RATTLE - 4);
    let s = await api.summary();
    assert(s.top.lids === 1 && s.top.lidT === RATTLE - 4, `the lid rattles, harder and harder (lidT ${s.top.lidT})`);
    await api.shot('kitchen-lid-rattle');
    // THE BANG: off it goes, CLANG!, spinning up
    await api.step(4 + 8);
    assert((await cards(page)) >= 1, 'CLANG! is up as it blows off');
    await api.shot('kitchen-lid');
    await api.step(UP - 8 + 2);
    s = await api.summary();
    assert(s.top.lidT === RATTLE + UP + 2 && s.top.lidOn === -1, `past the top of its flight, with nobody at the pot to come down on (lidT ${s.top.lidT}, on ${s.top.lidOn})`);
    await api.step(DOWN - 2 + CLATTER);
    s = await api.summary();
    assert(s.top.lidT === -1 && s.top.lidHome === true, `it clatters back down onto the pot and stays there (lidT ${s.top.lidT}, home ${s.top.lidHome})`);
    // ...and with a cook stood at the pot, it comes down on their head
    await api.hold(1, { right: true });
    await api.step((POT_X - s.top.seats[1][1]) / 2);   // two px a frame
    await api.release(1);
    s = await api.summary();
    assert(s.top.seats[1][1] === POT_X && s.top.seats[1][2] === OVEN, `seat 1 stands in front of the pot, at the oven (x ${s.top.seats[1][1]}, station ${s.top.seats[1][2]})`);
    await lid();
    await api.step(RATTLE + UP + DOWN + OW_LATE + 6);
    s = await api.summary();
    assert(s.top.lidOn === 1 && s.top.lids === 2, `this time it comes down on seat 1's head (on ${s.top.lidOn})`);
    assert((await cards(page)) >= 1, 'stars, and then: OW!');
    await api.shot('kitchen-lid-head');
    await api.step(LID_HAT + HOP + CLATTER);
    s = await api.summary();
    assert(s.top.lidT === -1 && s.top.lidHome === true, `then it hops home onto the pot (lidT ${s.top.lidT})`);

    // THE FLOUR: seat 1 is at the oven when the bake is done, and the door puffs it white
    await page.evaluate(() => { const sc = window.__game.game.screen; sc.gags.poof(sc.seats, sc.seats[1]); });
    await api.step(8);
    s = await api.summary();
    assert(s.top.poofs === 1 && s.top.flour[1] > FLOUR_FRAMES - 10 && s.top.flour[0] === 0, `POOF: whoever was at the oven is floured, nobody else (flour ${s.top.flour})`);
    assert((await cards(page)) >= 1, 'POOF! is up');
    await api.shot('kitchen-flour');
    await api.step(COUGH_AT - 8 + 4);
    s = await api.summary();
    assert(s.top.seats[1][3] === 'cough', `stood in it, they cough (${s.top.seats[1][3]})`);
    assert((await cards(page)) >= 1, 'COUGH');
    await api.shot('kitchen-flour-cough');
    // and they cook on: the stick walks in the flour
    await api.hold(1, { left: true });
    await api.step(10);
    await api.release(1);
    s = await api.summary();
    assert(s.top.seats[1][1] === POT_X - 20 && s.top.flour[1] > 0, `floured, the stick still walks (x ${s.top.seats[1][1]}, flour ${s.top.flour[1]})`);
    await api.step(FLOUR_FRAMES);
    s = await api.summary();
    assert(s.top.flour.every((v) => v === 0) && s.top.total === 0 && s.top.scores.every((v) => v === -1), `the flour shakes off, and nothing was scored or lost (flour ${s.top.flour}, total ${s.top.total})`);
    assert((await api.errors()).length === 0, 'no errors drawing the lid and the flour');
  });
};

