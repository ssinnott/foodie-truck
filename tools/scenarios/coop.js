// Playtest scenarios for the coop work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   coop - four seats in the coop: seat 0 is driven along its lane to the nearest egg (polling summary() for its
//          reach x and holding the stick toward it), presses action and has one egg in its basket; up and down
//          move nobody (the lanes are the whole depth a seat gets); the five hens potter at the back and touch
//          nothing; then the finish line is brought down to the party's total: the EGGS sign drops, is held, and the screen
//          returns to the map with the order's egg line updated by the party's total. Also writes
//          tools/screens/coop-pluck.png and coop-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** Nearest [x, fy, nest] of `list` to x along the lane, or null. */
function nearest(list, x) {
  let best = null, bd = 1e9;
  for (const p of list) { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = p; } }
  return best;
}

export const SCENARIOS = {
  async coop(server) {
    await withPage(server, 'skipTo=coop&critters=0,1,2,3', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'coop', `the coop is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      assert(s0.top.hens.length === 5, `five hens on the floor (${s0.top.hens.length})`);
      const lanes = s0.top.seats.map((s) => s[2]);
      assert(lanes.every((y, i) => i === 0 || y === lanes[i - 1] - 8), `the seats stand on four lanes 8 px apart (${lanes.join()})`);
      const others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => [s[1], s[2]]));

      // up and down are not directions in this coop: 30 frames of `up` leaves seat 0 exactly where it was
      await api.hold(0, { up: true });
      await api.step(30);
      await api.release(0);
      const up = await api.summary();
      assert(up.top.seats[0][1] === s0.top.seats[0][1] && up.top.seats[0][2] === s0.top.seats[0][2], `up moves nobody (${s0.top.seats[0][1]},${s0.top.seats[0][2]} -> ${up.top.seats[0][1]},${up.top.seats[0][2]})`);

      // wait for an egg, then drive seat 0 along the lane to its reach x and pluck it
      let plucked = false, last = up;
      for (let attempt = 0; attempt < 4 && !plucked; attempt++) {
        let egg = null;
        for (let i = 0; i < 60 && !egg; i++) { await api.step(4); last = await api.summary(); egg = nearest(last.top.eggs, last.top.seats[0][1]); }
        if (!egg) break;
        for (let i = 0; i < 150; i++) {
          const dx = egg[0] - last.top.seats[0][1];
          if (Math.abs(dx) <= 3) break;
          await api.hold(0, dx > 0 ? { right: true } : { left: true });
          await api.step(4);
          last = await api.summary();
          if (!last.top.eggs.some((e) => e[0] === egg[0] && e[1] === egg[1])) break;
        }
        await api.release(0);
        await api.step(2);
        const before = (await api.summary()).top.seats[0][3];
        await api.press(0, { action: true }, 1, 0);
        const after = await api.summary();
        await api.step(5);
        if (after.top.seats[0][3] === before + 1) { plucked = true; await api.shot('coop-pluck'); }
      }
      assert(plucked, 'seat 0 walked to an egg, pressed action and has it in the basket (count 1)');
      const p = await api.summary();
      assert(p.top.count >= 1 && p.top.seats[0][3] >= 1, `the party total counts the egg (total ${p.top.count}, seat 0 ${p.top.seats[0][3]})`);
      assert(p.top.seats.slice(1).every((s) => s[3] === 0), 'the other seats, with no input, plucked nothing');
      assert(JSON.stringify(p.top.seats.slice(1).map((s) => [s[1], s[2]])) === others0, 'the other seats stayed put: no hen shoves anyone');
      assert(p.top.hens.every((h) => h[1] <= 290), `the hens keep to the back of the floor (${p.top.hens.map((h) => h[1]).join()})`);

      // bring the finish line down to the party's total (or watch the early ending) and expect the sign, then the map:
      // there is no clock to force, a round ends only when the total reaches the target
      let s2 = await api.summary();
      if (s2.screen === 'coop' && s2.top.phase === 0) {
        assert(s2.top.count >= 1, `something was collected before the ending (count ${s2.top.count})`);
        await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
        await api.step(4 + SLAM + 20);
        s2 = await api.summary();
        assert(s2.screen === 'coop' && s2.top.phase === 1 && /^EGGS: \d+$/.test(s2.top.sign), `the target was reached: the EGGS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
        await api.shot('coop-sign');
        await api.step(HOLD);
      } else if (s2.screen === 'coop') await api.step(SLAM + HOLD);
      const lastCoop = s2.screen === 'coop' ? s2 : p;
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the coop hands back to the map (on ${s3.screen})`);
      const count = lastCoop.top.count, target = lastCoop.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('egg:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(count, target), `run.gather('egg') banked the party's total (${line}, count ${count})`);
    });
  },
};
