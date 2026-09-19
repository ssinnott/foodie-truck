// Playtest scenarios for the dairy work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   dairy - four seats in the byre on the CUSTARD TART order, so the target is the order's own milk line and not
//           the fallback: seat 0 is milked with REAL input through api.press - twelve taps of action, one pail, the
//           party's total up by one, and the other seats still on zero. Then the two things the byre promises:
//             any rhythm works - twelve taps spread over six seconds fill a pail just the same;
//             nothing else does anything - `alt` moves nothing, and no cow ever kicks.
//           Finally the finish line is brought down to the party's total: the MILK sign drops, is held, and the screen hands back
//           to the map with the order's milk line updated by the party's total.
//           Shots: tools/screens/dairy-pump.png (mid-squirt: the jet, the ring, the chevron on its next step) and
//           dairy-sign.png.
//   dairyButter - two seats on the PEACH COBBLER order, so the byre's visit is for butter: a barrel churn stands
//           beside each stall. Twelve taps fill the pail and bank NOTHING - the seat turns to the churn instead
//           (phase 1, churn 0, the total unchanged); the next eleven taps turn the crank and still bank nothing;
//           the twelfth brings the pat (count and total up by one, the seat back at the cow, phase 0). Then the
//           finish line is brought down to the total: the BUTTER sign and the map with the order's butter line updated. Shots: dairy-churn.png (mid-crank).
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const PUMP_PER_PAIL = 12;
/** ?order=5 is ORDERS[4], CUSTARD TART: milk 3 + egg 2, so `milk` is a real line on the ticket. */
const BOOT = 'skipTo=dairy&critters=0,1,2,3&order=5';
/** ?recipes=8 fixes the menu to ORDERS[8], PEACH COBBLER: peach 3 + butter 2, so the dairy's visit is for butter. */
const BOOT_BUTTER = 'skipTo=dairy&critters=0,1&recipes=8';
const CHURN_PRESSES = 12;
/** The frame of the squirt the pump shot is taken on: the jet is still up and the ring has opened. */
const PUMP_SHOT = 3;

/** Hold the finish line out of reach so a +1 cannot end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total); });
}
/** Seat 0 as the sim holds it. */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { fill: s.fill, count: s.count, bumpT: s.bumpT, anim: s.anim, total: sc.total, phase: s.phase, churn: s.churn, facing: s.facing };
  });
}

export const SCENARIOS = {
  async dairy(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'dairy', `the dairy is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.cows.length === 4, `four seats, four cows (${s0.top.seats.length} / ${s0.top.cows.length})`);
      const milkLine = (s0.run.needs || []).find((n) => n.startsWith('milk:')) || '';
      assert(milkLine === `milk:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own milk line (${milkLine}, target ${s0.top.target})`);
      const others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s.count));

      // --- real input: twelve quick taps fill a pail and bank one milk for the party
      await holdTarget(page);
      const before = await seat0(page);
      assert(before.fill === 0, `seat 0 starts with an empty pail (fill ${before.fill})`);
      let shot = false;
      for (let i = 0; i < PUMP_PER_PAIL; i++) {
        await api.hold(0, { action: true });
        await api.step(1);
        await api.release(0);
        if (!shot) { await api.step(PUMP_SHOT); await api.shot('dairy-pump'); shot = true; await api.step(4); }
        else await api.step(7);
        const mid = await seat0(page);
        if (i < PUMP_PER_PAIL - 1) assert(mid.fill === i + 1, `tap ${i + 1} is a squirt: the pail is ${i + 1}/${PUMP_PER_PAIL} (fill ${mid.fill})`);
      }
      const filled = await seat0(page);
      assert(filled.count === before.count + 1, `twelve taps bank a pail (seat 0 ${before.count} -> ${filled.count})`);
      assert(filled.total === before.total + 1, `and the party's total goes up with it (${before.total} -> ${filled.total})`);
      assert(filled.fill === 0, `a fresh pail slides in (fill ${filled.fill})`);
      const after = await api.summary();
      assert(JSON.stringify(after.top.seats.slice(1).map((s) => s.count)) === others0, 'the other seats, with no input, milked nothing');

      // --- any rhythm: twelve slow taps, half a second apart, fill a pail just the same
      const slowBefore = await seat0(page);
      for (let i = 0; i < PUMP_PER_PAIL; i++) await api.press(0, { action: true }, 1, 29);
      const slow = await seat0(page);
      assert(slow.count === slowBefore.count + 1 && slow.fill === 0, `twelve slow taps fill a pail too (seat 0 ${slowBefore.count} -> ${slow.count}, fill ${slow.fill})`);

      // --- nothing else does anything: `alt` is not a pump, and no cow ever kicks
      // forty taps are three more pails: push the finish line well out so the mash cannot end the round under the assert
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total + 20; sc.setTotal(sc.total); });
      const altBefore = await seat0(page);
      await api.press(0, { alt: true }, 1, 3);
      const alted = await seat0(page);
      assert(alted.fill === altBefore.fill && alted.count === altBefore.count, `alt moves nothing (fill ${alted.fill}, count ${alted.count})`);
      for (let i = 0; i < 40; i++) await api.press(0, { action: true }, 1, 2);
      const mashed = await seat0(page);
      assert(mashed.bumpT === 0 && mashed.anim !== 'bump', `forty taps in a row and nothing kicks (bumpT ${mashed.bumpT}, anim '${mashed.anim}')`);
      assert(mashed.count === altBefore.count + Math.floor((altBefore.fill + 40) / PUMP_PER_PAIL), `every one of them counted (seat 0 ${altBefore.count} -> ${mashed.count})`);

      // --- the ending: bring the finish line down to the party's total (there is no clock to force), expect the sign,
      // then the map with the milk banked
      const last = await api.summary();
      assert(last.top.total >= 1, `something was milked before the ending (total ${last.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'dairy' && s2.top.phase === 1 && /^MILK: \d+$/.test(s2.top.sign), `the target was reached: the MILK sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('dairy-sign');
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the dairy hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (holdTarget lifted the screen's so it could not end early)
      const total = last.top.total, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('milk:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(total, target), `run.gather('milk') banked the party's total (${line}, total ${total})`);
    });
  },

  async dairyButter(server) {
    await withPage(server, BOOT_BUTTER, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'dairy' && s0.top.seats.length === 2, `the dairy is up with two seats (on ${s0.screen}, ${s0.top.seats.length} seats)`);
      const butterLine = (s0.run.needs || []).find((n) => n.startsWith('butter:')) || '';
      assert(butterLine === `butter:0/${s0.top.target}` && s0.top.target > 0, `the visit is for the order's own butter line (${butterLine}, target ${s0.top.target})`);
      const isButter = await page.evaluate(() => window.__game.game.screen.butter === true && window.__game.game.screen.ing === 'butter');
      assert(isButter, 'the screen knows it is a butter visit (the churns stand)');
      await holdTarget(page);

      // --- the pail: twelve taps fill it, and on a butter visit that banks nothing - the seat turns to the churn
      const before = await seat0(page);
      assert(before.phase === 0 && before.facing === -1, `seat 0 starts at the cow (phase ${before.phase}, facing ${before.facing})`);
      for (let i = 0; i < PUMP_PER_PAIL; i++) await api.press(0, { action: true }, 1, 3);
      const poured = await seat0(page);
      assert(poured.phase === 1 && poured.churn === 0 && poured.fill === 0, `a full pail pours into the churn: the seat is cranking with an empty crank (phase ${poured.phase}, churn ${poured.churn}, fill ${poured.fill})`);
      assert(poured.count === before.count && poured.total === before.total, `and nothing is banked yet (count ${poured.count}, total ${poured.total})`);
      assert(poured.facing === 1, `the milker has turned round to the churn (facing ${poured.facing})`);

      // --- the crank: eleven turns are eleven turns, the twelfth is the pat
      for (let i = 0; i < CHURN_PRESSES - 1; i++) {
        await api.press(0, { action: true }, 1, 3);
        if (i === 4) { await api.step(1); await api.shot('dairy-churn'); }
      }
      const almost = await seat0(page);
      assert(almost.phase === 1 && almost.churn === CHURN_PRESSES - 1 && almost.total === before.total, `${CHURN_PRESSES - 1} turns of the crank are ${CHURN_PRESSES - 1} turns (phase ${almost.phase}, churn ${almost.churn}, total ${almost.total})`);
      await api.press(0, { action: true }, 1, 3);
      const patted = await seat0(page);
      assert(patted.count === before.count + 1 && patted.total === before.total + 1, `the ${CHURN_PRESSES}th turn brings the butter (seat 0 ${before.count} -> ${patted.count}, total ${before.total} -> ${patted.total})`);
      assert(patted.phase === 0 && patted.churn === 0 && patted.facing === -1, `and the milker is back at the cow with a fresh pail (phase ${patted.phase}, churn ${patted.churn}, facing ${patted.facing})`);
      const other = (await api.summary()).top.seats[1];
      assert(other.count === 0 && other.phase === 0, `the other seat, with no input, did nothing (count ${other.count}, phase ${other.phase})`);

      // --- the ending: bring the finish line down to the party's total (there is no clock to force), the BUTTER
      // sign, then the map with the butter banked against the order
      const last = await api.summary();
      assert(last.top.total >= 1, `something was churned before the ending (total ${last.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'dairy' && s2.top.phase === 1 && /^BUTTER: \d+$/.test(s2.top.sign), `the target was reached: the BUTTER sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the dairy hands back to the map (on ${s3.screen})`);
      const line = (s3.run.needs || []).find((n) => n.startsWith('butter:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(last.top.total, s0.top.target), `run.gather('butter') banked the party's total (${line}, total ${last.top.total})`);
    });
  },
};
