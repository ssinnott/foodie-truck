// Playtest scenarios for Bramble Bank (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   bramble - four seats on the bank on the STRAWBERRY TART order, so the target is the order's own strawberry
//            line and not the fallback. Then, in order:
//              THE BANK     the truck arrives to a planted bank: six bushes, SEED_RIPE ripe berries spread over them.
//              REAL INPUT   seat 0 is walked along the path with the stick (it moved, it stayed inside the path, and
//                           the three seats with no input stayed exactly where they were), walked under the nearest
//                           bush with a ripe berry on it, and `action`-ed: one berry off that bush (its ripe mask
//                           lost one bit), the seat's count and the party's total up by one, the reach beat playing.
//              NOTHING      `action` under a bush with nothing ripe on it does nothing at all.
//              RIPENING     a berry ripens on its own inside RIPEN_MIN..RIPEN_MAX frames of the last.
//              THE HAND-OFF the clock is forced to its last frames: the STRAWBERRIES sign drops, is held, and the
//                           screen hands back to the map with the order's strawberry line updated.
//            Shots: tools/screens/bramble-pick.png (mid-reach, the berry in the air) and bramble-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?recipes=13 fixes the menu to ORDERS[13], STRAWBERRY TART: strawberry 4 + butter 2, so `strawberry` is a real line. */
const BOOT = 'skipTo=bramble&critters=0,1,2,3&recipes=13';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const BUSH_X = [70, 170, 270, 370, 470, 570], REACH_FRAMES = 12, RIPEN_MAX = 120, SEED_RIPE = 6;
const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
const ripeTotal = (s) => s.top.bushes.reduce((a, m) => a + bits(m), 0);

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); });
}

export const SCENARIOS = {
  async bramble(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'bramble', `the bank is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4, `four seats work the path (${s0.top.seats.length})`);
      const line = (s0.run.needs || []).find((n) => n.startsWith('strawberry:')) || '';
      assert(line === `strawberry:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own strawberry line (${line}, target ${s0.top.target})`);
      assert(s0.top.bushes.length === 6 && ripeTotal(s0) === SEED_RIPE, `the bank is planted when the truck pulls up: ${SEED_RIPE} ripe berries on six bushes (${s0.top.bushes.join()})`);
      const x0 = s0.top.seats[0].x, others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s.x));

      // --- REAL INPUT: the stick moves seat 0 along the path and nobody else
      await holdTarget(page);
      await api.hold(0, { right: true });
      await api.step(30);
      await api.release(0);
      await api.step(2);
      let last = await api.summary();
      assert(last.top.seats[0].x > x0 && last.top.seats[0].x <= 614, `seat 0 walked the path on its own stick (${x0} -> ${last.top.seats[0].x})`);
      assert(JSON.stringify(last.top.seats.slice(1).map((s) => s.x)) === others0, 'the other seats, with no input, stayed put');

      // --- walk under the nearest bush with a ripe berry and pick it
      // ripening is paused first, so the count of ripe berries is the count the pick changes and nothing else
      await page.evaluate(() => { window.__game.game.screen.nextRipen = 100000; });
      let best = -1, bd = 1e9;
      for (let i = 0; i < BUSH_X.length; i++) { const d = Math.abs(BUSH_X[i] - last.top.seats[0].x); if (last.top.bushes[i] && d < bd) { bd = d; best = i; } }
      assert(best >= 0, 'a bush with a ripe berry is standing somewhere along the bank');
      for (let i = 0; i < 200; i++) {
        const dx = BUSH_X[best] - last.top.seats[0].x;
        if (Math.abs(dx) <= 6) break;
        await api.hold(0, dx > 0 ? { right: true } : { left: true });
        await api.step(2);
        last = await api.summary();
      }
      await api.release(0);
      await api.step(2);
      const before = await api.summary();
      const ripeBefore = ripeTotal(before), maskBefore = before.top.bushes[best];
      await api.press(0, { action: true }, 1, 0);
      await api.step(3);
      const picked = await api.summary();
      assert(picked.top.seats[0].count === before.top.seats[0].count + 1, `action under a ripe bush picks a berry (seat 0 ${before.top.seats[0].count} -> ${picked.top.seats[0].count})`);
      assert(picked.top.total === before.top.total + 1, `the party's total went up with it (${before.top.total} -> ${picked.top.total})`);
      assert(bits(picked.top.bushes[best]) === bits(maskBefore) - 1 && ripeTotal(picked) === ripeBefore - 1, `that bush lost one ripe berry and no other bush changed (${maskBefore} -> ${picked.top.bushes[best]})`);
      assert(picked.top.seats[0].reachT > 0 && picked.top.seats[0].reachT <= REACH_FRAMES && picked.top.seats[0].anim === 'pick', `and the seat is in its reach beat (reachT ${picked.top.seats[0].reachT}, anim '${picked.top.seats[0].anim}')`);
      await api.shot('bramble-pick');
      assert(picked.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, picked nothing');
      await api.step(REACH_FRAMES);

      // --- NOTHING: a bare bush gives nothing
      const bare = await page.evaluate((b) => {
        const sc = window.__game.game.screen, s = sc.seats[0];
        for (const bush of sc.bushes) bush.ripe = 0;
        s.x = b; s.reachT = 0;
        return sc.total;
      }, BUSH_X[best]);
      await api.press(0, { action: true }, 1, 2);
      const nothing = await api.summary();
      assert(nothing.top.total === bare && nothing.top.seats[0].reachT === 0, `action under a bush with nothing ripe on it does nothing (total ${nothing.top.total}, reachT ${nothing.top.seats[0].reachT})`);

      // --- RIPENING: a berry comes on its own, inside the timer's range
      await page.evaluate(() => { window.__game.game.screen.nextRipen = 40; });
      await api.step(41);
      const ripened = await api.summary();
      assert(ripeTotal(ripened) === 1, `a berry ripened on its own when the timer ran out (${ripened.top.bushes.join()})`);
      const nextRipen = await page.evaluate(() => window.__game.game.screen.nextRipen);
      assert(nextRipen > 0 && nextRipen <= RIPEN_MAX, `and the next is seeded inside the range (${nextRipen})`);

      // --- the hand-off: force the clock to its last frames, watch the sign, then the map
      const lastTotal = (await api.summary()).top.total;
      await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'bramble' && s2.top.phase === 1 && /^STRAWBERRIES: \d+$/.test(s2.top.sign), `the clock ran out: the STRAWBERRIES sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('bramble-sign');
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the bank hands back to the map (on ${s3.screen})`);
      const line3 = (s3.run.needs || []).find((n) => n.startsWith('strawberry:')) || '';
      const have = parseInt(line3.split(':')[1], 10);
      assert(line3 && have === Math.min(lastTotal, s0.top.target), `run.gather('strawberry') banked the party's total (${line3}, total ${lastTotal})`);
    });
  },
};
