// Playtest scenarios for the market-garden work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   garden - four seats in the Saturday Market's kitchen garden on the CARROT SOUP order, so the target is the
//            order's own carrot line and not the fallback. Then, in order:
//              REAL INPUT   seat 0 is walked along the row with the stick (it moved, it stayed inside the row, and
//                           the three seats with no input stayed exactly where they were), walked onto the nearest
//                           RIPE top, `action`-ed into a grip (the gauge opened with a needle and a band), and then
//                           `action`-ed again on the frame its needle was inside the band - the party's total went
//                           up. A dead reach, a dead gauge or a dead pull fails one of those.
//              THE ONE RULE, driven by hand through window.__game.game.screen, all three halves of it:
//                           in the band on a carrot     -> +1 and the seat is in its pull beat;
//                           OUTSIDE the band            -> nothing scored, the top snapped off and that root is
//                                                          counting down REGROW_FRAMES to a new one;
//                           in the band on a THISTLE    -> one banked carrot gone and the seat in the full bump.
//              THE HAND-OFF the clock is forced to its last frames: the CARROTS sign drops, is held, and the screen
//                           hands back to the map with the order's carrot line updated by the party's total.
//            Shots: tools/screens/garden-pull.png (the root out of the ground and in the air, the hole behind it)
//            and garden-gauges.png (all four seats gripping at once - the shot the "four gauges are not a wall"
//            claim is judged from), plus garden-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?order=6 is ORDERS[5], CARROT SOUP: carrot 4 + milk 2, so `carrot` is a real line on the ticket. */
const BOOT = 'skipTo=garden&critters=0,1,2,3&order=6';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const GRIP_DX = 10, PULL_FRAMES = 14, BUMP_FRAMES = 21, SWEEP_STEP = 3, GAUGE_UNITS = 120;
/** The frame of the pull the shot is taken on: the root is mid-arc and the hole is still open behind it. */
const PULL_SHOT = 5;

/** Seat 0 as the sim holds it (summary() carries the rest). */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    // `sweep`, not `needle`: the needle is derived (summary() runs needleAt over this counter), and a seat carries
    // only the counter - a `needle` key read off the seat here would be undefined on every frame
    return { count: s.count, state: s.state, t: s.t, anim: s.anim, top: s.top, sweep: s.sweep,
      total: sc.total, pulls: sc.pulls, snaps: sc.snaps, weeds: sc.weeds,
      tops: sc.tops.map((t) => [t.x, t.active ? t.kind : -1, t.regrow]) };
  });
}

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total); });
}

/**
 * Set up ONE pull by hand: clear the bed, stand a single top of `kind` exactly on seat 0's grip point, take hold of
 * it through the screen's own tryGrip (so the test drives the real code, not a copy of it), and then park the needle
 * either at the band's centre or a full half-bar away from it. Returns what the seat had before the press.
 */
function armPull(page, kind, inBand) {
  return page.evaluate(([k, want, dx, step, units]) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.nextSpawn = 100000;
    for (const t of sc.tops) { t.active = false; t.regrow = 0; t.held = 0; }
    s.state = 0; s.t = 0; s.top = -1; s.facing = 1; s.moving = false;
    const t = sc.tops[0];
    t.active = true; t.kind = k; t.regrow = 0; t.held = 0; t.x = Math.round(s.x) + dx;
    sc.tryGrip(s);
    // the needle only ever stands on a multiple of SWEEP_STEP; on the OUTWARD half of the sweep its position is
    // sweep * SWEEP_STEP, so parking it is one assignment. The band's centre is the hit, half a bar away is the miss.
    const mid = Math.round((s.bandLo + s.bandHi) / 2 / step) * step;
    const at = want ? mid : (mid >= units / 2 ? mid - units / 2 : mid + units / 2);
    s.sweep = at / step;
    return { count: s.count, total: sc.total, state: s.state, top: s.top, needle: at, lo: s.bandLo, hi: s.bandHi,
      snaps: sc.snaps, weeds: sc.weeds, pulls: sc.pulls };
  }, [kind, inBand, GRIP_DX, SWEEP_STEP, GAUGE_UNITS]);
}

/** The nearest ripe (kind 0) top to x, as [x, kind, regrow], or null. */
function nearestRipe(tops, x) {
  let best = null, bd = 1e9;
  for (const t of tops) { if (t[1] !== 0) continue; const d = Math.abs(t[0] - x); if (d < bd) { bd = d; best = t; } }
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
      assert(s0.top.tops.some((t) => t[1] === 1), 'and at least one of them is a thistle, so the rule can be read from frame one');
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

      // --- REAL INPUT: walk onto the nearest ripe top, grip it, and pull it on the beat
      let ripe = nearestRipe(last.top.tops, last.top.seats[0].x);
      for (let i = 0; i < 40 && !ripe; i++) { await api.step(6); last = await api.summary(); ripe = nearestRipe(last.top.tops, last.top.seats[0].x); }
      assert(!!ripe, 'a ripe top is standing in the row to walk to');
      for (let i = 0; i < 160 && ripe; i++) {
        const dx = ripe[0] - last.top.seats[0].x;
        if (Math.abs(dx) <= 6) break;
        await api.hold(0, dx > 0 ? { right: true } : { left: true });
        await api.step(2);
        last = await api.summary();
      }
      await api.release(0);
      await api.step(2);
      const before = (await api.summary()).top;
      await api.press(0, { action: true }, 1, 0);
      let g = await api.summary();
      const gs = g.top.seats[0];
      assert(gs.state === 'grip' && gs.needle >= 0 && gs.hi > gs.lo,
        `action within reach takes hold and opens the tug gauge (state '${gs.state}', needle ${gs.needle}, band ${gs.lo}..${gs.hi})`);
      await api.shot('garden-grip');
      let pulled = false;
      for (let i = 0; i < 120 && !pulled; i++) {
        const s = g.top.seats[0];
        if (s.state !== 'grip') break;
        if (s.needle >= s.lo && s.needle <= s.hi) {
          await api.press(0, { action: true }, 1, 0);
          g = await api.summary();
          pulled = g.top.seats[0].count > before.seats[0].count;
          break;
        }
        await api.step(1);
        g = await api.summary();
      }
      assert(pulled, `a second action inside the band brings the root out on real input (seat 0 ${before.seats[0].count} -> ${g.top.seats[0].count})`);
      assert(g.top.total === before.total + 1, `the party's total went up with it (${before.total} -> ${g.top.total})`);
      assert(g.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, pulled nothing');
      await api.step(PULL_SHOT);
      await api.shot('garden-pull');

      // --- THE ONE RULE, by hand. (a) the needle in the band on a carrot scores.
      let a = await armPull(page, 0, true);
      assert(a.state === 1 && a.top === 0, `tryGrip took hold of the hand-placed top (state ${a.state}, top ${a.top})`);
      await api.press(0, { action: true }, 1, 0);
      let r = await seat0(page);
      assert(r.count === a.count + 1 && r.total === a.total + 1, `needle in the band: the carrot comes out (+1: ${a.count} -> ${r.count})`);
      assert(r.state === 2 && r.t === PULL_FRAMES && r.anim === 'pullOut', `and the seat is in its pull beat (state ${r.state}, t ${r.t}, anim '${r.anim}')`);
      assert(r.tops[0][1] === -1 && r.tops[0][2] === 0, 'the root is out of the ground, so that slot is free to be replanted elsewhere');
      await api.step(PULL_FRAMES + 2);

      // (b) the needle OUTSIDE the band snaps the top off: nothing scored, nothing lost, a new top on the way.
      const banked = (await seat0(page)).count;
      a = await armPull(page, 0, false);
      await api.press(0, { action: true }, 1, 0);
      r = await seat0(page);
      assert(r.count === a.count && r.total === a.total, `needle outside the band: nothing is scored and nothing is lost (count ${r.count})`);
      assert(r.snaps === a.snaps + 1 && r.state === 3 && r.anim === 'snap', `the top snaps off instead (snaps ${a.snaps} -> ${r.snaps}, anim '${r.anim}')`);
      assert(r.tops[0][1] === -1 && r.tops[0][2] > 0, `and that root is counting down to a new top (regrow ${r.tops[0][2]})`);
      assert(banked === a.count, 'the seat still has everything it had banked before the snap');
      await api.step(PULL_FRAMES + 30);   // long enough for the SNAP! float text to expire before the next shot

      // (c) the needle in the band on a THISTLE: one banked carrot gone, the full bump, the thistle over the shoulder.
      a = await armPull(page, 1, true);
      assert(a.count > 0, `seat 0 has a carrot to lose before the thistle test (${a.count})`);
      await api.press(0, { action: true }, 1, 0);
      r = await seat0(page);
      assert(r.count === a.count - 1 && r.total === a.total - 1, `pulling a thistle costs one banked carrot (${a.count} -> ${r.count})`);
      assert(r.weeds === a.weeds + 1 && r.state === 4 && r.t === BUMP_FRAMES && r.anim === 'bump', `and gives the seat the full bump beat (weeds ${r.weeds}, t ${r.t}, anim '${r.anim}')`);
      await api.step(7);                 // the thistle is over the critter's head and the '-1' is up
      await api.shot('garden-weed');
      await api.step(BUMP_FRAMES);

      // --- four gauges at once: the shot the HUD claim is judged from
      await page.evaluate(() => {
        const sc = window.__game.game.screen;
        for (const t of sc.tops) { t.active = false; t.regrow = 0; t.held = 0; }
        sc.nextSpawn = 100000;
        for (let i = 0; i < sc.seats.length; i++) {
          const s = sc.seats[i], t = sc.tops[i];
          s.state = 0; s.t = 0; s.top = -1; s.facing = 1; s.moving = false; s.count = i;
          t.active = true; t.kind = i === 2 ? 1 : 0; t.regrow = 0; t.held = 0; t.x = Math.round(s.x) + 10;
          sc.tryGrip(s);
          s.sweep = 4 + i * 10;           // four needles in four different places, which is the whole point
        }
        // and two more tops standing clear of the crew so the fern/thistle comparison is in the same frame
        sc.tops[4].active = true; sc.tops[4].kind = 0; sc.tops[4].x = 60; sc.tops[4].held = 0;
        sc.tops[5].active = true; sc.tops[5].kind = 1; sc.tops[5].x = 566; sc.tops[5].held = 0;
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
