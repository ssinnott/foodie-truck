// Playtest scenarios for THE ORDER BOARD (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   stage - the board a run passes through before every dish: seven stages on it, the cursor walking both rows,
//        and CONFIRM taking an order off the board - which must be the stage the cursor stood on, with an empty
//        ticket and the truck pointed at that order's first landmark. Writes tools/screens/stage-board.png.
//   stageServed - the hand-back: results banks the stars and the board re-opens with that stage stamped SERVED,
//        its stars printed on the card, and the cursor already standing on a stage still to be cooked.
//   stageClosing - the END: with every stage served the board closes the truck for the night, prints the day's
//        card and the only thing left to press goes back to the title. Writes tools/screens/stage-closing.png.
import { withPage, assert } from '../playtest.js';
import { ORDERS } from '../../src/content/recipes.ts';

export const SCENARIOS = {
  async stage(server) {
    await withPage(server, 'skipTo=stage&critters=0,1', async (api) => {
      await api.step(5);
      let s = await api.summary();
      assert(s.screen === 'stage', `the board comes up (on ${s.screen})`);
      assert(s.top.stages === ORDERS.length, `every order in the book is pinned to it (${s.top.stages} of ${ORDERS.length})`);
      assert(s.top.sel === 0 && s.top.closed === false, `it opens on the first stage still to be served (sel ${s.top.sel})`);
      assert(s.top.stars.every((n) => n === 0) && s.top.cleared === 0, `nothing on the day's card yet (${s.top.stars.join()})`);
      await api.shot('stage-board');

      // the cursor walks the row, then drops to the second row: seven cards, four across the top
      await api.press(0, { right: true }, 2, 4);
      assert((await api.summary()).top.sel === 1, 'right moves along the row');
      await api.press(0, { down: true }, 2, 4);
      s = await api.summary();
      assert(s.top.sel === 5, `down drops to the card under it (sel ${s.top.sel})`);
      await api.press(0, { up: true }, 2, 4);
      await api.press(0, { left: true }, 2, 4);
      s = await api.summary();
      assert(s.top.sel === 0, `up and left come back to where it started (sel ${s.top.sel})`);

      // ...and a stage two along is the one the run takes off the board
      await api.press(0, { right: true }, 2, 4);
      await api.press(0, { right: true }, 2, 4);
      const want = await api.summary();
      assert(want.top.sel === 2, `the cursor is on the third card (sel ${want.top.sel})`);
      await api.press(0, { action: true }, 2, 4);
      await api.step(60);
      s = await api.summary();
      assert(s.screen === 'map', `taking the order opens the map (on ${s.screen})`);
      assert(s.run.stage === 2 && s.run.dish === ORDERS[2].dish, `...on the stage the cursor stood on (${s.run.stage}, ${s.run.dish})`);
      assert(s.run.needs.every((n) => n.endsWith(':0/' + n.split('/')[1])), `with nothing gathered yet (${s.run.needs.join()})`);
      assert(s.run.truckAt === 'home' && s.top.dest !== 'home', `the truck is home and pointed at a landmark (dest ${s.top.dest})`);
    });
  },

  async stageServed(server) {
    await withPage(server, 'skipTo=results&critters=0&order=2', async (api) => {
      await api.step(150);
      const before = await api.summary();
      const stars = before.top.stars;
      await api.press(0, { action: true }, 1, 2);
      const s = await api.summary();
      assert(s.screen === 'stage', `results hands back to the board (on ${s.screen})`);
      assert(s.run.served === 1 && s.run.stars[1] === stars, `the stage carries the stars it was served at (${s.run.stars.join()})`);
      assert(s.run.cleared === 1 && s.run.dayComplete === false, `one stage down, the day still open (cleared ${s.run.cleared})`);
      assert(s.top.sel !== 1, `the cursor has moved on to a stage still to be cooked (sel ${s.top.sel})`);
      await api.step(30);
      await api.shot('stage-served');
    });
  },

  async stageClosing(server) {
    await withPage(server, 'skipTo=stage&critters=0,1,2,3', async (api, page) => {
      // the day, played out: every stage banked. The board is what has to notice, so it is the only thing
      // this scenario drives - the seven runs behind it are the playthrough scenario's job.
      await page.evaluate(() => {
        const run = window.__game.game.run;
        for (const st of run.stages) st.stars = 2;
        run.stages[0].stars = 3;
        run.served = run.stages.length;
        run.score = 1500;
        run.lastServed = run.stages.length - 1;
      });
      await api.goto('stage');
      await api.step(20);
      const s = await api.summary();
      assert(s.top.closed === true, 'a board with every stage served closes the truck for the night');
      assert(s.run.dayComplete === true && s.run.cleared === ORDERS.length, `the day's card is full (${s.run.cleared} of ${ORDERS.length})`);
      await api.shot('stage-closing');
      await api.press(0, { action: true }, 2, 6);
      assert((await api.screen()) === 'title', `and the last press goes back to the title (on ${await api.screen()})`);
    });
  },
};
