// Playtest scenarios for THE RECIPE BOOK (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   book - the screen itself: reachable from the title, paging through the dishes and the three back pages, a
//        cooked dish inked in and an uncooked one in pencil, and CANCEL back out. Writes tools/screens/book.png.
//   bookRecords - closing a day BANKS it: every dish cooked, every diner fed, everything gathered and everywhere
//        the truck went. Re-opening the same closed board counts it once.
//   bookInvariant - the book never reaches the simulation: two pages with completely different books lay out a
//        byte-identical day off the same seed. This is what makes a saved file safe in a lockstep game.
import { withPage, assert } from '../playtest.js';
import { ORDERS } from '../../src/content/recipes.ts';
import { serveDay } from './week.js';

export const SCENARIOS = {
  async book(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      let s = await api.summary();
      const row = s.top.menu.indexOf('BOOK');
      assert(row > 0, `BOOK is on the title menu (${s.top.menu.join()})`);
      // walk down to it and open it
      for (let i = 0; i < row; i++) { await api.press(0, { down: true }, 2, 4); }
      s = await api.summary();
      assert(s.top.row === 'BOOK', `the cursor is on BOOK (${s.top.row})`);
      await api.press(0, { action: true }, 2, 6);
      await api.step(10);
      s = await api.summary();
      assert(s.screen === 'book', `and it opens the book (on ${s.screen})`);
      assert(s.top.title === 'THE DISHES' && s.top.page === 0, `on the first page of the dishes (${s.top.title})`);
      assert(s.top.cells > 0, `with dish cells on it (${s.top.cells})`);
      assert(s.top.strap.endsWith(`OF ${ORDERS.length} COOKED`), `the strap counts the whole menu (${s.top.strap})`);
      await api.shot('book');
      // every page turns, and the three back pages are there
      const titles = new Set([s.top.title]);
      for (let i = 1; i < s.top.pages; i++) {
        await api.press(0, { right: true }, 2, 4);
        const t = await api.summary();
        titles.add(t.top.title);
        assert(t.top.page === i, `page ${i + 1} turns (${t.top.page + 1})`);
        if (t.top.title === 'THE DINERS') {
          assert(t.top.busts === t.top.rows && t.top.busts > 0, `every diner has a portrait built for them (${t.top.busts} for ${t.top.rows} rows)`);
          await api.shot('book-diners');
        }
      }
      for (const want of ['THE DISHES', 'THE DINERS', 'THE LARDER', 'THE ROAD']) {
        assert(titles.has(want), `the book has a ${want} page (${[...titles].join()})`);
      }
      await api.shot('book-road');
      // right off the end comes back round, and CANCEL leaves
      await api.press(0, { right: true }, 2, 4);
      assert((await api.summary()).top.page === 0, 'the pages wrap');
      await api.press(0, { cancel: true }, 2, 6);
      await api.step(10);
      assert((await api.screen()) === 'title', `CANCEL goes back to the title (on ${await api.screen()})`);
    });
  },

  async bookRecords(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      let s = await api.summary();
      const cooked = s.run.lines.flatMap((l) => l.customers.map((c) => c.split(':')[1]));
      const distinct = [...new Set(cooked)];
      assert(await page.evaluate(() => !localStorage.getItem('foodie-truck.book')), 'the book starts empty');
      await serveDay(page, 3);
      await api.goto('stage');
      await api.step(20);
      const banked = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('foodie-truck.book')); } catch { return null; } });
      assert(banked && banked.days === 1, `closing the day banks it (days ${banked && banked.days})`);
      assert(distinct.every((id) => banked.dishes[id] && banked.dishes[id].n > 0), `every dish cooked today is in the book (${distinct.join()})`);
      assert(distinct.every((id) => banked.dishes[id].first === 1), 'each of them first cooked on day 1');
      assert(Object.keys(banked.diners).length > 0 && Object.values(banked.diners).every((d) => d.n > 0), `the diners fed are in it (${JSON.stringify(banked.diners)})`);
      assert(Object.keys(banked.larder).length > 0, `the larder carries what was gathered (${Object.keys(banked.larder).join()})`);
      assert(Object.keys(banked.road).length > 0, `the road carries where the truck went (${Object.keys(banked.road).join()})`);
      assert(banked.weeks === 0, 'but not a finished week: it is day one of five');
      // the SAME closed board, opened again, must not count twice
      const before = JSON.stringify(banked);
      await api.goto('stage');
      await api.step(20);
      const again = await page.evaluate(() => localStorage.getItem('foodie-truck.book'));
      assert(JSON.stringify(JSON.parse(again)) === before, 'a board that opens closed twice banks the day once');
      // and the screen reads it back
      await api.goto('book');
      await api.step(5);
      let b = await api.summary();
      assert(b.top.days === 1, `the book screen reads the day back (${b.top.days})`);
      assert(b.top.strap === `${distinct.length} OF ${ORDERS.length} COOKED`, `and counts today's dishes against the whole menu (${b.top.strap})`);
      // page to where one of today's dishes lives and check it is INKED, not pencilled
      const perPage = b.top.cells;
      const want = Math.floor(ORDERS.findIndex((o) => o.id === distinct[0]) / perPage);
      for (let i = 0; i < want; i++) await api.press(0, { right: true }, 2, 4);
      b = await api.summary();
      assert(b.top.page === want, `paged to where ${distinct[0]} lives (page ${b.top.page + 1})`);
      assert(b.top.known >= 1, `and it is inked in rather than pencilled (${b.top.known} known on the page)`);
      await api.shot('book-cooked');
      // the diners page, with somebody actually fed on it
      const dinersPage = b.top.pages - 3;
      for (let i = b.top.page; i < dinersPage; i++) await api.press(0, { right: true }, 2, 4);
      const d = await api.summary();
      assert(d.top.title === 'THE DINERS', `paged to the diners (${d.top.title})`);
      assert(d.top.known >= 1, `at least one of them has been fed (${d.top.known} of ${d.top.rows})`);
      await api.shot('book-diners-fed');
      assert(b.top.strap.startsWith(`${distinct.length} OF `) || Number(b.top.strap.split(' ')[0]) >= 1, `and knows how much of the menu is cooked (${b.top.strap})`);
    });
  },

  async bookInvariant(server) {
    // THE INVARIANT: the book records, it never unlocks. A page carrying a big book and a page carrying none must
    // lay out the same day off the same seed - otherwise two peers with different saves would desync.
    const dayOf = (s) => JSON.stringify({ recipes: s.run.recipes, lines: s.run.lines, needs: s.run.needs, weather: s.run.weather });
    let empty = null, full = null;
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920&day=2', async (api) => {
      await api.step(3);
      empty = dayOf(await api.summary());
    });
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920&day=2', async (api, page) => {
      // stuff the book with every recipe in the game, as if this truck had cooked for years
      await page.evaluate((ids) => {
        const dishes = {};
        for (let i = 0; i < ids.length; i++) dishes[ids[i]] = { n: 40 + i, stars: 3, first: 1 };
        localStorage.setItem('foodie-truck.book', JSON.stringify({
          v: 1, dishes, diners: { owl: { n: 99, fav: ids[0], favN: 40 } }, larder: { apple: 500 }, road: { orchard: 99 }, days: 200, weeks: 40, last: '',
        }));
      }, ORDERS.map((o) => o.id));
      await api.goto('stage');
      await api.step(3);
      full = dayOf(await api.summary());
      const b = await api.summary();
      assert(b.run.seed === 481920 && b.run.day === 1, 'the stuffed page is on the same seed and day');
    });
    assert(empty && full && empty === full, 'a page with a full book and a page with none lay out a BYTE-IDENTICAL day');
  },
};
