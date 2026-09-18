// Playtest scenarios for the orchard work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   orchard - four seats in the orchard: 600 frames with seat 0 running left and right (no errors, a numeric
//             caught count, seat 0 actually moved and stayed inside the lane, the other seats did not), then the
//             mini-game's one rule driven by hand - an apple aimed at seat 0's rim scores, one that misses the rim
//             splats and costs nothing - then the clock is forced to its last frames: the APPLES
//             sign drops, is held, and the screen returns to the map with the order's apple line updated by the
//             party's total. Also writes tools/screens/orchard-catch.png (the catch beat, with two apples left in
//             the canopy so the shot answers "can you see one against the leaves?") and orchard-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** Frames given to a hand-placed apple: 40 px of fall at 2 px/frame, plus the bump it may start. */
const DROP_FRAMES = 30;
/** The frame of that fall the catch shot is taken on: the apple is in the rim, the ring and the +1 are still up. */
const CATCH_SHOT = 22;

/**
 * Put one apple straight above seat 0's catch box and let it fall. Returns the state around the catch: everything
 * else is switched off first (every other apple parked, the spawner pushed out of reach) so the beat is the only
 * thing that can move the count.
 */
async function dropOnSeat0(page, aimed, homeX) {
  return page.evaluate(([hit, hx]) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.nextSpawn = 100000;
    // back to the lane position it was given in enter(): 600 frames of running left leaves seat 0 standing on top
    // of seat 1, and the catch shot wants to show one basket taking one apple, not two critters in a heap
    if (hx) { s.x = hx; s.facing = 1; s.moving = false; }
    for (const a of sc.apples) a.active = false;
    // hold the target out of reach for the beat, or the +1 could end the round before the miss half runs.
    // run.gather() clamps to the order's own line, so the bank assert still reads the real target.
    sc.target = Math.max(sc.target, sc.total + 3); sc.setTotal(sc.total);
    const a = sc.apples[0];
    const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
    // hang 0: this one is already off the branch, so DROP_FRAMES is 40 px of fall and nothing else; a miss is the
    // same apple started a basket's width to the side, so it falls past the rim and onto the grass
    const ax = hit ? bx : bx + 30;
    a.active = true; a.t = 0; a.vy = 2; a.x0 = ax; a.x = ax; a.y = by - 40; a.hang = 0;
    // two more apples held ON their branches for the picture, at the far ends of the lane where no rim can reach
    // them inside the beat (the whole point of the shot is a red apple against #4F6B3A leaves at 1x, hanging
    // on its stalk before it lets go)
    // x 60 / 540 sit inside the end trees' crowns (the canopy's runs at row 66 are 26..118 and 483..576) and a
    // hanging apple is never catch-tested anyway; y 66 is the hang row
    const ends = [60, 540], rows = [66, 74];
    for (let i = 0; i < 2; i++) {
      const d = sc.apples[i + 1];
      d.active = true; d.t = i * 20; d.vy = 1.6; d.x0 = ends[i]; d.x = ends[i]; d.y = rows[i];
      d.hang = 200;
    }
    return { count: s.count, total: sc.total, target: sc.target };
  }, [aimed, homeX]);
}

/** Seat 0 as the sim holds it (the summary only carries slot/x/count). */
function seat0(page) {
  return page.evaluate(() => {
    const s = window.__game.game.screen.seats[0];
    return { count: s.count, anim: s.anim, total: window.__game.game.screen.total, apples: window.__game.game.screen.apples.filter((a) => a.active).length };
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

      // the rule itself: an apple into seat 0's rim is +1, one past the rim splats and costs nothing. Without this a
      // dead catch box would still pass every assert above.
      if (!ended) {
        const before = await dropOnSeat0(page, true, x0);
        await api.step(CATCH_SHOT);
        await api.shot('orchard-catch');
        await api.step(DROP_FRAMES - CATCH_SHOT);
        const hit = await seat0(page);
        assert(hit.count === before.count + 1, `an apple on the rim is caught (seat 0 ${before.count} -> ${hit.count})`);
        assert(hit.total === before.total + 1, `the party's total went up with it (${before.total} -> ${hit.total})`);
        const beside = await dropOnSeat0(page, false, x0);
        await api.step(DROP_FRAMES + 60);   // the miss has 40 px to the rim's row and another ~60 rows to the grass
        const missed = await seat0(page);
        assert(missed.count === beside.count && missed.total === beside.total, `a missed apple costs nothing (seat 0 still ${missed.count})`);
        assert(missed.anim !== 'bump', `and nothing bumps anyone (anim '${missed.anim}')`);
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
