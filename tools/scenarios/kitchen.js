// Playtest scenarios for the kitchen work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   kitchen - four seats in the kitchen with the APPLE PIE at the hatch (?order=1: fridge, chop, mix, oven, plate). Seat 0 is walked
//             to each station in turn and given the right input: ten taps on the board in any rhythm, a 240-frame
//             hold on the bowl (with a pause in the middle that costs nothing), a 240-frame hold on the oven, and
//             the bell. The screen must reach results with three stars, then - the line still having someone in
//             it - the line screen with run.served 1 on confirm and the next customer at the hatch. A second pass
//             runs the FISH CAKES order (chop, mix, stove, plate) for the stove's hold and
//             writes tools/screens/kitchen-stove.png with the pot lit mid-hold. The tags are shot as they come up
//             (kitchen-chop / -mix / -oven / -plate / -stove): each carries its owner's colour across its head.
//             The food is followed down the line too: the pulls have landed at the board by the time seat 0 gets
//             there, the tenth chop clears the board and puts the whole batch in the air for the bowl
//             (kitchen-fly.png, mid-arc), it has dropped in by the time seat 0 arrives, and the dish is stacked
//             on the plate before the bell.
//   kitchenPause - `start` from a seat pushes the pause overlay, `cancel` pops it and the kitchen underneath is
//             exactly as it was left (step, scores, owners, seat positions); online the push is refused.
//   kitchenGag - Barley's eat gag hands him an apple and TAKES IT BACK: the rig's held item is cleared with the
//             state, at a spot where no station suggests one; and a push of the stick ends the gag at once, so
//             the joke never holds a player still. Writes tools/screens/kitchen-gag.png.
//   results - opens straight onto results and calls the next in line on action, with the customer banked; and the party
//             is IN the room, one rig per seat facing the hatch, every one of them cheering on a stagger once the
//             stars have landed. Writes tools/screens/results-crew.png.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, assert } from '../playtest.js';

/** Where the harness writes its screenshots (tools/playtest.js SHOTS). */
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screens');

/** The standing spots (art/backgrounds/kitchen.js STATION_X); the scenario walks by summary, not by geometry. */
const STATION_X = [36, 122, 214, 306, 398, 490];
/** Station indices (content/places.js STATIONS). */
export const FRIDGE = 0, CHOP = 1, MIX = 2, STOVE = 3, OVEN = 4, PLATE = 5;

/**
 * Walk seat 0 to a station: hold the direction and step until the summary says it is there (a budget of 400 frames,
 * because Barley's eat gag can lock him for 42 frames on the way), then let go.
 */
export async function walkTo(api, station) {
  let s = await api.summary();
  const x0 = s.top.seats[0][1], target = STATION_X[station];
  await api.hold(0, target > x0 ? { right: true } : { left: true });
  for (let i = 0; i < 40 && s.top.seats[0][2] !== station; i++) { await api.step(10); s = await api.summary(); }
  await api.release(0);
  await api.step(2);
  return api.summary();
}

/** One chop: a press, then a few frames for the next one to be a fresh edge. */
export async function chopOnce(api) {
  await api.press(0, { action: true }, 1, 3);
  return api.summary();
}

/** The fridge: walk to it and tap until the step moves on (one tap per item the order wants, so the count is the order's). */
export async function pullAll(api) {
  let s = await walkTo(api, FRIDGE);
  const step = s.top.step;
  for (let i = 0; i < 16 && s.top.step === step; i++) s = await chopOnce(api);
  return s;
}

/** The fridge, the chop and the mix are the first three steps of both prototype orders; drive them through. */
async function chopAndMix(api) {
  await pullAll(api);
  await walkTo(api, CHOP);
  for (let i = 0; i < 10; i++) await chopOnce(api);
  await walkTo(api, MIX);
  await api.hold(0, { action: true });
  await api.step(241);
  await api.release(0);
  return api.summary();
}

export const SCENARIOS = {
  /**
   * Every ORDERS entry has a finished-dish glyph of its own (art/dishes.ts), and every one of them draws whole and
   * at each of the three bite stages without an error and without vanishing: a dish that fell back to the pie, or
   * a bite clip that ate the whole thing, would put the wrong picture on the plate. Writes tools/screens/dishes.png,
   * the contact sheet of all of them.
   */
  async dishes(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      const r = await page.evaluate(async () => {
        const { DISHES, drawDish } = await import('/src/art/dishes.ts');
        const { ORDERS } = await import('/src/content/recipes.ts');
        const missing = ORDERS.filter((o) => !DISHES[o.id]).map((o) => o.id);
        const extra = Object.keys(DISHES).filter((id) => !ORDERS.some((o) => o.id === id));
        const ids = ORDERS.map((o) => o.id);
        const c = document.createElement('canvas'); c.id = 'dishes'; c.width = 40 * ids.length + 8; c.height = 96;
        c.style.cssText = 'position:fixed;left:0;top:0;width:' + c.width * 2 + 'px;height:192px;image-rendering:pixelated;z-index:99';
        document.body.appendChild(c);
        const g = c.getContext('2d');
        g.fillStyle = '#4F5A62'; g.fillRect(0, 0, c.width, c.height);
        const blank = [], errors = [];
        ids.forEach((id, i) => {
          for (let b = 0; b < 4; b++) {
            const x = 24 + i * 40, y = 14 + b * 22;
            g.fillStyle = '#FFF6E0'; g.fillRect(x - 13, y + 5, 26, 6);
            try { drawDish(g, id, x, y, 7, b); } catch (e) { errors.push(`${id}/${b}: ${e.message}`); continue; }
            // over the plate's cream: any inked pixel means the dish drew; the fourth stage (3 bites) must draw nothing
            const px = g.getImageData(x - 13, y - 12, 26, 17).data;
            let ink = 0; for (let k = 0; k < px.length; k += 4) if (px[k] < 0x60 && px[k + 1] < 0x50) ink++;
            if (b < 3 && ink < 8) blank.push(`${id}/${b}`);
            if (b === 3 && ink > 0) blank.push(`${id}/3 drew ${ink}`);
          }
        });
        return { n: ids.length, missing, extra, blank, errors };
      });
      assert(r.n === 55 && r.missing.length === 0, `every order has a dish glyph (${r.n} orders, missing: ${r.missing.join() || 'none'})`);
      assert(r.extra.length === 0, `no dish glyph is for an order that does not exist (${r.extra.join() || 'none'})`);
      assert(r.errors.length === 0, `every dish draws at every bite stage (${r.errors.join('; ') || 'no errors'})`);
      assert(r.blank.length === 0, `every dish is visible on the plate until the last bite, and gone after it (${r.blank.join() || 'all fine'})`);
      await page.locator('#dishes').screenshot({ path: path.join(SHOTS, 'dishes.png') });
    });
  },

  async kitchen(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1,2,3&order=1', async (api) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'kitchen' && s0.top.seats.length === 4, `the kitchen is up with four seats (${s0.screen}, ${s0.top.seats.length})`);
      assert(s0.run.dish === 'APPLE PIE' && s0.run.line === 0 && s0.run.customer === 0, `the first customer of the first line has ordered the pie (${s0.run.dish}, line ${s0.run.line}, customer ${s0.run.customer})`);
      assert(s0.top.steps.join() === 'FRIDGE,CHOP,MIX,OVEN,PLATE', `the first order's steps are fridge, chop, mix, oven, plate (${s0.top.steps.join()})`);
      assert(s0.top.step === 0 && !s0.top.served, 'the first step is up and nothing is served');
      assert(s0.top.pulls === 6 && s0.top.pulled === 0, `the fridge holds the pie's six items, none out yet (${s0.top.pulls}, ${s0.top.pulled})`);

      // FRIDGE: seat 0 opens on its spot; the first tap claims the step and pulls the first apple, six taps empty it
      let s = await api.summary();
      assert(s.top.seats[0][2] === FRIDGE, `seat 0 opens at the fridge (station ${s.top.seats[0][2]}, x ${s.top.seats[0][1]})`);
      assert(s.top.seats.slice(1).every((x, i) => x[1] === s0.top.seats[i + 1][1]), 'the other seats, with no input, stayed put');
      s = await chopOnce(api);
      assert(s.top.count === 1 && s.top.pulled === 1 && s.top.owners[0] === 0, `the first tap pulls one item and claims the step for P1 (count ${s.top.count}, pulled ${s.top.pulled}, owner ${s.top.owners[0]})`);
      assert(s.top.pullDest === CHOP, `the pie's pulls fly to the chopping board, its next step (dest ${s.top.pullDest})`);
      await api.step(8);
      await api.shot('kitchen-fridge');
      await api.step(40);                        // a long think between pulls costs nothing
      for (let i = 0; i < 5; i++) s = await chopOnce(api);
      assert(s.top.step === 1 && s.top.scores[0] === 2 && s.top.pulled === 6, `six taps empty the fridge and complete the step as PERFECT (step ${s.top.step}, score ${s.top.scores[0]}, pulled ${s.top.pulled})`);

      // CHOP: walk to the board; the pulls have all landed there by the time seat 0 arrives. The first tap claims
      // the step, ten taps in any rhythm finish it
      s = await walkTo(api, CHOP);
      assert(s.top.seats[0][2] === CHOP, `seat 0 is at the chop station (station ${s.top.seats[0][2]}, x ${s.top.seats[0][1]})`);
      assert(s.top.batchAt === CHOP && s.top.landed === 6 && s.top.flying === 0, `the six pulls are on and beside the board (at ${s.top.batchAt}, landed ${s.top.landed}, flying ${s.top.flying})`);
      s = await chopOnce(api);
      assert(s.top.count === 1 && s.top.owners[1] === 0, `the first tap is a chop and claims the step for P1 (count ${s.top.count}, owner ${s.top.owners[1]})`);
      await api.step(40);                        // a long think between chops costs nothing
      for (let i = 0; i < 9; i++) { s = await chopOnce(api); if (i === 3) { await api.step(7); await api.shot('kitchen-chop'); } }
      assert(s.top.step === 2 && s.top.scores[1] === 2, `ten taps complete the step as PERFECT (step ${s.top.step}, score ${s.top.scores[1]})`);
      // the tenth chop clears the board: the whole batch is in the air for the bowl, nothing has landed yet
      assert(s.top.batchAt === MIX && s.top.flying === 6 && s.top.landed === 0, `the tenth chop sends everything on the board flying to the bowl (at ${s.top.batchAt}, flying ${s.top.flying}, landed ${s.top.landed})`);
      await api.step(12);
      await api.shot('kitchen-fly');

      // MIX: hold at the bowl for 240 frames; a release halfway pauses it and costs nothing. Everything has
      // dropped into the bowl by the time seat 0 gets there
      s = await walkTo(api, MIX);
      assert(s.top.seats[0][2] === MIX, `seat 0 is at the mixing bowl (station ${s.top.seats[0][2]})`);
      assert(s.top.batchAt === MIX && s.top.landed === 6 && s.top.flying === 0, `the batch has landed in the bowl (at ${s.top.batchAt}, landed ${s.top.landed}, flying ${s.top.flying})`);
      await api.hold(0, { action: true });
      await api.step(120);
      s = await api.summary();
      assert(s.top.t === 120 && s.top.owners[2] === 0, `120 frames held fill half the dial (${s.top.t}) and P1 owns the step`);
      assert(s.top.seats[0][3] === 'stir', `the mixer stirs (${s.top.seats[0][3]})`);
      await api.shot('kitchen-mix');
      await api.release(0);
      await api.step(20);
      s = await api.summary();
      assert(s.top.t === 120 && s.top.phase === 0, `letting go pauses the dial (${s.top.t}, phase ${s.top.phase})`);
      await api.hold(0, { action: true });
      await api.step(121);
      await api.release(0);
      s = await api.summary();
      assert(s.top.step === 3 && s.top.scores[2] === 2, `the hold finishes the mix as PERFECT, pause and all (step ${s.top.step}, score ${s.top.scores[2]})`);

      // OVEN: hold at the oven for 240 frames while the bake runs
      s = await walkTo(api, OVEN);
      assert(s.top.seats[0][2] === OVEN, `seat 0 is at the oven (station ${s.top.seats[0][2]})`);
      await api.hold(0, { action: true });
      await api.step(160);
      s = await api.summary();
      assert(s.top.phase === 1 && s.top.t === 160 && s.top.owners[3] === 0, `160 frames held bake two thirds of the way (phase ${s.top.phase}, t ${s.top.t}) and P1 owns the step`);
      await api.shot('kitchen-oven');
      await api.step(81);
      await api.release(0);
      s = await api.summary();
      assert(s.top.step === 4 && s.top.scores[3] === 2, `holding to the end of the bake is PERFECT (step ${s.top.step}, score ${s.top.scores[3]})`);

      // PLATE: the bake sent the dish to the plate; it is stacked there before the bell is rung
      s = await walkTo(api, PLATE);
      assert(s.top.seats[0][2] === PLATE, `seat 0 is at the hatch (station ${s.top.seats[0][2]})`);
      await api.step(10);
      s = await api.summary();
      assert(s.top.batchAt === PLATE && s.top.landed === 6 && s.top.flying === 0, `the dish is on the plate before the bell (at ${s.top.batchAt}, landed ${s.top.landed}, flying ${s.top.flying})`);
      assert(s.top.dish === 'applePie', `and it is THE PIE, not a stack of apples and eggs (dish '${s.top.dish}')`);
      await api.shot('kitchen-plate');
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.served === true && s.top.total === 10 && s.top.stars === 3, `the bell serves the dish: total ${s.top.total}/10 -> ${s.top.stars} stars`);
      await api.step(50);
      await api.shot('kitchen-order-up');
      await api.step(50);
      s = await api.summary();
      assert(s.screen === 'results' && s.top.stars === 3, `ORDER UP! hands over to results with the stars (on ${s.screen}, stars ${s.top.stars})`);
      await api.step(140);
      s = await api.summary();
      assert(s.top.chews === 3 && s.top.stamp === 'DELICIOUS', `the customer chews three times and the stamp reads DELICIOUS (${s.top.chews}, '${s.top.stamp}')`);
      await api.shot('results-stamp');
      await api.press(0, { action: true }, 1, 2);
      s = await api.summary();
      assert(s.screen === 'line' && s.run.served === 1 && s.run.score === 300, `confirm banks the order and calls the next in line (on ${s.screen}, served ${s.run.served}, score ${s.run.score})`);
      assert(s.run.lines[0].customers[0].endsWith(':3') && s.run.customer === 1, `...with the customer stamped at the stars they gave (${s.run.lines[0].customers.join()}, customer ${s.run.customer})`);
      const used = s.run.needs.map((n, i) => Number(n.split(':')[1].split('/')[0]) - Number(s.run.stock[i].split(':')[1]));
      assert(used.some((u) => u > 0), `the dish came out of the pantry (used ${used.join()})`);
    });

    // the second order has the STOVE in it: a hold that pauses and picks up again, like the bowl
    await withPage(server, 'skipTo=kitchen&critters=0,1&order=2', async (api) => {
      await api.step(2);
      let s = await api.summary();
      assert(s.top.steps.join() === 'FRIDGE,CHOP,MIX,STOVE,PLATE', `the fish cakes order cooks on the stove (${s.top.steps.join()})`);
      s = await chopAndMix(api);
      assert(s.top.step === 3 && s.top.scores[1] === 2 && s.top.scores[2] === 2, `the chop and the mix are PERFECT (step ${s.top.step}, ${s.top.scores.slice(0, 3).join()})`);
      s = await walkTo(api, STOVE);
      assert(s.top.seats[0][2] === STOVE, `seat 0 is at the stove (station ${s.top.seats[0][2]})`);
      await api.hold(0, { action: true });
      await api.step(60);
      await api.release(0);
      await api.step(2);
      s = await api.summary();
      assert(s.top.phase === 0 && s.top.t === 60, `letting go pauses the bar where it is (phase ${s.top.phase}, t ${s.top.t})`);
      await api.hold(0, { action: true });
      await api.step(140);            // 240 frames fill the bar
      s = await api.summary();
      assert(s.top.phase === 1 && s.top.t === 200, `the pot is back on and the bar is nearly full (${s.top.t}/240)`);
      await api.shot('kitchen-stove');
      await api.step(41);
      await api.release(0);
      s = await api.summary();
      assert(s.top.step === 4 && s.top.scores[3] === 2, `holding until the bar fills is PERFECT, pause and all (step ${s.top.step}, score ${s.top.scores[3]})`);
      s = await walkTo(api, PLATE);
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.served === true && s.top.total === 10 && s.top.stars === 3, `the run serves three stars (total ${s.top.total}/10, stars ${s.top.stars})`);
    });
  },

  /** The screen contract: `start` pushes the pause overlay offline, `cancel` pops it, and the scene underneath
   *  comes back untouched. Online the kitchen refuses to push at all (a paused peer stalls the room). */
  async kitchenPause(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1', async (api, page) => {
      await api.step(4);
      // leave the kitchen in a state worth preserving: one claimed step with a pull on it, seat 0 off its spot
      await walkTo(api, FRIDGE);
      await api.press(0, { action: true }, 1, 0);
      await api.hold(0, { right: true });
      await api.step(6);
      await api.release(0);
      await api.step(2);
      const before = (await api.summary()).top;

      await api.press(0, { start: true }, 1, 2);
      assert((await api.screen()) === 'pause', `start pushes the pause overlay (on ${await api.screen()})`);
      await api.step(20);
      assert((await api.summary()).top.row === 'RESUME', 'the overlay opens on RESUME');
      await api.press(0, { cancel: true }, 1, 2);
      assert((await api.screen()) === 'kitchen', `cancel pops it back to the kitchen (on ${await api.screen()})`);
      const after = (await api.summary()).top;
      assert(after.step === before.step && after.total === before.total && after.count === before.count,
        `the step, the score and the chop count survived the pause (${after.step}/${after.total}/${after.count} vs ${before.step}/${before.total}/${before.count})`);
      assert(after.owners.join() === before.owners.join(), `the station owners survived the pause (${after.owners.join()} vs ${before.owners.join()})`);
      assert(after.seats.map((x) => x[1]).join() === before.seats.map((x) => x[1]).join(),
        `every seat is where it was left (${after.seats.map((x) => x[1]).join()} vs ${before.seats.map((x) => x[1]).join()})`);

      // online the overlay is refused by the scene, so a room never stalls on one peer's start
      await page.evaluate(() => { window.__game.game.net = { active: true }; });
      await api.press(0, { start: true }, 1, 2);
      assert((await api.screen()) === 'kitchen', `start is refused while the room is live (on ${await api.screen()})`);
      await page.evaluate(() => { window.__game.game.net = null; });
    });
  },

  /**
   * Barley's eat gag hands him an ingredient for 42 frames. The rig has to give it back: the reconcile in
   * updateSeats only runs when the wanted item CHANGES, so a gag that ends where no station suggests one used to
   * leave the apple welded to his paw for the rest of the service.
   */
  async kitchenGag(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1', async (api, page) => {
      await api.step(2);
      // park him in the gap between the bowl and the hob, where no station suggests an item and no other seat stands
      // (from the fridge spot at 36 to x 262: past the bowl's reach at 254 with room for the nudge below, short of the hob's at 266)
      await api.hold(0, { right: true });
      await api.step(113);
      await api.release(0);
      await api.step(2);
      let s = await api.summary();
      assert(s.top.seats[0][2] === -1 && s.top.seats[0][5] === 0, `seat 0 stands at no station with empty paws (station ${s.top.seats[0][2]}, item ${s.top.seats[0][5]})`);

      // the gag is a seeded one-in-six on each completed step, so force steps until it rolls (the step index is
      // put back each time, so the order is never actually served out from under the test)
      const eatT = await page.evaluate(() => {
        const g = window.__game.game, k = g.screens[g.screens.length - 1];
        for (let i = 0; i < 200 && k.seats[0].eatT === 0; i++) { k.completeStep(1, null); k.stepIdx = 0; }
        return k.seats[0].eatT;
      });
      assert(eatT > 0, `the gag fires and locks the seat for ${eatT} frames`);
      await api.step(4);
      s = await api.summary();
      assert(s.top.seats[0][3] === 'eat' && s.top.seats[0][5] === 1, `he is eating, with something in his paw (${s.top.seats[0][3]}, item ${s.top.seats[0][5]})`);
      await api.shot('kitchen-gag');

      await api.step(50);            // past EAT_FRAMES (42) with no station to suggest an item
      s = await api.summary();
      assert(s.top.seats[0][4] === 0, `the gag is over (eatT ${s.top.seats[0][4]})`);
      assert(s.top.seats[0][5] === 0, `the rig's held item went with it (item ${s.top.seats[0][5]})`);
      assert(s.top.seats[0][3] === 'idle', `and he is idling again (${s.top.seats[0][3]})`);

      // the gag never holds a player still: roll it again and push the stick, and it is over on that frame
      const again = await page.evaluate(() => {
        const g = window.__game.game, k = g.screens[g.screens.length - 1];
        for (let i = 0; i < 200 && k.seats[0].eatT === 0; i++) { k.completeStep(1, null); k.stepIdx = 0; }
        return k.seats[0].eatT;
      });
      assert(again > 0, `the gag fires a second time (eatT ${again})`);
      const x0 = (await api.summary()).top.seats[0][1];
      await api.hold(0, { left: true });
      await api.step(3);
      await api.release(0);
      s = await api.summary();
      assert(s.top.seats[0][4] === 0 && s.top.seats[0][5] === 0, `a push of the stick ends the gag at once and takes the apple back (eatT ${s.top.seats[0][4]}, item ${s.top.seats[0][5]})`);
      assert(s.top.seats[0][1] < x0, `and he walked on that same push (${x0} -> ${s.top.seats[0][1]})`);
    });
  },

  async results(server) {
    await withPage(server, 'skipTo=results&critters=0,1', async (api, page) => {
      await api.step(30);
      const s0 = await api.summary();
      assert(s0.screen === 'results' && s0.top.stars === 2, `results opens on its own with two stars (${s0.screen}, ${s0.top.stars})`);

      // the party has to BE here watching the customer eat: the screen used to be a customer, a stamp and an
      // empty room (director's note 11). One rig per seat, facing the hatch, and every one of them cheering a
      // few frames after the last once the stars have landed
      await api.step(40);
      const crew = await page.evaluate(() => {
        const g = window.__game.game, k = g.screens[g.screens.length - 1];
        return k.crew.map((c) => [c.x, c.opts.facing, c.player.name, c.cheerAt]);
      });
      assert(crew.length === 2, `both seats are in the room (${crew.length})`);
      assert(crew.every((c) => c[1] === 1), `every seat faces the hatch (${crew.map((c) => c[1]).join()})`);
      assert(crew.every((c) => c[2] === 'cheer'), `every seat is cheering (${crew.map((c) => c[2]).join()})`);
      assert(crew[1][3] > crew[0][3], `the seats cheer on a stagger (${crew.map((c) => c[3]).join()})`);
      assert(crew[0][0] < crew[1][0] && crew[1][0] < 300, `they stand along the counter left of the paper (${crew.map((c) => c[0]).join()})`);
      await api.shot('results-crew');

      await api.press(0, { action: true }, 1, 2);
      const s1 = await api.summary();
      assert(s1.screen === 'line' && s1.run.served === 1 && s1.run.customer === 1, `action calls the next in line with the customer served (on ${s1.screen}, served ${s1.run.served}, customer ${s1.run.customer})`);
    });
  },
};
