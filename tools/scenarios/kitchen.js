// Playtest scenarios for the kitchen work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   kitchen - four seats in the kitchen with the first order (APPLE PIE: chop, mix, oven, plate). Seat 0 is walked
//             to each station in turn and given the right input: ten taps on the board in any rhythm, a 240-frame
//             hold on the bowl (with a pause in the middle that costs nothing), a 240-frame hold on the oven, and
//             the bell. The screen must reach results with three stars, then the order board with run.served 1 on
//             confirm. A second pass runs the FISH CAKES order (chop, mix, stove, plate) for the stove's hold and
//             writes tools/screens/kitchen-stove.png with the pot lit mid-hold. The tags are shot as they come up
//             (kitchen-chop / -mix / -oven / -plate / -stove): each carries its owner's colour across its head.
//   kitchenPause - `start` from a seat pushes the pause overlay, `cancel` pops it and the kitchen underneath is
//             exactly as it was left (step, scores, owners, seat positions); online the push is refused.
//   kitchenGag - Barley's eat gag hands him an apple and TAKES IT BACK: the rig's held item is cleared with the
//             state, at a spot where no station suggests one. Writes tools/screens/kitchen-gag.png.
//   results - opens straight onto results and returns to the order board on action, with the stage banked; and the party
//             is IN the room, one rig per seat facing the hatch, every one of them cheering on a stagger once the
//             stars have landed. Writes tools/screens/results-crew.png.
import { withPage, assert } from '../playtest.js';

/** The standing spots (art/backgrounds/kitchen.js STATION_X); the scenario walks by summary, not by geometry. */
const STATION_X = [80, 190, 300, 410, 490];

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

/** Chop and mix are the first two steps of both prototype orders; drive them through. */
async function chopAndMix(api) {
  await walkTo(api, 0);
  for (let i = 0; i < 10; i++) await chopOnce(api);
  await walkTo(api, 1);
  await api.hold(0, { action: true });
  await api.step(241);
  await api.release(0);
  return api.summary();
}

export const SCENARIOS = {
  async kitchen(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1,2,3', async (api) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'kitchen' && s0.top.seats.length === 4, `the kitchen is up with four seats (${s0.screen}, ${s0.top.seats.length})`);
      assert(s0.top.steps.join() === 'CHOP,MIX,OVEN,PLATE', `the first order's steps are chop, mix, oven, plate (${s0.top.steps.join()})`);
      assert(s0.top.step === 0 && !s0.top.served, 'the first step is up and nothing is served');

      // CHOP: walk to the board; the first tap claims the step, ten taps in any rhythm finish it
      let s = await walkTo(api, 0);
      assert(s.top.seats[0][2] === 0, `seat 0 is at the chop station (station ${s.top.seats[0][2]}, x ${s.top.seats[0][1]})`);
      assert(s.top.seats.slice(1).every((x, i) => x[1] === s0.top.seats[i + 1][1]), 'the other seats, with no input, stayed put');
      s = await chopOnce(api);
      assert(s.top.count === 1 && s.top.owners[0] === 0, `the first tap is a chop and claims the step for P1 (count ${s.top.count}, owner ${s.top.owners[0]})`);
      await api.step(40);                        // a long think between chops costs nothing
      for (let i = 0; i < 9; i++) { s = await chopOnce(api); if (i === 3) { await api.step(7); await api.shot('kitchen-chop'); } }
      assert(s.top.step === 1 && s.top.scores[0] === 2, `ten taps complete the step as PERFECT (step ${s.top.step}, score ${s.top.scores[0]})`);

      // MIX: hold at the bowl for 240 frames; a release halfway pauses it and costs nothing
      s = await walkTo(api, 1);
      assert(s.top.seats[0][2] === 1, `seat 0 is at the mixing bowl (station ${s.top.seats[0][2]})`);
      await api.hold(0, { action: true });
      await api.step(120);
      s = await api.summary();
      assert(s.top.t === 120 && s.top.owners[1] === 0, `120 frames held fill half the dial (${s.top.t}) and P1 owns the step`);
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
      assert(s.top.step === 2 && s.top.scores[1] === 2, `the hold finishes the mix as PERFECT, pause and all (step ${s.top.step}, score ${s.top.scores[1]})`);

      // OVEN: hold at the oven for 240 frames while the bake runs
      s = await walkTo(api, 3);
      assert(s.top.seats[0][2] === 3, `seat 0 is at the oven (station ${s.top.seats[0][2]})`);
      await api.hold(0, { action: true });
      await api.step(160);
      s = await api.summary();
      assert(s.top.phase === 1 && s.top.t === 160 && s.top.owners[2] === 0, `160 frames held bake two thirds of the way (phase ${s.top.phase}, t ${s.top.t}) and P1 owns the step`);
      await api.shot('kitchen-oven');
      await api.step(81);
      await api.release(0);
      s = await api.summary();
      assert(s.top.step === 3 && s.top.scores[2] === 2, `holding to the end of the bake is PERFECT (step ${s.top.step}, score ${s.top.scores[2]})`);

      // PLATE: ring the bell at the hatch
      s = await walkTo(api, 4);
      assert(s.top.seats[0][2] === 4, `seat 0 is at the hatch (station ${s.top.seats[0][2]})`);
      await api.shot('kitchen-plate');
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.served === true && s.top.total === 8 && s.top.stars === 3, `the bell serves the dish: total ${s.top.total}/8 -> ${s.top.stars} stars`);
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
      assert(s.screen === 'stage' && s.run.served === 1 && s.run.score === 300, `confirm banks the order and returns to the board (on ${s.screen}, served ${s.run.served}, score ${s.run.score})`);
      assert(s.run.stars[0] === 3, `...with the stage stamped at the stars it was served at (${s.run.stars.join()})`);
    });

    // the second order has the STOVE in it: a hold that pauses and picks up again, like the bowl
    await withPage(server, 'skipTo=kitchen&critters=0,1&order=2', async (api) => {
      await api.step(2);
      let s = await api.summary();
      assert(s.top.steps.join() === 'CHOP,MIX,STOVE,PLATE', `the fish cakes order cooks on the stove (${s.top.steps.join()})`);
      s = await chopAndMix(api);
      assert(s.top.step === 2 && s.top.scores[0] === 2 && s.top.scores[1] === 2, `the chop and the mix are PERFECT (step ${s.top.step}, ${s.top.scores.slice(0, 2).join()})`);
      s = await walkTo(api, 2);
      assert(s.top.seats[0][2] === 2, `seat 0 is at the stove (station ${s.top.seats[0][2]})`);
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
      assert(s.top.step === 3 && s.top.scores[2] === 2, `holding until the bar fills is PERFECT, pause and all (step ${s.top.step}, score ${s.top.scores[2]})`);
      s = await walkTo(api, 4);
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.served === true && s.top.total === 8 && s.top.stars === 3, `the run serves three stars (total ${s.top.total}/8, stars ${s.top.stars})`);
    });
  },

  /** The screen contract: `start` pushes the pause overlay offline, `cancel` pops it, and the scene underneath
   *  comes back untouched. Online the kitchen refuses to push at all (a paused peer stalls the room). */
  async kitchenPause(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1', async (api, page) => {
      await api.step(4);
      // leave the kitchen in a state worth preserving: one claimed step with a chop on it, seat 0 off its spot
      await walkTo(api, 0);
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
      await api.hold(0, { right: true });
      await api.step(86);
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
      assert(s1.screen === 'stage' && s1.run.served === 1, `action returns to the order board with the stage served (on ${s1.screen}, served ${s1.run.served})`);
    });
  },
};
