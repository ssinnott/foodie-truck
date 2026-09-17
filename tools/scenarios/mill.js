// Playtest scenarios for the mill work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   mill - four seats in Windle Mill on the HONEY LOAF order (the first order that asks for flour, so the screen
//          takes its target from the order line and run.gather has a line to bank into):
//            * the screen is up with four seats, four chutes and a target from the order;
//            * 300 frames of seat 0 running left and right through api.hold - it moved, stayed inside the floor,
//              and the three seats with no input stayed exactly where they were put;
//            * the ONE RULE, driven by hand: with a chute forced to POUR and seat 0 stood under it, holding action
//              raises the fill (a dead FILL_RATE or a dead catch test fails here), releasing at the brim scores +1
//              and banks it in the party's total, and holding past the brim BURSTS - the part fill goes, the seat's
//              bump beat starts and one BANKED sack goes with it. The same hold with the chute dormant fills
//              nothing, which is the assert that catches a fill that forgot to check the chute;
//            * the clock forced to its last frames: the FLOUR sign drops with the party's total on it, is held,
//              the screen hands back to the map and run.gather('flour') has moved the order's flour line.
//          Writes tools/screens/mill-fill.png (a sack in the brim band under a pouring chute - the shot the
//          "nearly full vs about to burst" read is judged from) and mill-burst.png (the flour cloud, the whitened
//          critter and the '-1').
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, restated here so a change to either side shows up as a failing assert, not a silent pass. */
const FILL_RATE = 1 / 54, FULL = 1, BRIM_AT = 0.65, BURST = 1.5;
/** Frames of holding that land the sack inside the brim band: 45/54 = 0.833, comfortably between 0.65 and 1. */
const TO_BRIM = 45;
/** ...and from there to just over the brim (57/54 = 1.055), where a release ties the sack off. */
const TO_FULL = 12;
/** A full hold from empty to the bang: BURST / FILL_RATE = 81 frames, plus one so the test never sits on the edge. */
const TO_BURST = 82;

/**
 * Stand seat 0 under chute `ci` with an empty sack and that chute pouring, and switch everything else off: no more
 * spouts wake, no other chute is live, and the target is held out of reach so a +1 cannot end the round in the
 * middle of the beat (run.gather clamps to the order's own line, so the bank assert still reads the real target).
 * `pouring` false leaves the chute DORMANT, which is how the negative case is set up. Costs one step.
 */
async function stage(api, page, ci, pouring) {
  const before = await page.evaluate(([i, on]) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.wake = 100000;
    for (const c of sc.chutes) { c.state = 0; c.t = 0; c.seat = -1; }
    // the chute is put on the LAST frame of its telegraph, not straight into POURING with a made-up timer: one
    // step then gives it the screen's own POUR_FRAMES, so the test never invents a state the sim cannot reach
    if (on) { sc.chutes[i].state = 1; sc.chutes[i].t = 1; }
    s.x = sc.summary().chutes[i][3]; s.facing = 1; s.moving = false;
    s.fill = 0; s.bumpT = 0; s.tieT = 0; s.whiteT = 0; s.wasHeld = false; s.chute = -1;
    sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total);
    return { count: s.count, total: sc.total, target: sc.target };
  }, [ci, pouring]);
  await api.step(1);
  return before;
}

/** Seat 0 as the sim holds it (summary only carries the rounded fill). */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { x: s.x, fill: s.fill, count: s.count, bumpT: s.bumpT, whiteT: s.whiteT, tieT: s.tieT, anim: s.anim, chute: s.chute, total: sc.total, bursts: sc.bursts, tied: sc.tied };
  });
}

export const SCENARIOS = {
  async mill(server) {
    // order=4 is HONEY LOAF (content/recipes.js ORDERS index 3): FLOUR 3 + HONEY 2. Without it the boot order is
    // APPLE PIE, the screen falls back to a target of 3 and run.gather('flour') has nothing to bank into.
    await withPage(server, 'skipTo=mill&critters=0,1,2,3&order=4', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'mill', `the mill is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      assert(s0.top.chutes.length === 4, `four chutes along the back wall (${s0.top.chutes.length})`);
      assert((s0.run.needs || []).some((n) => n.startsWith('flour:')), `the order asks for flour (${JSON.stringify(s0.run.needs)})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // 300 frames of real input on seat 0: left, then right past where it started. `last` only ever holds a MILL
      // summary - once the round hands off, api.summary() is the map's.
      let ended = false, last = s0;
      for (const [keys, n] of [[{ left: true }, 100], [{ right: true }, 200]]) {
        await api.hold(0, keys);
        for (let k = 0; k < n && !ended; k += 50) {
          await api.step(50);
          const s = await api.summary();
          if (s.screen !== 'mill') ended = true; else last = s;
        }
        await api.release(0);
      }
      assert(!ended, 'the round is still running after 300 frames of walking');
      const x1 = last.top.seats[0][1];
      assert(x1 !== x0 && x1 >= 34 && x1 <= 606, `seat 0 walked and stayed on the floor (${x0} -> ${x1})`);
      assert(JSON.stringify(last.top.seats.slice(1).map((s) => s[1])) === others0, 'the other seats, with no input, stayed put');
      // 303 frames: main.js boots test mode with one step, then 2 + 300 here
      assert(last.top.timer === 2400 - 303, `the clock counted every frame (timer ${last.top.timer})`);

      // --- the rule, part one: a chute that is NOT pouring fills nothing, however hard action is held
      await stage(api, page, 1, false);
      await api.hold(0, { action: true });
      await api.step(TO_BRIM);
      await api.release(0);
      const dry = await seat0(page);
      assert(dry.fill === 0 && dry.chute === -1, `holding under a DORMANT chute fills nothing (fill ${dry.fill})`);

      // --- part two: under a pouring chute the sack fills, and the brim band is where the shot is taken
      const before = await stage(api, page, 1, true);
      await api.hold(0, { action: true });
      await api.step(TO_BRIM);
      const brim = await seat0(page);
      assert(brim.chute === 1, `standing under the pouring chute registers it (chute ${brim.chute})`);
      assert(brim.fill > BRIM_AT && brim.fill < FULL,
        `${TO_BRIM} frames of hold puts the sack in the brim band (fill ${brim.fill.toFixed(3)}, band ${BRIM_AT}..${FULL})`);
      assert(Math.abs(brim.fill - TO_BRIM * FILL_RATE) < 0.02, `and it filled at FILL_RATE (${brim.fill.toFixed(3)} vs ${(TO_BRIM * FILL_RATE).toFixed(3)})`);
      // one shot carrying BOTH reads: seat 0 in the brim band (green tie, green on the tag) beside seat 2 held over
      // the brim (green/HOT strobe, red past the tag's brim post) - and the gold, which belongs to the pouring
      // chute alone, on the spouts above them. That side-by-side IS the readability claim.
      await api.hold(2, { action: true });
      await page.evaluate(() => {
        const sc = window.__game.game.screen, s = sc.seats[2];
        sc.chutes[3].state = 2; sc.chutes[3].t = 90;
        s.x = sc.summary().chutes[3][3]; s.facing = 1; s.moving = false; s.fill = 1.3; s.wasHeld = true;
      });
      await api.step(1);
      const hot = await page.evaluate(() => window.__game.game.screen.seats[2].fill);
      assert(hot > FULL && hot < BURST, `seat 2 is held over the brim for the shot (fill ${hot.toFixed(3)})`);
      await api.shot('mill-fill');
      await api.release(2);
      // put seat 2 back before it can score off the staged fill: clearing wasHeld means no release is seen
      await page.evaluate(() => { const s = window.__game.game.screen.seats[2]; s.fill = 0; s.wasHeld = false; s.chute = -1; });

      // --- part three: releasing at or over the brim ties the sack off
      await api.step(TO_FULL);
      const over = await seat0(page);
      assert(over.fill >= FULL, `holding on carries it over the brim (fill ${over.fill.toFixed(3)})`);
      await api.release(0);
      await api.step(2);
      const tied = await seat0(page);
      assert(tied.count === before.count + 1, `releasing over the brim ties the sack off (seat 0 ${before.count} -> ${tied.count})`);
      assert(tied.total === before.total + 1, `and the party's total went up with it (${before.total} -> ${tied.total})`);
      assert(tied.fill === 0 && tied.tieT > 0 && tied.anim === 'tie', `a fresh empty sack and the tie beat (fill ${tied.fill}, tieT ${tied.tieT}, anim '${tied.anim}')`);
      await api.step(20);

      // --- part four: a release UNDER the brim keeps the part fill instead of scoring
      const partBefore = await stage(api, page, 1, true);
      await api.hold(0, { action: true });
      await api.step(20);
      await api.release(0);
      await api.step(2);
      const part = await seat0(page);
      assert(part.count === partBefore.count && part.fill > 0 && part.fill < FULL,
        `releasing under the brim keeps the part-filled sack and scores nothing (count ${part.count}, fill ${part.fill.toFixed(3)})`);

      // --- part five: holding past the brim bursts, and it costs a BANKED sack
      const burstBefore = await stage(api, page, 1, true);
      assert(burstBefore.count > 0, `seat 0 has a banked sack to lose (${burstBefore.count})`);
      await api.hold(0, { action: true });
      await api.step(TO_BURST);
      const bang = await seat0(page);
      await api.release(0);
      // five frames on: the cloud is at its widest step and the critter is still whitened (WHITE_FRAMES is 8)
      await api.step(5);
      await api.shot('mill-burst');
      assert(bang.bursts === 1, `${TO_BURST} frames of hold (BURST ${BURST} / FILL_RATE) bursts the sack (${bang.bursts} bursts)`);
      assert(bang.fill === 0, `the part fill is gone (fill ${bang.fill})`);
      assert(bang.count === burstBefore.count - 1 && bang.total === burstBefore.total - 1,
        `and one banked sack goes with it (seat 0 ${burstBefore.count} -> ${bang.count}, total ${burstBefore.total} -> ${bang.total})`);
      assert(bang.bumpT > 0 && bang.anim === 'bump' && bang.whiteT > 0,
        `the seat takes the shared bump beat, whitened with flour (bumpT ${bang.bumpT}, anim '${bang.anim}', whiteT ${bang.whiteT})`);
      await api.step(25);

      // --- the ending: force the clock to its last frames, expect the sign, the hold, then the map and the bank
      const lastMill = await api.summary();
      await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'mill' && s2.top.phase === 1 && s2.top.sign === 'FLOUR: ' + lastMill.top.total,
        `the clock ran out: the FLOUR sign is up with the party's total (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the mill hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (stage() lifts the screen's so it cannot end early)
      const total = lastMill.top.total, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('flour:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(total, target), `run.gather('flour') banked the party's total (${line}, total ${total})`);
    });
  },
};
