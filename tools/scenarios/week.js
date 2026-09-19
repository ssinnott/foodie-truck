// Playtest scenarios for THE WEEK (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   week - the five days have SHAPES and not just seeds: the opening day is short and twistless, market day cuts
//        the menu without cutting the queues, day four is always wet, and the fete is four queues with one of them
//        three deep on a menu drawn from what the week already served. Writes tools/screens/week-strip.png.
//   weekRollover - the closed board is the HINGE: confirming it opens tomorrow with a new menu, a new shopping
//        list, an empty pantry and the truck back in the yard, with yesterday still on the week strip. Nothing
//        carries but the record, the takings and the party.
//   weekResume - a closed day writes the week to storage; the title turns PLAY into CONTINUE; CONTINUE reseats
//        the saved party and opens the saved day, with the days already closed back on the strip.
//   weekFresh - PLAY over a week in progress forgets it, so CONTINUE cannot resurrect last week's Thursday.
import { withPage, assert } from '../playtest.js';
import { DAY_SHAPES, DAYS_PER_WEEK, dishesIn, planWeek } from '../../src/game/run.ts';

/** Serve every queue of the day the page is standing in, without playing it: the board is what these test. */
export function serveDay(page, stars = 3) {
  return page.evaluate((st) => {
    const run = window.__game.game.run;
    for (const n of run.needs) n.have = n.amount;
    let i;
    while ((i = run.lines.findIndex((l) => !l.served)) >= 0) {
      run.startLine(i);
      while (!run.lineDone()) run.serve(st);
    }
    run.lastServed = run.lines.length - 1;
  }, stars);
}

export const SCENARIOS = {
  async week(server) {
    // every day, opened on its own through ?day=, is the shape DAY_SHAPES says it is
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const shape = DAY_SHAPES[d];
      await withPage(server, `skipTo=stage&critters=0,1&seed=481920&day=${d + 1}`, async (api) => {
        await api.step(3);
        const s = await api.summary();
        assert(s.run.day === d, `?day=${d + 1} opens day ${d + 1} (${s.run.day + 1})`);
        assert(s.run.lines.length === shape.lines.length, `day ${d + 1} forms ${shape.lines.length} queues (${s.run.lines.length})`);
        assert(s.run.lines.every((l, i) => l.customers.length === shape.lines[i]), `its queues are ${shape.lines.join()} deep (${s.run.lines.map((l) => l.customers.length).join()})`);
        assert(s.run.recipes.length === shape.recipes, `its menu is ${shape.recipes} recipes (${s.run.recipes.length})`);
        const expect = `DAY ${d + 1} OF ${DAYS_PER_WEEK}` + (shape.name ? ` - ${shape.name}` : '');
        assert(s.top.head === expect, `the sign reads '${expect}' (${s.top.head})`);
        if (!shape.twists) assert(s.run.lines.every((l) => l.customers.every((c) => !c.split(':')[3])), `day ${d + 1} deals no twists`);
        if (shape.weather === 'clear') assert(s.run.weather === 0, `day ${d + 1} is always clear (${s.run.weather})`);
        if (shape.weather === 'wet') assert(s.run.weather === 1 || s.run.weather === 2, `day ${d + 1} is always wet (${s.run.weather})`);
        assert(s.top.strip.length === DAYS_PER_WEEK, `the board shows the whole week (${s.top.strip.length} chips)`);
      });
    }
    // the fete is the one that looks back
    const fete = DAY_SHAPES.findIndex((sh) => sh.fromWeek);
    const week = planWeek(481920);
    const before = new Set(week.slice(0, fete).flatMap((p) => p.recipes));
    assert(week[fete].recipes.every((r) => before.has(r)), 'the fete cooks the week again: nothing on its menu is new');
    assert(dishesIn(DAY_SHAPES[fete]) > dishesIn(DAY_SHAPES[0]), 'and it is the biggest day of the week');
  },

  async weekRollover(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      let s = await api.summary();
      const menu1 = s.run.recipes.join(), list1 = s.run.needs.join();
      assert(s.run.day === 0, 'a fresh run opens on day 1');
      await serveDay(page, 3);
      await api.goto('stage');
      await api.step(20);
      s = await api.summary();
      assert(s.top.closed === true && s.top.weekDone === false, 'the day closes but the week does not');
      const starsD1 = s.run.stars;
      assert(s.top.strip[0] === `${starsD1}/${dishesIn(DAY_SHAPES[0]) * 3}`, `tonight lands on the strip (${s.top.strip.join(' ')})`);
      await api.shot('week-strip');
      // the hinge
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.day === 1 && s.top.closed === false, `confirming opens day 2's board (day ${s.run.day + 1}, closed ${s.top.closed})`);
      assert(s.run.recipes.join() !== menu1 || s.run.needs.join() !== list1, 'tomorrow is a different day, not the same one again');
      assert(s.run.needs.every((n) => n.split(':')[1].startsWith('0/')), `the pantry is EMPTY: nothing carries between days (${s.run.needs.join()})`);
      assert(s.run.served === 0 && s.run.linesServed === 0 && s.run.truckAt === 'home', 'nothing served and the truck back in the yard');
      assert(s.top.strip[0] === `${starsD1}/${dishesIn(DAY_SHAPES[0]) * 3}` && s.top.strip[1].startsWith('-'), `yesterday is still on the strip and today is not (${s.top.strip.join(' ')})`);
      assert(s.run.weekStars[0] === starsD1, `the week's record carries day 1 (${JSON.stringify(s.run.weekStars)})`);
      // and again, so the roll-over is not a one-off
      await serveDay(page, 2);
      await api.goto('stage');
      await api.step(20);
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      s = await api.summary();
      assert(s.run.day === 2 && s.top.closed === false, `and on to day 3 (day ${s.run.day + 1})`);
      assert(s.run.weekStars.length === 2, `two days banked (${JSON.stringify(s.run.weekStars)})`);
    });
  },

  async weekResume(server) {
    await withPage(server, 'skipTo=stage&critters=0,3&seed=481920', async (api, page) => {
      await api.step(3);
      await serveDay(page, 3);
      await api.goto('stage');
      await api.step(20);
      let s = await api.summary();
      const banked = s.run.stars;
      // the one write of the night
      const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('foodie-truck.week')); } catch { return null; } });
      assert(saved && saved.seed === 481920, `the closed board writes the week to storage (${JSON.stringify(saved)})`);
      assert(saved.day === 1, `pointed at the day still to open (${saved && saved.day})`);
      assert(saved.critters.join() === '0,3', `with the party that was sitting down (${saved && saved.critters.join()})`);
      assert(!saved.lines && !saved.needs && !saved.week, 'and nothing that could be re-derived from the seed');
      // the title turns PLAY into CONTINUE
      await api.goto('title');
      await api.step(5);
      s = await api.summary();
      assert(s.top.row === 'CONTINUE' && s.top.menu[0] === 'CONTINUE', `the first row is CONTINUE, not PLAY (${s.top.menu.join()})`);
      assert(s.top.week && s.top.week.day === 1 && s.top.week.seed === 481920, `and it knows which week (${JSON.stringify(s.top.week)})`);
      // pressing it picks the week up
      await api.press(0, { action: true }, 2, 6);
      await api.step(20);
      s = await api.summary();
      assert(s.screen === 'stage', `CONTINUE opens the board directly, with no character select (on ${s.screen})`);
      assert(s.run.day === 1 && s.run.seed === 481920, `on the saved day of the saved week (day ${s.run.day + 1}, seed ${s.run.seed})`);
      assert(s.run.party.join() === 'barley,cress', `with the saved party reseated (${s.run.party.join()})`);
      assert(s.run.weekStars[0] === banked, `and day 1 back on the strip (${JSON.stringify(s.run.weekStars)})`);
      await api.shot('week-continue');
    });
  },

  /** A peer in a live match plays the HOST'S week and must not save it as its own - but it DOES write its book. */
  async weekOnlineGuard(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      await serveDay(page, 3);
      // stand a live match up under the board
      // the shape the board actually reads (`game.net.active`), plus the summary hook the test harness calls
      await page.evaluate(() => { window.__game.game.net = { active: true, summary: () => ({ faked: true }) }; });
      await api.goto('stage');
      await api.step(20);
      const s = await api.summary();
      assert(s.top.closed === true && s.run.weekStars[0] === s.run.stars, 'the board still closes the day and banks it into the run');
      const saved = await page.evaluate(() => localStorage.getItem('foodie-truck.week'));
      assert(saved === null, `but a peer in a match writes no week of its own (${saved})`);
      const book = await page.evaluate(() => localStorage.getItem('foodie-truck.book'));
      assert(book !== null, 'while the BOOK is written either way, because it records what this player cooked');
    });
  },

  async weekFresh(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      await serveDay(page, 3);
      await api.goto('stage');
      await api.step(20);
      assert(await page.evaluate(() => !!localStorage.getItem('foodie-truck.week')), 'a week is in progress');
      // PLAY, all the way through the character select, is a FRESH week
      await api.goto('title');
      await api.step(5);
      let s = await api.summary();
      assert(s.top.menu[0] === 'CONTINUE', 'the title offers to continue it');
      // now walk in through PLAY instead: the character select starts a fresh week and forgets the saved one
      await api.goto('select');
      await api.step(5);
      await api.press(0, { action: true }, 2, 4);
      await api.press(0, { action: true }, 2, 4);
      await api.step(80);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.day === 0, `a fresh PLAY opens on day 1 (on ${s.screen}, day ${s.run.day + 1})`);
      assert(await page.evaluate(() => !localStorage.getItem('foodie-truck.week')), 'and the week in progress is forgotten, so CONTINUE cannot resurrect it');
    });
  },
};
