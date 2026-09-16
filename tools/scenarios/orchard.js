// Playtest scenarios for the orchard work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   orchard - four seats in the orchard: 600 frames with seat 0 running left and right (no errors, a numeric
//             caught count, seat 0 actually moved and stayed inside the lane, the other seats did not), then the
//             mini-game's one rule driven by hand - an apple aimed at seat 0's rim scores, a wormy one takes the
//             score back and locks the seat in its bump - then the clock is forced to its last frames: the APPLES
//             sign drops, is held, and the screen returns to the map with the order's apple line updated by the
//             party's total. Also writes tools/screens/orchard-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** Frames given to a hand-placed apple: 40 px of fall at 2 px/frame, plus the bump it may start. */
const DROP_FRAMES = 30;

/**
 * Put one apple straight above seat 0's catch box and let it fall. Returns the state around the catch: everything
 * else is switched off first (every other apple parked, the spawner pushed out of reach) so the beat is the only
 * thing that can move the count.
 */
async function dropOnSeat0(page, kind) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.nextSpawn = 100000;
    for (const a of sc.apples) a.active = false;
    // hold the target out of reach for the beat, or the +1 could end the round before the wormy half runs.
    // run.gather() clamps to the order's own line, so the bank assert still reads the real target.
    sc.target = Math.max(sc.target, sc.total + 3); sc.setTotal(sc.total);
    const a = sc.apples[0];
    const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
    a.active = true; a.kind = k; a.t = 0; a.vy = 2; a.x0 = bx; a.x = bx; a.y = by - 40;
    return { count: s.count, total: sc.total, target: sc.target };
  }, kind);
}

/** Seat 0 as the sim holds it (the summary only carries slot/x/count). */
function seat0(page) {
  return page.evaluate(() => {
    const s = window.__game.game.screen.seats[0];
    return { count: s.count, bumpT: s.bumpT, anim: s.anim, total: window.__game.game.screen.total };
  });
}

export const SCENARIOS = {
  async orchard(server) {
    await withPage(server, 'skipTo=orchard&critters=0,1,2,3', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'orchard', `the orchard is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // 600 frames of seat 0 running: left for 150, right for 300, left for 150. `last` only ever holds an ORCHARD
      // summary - once the round hands off, api.summary() is the map's and asserting on it reads the wrong screen.
      let ended = false, last = s0;
      const legs = [[{ left: true }, 150], [{ right: true }, 300], [{ left: true }, 150]];
      for (const [keys, n] of legs) {
        await api.hold(0, keys);
        for (let k = 0; k < n && !ended; k += 50) {
          await api.step(50);
          const s = await api.summary();
          if (s.screen !== 'orchard') ended = true; else last = s;
        }
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

      // the rule itself: a ripe apple into seat 0's rim is +1, a wormy one is -1 and a locked seat. Without this a
      // dead catch box would still pass every assert above.
      if (!ended) {
        const before = await dropOnSeat0(page, 0);
        await api.step(DROP_FRAMES);
        const hit = await seat0(page);
        assert(hit.count === before.count + 1, `a ripe apple on the rim is caught (seat 0 ${before.count} -> ${hit.count})`);
        assert(hit.total === before.total + 1, `the party's total went up with it (${before.total} -> ${hit.total})`);
        const worm = await dropOnSeat0(page, 1);
        await api.step(DROP_FRAMES);
        const bump = await seat0(page);
        assert(bump.count === worm.count - 1, `a wormy apple costs one (seat 0 ${worm.count} -> ${bump.count})`);
        assert(bump.bumpT > 0 && bump.anim === 'bump', `and locks the seat in its bump (bumpT ${bump.bumpT}, anim '${bump.anim}')`);
        last = await api.summary();
        if (last.screen !== 'orchard') ended = true;
      }

      // force the clock to its end (or watch the early ending) and expect the sign, then the map
      if (!ended) {
        await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
        await api.step(4 + SLAM + 20);
        const s2 = await api.summary();
        assert(s2.screen === 'orchard' && s2.top.phase === 1 && /^APPLES: \d+$/.test(s2.top.sign), `the clock ran out: the APPLES sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
        await api.shot('orchard-sign');
        last = s2;
        await api.step(HOLD);
      }
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the orchard hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (the catch beat lifts the screen's so it cannot end early)
      const caught = last.top.caught, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('apple:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(caught, target), `run.gather('apple') banked the party's total (${line}, caught ${caught})`);
    });
  },
};
