// Playtest scenarios for the market-garden work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   garden - four seats in the Saturday Market's kitchen garden on the CARROT SOUP order, so the target is the
//            order's own carrot line and not the fallback. Then, in order:
//              REAL INPUT   seat 0 is walked along the row with the stick (it moved, it stayed inside the row, and
//                           the three seats with no input stayed exactly where they were), walked onto the nearest
//                           top, `action`-ed into a grip (the gauge opened at zero), and then `action`-ed
//                           PULL_PRESSES more times - the party's total went up on the last one and not before. A
//                           dead reach, a dead gauge or a dead pull fails one of those.
//              LETTING GO   a grip nobody presses on for GRIP_TIMEOUT frames is let go of: no carrot, nothing lost,
//                           the top standing where it was.
//              THE HAND-OFF the clock is forced to its last frames: the CARROTS sign drops, is held, and the screen
//                           hands back to the map with the order's carrot line updated by the party's total.
//            Shots: tools/screens/garden-grip.png (a seat with hold of a top and an empty gauge over its head),
//            garden-pull.png (the root out of the ground and in the air, the hole behind it) and garden-gauges.png
//            (all four seats gripping at once at four different fills - the shot the "four gauges are not a wall"
//            claim is judged from), plus garden-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?order=6 is ORDERS[5], CARROT SOUP: carrot 4 + milk 2, so `carrot` is a real line on the ticket. */
const BOOT = 'skipTo=garden&critters=0,1,2,3&order=6';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const PULL_PRESSES = 6, PULL_FRAMES = 14, GRIP_TIMEOUT = 150, GAUGE_UNITS = 120;
/** The frame of the pull the shot is taken on: the root is mid-arc and the hole is still open behind it. */
const PULL_SHOT = 5;

/** Seat 0 as the sim holds it (summary() carries the rest). */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { count: s.count, state: s.state, t: s.t, anim: s.anim, top: s.top, pull: s.pull, total: sc.total, pulls: sc.pulls,
      tops: sc.tops.map((t) => [t.x, t.active ? 1 : 0, t.held]) };
  });
}

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total); });
}

/** The nearest standing top to x, as [x, held], or null. */
function nearestTop(tops, x) {
  let best = null, bd = 1e9;
  for (const t of tops) { const d = Math.abs(t[0] - x); if (d < bd) { bd = d; best = t; } }
  return best;
}

export const SCENARIOS = {
  async garden(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'garden', `the market garden is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4, `four seats work the row (${s0.top.seats.length})`);
      const carrotLine = (s0.run.needs || []).find((n) => n.startsWith('carrot:')) || '';
      assert(carrotLine === `carrot:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own carrot line (${carrotLine}, target ${s0.top.target})`);
      assert(s0.top.tops.length >= 5, `the bed is already planted when the truck pulls up (${s0.top.tops.length} tops)`);
      const orderTarget = s0.top.target;
      const x0 = s0.top.seats[0].x, others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s.x));

      // --- REAL INPUT: the stick moves seat 0 along the row and nobody else
      await holdTarget(page);
      await api.hold(0, { right: true });
      await api.step(40);
      await api.release(0);
      await api.step(2);
      let last = await api.summary();
      assert(last.top.seats[0].x > x0 && last.top.seats[0].x <= 614, `seat 0 walked the row on its own stick (${x0} -> ${last.top.seats[0].x})`);
      assert(JSON.stringify(last.top.seats.slice(1).map((s) => s.x)) === others0, 'the other seats, with no input, stayed put');

      // --- REAL INPUT: walk onto the nearest top, grip it, and tap it out
      let top = nearestTop(last.top.tops, last.top.seats[0].x);
      assert(!!top, 'a top is standing in the row to walk to');
      for (let i = 0; i < 160 && top; i++) {
        const dx = top[0] - last.top.seats[0].x;
        if (Math.abs(dx) <= 6) break;
        await api.hold(0, dx > 0 ? { right: true } : { left: true });
        await api.step(2);
        last = await api.summary();
      }
      await api.release(0);
      await api.step(2);
      const before = (await api.summary()).top;
      // two released frames after the grip press, so the first tap is a fresh edge and not the same press held
      await api.press(0, { action: true }, 1, 2);
      let g = await api.summary();
      const gs = g.top.seats[0];
      assert(gs.state === 'grip' && gs.pull === 0 && gs.top >= 0,
        `action within reach takes hold and opens an empty gauge (state '${gs.state}', pull ${gs.pull}, top ${gs.top})`);
      await api.shot('garden-grip');
      for (let i = 0; i < PULL_PRESSES - 1; i++) await api.press(0, { action: true }, 1, 3);
      g = await api.summary();
      assert(g.top.seats[0].state === 'grip' && g.top.seats[0].pull === (PULL_PRESSES - 1) * GAUGE_UNITS / PULL_PRESSES && g.top.seats[0].count === before.seats[0].count,
        `${PULL_PRESSES - 1} taps fill the gauge to one step short (state '${g.top.seats[0].state}', pull ${g.top.seats[0].pull}, count ${g.top.seats[0].count})`);
      await api.press(0, { action: true }, 1, 0);
      g = await api.summary();
      assert(g.top.seats[0].count === before.seats[0].count + 1, `the ${PULL_PRESSES}th tap brings the root out (seat 0 ${before.seats[0].count} -> ${g.top.seats[0].count})`);
      assert(g.top.total === before.total + 1, `the party's total went up with it (${before.total} -> ${g.top.total})`);
      const beat = await seat0(page);
      assert(beat.state === 2 && beat.t === PULL_FRAMES && beat.anim === 'pullOut', `and the seat is in its pull beat (state ${beat.state}, t ${beat.t}, anim '${beat.anim}')`);
      assert(g.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, pulled nothing');
      await api.step(PULL_SHOT);
      await api.shot('garden-pull');
      await api.step(PULL_FRAMES);

      // --- LETTING GO: a grip nobody presses on is let go of, at no cost, with the top still standing
      const parked = await page.evaluate(() => {
        const sc = window.__game.game.screen, s = sc.seats[0];
        sc.nextSpawn = 100000;
        for (const t of sc.tops) { t.active = false; t.held = 0; }
        s.state = 0; s.t = 0; s.top = -1; s.pull = 0; s.facing = 1; s.moving = false;
        const t = sc.tops[0];
        t.active = true; t.held = 0; t.x = Math.round(s.x) + 10;
        sc.tryGrip(s);
        return { count: s.count, state: s.state, top: s.top };
      });
      assert(parked.state === 1 && parked.top === 0, `tryGrip took hold of the hand-placed top (state ${parked.state}, top ${parked.top})`);
      await api.step(GRIP_TIMEOUT + 2);
      const letGo = await seat0(page);
      assert(letGo.state === 0 && letGo.top === -1 && letGo.count === parked.count, `${GRIP_TIMEOUT} frames without a press lets go (state ${letGo.state}, top ${letGo.top}, count ${letGo.count})`);
      assert(letGo.tops[0][1] === 1 && letGo.tops[0][2] === 0, 'and the top is still standing, free for anyone');

      // --- four gauges at once: the shot the HUD claim is judged from
      await page.evaluate(() => {
        const sc = window.__game.game.screen;
        for (const t of sc.tops) { t.active = false; t.held = 0; }
        sc.nextSpawn = 100000;
        for (let i = 0; i < sc.seats.length; i++) {
          const s = sc.seats[i], t = sc.tops[i];
          s.state = 0; s.t = 0; s.top = -1; s.pull = 0; s.facing = 1; s.moving = false; s.count = i;
          t.active = true; t.held = 0; t.x = Math.round(s.x) + 10;
          sc.tryGrip(s);
          s.pull = i * 30;                // four gauges at four different fills, which is the whole point
        }
        // and one more top standing clear of the crew
        sc.tops[4].active = true; sc.tops[4].x = 60; sc.tops[4].held = 0;
      });
      await api.step(2);
      const four = await api.summary();
      assert(four.top.seats.every((s) => s.state === 'grip'), 'all four seats can have hold of a top at the same time');
      await api.shot('garden-gauges');

      // --- the hand-off: force the clock to its last frames, watch the sign, then the map
      await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'garden' && s2.top.phase === 1 && /^CARROTS: \d+$/.test(s2.top.sign), `the clock ran out: the CARROTS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('garden-sign');
      const banked2 = s2.top.total;
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the garden hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (the tests lift the screen's so it cannot end early)
      const line = (s3.run.needs || []).find((n) => n.startsWith('carrot:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(banked2, orderTarget), `run.gather('carrot') banked the party's total (${line}, total ${banked2})`);
    });
  },
};
