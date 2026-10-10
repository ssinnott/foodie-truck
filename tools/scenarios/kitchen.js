// Playtest scenarios for the kitchen work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   kitchen - four seats in the kitchen with the APPLE PIE at the hatch (?order=1: fridge, chop, mix, oven, plate), the line
//             cut to that one order (`oneOrder`). Seat 0 is walked
//             to each station in turn and given the right input: ten taps on the board in any rhythm, a 240-frame
//             hold on the bowl (with a pause in the middle that costs nothing), a 240-frame hold on the oven, and
//             the bell. ORDER UP! hands the dish to results, which serves it and sends the truck back to
//             the map on confirm. A second pass
//             runs the FISH CAKES order (chop, mix, stove, plate) for the stove's hold and
//             writes tools/screens/kitchen-stove.png with the pot lit mid-hold. The tags are shot as they come up
//             (kitchen-chop / -mix / -oven / -plate / -stove): each carries its owner's colour across its head.
//             The fridge gives up an ingredient a tap (every apple, then every egg). The food is followed down the
//             line too: the pulls have landed at the board by the time seat 0 gets
//             there, the tenth chop clears the board and puts the whole batch in the air for the bowl
//             (kitchen-fly.png, mid-arc), it has dropped in by the time seat 0 arrives, and the dish is stacked
//             on the plate before the bell. The ceiling slice is held off after the board's first chop
//             (`holdOffSlice`): a rules test sees no joke.
//   kitchenTogether - the fete's nine-long line cooked AS ONE GIANT ORDER: all nine orders taken at once, read by
//             dish on the ticket and the hatch shelf (a plate per dish, how many it is for under it), the whole line
//             at the hatch (the front three leaning in, the rest in rows behind them), the steps merged with each
//             order's own kept in order, one fridge run a tap per ingredient, every plate dished before the one bell,
//             then every plate SERVED out through the hatch to its diner, front of the line first, and results with
//             all nine eating and the day closed, the ceiling slice held off. Writes
//             kitchen-together(-plated / -serving / -served).png and results-together.png.
//   kitchenPause - `start` from a seat pushes the pause overlay, `cancel` pops it and the kitchen underneath is
//             exactly as it was left (step, scores, owners, seat positions); online the push is refused.
//   kitchenGag - Barley's bite: CHOMP!, a proper chew, MMM! at the swallow. It hands him an apple and TAKES IT BACK:
//             the rig's held item is cleared with the state, at a spot where no station suggests one; and a push of
//             the stick ends the beat at once, so the joke never holds a player still (and it still goes down:
//             MMM!). Writes tools/screens/kitchen-gag.png and kitchen-gag-mmm.png.
//   kitchenSlice - the ceiling slice: a chop dealt the slice flicks one up off the board onto the ceiling, where it
//             hangs dripping (the tell), sags off it on a strand (the wind-up) and, dangling, lets go onto the first
//             head to come under it: PLOP!, worn while the stick still walks, then shaken off onto the floor. Nobody
//             under it, it waits, then SPLATs on the floor. Under it, the hungry one EATS it - CHOMP!, MMM! - and
//             holding the bowl's stir under it, the stir never stops for it. Nothing about the dish changes. Writes
//             kitchen-slice-flick / -ceiling / -peel / -drop / -plop / -hat / -floor / -gape / -barley / -mmm.png.
//   results - opens straight onto results with the whole line on the lane, every diner holding the plate the
//             kitchen handed them and eating it at once, a bite at a time, the crew cheering from the truck on a
//             stagger once the stars have landed, and action banks the whole line and closes the day. Writes
//             tools/screens/results-crew.png.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, assert } from '../playtest.js';
import { TIP_COINS, dishGroups } from '../../src/game/run.ts';

/** Where the harness writes its screenshots (tools/playtest.js SHOTS). */
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screens');

/** The standing spots (art/backgrounds/kitchen.js STATION_X); the scenario walks by summary, not by geometry. */
const STATION_X = [36, 122, 214, 306, 398, 490];
/** Station indices (content/places.js STATIONS). */
export const FRIDGE = 0, CHOP = 1, MIX = 2, STOVE = 3, OVEN = 4, PLATE = 5;
/** Walking pace, px/frame (screens/kitchen.ts SPEED). */
const SPEED = 2;
/**
 * The jokes' numbers (game/kitchenGags.ts), mirrored - and checked against the module itself by `kitchenSlice`, so
 * a change there fails here rather than passing on stale arithmetic. The slice: the first chop it can be dealt to,
 * its clock (stuck at FLICK, peeling from PEEL_AT, dangling by its strand at READY_AT, given up at GIVE_UP), FALL frames
 * down, UNDER px either side of it, worn HAT_FRAMES and shaken off over the last SHAKE_FRAMES. The hungry one's eat
 * beat is EAT_FRAMES, his MMM! MMM_AT frames into it.
 */
export const GAGS = Object.freeze({
  SLICE_FIRST: 3, FLICK: 14, PEEL_AT: 60, PEEL_STEP: 30, READY_AT: 150, GIVE_UP: 270, FALL: 14, UNDER: 16, HAT_FRAMES: 90, SHAKE_FRAMES: 18,
  EAT_FRAMES: 74, MMM_AT: 50,
});
/** How many word cards are up (game/gags.ts gagsUp, the same module instance the game draws from). */
export const cardsUp = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());
/** Walk seat `seat` to x (an even number: the seats walk 2 px a frame) and let go. */
export async function walkX(api, seat, x) {
  const x0 = (await api.summary()).top.seats[seat][1];
  if (x0 !== x) {
    await api.hold(seat, x > x0 ? { right: true } : { left: true });
    await api.step(Math.round(Math.abs(x - x0) / SPEED));
    await api.release(seat);
  }
  return api.summary();
}

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

/**
 * Hold the ceiling slice off a rules test (it has a scenario of its own, `kitchenSlice`): its deal is rolled on the
 * board's first chop, so this takes it back straight after that chop, through the field the roll writes
 * (game/kitchenGags.ts `deal`) - before the earliest chop a slice can be dealt to.
 */
export async function holdOffSlice(page) {
  await page.evaluate(() => { window.__game.game.screen.gags.deal = 0; });
}

/** The fridge: walk to it and tap until the step moves on (one tap per ingredient the order wants, so the count is the order's). */
export async function pullAll(api) {
  let s = await walkTo(api, FRIDGE);
  const step = s.top.step;
  for (let i = 0; i < 48 && s.top.step === step; i++) s = await chopOnce(api);
  return s;
}

/** The fridge, the chop and the mix are the first three steps of both prototype orders; drive them through (with no
 *  slice flicked off the board: a rules test sees no joke). */
async function chopAndMix(api, page) {
  await pullAll(api);
  await walkTo(api, CHOP);
  await chopOnce(api);
  await holdOffSlice(page);
  for (let i = 1; i < 10; i++) await chopOnce(api);
  await walkTo(api, MIX);
  await api.hold(0, { action: true });
  await api.step(241);
  await api.release(0);
  return api.summary();
}

/** Station index per step name (game/screens/kitchen.js STATION_IDX). */
const STATION = { fridge: 0, chop: 1, mix: 2, stove: 3, oven: 4, plate: 5 };

/**
 * Cook whatever steps the order carries, each with the input its station asks for: a tap per ingredient at the fridge,
 * ten taps on the board, a hold on the bowl, a hold on the stove, a hold on the oven, and the bell. Every hold is
 * kept down until the step advances, which is what a player does. Leaves the kitchen on the bell: the hand-over to results.
 */
export async function cook(api) {
  let s = await api.summary();
  const steps = s.top.steps.map((n) => n.toLowerCase());
  for (let k = 0; k < steps.length; k++) {
    const name = steps[k];
    if (name === 'fridge') { s = await pullAll(api); continue; }
    s = await walkTo(api, STATION[name]);
    if (name === 'chop') { for (let i = 0; i < 10; i++) s = await chopOnce(api); }
    else if (name === 'plate') await api.press(0, { action: true }, 1, 0);
    else {
      await api.hold(0, { action: true });
      for (let i = 0; i < 80 && (await api.summary()).top.step === k; i++) await api.step(4);
      await api.release(0);
      await api.step(2);
    }
    s = await api.summary();
  }
  return s;
}

/**
 * Cut the line the kitchen is cooking for down to its first customer and open the kitchen again, so a scenario can
 * walk ONE order's steps station by station with nothing else on the counter.
 */
export async function oneOrder(api, page) {
  await page.evaluate(() => { const g = window.__game.game, ln = g.run.lines[g.run.line]; ln.customers.length = 1; g.reset('kitchen'); });
  await api.step(2);
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
      assert(r.n === 72 && r.missing.length === 0, `every order has a dish glyph (${r.n} orders, missing: ${r.missing.join() || 'none'})`);
      assert(r.extra.length === 0, `no dish glyph is for an order that does not exist (${r.extra.join() || 'none'})`);
      assert(r.errors.length === 0, `every dish draws at every bite stage (${r.errors.join('; ') || 'no errors'})`);
      assert(r.blank.length === 0, `every dish is visible on the plate until the last bite, and gone after it (${r.blank.join() || 'all fine'})`);
      await page.locator('#dishes').screenshot({ path: path.join(SHOTS, 'dishes.png') });
    });
  },

  // the chef's holds fill 1.25 a frame (CHEF_HOLD): Sorrel finishes a 240-frame MIX in 192 held frames, Barley in 240
  async chef(server) {
    for (const [critters, who, rate] of [['1,0,2,3', 'Sorrel', 1.25], ['0,1,2,3', 'Barley', 1]]) {
      await withPage(server, `skipTo=kitchen&critters=${critters}&order=1`, async (api, page) => {
        await oneOrder(api, page);
        await pullAll(api);
        await walkTo(api, CHOP);
        for (let i = 0; i < 10; i++) await chopOnce(api);
        await walkTo(api, MIX);
        await api.hold(0, { action: true });
        await api.step(120);
        let s = await api.summary();
        assert(s.top.step === 2 && s.top.t === 120 * rate, `${who} holds the bowl and the dial fills ${rate} a frame (step ${s.top.step}, t ${s.top.t})`);
        await api.step(72);
        s = await api.summary();
        if (rate > 1) assert(s.top.step === 3, `Sorrel's 192 held frames finish the MIX (step ${s.top.step}, t ${s.top.t})`);
        else assert(s.top.step === 2 && s.top.t === 192, `Barley's 192 held frames leave the MIX unfinished (step ${s.top.step}, t ${s.top.t})`);
        await api.release(0);
      });
    }
  },
  async kitchen(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1,2,3&order=1', async (api, page) => {
      await api.step(2);
      const s0 = await oneOrder(api, page);
      assert(s0.screen === 'kitchen' && s0.top.seats.length === 4, `the kitchen is up with four seats (${s0.screen}, ${s0.top.seats.length})`);
      assert(s0.run.dish === 'APPLE PIE' && s0.run.line === 0 && s0.run.customer === 0, `the first customer of the first line has ordered the pie (${s0.run.dish}, line ${s0.run.line}, customer ${s0.run.customer})`);
      assert(s0.top.steps.join() === 'FRIDGE,CHOP,MIX,OVEN,PLATE', `the first order's steps are fridge, chop, mix, oven, plate (${s0.top.steps.join()})`);
      assert(s0.top.step === 0 && !s0.top.served, 'the first step is up and nothing is served');
      assert(s0.top.pulls === 2 && s0.top.units === 6 && s0.top.pulled === 0, `the fridge holds the pie's six items, two ingredients, none out yet (${s0.top.pulls} ingredients, ${s0.top.units} items, ${s0.top.pulled} out)`);

      // FRIDGE: seat 0 opens on its spot; the first tap claims the step and brings out every apple, the second the eggs
      let s = await api.summary();
      assert(s.top.seats[0][2] === FRIDGE, `seat 0 opens at the fridge (station ${s.top.seats[0][2]}, x ${s.top.seats[0][1]})`);
      assert(s.top.seats.slice(1).every((x, i) => x[1] === s0.top.seats[i + 1][1]), 'the other seats, with no input, stayed put');
      s = await chopOnce(api);
      assert(s.top.count === 1 && s.top.pulled === 1 && s.top.owners[0] === 0 && s.top.flying === 4, `the first tap brings out all four apples and claims the step for P1 (count ${s.top.count}, pulled ${s.top.pulled}, owner ${s.top.owners[0]}, flying ${s.top.flying})`);
      assert(s.top.routes[0][1] === 'CHOP', `the pie's pulls fly to the chopping board, its next step (route ${s.top.routes[0].join()})`);
      await api.step(8);
      await api.shot('kitchen-fridge');
      await api.step(40);                        // a long think between pulls costs nothing
      s = await chopOnce(api);
      assert(s.top.step === 1 && s.top.scores[0] === 2 && s.top.pulled === 2, `two taps - the apples, then the eggs - empty the fridge and complete the step as PERFECT (step ${s.top.step}, score ${s.top.scores[0]}, pulled ${s.top.pulled})`);

      // CHOP: walk to the board; the pulls have all landed there by the time seat 0 arrives. The first tap claims
      // the step, ten taps in any rhythm finish it
      s = await walkTo(api, CHOP);
      assert(s.top.seats[0][2] === CHOP, `seat 0 is at the chop station (station ${s.top.seats[0][2]}, x ${s.top.seats[0][1]})`);
      assert(s.top.at[CHOP] === 6 && s.top.flying === 0, `the six pulls are on and beside the board (at ${s.top.at}, flying ${s.top.flying})`);
      s = await chopOnce(api);
      assert(s.top.count === 1 && s.top.owners[1] === 0, `the first tap is a chop and claims the step for P1 (count ${s.top.count}, owner ${s.top.owners[1]})`);
      await holdOffSlice(page);                  // the slice a chop can flick onto the ceiling is kitchenSlice's
      await api.step(40);                        // a long think between chops costs nothing
      for (let i = 0; i < 9; i++) { s = await chopOnce(api); if (i === 3) { await api.step(7); await api.shot('kitchen-chop'); } }
      assert(s.top.step === 2 && s.top.scores[1] === 2, `ten taps complete the step as PERFECT (step ${s.top.step}, score ${s.top.scores[1]})`);
      // the tenth chop clears the board: the whole batch is in the air for the bowl, nothing has landed yet
      assert(s.top.at[CHOP] === 0 && s.top.at[MIX] === 0 && s.top.flying === 6, `the tenth chop sends everything on the board flying to the bowl (at ${s.top.at}, flying ${s.top.flying})`);
      await api.step(12);
      await api.shot('kitchen-fly');

      // MIX: hold at the bowl for 240 frames; a release halfway pauses it and costs nothing. Everything has
      // dropped into the bowl by the time seat 0 gets there
      s = await walkTo(api, MIX);
      assert(s.top.seats[0][2] === MIX, `seat 0 is at the mixing bowl (station ${s.top.seats[0][2]})`);
      assert(s.top.at[MIX] === 6 && s.top.flying === 0, `the batch has landed in the bowl (at ${s.top.at}, flying ${s.top.flying})`);
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
      assert(s.top.at[PLATE] === 6 && s.top.flying === 0, `the dish is on the plate before the bell (at ${s.top.at}, flying ${s.top.flying})`);
      assert(s.top.dished[0] === 'applePie', `and it is THE PIE, not a stack of apples and eggs (dish '${s.top.dished[0]}')`);
      await api.shot('kitchen-plate');
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.served === true && s.top.total === 10 && s.top.stars === 3, `the bell serves the dish: total ${s.top.total}/10 -> ${s.top.stars} stars`);
      await api.step(50);
      await api.shot('kitchen-order-up');
      for (let i = 0; i < 20 && (await api.screen()) !== 'results'; i++) await api.step(6);
      s = await api.summary();
      assert(s.screen === 'results' && s.top.diners === 1 && s.top.stars.join() === '3', `ORDER UP! hands the dish to results (on ${s.screen}, stars ${s.top.stars})`);
      await api.step(200);
      s = await api.summary();
      assert(s.top.chews.join() === '3' && s.top.stamp === 'DELICIOUS', `the customer chews three times and the stamp reads DELICIOUS (${s.top.chews}, '${s.top.stamp}')`);
      await api.shot('results-stamp');
      await api.press(0, { action: true }, 1, 2);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.served === 1 && s.run.score === TIP_COINS[3], `confirm banks the line (a line of one: the day's only line), and its tip, and hands the closed day to the board (on ${s.screen}, served ${s.run.served}, coins ${s.run.score})`);
      assert(s.run.lines[0].customers[0].endsWith(':3') && s.run.lines[0].served, `...with the customer stamped at the stars they gave (${s.run.lines[0].customers.join()})`);
      const used = s.run.needs.map((n, i) => Number(n.split(':')[1].split('/')[0]) - Number(s.run.stock[i].split(':')[1]));
      assert(used.some((u) => u > 0), `the dish came out of the pantry (used ${used.join()})`);
    });

    // the second order has the STOVE in it: a hold that pauses and picks up again, like the bowl
    await withPage(server, 'skipTo=kitchen&critters=0,1&order=2', async (api, page) => {
      await api.step(2);
      let s = await oneOrder(api, page);
      assert(s.top.steps.join() === 'FRIDGE,CHOP,MIX,STOVE,PLATE', `the fish cakes order cooks on the stove (${s.top.steps.join()})`);
      s = await chopAndMix(api, page);
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
   * Barley's bite: the eat beat hands him an ingredient for EAT_FRAMES - CHOMP! as he bites, three chews with the
   * crumbs flying, MMM! at the swallow - and the rig has to give it back: the reconcile in updateSeats only runs when
   * the wanted item CHANGES, so a beat that ends where no station suggests one used to leave the apple welded to his
   * paw for the rest of the service. And any push of the stick ends it on that frame.
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

      // the bite is a seeded one-in-six on each completed step, so force steps until it rolls (the step index is
      // put back each time, so the order is never actually served out from under the test)
      const force = () => page.evaluate(() => {
        const g = window.__game.game, k = g.screens[g.screens.length - 1];
        for (let i = 0; i < 200 && k.seats[0].eatT === 0; i++) { k.completeStep(1, null); k.stepIdx = 0; }
        return k.seats[0].eatT;
      });
      const eatT = await force();
      assert(eatT === GAGS.EAT_FRAMES, `the bite fires and he eats for ${GAGS.EAT_FRAMES} frames (eatT ${eatT})`);
      const total = (await api.summary()).top.total;
      await api.step(6);
      s = await api.summary();
      const cards = await cardsUp(page);
      assert(s.top.seats[0][3] === 'chomp' && s.top.seats[0][5] === 1, `he is chomping, with the apple in his paw (${s.top.seats[0][3]}, item ${s.top.seats[0][5]})`);
      assert(cards >= 1, `CHOMP! is up over him (${cards} cards)`);
      await api.shot('kitchen-gag');

      // the swallow: the paw empties, MMM!
      await api.step(GAGS.MMM_AT - 6 + 4);
      s = await api.summary();
      assert(s.top.seats[0][4] > 0 && s.top.seats[0][5] === 0, `at the swallow the apple is gone from his paw, the beat still running (eatT ${s.top.seats[0][4]}, item ${s.top.seats[0][5]})`);
      assert((await cardsUp(page)) >= 1, 'MMM! is up');
      await api.shot('kitchen-gag-mmm');

      await api.step(GAGS.EAT_FRAMES - GAGS.MMM_AT + 2);   // past the beat, with no station to suggest an item
      s = await api.summary();
      assert(s.top.seats[0][4] === 0, `the bite is over (eatT ${s.top.seats[0][4]})`);
      assert(s.top.seats[0][5] === 0, `the rig's held item went with it (item ${s.top.seats[0][5]})`);
      assert(s.top.seats[0][3] === 'idle', `and he is idling again (${s.top.seats[0][3]})`);
      assert(s.top.total === total, `the bite cost nothing and scored nothing (total ${total} -> ${s.top.total})`);

      // the bite never holds a player still: roll it again and push the stick, and it is over on that frame
      const again = await force();
      assert(again > 0, `the bite fires a second time (eatT ${again})`);
      const x0 = (await api.summary()).top.seats[0][1];
      await api.hold(0, { left: true });
      await api.step(3);
      await api.release(0);
      s = await api.summary();
      assert(s.top.seats[0][4] === 0 && s.top.seats[0][5] === 0, `a push of the stick ends the bite at once and takes the apple back (eatT ${s.top.seats[0][4]}, item ${s.top.seats[0][5]})`);
      assert(s.top.seats[0][1] < x0, `and he walked on that same push (${x0} -> ${s.top.seats[0][1]})`);
      await api.step(GAGS.MMM_AT);
      assert((await cardsUp(page)) >= 1, 'a bite the stick cut short still goes down: MMM!');
    });
  },

  /**
   * THE CEILING SLICE. One chopping in three has a chop that flicks a slice of the ingredient up onto the ceiling; the
   * deal is one roll on the board's first chop, so the scenario rolls it and then sets the dealt chop by hand
   * (`gags.deal`), the field the roll writes. The slice goes up spinning, sticks over the board and drips (the tell),
   * peels in three stages, sagging on a strand (the wind-up), and dangling it waits for a head: the first free cook
   * under it gets it - PLOP!, worn on the head while the stick still walks, shaken off, onto the floor - and with
   * nobody under it, it gives up and SPLATs on the floor. The hungry one under it EATS it: CHOMP!, the chew, MMM!; and
   * holding the bowl's stir under it, the stir never loses a frame. The dish is untouched throughout.
   */
  async kitchenSlice(server) {
    const G = GAGS;
    // a party without the hungry one: the slice is worn
    await withPage(server, 'skipTo=kitchen&critters=1,2&order=1', async (api, page) => {
      await api.step(2);
      await oneOrder(api, page);
      const mod = await page.evaluate(async (keys) => { const m = await import('/src/game/kitchenGags.ts'); return Object.fromEntries(keys.map((k) => [k, m[k]])); }, Object.keys(G));
      assert(JSON.stringify(mod) === JSON.stringify(G), `the scenario's numbers are the module's (${JSON.stringify(mod)})`);
      await pullAll(api);
      let s = await walkTo(api, CHOP);
      // the deal is rolled on the first chop; set the chop it lands on, as the roll would
      s = await chopOnce(api);
      assert(s.top.count === 1 && s.top.slicePhase === 'none', `the first chop deals and nothing has flown yet (count ${s.top.count}, ${s.top.slicePhase})`);
      await page.evaluate((k) => { window.__game.game.screen.gags.deal = k; }, G.SLICE_FIRST);
      for (let i = 1; i < G.SLICE_FIRST; i++) s = await chopOnce(api);
      assert(s.top.slicePhase === 'up' && s.top.sliceT > 0 && s.top.sliceT < G.FLICK, `the dealt chop flicks a slice up off the board (${s.top.slicePhase}, t ${s.top.sliceT})`);
      await api.step(4);
      await api.shot('kitchen-slice-flick');
      // THE TELL: stuck to the ceiling over the board, dripping, while the chopping goes on underneath it
      await api.step(G.FLICK + 8 - (await api.summary()).top.sliceT);
      s = await api.summary();
      const x = s.top.sliceX;
      assert(s.top.slicePhase === 'hang' && x === 168, `it sticks to the ceiling over the board (${s.top.slicePhase} at x ${x})`);
      await api.shot('kitchen-slice-ceiling');
      for (let i = G.SLICE_FIRST; i < 10; i++) s = await chopOnce(api);
      assert(s.top.step === 2 && s.top.scores[1] === 2 && s.top.total === 4, `the chopping finishes under it, PERFECT as ever (step ${s.top.step}, scores ${s.top.scores}, total ${s.top.total})`);
      // THE WIND-UP: it peels, a stage at a time
      await api.step(G.PEEL_AT + G.PEEL_STEP + 10 - (await api.summary()).top.sliceT);
      s = await api.summary();
      assert(s.top.slicePhase === 'peel', `it peels (${s.top.slicePhase}, t ${s.top.sliceT})`);
      await api.shot('kitchen-slice-peel');
      // dangling, and nobody under it (seat 0 chopped left of the board, seat 1 stands at the board's left): it waits
      await api.step(G.READY_AT + 6 - s.top.sliceT);
      s = await api.summary();
      assert(s.top.slicePhase === 'ready' && s.top.seats.every((q) => Math.abs(q[1] - x) > G.UNDER), `ready, it hangs on while nobody is under it (${s.top.slicePhase}; seats at ${s.top.seats.map((q) => q[1])})`);
      // THE BANG: seat 1 walks under it, and it lets go onto that head
      s = await walkX(api, 1, x - G.UNDER);
      assert(s.top.slicePhase === 'fall' && s.top.sliceOn === 1, `the moment seat 1 is under it, it lets go onto them (${s.top.slicePhase}, on seat ${s.top.sliceOn})`);
      await api.step(G.FALL - 6);
      await api.shot('kitchen-slice-drop');
      await api.step(6 + 2);
      s = await api.summary();
      assert(s.top.slices === 1 && s.top.slicePhase === 'none' && s.top.hats[1] > G.HAT_FRAMES - 6 && s.top.hats[0] === 0, `PLOP: it is on seat 1's head (slices ${s.top.slices}, hats ${s.top.hats})`);
      assert((await cardsUp(page)) >= 1, 'PLOP! is up');
      await api.step(4);
      await api.shot('kitchen-slice-plop');
      // THE LOOK, and the stick still walks: seat 1 goes on with it on their head
      const x1 = s.top.seats[1][1];
      s = await walkX(api, 1, x1 - 24);
      assert(s.top.seats[1][1] === x1 - 24 && s.top.hats[1] > 0, `wearing it, the stick still walks (x ${x1} -> ${s.top.seats[1][1]}, hat ${s.top.hats[1]})`);
      await api.shot('kitchen-slice-hat');
      // ...then shaken off, onto the floor behind them
      await api.step(s.top.hats[1] - G.SHAKE_FRAMES + 4);
      s = await api.summary();
      assert(s.top.seats[1][3] === 'shake' && s.top.hats[1] > 0, `at the end of it the cook shakes it off (${s.top.seats[1][3]}, hat ${s.top.hats[1]})`);
      await api.step(G.SHAKE_FRAMES + 20);
      s = await api.summary();
      assert(s.top.hats[1] === 0 && s.top.splats >= 1 && s.top.seats[1][3] === 'idle', `off it comes, and it lies on the floor (hat ${s.top.hats[1]}, splats ${s.top.splats}, ${s.top.seats[1][3]})`);
      // nothing about the dish changed: the batch is in the bowl, the scores as they were
      assert(s.top.at[MIX] === 6 && s.top.total === 4 && s.top.scores.join() === '2,2,-1,-1,-1', `the dish never knew (at ${s.top.at}, total ${s.top.total}, scores ${s.top.scores})`);
      // NOBODY UNDER IT: a second one, forced through the deal again; it waits its while and gives up onto the floor
      await page.evaluate((k) => { const g = window.__game.game.screen.gags; g.deal = k; g.chop(k, '#D9463B'); }, G.SLICE_FIRST);
      await api.step(G.GIVE_UP + G.FALL + 4);
      s = await api.summary();
      assert(s.top.slices === 2 && s.top.sliceOn === -1 && s.top.hats.every((h) => h === 0) && s.top.splats >= 1, `with nobody under it, it SPLATs on the floor (slices ${s.top.slices}, on ${s.top.sliceOn}, hats ${s.top.hats})`);
      assert((await cardsUp(page)) >= 1, 'SPLAT! is up');
      await api.shot('kitchen-slice-floor');
    });

    // the hungry one: he eats the evidence
    await withPage(server, 'skipTo=kitchen&critters=0,1&order=1', async (api, page) => {
      await api.step(2);
      await oneOrder(api, page);
      await pullAll(api);
      let s = await walkTo(api, CHOP);
      s = await chopOnce(api);
      await page.evaluate((k) => { window.__game.game.screen.gags.deal = k; }, G.SLICE_FIRST);
      for (let i = 1; i < 10; i++) s = await chopOnce(api);
      // (his own bite may roll on the chopping's last chop; a step of the stick ends it, as it would for a player)
      if (s.top.seats[0][4] > 0) { await walkX(api, 0, s.top.seats[0][1] + 2); s = await api.summary(); }
      assert(s.top.step === 2 && s.top.slicePhase !== 'none', `the chopping is done with a slice up (step ${s.top.step}, ${s.top.slicePhase})`);
      const x = s.top.sliceX, total = s.top.total;
      await api.step(G.READY_AT + 2 - s.top.sliceT);
      s = await walkX(api, 0, x - G.UNDER);
      assert(s.top.slicePhase === 'fall' && s.top.sliceOn === 0, `under it, it lets go onto Barley (${s.top.slicePhase}, on ${s.top.sliceOn})`);
      await api.step(G.FALL - 4);
      await api.shot('kitchen-slice-gape');
      await api.step(4 + 6);
      s = await api.summary();
      assert(s.top.slices === 1 && s.top.hats[0] === 0 && s.top.seats[0][3] === 'chomp' && s.top.seats[0][4] > 0 && s.top.seats[0][5] === 1,
        `Barley eats it: no hat, the chomp, the slice in his paw (hats ${s.top.hats}, ${s.top.seats[0][3]}, eatT ${s.top.seats[0][4]}, item ${s.top.seats[0][5]})`);
      assert((await cardsUp(page)) >= 1, 'CHOMP! is up');
      await api.shot('kitchen-slice-barley');
      await api.step(G.MMM_AT - 6 + 2);
      s = await api.summary();
      assert(s.top.seats[0][5] === 0 && s.top.seats[0][4] > 0, `swallowed: the paw is empty (item ${s.top.seats[0][5]})`);
      await api.shot('kitchen-slice-mmm');
      await api.step(G.EAT_FRAMES);
      s = await api.summary();
      assert(s.top.seats[0][4] === 0 && s.top.seats[0][3] === 'idle' && s.top.total === total && s.top.at[MIX] === 6, `and that is all: idle again, nothing about the dish changed (eatT ${s.top.seats[0][4]}, total ${s.top.total}, at ${s.top.at})`);

      // UNDER IT AT THE BOWL, HOLDING THE STIR: the slice lands in his mouth, and the stir never misses a frame
      s = await walkX(api, 0, x + 8);
      assert(s.top.seats[0][2] === MIX && Math.abs(s.top.seats[0][1] - x) <= G.UNDER, `Barley stands at the bowl, under the ceiling spot (station ${s.top.seats[0][2]}, x ${s.top.seats[0][1]})`);
      await page.evaluate((k) => { const g = window.__game.game.screen.gags; g.deal = k; g.chop(k, '#D9463B'); }, G.SLICE_FIRST);
      await api.hold(0, { action: true });
      await api.step(G.READY_AT + G.FALL + 3);
      s = await api.summary();
      await api.release(0);
      assert(s.top.slices === 2 && s.top.t === G.READY_AT + G.FALL + 3 && s.top.seats[0][4] === 0, `it came down on him mid-stir and the stir ran on every frame (slices ${s.top.slices}, t ${s.top.t}, eatT ${s.top.seats[0][4]})`);
    });
  },

  /**
   * THE WHOLE LINE AS ONE GIANT ORDER: the kitchen opens on every order in the fete's line at once - read by dish,
   * one ticket row and one plate per dish with how many it is for, the whole line crowding the hatch - with their
   * steps merged into one run of the counter, each order's own steps kept in its own order along it. One fridge run
   * pulls every ingredient (a tap each), each station is worked once, every plate is dished before the one bell, the
   * bell sends every plate out through the hatch to the diner who asked for it, and results has the whole line
   * eating and closes the day.
   */
  async kitchenTogether(server) {
    await withPage(server, 'skipTo=kitchen&critters=0,1&day=5', async (api, page) => {
      await api.step(2);
      let s = await api.summary();
      const want = await page.evaluate(() => window.__game.game.run.lineOrders().map((o) => ({ id: o.id, steps: o.steps.map((x) => x.toUpperCase()), units: o.needs.reduce((n, x) => n + x.amount, 0), kinds: o.needs.map((x) => x.id) })));
      const dishes = dishGroups(want.map((o) => o.id)), kinds = new Set(want.flatMap((o) => o.kinds));
      assert(want.length === 9 && s.top.orders.join() === want.map((o) => o.id).join(), `the kitchen opens on all nine orders of the fete's line at once (${s.top.orders.join()})`);
      assert(s.top.custs === 9, `the whole line is at the hatch (${s.top.custs} diners)`);
      assert(s.top.crowd.every(([x, top]) => x > 500 && x < 640 && top > 90 && top < 230) && new Set(s.top.crowd.map((c) => c[1])).size >= 3,
        `every one of them stands in the opening, the rest of the line in rows behind the front (${s.top.crowd.map((c) => c.join(':')).join(' ')})`);
      assert(want.every((o, d) => s.top.routes[d].join() === o.steps.join()), `each order keeps its own steps in its own order along the merged run (${s.top.routes.map((r) => r.join('>')).join(' | ')} on ${s.top.steps.join('>')})`);
      assert(s.top.steps.filter((x) => x === 'FRIDGE').length === 1 && s.top.steps.filter((x) => x === 'PLATE').length === 1, `one fridge run and one bell for the whole line (${s.top.steps.join()})`);
      assert(s.top.pulls === kinds.size && s.top.units === want.reduce((n, o) => n + o.units, 0), `the fridge gives up the whole order an ingredient a tap (${s.top.pulls} taps for ${s.top.units} items)`);
      assert(s.top.dishes.join() === dishes.map((g) => g.id).join() && s.top.counts.join() === dishes.map((g) => g.members.length).join(), `the ticket reads the order by dish (${s.top.ticket.join(' / ')})`);
      assert(s.top.plateX.length === dishes.length && s.top.plateX.every((x, g) => x <= 626 && (g === 0 || x > s.top.plateX[g - 1])), `a plate per dish stands along the hatch shelf (${s.top.plateX.join()})`);
      await api.shot('kitchen-together');
      // cook it all, station by station, and look at the hatch shelf just before the bell
      const steps = s.top.steps.length;
      for (let k = 0; k < steps - 1; k++) {
        const name = s.top.steps[k];
        if (name === 'FRIDGE') s = await pullAll(api);
        else {
          s = await walkTo(api, [FRIDGE, CHOP, MIX, STOVE, OVEN, PLATE][['FRIDGE', 'CHOP', 'MIX', 'STOVE', 'OVEN', 'PLATE'].indexOf(name)]);
          if (name === 'CHOP') { await chopOnce(api); await holdOffSlice(page); for (let i = 1; i < 20 && (await api.summary()).top.step === k; i++) await chopOnce(api); }
          else { await api.hold(0, { action: true }); for (let i = 0; i < 80 && (await api.summary()).top.step === k; i++) await api.step(4); await api.release(0); }
          s = await api.summary();
        }
      }
      s = await walkTo(api, PLATE);
      await api.step(120);
      s = await api.summary();
      assert(s.top.dished.join() === want.map((o) => o.id).join() && s.top.flying === 0, `every order is dished before the bell (${s.top.dished.join()})`);
      assert(s.top.plates.join() === dishes.map((g) => g.id).join(), `and every dish's plate is the finished dish (${s.top.plates.join()})`);
      await api.shot('kitchen-together-plated');
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.served && s.top.dishStars.length === 9 && s.top.dishStars.every((v) => v === 3), `the one bell serves them all (${s.top.dishStars.join()})`);
      assert(s.top.passed === 0 && s.top.holding === 0 && s.top.onShelf.join() === dishes.map((g) => g.members.length).join(), `the bell rings with every plate still on the shelf (${s.top.onShelf.join()})`);
      // the plates go out through the hatch one after another, front of the line first, each into its diner's paws
      await api.step(46);
      s = await api.summary();
      assert(s.screen === 'kitchen' && s.top.passed > 1 && s.top.passed < 9 && s.top.holding < s.top.passed, `the plates go out one after another (${s.top.passed} out of the hatch, ${s.top.holding} taken)`);
      assert(s.top.onShelf.reduce((t, n) => t + n, 0) === 9 - s.top.passed, `the shelf counts down as they go (${s.top.onShelf.join()})`);
      await api.shot('kitchen-serving');
      await api.step(60);
      s = await api.summary();
      assert(s.screen === 'kitchen' && s.top.holding === 9 && s.top.onShelf.every((n) => n === 0), `every diner in the line has their plate, and the shelf is bare (${s.top.holding} holding, ${s.top.onShelf.join()})`);
      await api.shot('kitchen-served');
      for (let i = 0; i < 30 && (await api.screen()) !== 'results'; i++) await api.step(6);
      s = await api.summary();
      assert(s.screen === 'results' && s.top.diners === 9 && s.top.stars.every((v) => v === 3), `results serves the whole line at once (on ${s.screen}, ${s.top.stars})`);
      assert(s.top.receipt.length === dishes.length && s.top.receipt.every((r, g) => r.startsWith(dishes[g].members.length + ' X ')), `the receipt reads the order by dish (${s.top.receipt.join(' / ')})`);
      await api.step(230);
      s = await api.summary();
      assert(s.top.chews.every((c) => c === 3) && s.top.stamp === 'DELICIOUS' && s.top.coins === 9 * TIP_COINS[3], `all nine eat, the line is stamped DELICIOUS and tips ${s.top.coins} coins (${s.top.chews}, '${s.top.stamp}')`);
      assert((await api.errors()).length === 0, 'no errors serving the whole line');
      await api.shot('results-together');
      await api.press(0, { action: true }, 1, 2);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.served === 9 && s.run.dayComplete === true, `one confirm banks the whole line and the day closes (on ${s.screen}, served ${s.run.served})`);
    });
  },

  async results(server) {
    await withPage(server, 'skipTo=results&critters=0,1', async (api, page) => {
      await api.step(30);
      const s0 = await api.summary();
      const total = s0.run.lines[s0.run.line].customers.length;
      assert(s0.screen === 'results' && s0.top.diners === total && total > 1 && s0.top.stars.every((v) => v === 2), `results opens on its own with the whole line and two stars each (${s0.screen}, ${s0.top.diners} of ${total}, ${s0.top.stars})`);

      // the whole line eats at once: every diner has the plate they were handed in their paws and is eating it, and
      // the crew in the truck's windows cheer a few frames after each other once the stars have landed
      await api.step(40);
      const k = await page.evaluate(() => {
        const g = window.__game.game, r = g.screens[g.screens.length - 1];
        return { crew: r.crew.map((c) => [c.player.name, c.cheerAt]), diners: r.diners.map((d) => [d.x, d.holding, d.chews, d.plate ? d.plate.bites : -1]) };
      });
      assert(k.crew.length === 2 && k.crew.every((c) => c[0] === 'cheer'), `both seats cheer from the truck (${k.crew.map((c) => c[0]).join()})`);
      assert(k.crew[1][1] > k.crew[0][1], `the seats cheer on a stagger (${k.crew.map((c) => c[1]).join()})`);
      assert(k.diners.every((d) => d[1] && d[2] >= 1 && d[3] === d[2]), `every diner has their plate and is eating it, a bite gone per chew (${k.diners.map((d) => d.slice(1).join(':')).join()})`);
      assert(k.diners.every((d, i) => i === 0 || d[0] > k.diners[i - 1][0]), `they stand where they queued, front first (${k.diners.map((d) => d[0]).join()})`);
      await api.shot('results-crew');

      await api.step(140);
      const s1 = await api.summary();
      assert(s1.top.chews.every((c) => c === 3) && s1.top.holding.every((h) => !h) && s1.top.stamp === 'TASTY', `every plate is cleaned and the line stamped TASTY (${s1.top.chews}, ${s1.top.holding}, '${s1.top.stamp}')`);
      await api.press(0, { action: true }, 1, 2);
      const s2 = await api.summary();
      assert(s2.screen === 'stage' && s2.run.served === total && s2.run.customer === total && s2.run.linesServed === 1 && s2.run.dayComplete === true,
        `action serves the whole line at once and the board closes the day (on ${s2.screen}, served ${s2.run.served}, customer ${s2.run.customer})`);
    });
  },
};
