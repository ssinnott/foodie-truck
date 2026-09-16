// Playtest scenarios for the orchard work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   orchard - four seats in the orchard: 600 frames with seat 0 running left and right (no errors, a numeric
//             caught count, seat 0 actually moved and stayed inside the lane, the other seats did not), then the
//             clock is forced to its last frames: the APPLES sign drops, is held, and the screen returns to the map
//             with the order's apple line updated by the party's total. Also writes tools/screens/orchard-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;

export const SCENARIOS = {
  async orchard(server) {
    await withPage(server, 'skipTo=orchard&critters=0,1,2,3', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'orchard', `the orchard is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // 600 frames of seat 0 running: left for 150, right for 300, left for 150
      let ended = false, last = s0;
      const legs = [[{ left: true }, 150], [{ right: true }, 300], [{ left: true }, 150]];
      for (const [keys, n] of legs) {
        await api.hold(0, keys);
        for (let k = 0; k < n && !ended; k += 50) { await api.step(50); last = await api.summary(); if (last.screen !== 'orchard') ended = true; }
        await api.release(0);
      }
      assert(typeof last.top.caught === 'number', `summary().caught is a number (${last.top.caught})`);
      if (!ended) {
        const x1 = last.top.seats[0][1];
        assert(x1 !== x0 && x1 >= 24 && x1 <= 616, `seat 0 moved and stayed inside the lane (${x0} -> ${x1})`);
        assert(JSON.stringify(last.top.seats.slice(1).map((s) => s[1])) === others0, 'the other seats, with no input, stayed put');
        // 603 frames: main.js boots test mode with one step, then 2 + 600 here
        assert(last.top.timer === 2400 - 603, `the clock counted every frame (timer ${last.top.timer})`);
      }

      // force the clock to its end (or watch the early ending) and expect the sign, then the map
      if (!ended) {
        await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
        await api.step(4 + SLAM + 20);
        const s2 = await api.summary();
        assert(s2.screen === 'orchard' && s2.top.phase === 1 && /^APPLES: \d+$/.test(s2.top.sign), `the clock ran out: the APPLES sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
        await api.shot('orchard-sign');
        await api.step(HOLD);
      }
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the orchard hands back to the map (on ${s3.screen})`);
      const caught = last.top.caught, target = last.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('apple:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(caught, target), `run.gather('apple') banked the party's total (${line}, caught ${caught})`);
    });
  },
};
