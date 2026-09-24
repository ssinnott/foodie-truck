// Playtest scenarios for THE GARAGE (docs/GDD.md section 13; registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   garagePrices - the catalogue is balanced against a week of tips: three slots, a free stock piece and two to buy
//        in each, and every price one ordinary week can pay for - so a week buys about one thing.
//   garageTin - a closed board pays the day's tips into the tin, and a board that opens closed twice pays once.
//   garageBuy - in the garage off a closed board: flipping to a piece shows it on the truck, confirm asks, confirm
//        again buys it and wears it; a piece the tin cannot cover is refused and costs nothing; the way out saves
//        the garage and opens tomorrow, and the map's truck wears what was bought. Writes tools/screens/garage.png.
//   garageTryOn - flipping to a piece not bought only TRIES it on: leaving puts the owned one back.
//   garageTitle - the title's GARAGE row opens it between weeks, with nobody in the truck, and BACK goes home.
//   garageOnline - a closed board in a live match skips the garage: no coins banked, and the press opens tomorrow.
//   garageJunk - junk in storage is an empty garage, and a slot worn with something never bought goes back to stock.
import { withPage, assert } from '../playtest.js';
import { serveDay } from './week.js';
import { PARTS, SLOTS, partsFor } from '../../src/content/garage.ts';
import { TIP_COINS, DAY_SHAPES, dishesIn } from '../../src/game/run.ts';

const readTin = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('foodie-truck.garage')); } catch { return null; } });
const setTin = (page, rec) => page.evaluate((r) => localStorage.setItem('foodie-truck.garage', JSON.stringify({ v: 1, owned: [], wearing: { paint: 'beetroot', awning: 'stripes', roof: 'board' }, banked: '', ...r })), rec);

export const SCENARIOS = {
  async garagePrices() {
    let dishes = 0; for (const s of DAY_SHAPES) dishes += dishesIn(s);
    const twoStar = dishes * TIP_COINS[2], threeStar = dishes * TIP_COINS[3];
    assert(SLOTS.length === 3 && SLOTS.every((s) => partsFor(s.id).length === 3), 'three slots, three options in each');
    assert(SLOTS.every((s) => partsFor(s.id)[0].price === 0), 'the first option of every slot is the free stock piece');
    const forSale = PARTS.filter((p) => p.price > 0);
    assert(forSale.length === 6, `six pieces to buy (${forSale.length})`);
    const ids = forSale.map((p) => p.id);
    assert(['ketchup', 'salad', 'hotdog'].every((id) => ids.includes(id)), `the food paint, the salad awning and the hot dog roof are on sale (${ids.join()})`);
    const lo = Math.min(...forSale.map((p) => p.price)), hi = Math.max(...forSale.map((p) => p.price));
    assert(lo <= twoStar, `a week of two-star cooking (${twoStar} coins) buys the cheapest piece (${lo})`);
    assert(hi <= threeStar && hi > twoStar, `the dearest piece (${hi}) takes a better-than-two-star week (${twoStar}..${threeStar})`);
    const all = forSale.reduce((t, p) => t + p.price, 0), weeks = all / ((twoStar + threeStar) / 2);
    assert(weeks >= 4 && weeks <= 8, `the whole catalogue (${all}) is about one piece a week: ${weeks.toFixed(1)} ordinary weeks`);
  },

  async garageTin(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      await setTin(page, { coins: 5 });
      await serveDay(page, 3);
      let s = await api.summary();
      const want = s.run.served * TIP_COINS[3];
      assert(s.run.score === want, `every dish tipped its coins into the day (${s.run.score} for ${s.run.served} dishes at three stars)`);
      await api.goto('stage');
      await api.step(20);
      s = await api.summary();
      assert(s.top.closed === true && s.top.garage === true, 'the board closes, and off the net it is on its way to the garage');
      let tin = await readTin(page);
      assert(tin && tin.coins === 5 + want, `the day's coins are in the tin (${tin && tin.coins}, wanted ${5 + want})`);
      await api.goto('stage');
      await api.step(20);
      tin = await readTin(page);
      assert(tin.coins === 5 + want, `the same night opened again pays in once (${tin.coins})`);
    });
  },

  async garageBuy(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      // enough, with the opening day's one-star tips, for the mint and not for the hot dog after it
      await setTin(page, { coins: 210 });
      await serveDay(page, 1);
      await api.goto('stage');
      await api.step(20);
      const tip = (await api.summary()).run.served * TIP_COINS[1];
      const coins = 210 + tip;
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      let s = await api.summary();
      assert(s.screen === 'garage' && s.top.coins === coins && s.top.crew === 2, `the closed board drives into the garage, the crew aboard and ${coins} coins in the tin (on ${s.screen}, ${s.top.coins}, crew ${s.top.crew})`);
      assert(s.top.row === 'PAINT' && s.top.wearing.paint === 'beetroot', 'the cursor starts on the paint, and the truck is stock');
      await api.step(12);
      // flip to the mint: it is tried on, not bought
      await api.press(0, { right: true }, 2, 4);
      s = await api.summary();
      assert(s.top.showing[0] === 'mint' && s.top.preview.paint === 'mint' && s.top.wearing.paint === 'beetroot', `flipping to the mint tries it on (${JSON.stringify(s.top.preview)})`);
      assert(s.top.statuses[0] === '220 COINS' && s.top.tag === 'TRYING ON - 220 COINS', `with its price on the slate and a tag under the truck (${s.top.statuses[0]}, '${s.top.tag}')`);
      // confirm asks, confirm again buys
      await api.press(0, { action: true }, 2, 4);
      s = await api.summary();
      assert(s.top.asking === true && s.top.coins === coins, 'the first confirm only asks');
      await api.press(0, { action: true }, 2, 10);
      s = await api.summary();
      assert(s.top.sold === true && s.top.coins === coins - 220 && s.top.owned.includes('paint.mint') && s.top.wearing.paint === 'mint', `the second buys it and wears it (${s.top.coins} coins, ${s.top.owned}, ${s.top.wearing.paint})`);
      await api.shot('garage');
      // the hot dog is dearer than what is left
      await api.press(0, { down: true }, 2, 4);
      await api.press(0, { down: true }, 2, 4);
      await api.press(0, { left: true }, 2, 4);
      s = await api.summary();
      assert(s.top.row === 'ROOF' && s.top.showing[2] === 'hotdog' && s.top.preview.roof === 'hotdog', `the hot dog tried on (${s.top.showing[2]})`);
      await api.press(0, { action: true }, 2, 4);
      await api.press(0, { action: true }, 2, 4);
      s = await api.summary();
      assert(s.top.coins === coins - 220 && !s.top.owned.includes('roof.hotdog') && s.top.asking === false, `too dear: nothing is bought and nothing is paid (${s.top.coins}, ${s.top.owned})`);
      assert(/NEED \d+ MORE/.test(s.top.statuses[2]), `the slate says how much more it needs ('${s.top.statuses[2]}')`);
      // out: the garage is saved and tomorrow opens
      await api.press(0, { cancel: true }, 2, 6);
      await api.step(70);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.day === 1 && s.top.closed === false, `the way out opens day 2 (on ${s.screen}, day ${s.run.day + 1})`);
      const tin = await readTin(page);
      assert(tin.coins === coins - 220 && tin.owned.join() === 'paint.mint' && tin.wearing.paint === 'mint' && tin.wearing.roof === 'board', `the garage is saved as it was left (${JSON.stringify(tin)})`);
      await api.goto('map');
      await api.step(5);
      const style = await page.evaluate(() => window.__game.game.screen.truckStyle);
      assert(style && style.paint === 'mint', `the map's truck wears the new paint (${JSON.stringify(style)})`);
    });
  },

  async garageTryOn(server) {
    await withPage(server, 'skipTo=title&critters=0', async (api, page) => {
      await setTin(page, { coins: 1000, owned: ['awning.gingham'], wearing: { paint: 'beetroot', awning: 'gingham', roof: 'board' } });
      await api.goto('garage', { from: 'title' });
      await api.step(15);
      await api.press(0, { down: true }, 2, 4);
      let s = await api.summary();
      assert(s.top.row === 'AWNING' && s.top.showing[1] === 'gingham', `a saved garage opens on what the truck wears (${s.top.showing[1]})`);
      await api.press(0, { right: true }, 2, 4);
      s = await api.summary();
      assert(s.top.preview.awning === 'salad' && s.top.wearing.awning === 'gingham', 'the salad is tried on over the gingham');
      await api.press(0, { left: true }, 2, 4);
      await api.press(0, { left: true }, 2, 4);
      s = await api.summary();
      assert(s.top.showing[1] === 'stripes' && s.top.wearing.awning === 'stripes', 'flipping to the stock stripes wears them at once: they are owned');
      await api.press(0, { right: true }, 2, 4);
      await api.press(0, { right: true }, 2, 4);
      await api.press(0, { cancel: true }, 2, 6);
      await api.step(70);
      assert((await api.screen()) === 'title', `BACK goes back to the title (on ${await api.screen()})`);
      const tin = await readTin(page);
      assert(tin.wearing.awning === 'gingham' && tin.coins === 1000, `leaving on a piece not bought keeps the owned one worn and the tin untouched (${JSON.stringify(tin.wearing)}, ${tin.coins})`);
    });
  },

  async garageTitle(server) {
    await withPage(server, 'skipTo=title&critters=0', async (api) => {
      await api.step(5);
      let s = await api.summary();
      const row = s.top.menu.indexOf('GARAGE');
      assert(row > 0, `GARAGE is on the title menu (${s.top.menu.join()})`);
      for (let i = 0; i < row; i++) await api.press(0, { down: true }, 2, 4);
      await api.press(0, { action: true }, 2, 6);
      s = await api.summary();
      assert(s.screen === 'garage' && s.top.from === 'title' && s.top.exit === 'BACK' && s.top.crew === 0, `it opens the garage, with nobody in the truck (on ${s.screen}, '${s.top.exit}', crew ${s.top.crew})`);
      assert(s.top.coins === 0 && s.top.wearing.paint === 'beetroot', 'a first visit is an empty tin and the stock truck');
      await api.step(15);
      for (let i = 0; i < 3; i++) await api.press(0, { down: true }, 2, 4);
      s = await api.summary();
      assert(s.top.row === 'BACK', `the last row is the way out (${s.top.row})`);
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      assert((await api.screen()) === 'title', `and confirming it goes home (on ${await api.screen()})`);
    });
  },

  async garageOnline(server) {
    await withPage(server, 'skipTo=stage&critters=0,1&seed=481920', async (api, page) => {
      await api.step(3);
      await setTin(page, { coins: 7 });
      await serveDay(page, 3);
      await page.evaluate(() => { window.__game.game.net = { active: true, summary: () => ({ faked: true }), leave() {} }; });
      await api.goto('stage');
      await api.step(20);
      let s = await api.summary();
      assert(s.top.closed === true && s.top.garage === false, 'in a match the closed board is not headed for the garage');
      const tin = await readTin(page);
      assert(tin.coins === 7, `and nothing is banked from a match (${tin.coins})`);
      await api.press(0, { action: true }, 2, 6);
      await api.step(70);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.day === 1, `the press opens tomorrow directly (on ${s.screen}, day ${s.run.day + 1})`);
      await page.evaluate(() => { window.__game.game.net = null; });
    });
  },

  async garageJunk(server) {
    await withPage(server, 'skipTo=title&critters=0', async (api, page) => {
      await page.evaluate(() => localStorage.setItem('foodie-truck.garage', '{not json'));
      await api.goto('garage', { from: 'title' });
      await api.step(10);
      let s = await api.summary();
      assert(s.top.coins === 0 && s.top.owned.length === 0 && s.top.wearing.roof === 'board', 'junk in storage is an empty garage');
      await api.press(0, { cancel: true }, 2, 6);
      await api.step(70);
      await setTin(page, { coins: -40, owned: ['roof.hotdog', 'roof.rocket', 'paint.beetroot'], wearing: { paint: 'ketchup', awning: 'nope', roof: 'hotdog' } });
      await api.goto('garage', { from: 'title' });
      await api.step(10);
      s = await api.summary();
      assert(s.top.coins === 0, `a negative tin is an empty one (${s.top.coins})`);
      assert(s.top.owned.join() === 'roof.hotdog', `only pieces this build sells are kept (${s.top.owned})`);
      assert(s.top.wearing.paint === 'beetroot' && s.top.wearing.awning === 'stripes' && s.top.wearing.roof === 'hotdog', `what was never bought goes back to stock, what was stays on (${JSON.stringify(s.top.wearing)})`);
    });
  },
};
