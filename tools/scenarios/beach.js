// Playtest scenarios for Cockle Cove's beach (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   beach - four seats on the sand on the CRAB CAKES order, so the target is the order's own crab line and not the
//           fallback. Then, in order:
//             THE STRAND   the truck arrives to crabs already on the sand (QUARRY.crab.seed of them, coming up out
//                          of their burrows), and a crab RUNS: its x changes on its own.
//             THE DART     seat 0 is walked at the nearest crab with the stick; the crab darts AWAY from it (its
//                          direction is away from the seat and it is in its dart) and then stops, tired, with its
//                          claws up.
//             THE GRAB     `action` with the tired crab under the critter takes it: the crab is gone from the
//                          strand, the seat's count and the party's total are up by one, the pounce beat plays.
//             NOTHING      `action` on empty sand does nothing at all.
//             THE HAND-OFF the finish line is brought down to the party's total: the CRABS sign drops, is held, and the screen
//                          hands back to the map with the order's crab line updated.
//           Shots: tools/screens/beach-dart.png (the crab darting), beach-grab.png (mid-pounce) and beach-sign.png.
//   beachSalt - two seats on the SALT PRETZELS order: the visit is for salt, the pans fill and crust on their
//           timer, a pan still crusting cannot be scraped, a crusted one can.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?recipes=10 fixes the menu to ORDERS[10], CRAB CAKES: crab 3 + egg 1, so `crab` is a real line on the ticket. */
const BOOT = 'skipTo=beach&critters=0,1,2,3&recipes=10';
/** ?recipes=12 is ORDERS[12], SALT PRETZELS: flour 3 + salt 1 + butter 1. */
const BOOT_SALT = 'skipTo=beach&critters=0,1&recipes=12';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const POUNCE_FRAMES = 12, DART_R = 46, DART_FRAMES = 14, TIRED_FRAMES = 36, CRUST = 90, PAN_X = [96, 258, 396, 552];

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  // ...and hold the tide: the wave locks every seat for 40 frames, and the beats under test count frames
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.waveIn = 100000; });
}
/** The jokes (screens/beach.ts). */
const PINCH_FRAMES = 40, WAVE_FRAMES = 40;
/** The strand's things as the sim holds them. */
function things(page) {
  return page.evaluate(() => window.__game.game.screen.things.map((t) => ({ active: t.active, x: t.x, dir: t.dir, state: t.state, t: t.t, dartT: t.dartT, cool: t.cool })));
}
const nearest = (ts, x) => { let b = -1, bd = 1e9; for (let i = 0; i < ts.length; i++) { if (!ts[i].active) continue; const d = Math.abs(ts[i].x - x); if (d < bd) { bd = d; b = i; } } return b; };

export const SCENARIOS = {
  /**
   * beachPinch - the pinch: a crab still running is grabbed. It grabs back: no +1, the crab is 'held' on the paw,
   *              the seat runs its circle for 40 frames (pinches 1), then the crab drops to the sand beside the
   *              seat, stopped and tired, and the next grab takes it. Writes beach-pinch.
   */
  async beachPinch(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      const c = await page.evaluate(() => {
        const sc = window.__game.game.screen, i = sc.things.findIndex((t) => t.active), t = sc.things[i];
        sc.nextSpawn = 100000;
        for (const o of sc.things) if (o !== t) o.active = false;
        t.state = 1; t.t = 300; t.dartT = 0; t.cool = 500; t.dir = 1; t.x = 300;
        sc.seats[0].x = 306; sc.seats[1].x = 560;
        return i;
      });
      await api.press(0, { action: true }, 1, 0);
      await api.step(1);
      const p = await api.summary();
      assert(p.top.pinches === 1 && p.top.seats[0].count === 0 && p.top.total === 0, `a running crab grabs back (pinches ${p.top.pinches}, count ${p.top.seats[0].count})`);
      assert(p.top.seats[0].pinchT === PINCH_FRAMES - 1 && p.top.seats[0].anim === 'run', `the seat runs its circle (pinchT ${p.top.seats[0].pinchT}, anim '${p.top.seats[0].anim}')`);
      let ts = await things(page);
      assert(ts[c].active && ts[c].state === 4, `the crab is on the paw (state ${ts[c].state})`);
      await api.step(10);
      await api.shot('beach-pinch');
      await api.step(PINCH_FRAMES - 11);
      ts = await things(page);
      const s = (await api.summary()).top.seats[0];
      assert(s.pinchT === 0 && ts[c].active && ts[c].state === 2 && ts[c].cool > 0 && Math.abs(ts[c].x - s.x) <= 24, `the crab drops beside the seat, tired (state ${ts[c].state}, cool ${ts[c].cool}, x ${ts[c].x} vs seat ${s.x})`);
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x; }, ts[c].x);
      await api.press(0, { action: true }, 1, 0);
      const got = await api.summary();
      assert(got.top.seats[0].count === 1, `and the next grab takes it (count ${got.top.seats[0].count})`);
    });
  },
  /**
   * beachWave - the seventh wave: the tide is brought in. Everyone hops and drips for 40 frames with the stick
   *             locked (waves 1, waveT 40, wetT 40 on every seat), nothing is lost, and it goes out again.
   *             Writes beach-wave.
   */
  async beachWave(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      await page.evaluate(() => { window.__game.game.screen.waveIn = 1; });
      await api.step(1);
      const w = await api.summary();
      assert(w.top.waves === 1 && w.top.waveT === WAVE_FRAMES && w.top.seats.every((s) => s.wetT === WAVE_FRAMES && s.anim === 'hop'), `the wave rolls up and everyone hops (waves ${w.top.waves}, waveT ${w.top.waveT}, wetT ${w.top.seats.map((s) => s.wetT).join()})`);
      const x0 = w.top.seats[0].x;
      await api.hold(0, { right: true }); await api.step(12); await api.release(0);
      await api.shot('beach-wave');
      const mid = await api.summary();
      assert(mid.top.seats[0].x === x0, `the stick does nothing while the seat drips (x ${x0} -> ${mid.top.seats[0].x})`);
      await api.step(WAVE_FRAMES);
      const out = await api.summary();
      assert(out.top.waveT === 0 && out.top.seats.every((s) => s.wetT === 0) && out.top.total === 0, `the wave has gone out and nothing was lost (waveT ${out.top.waveT}, total ${out.top.total})`);
    });
  },
  async beach(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'beach', `the beach is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.ing === 'crab', `four seats on the sand, and the visit is for crabs (${s0.top.seats.length}, ${s0.top.ing})`);
      const line = (s0.run.needs || []).find((n) => n.startsWith('crab:')) || '';
      assert(line === `crab:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own crab line (${line}, target ${s0.top.target})`);
      assert(s0.top.things.length === 3, `three crabs are coming up when the truck pulls up (${s0.top.things.length})`);
      await holdTarget(page);

      // --- a crab runs on its own: the strand is alive without anybody touching it
      // nobody stands near it: the crew is parked at the far end so no dart is provoked
      await page.evaluate(() => { const sc = window.__game.game.screen; for (const s of sc.seats) s.x = 600; sc.nextSpawn = 100000; for (const t of sc.things) if (t.active) { t.x = Math.min(t.x, 300); } });
      await api.step(14);
      let ts = await things(page);
      const c = nearest(ts, 0);
      assert(c >= 0 && ts[c].state === 1, `the crab is up and running after its burrow opens (state ${ts[c].state})`);
      const x1 = ts[c].x;
      await api.step(10);
      ts = await things(page);
      assert(ts[c].x !== x1, `and it moves on its own (${x1} -> ${ts[c].x})`);

      // --- THE DART: walk seat 0 at the crab; it turns away and darts, then tires with its claws up
      await page.evaluate(([i, r]) => { const sc = window.__game.game.screen, t = sc.things[i]; sc.seats[0].x = t.x + r + 30; t.state = 2; t.t = 500; t.cool = 0; t.dartT = 0; t.dir = 1; }, [c, DART_R]);
      let darted = false, dartDir = 0, dartX = 0;
      for (let i = 0; i < 60 && !darted; i++) {
        await api.hold(0, { left: true });
        await api.step(1);
        ts = await things(page);
        if (ts[c].dartT > 0) { darted = true; dartDir = ts[c].dir; dartX = ts[c].x; }
      }
      await api.release(0);
      assert(darted && dartDir === -1, `a crab that sees a critter coming darts AWAY from it (darted ${darted}, dir ${dartDir})`);
      await api.step(3);
      await api.shot('beach-dart');
      await api.step(DART_FRAMES);
      ts = await things(page);
      assert(ts[c].state === 2 && ts[c].dartT === 0 && ts[c].x < dartX, `and stops, tired, further off (state ${ts[c].state}, ${dartX} -> ${ts[c].x})`);
      assert(ts[c].cool > 0, `it will not dart again for a while (cool ${ts[c].cool})`);

      // --- THE GRAB: walk up to the tired crab and take it
      const before = await api.summary();
      const cx = ts[c].x;
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x + 6; }, cx);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const grabbed = await api.summary();
      assert(grabbed.top.seats[0].count === before.top.seats[0].count + 1, `action with the crab under the critter grabs it (seat 0 ${before.top.seats[0].count} -> ${grabbed.top.seats[0].count})`);
      assert(grabbed.top.total === before.top.total + 1, `the party's total went up with it (${before.top.total} -> ${grabbed.top.total})`);
      ts = await things(page);
      assert(!ts[c].active, 'and the crab is off the strand');
      assert(grabbed.top.seats[0].pounceT > 0 && grabbed.top.seats[0].pounceT <= POUNCE_FRAMES && grabbed.top.seats[0].anim === 'pounce', `the seat is in its pounce (pounceT ${grabbed.top.seats[0].pounceT}, anim '${grabbed.top.seats[0].anim}')`);
      await api.shot('beach-grab');
      assert(grabbed.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, grabbed nothing');
      await api.step(POUNCE_FRAMES);

      // --- NOTHING: a grab at empty sand does nothing
      const bare = await page.evaluate(() => { const sc = window.__game.game.screen; for (const t of sc.things) t.active = false; sc.seats[0].pounceT = 0; return sc.total; });
      await api.press(0, { action: true }, 1, 2);
      const nothing = await api.summary();
      assert(nothing.top.total === bare && nothing.top.seats[0].pounceT === 0, `action on empty sand does nothing (total ${nothing.top.total}, pounceT ${nothing.top.seats[0].pounceT})`);

      // --- the hand-off: bring the finish line down to the party's total (there is no clock to force), watch the
      // sign, then the map
      const lastTotal = (await api.summary()).top.total;
      assert(lastTotal >= 1, `something was grabbed before the ending (total ${lastTotal})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'beach' && s2.top.phase === 1 && /^CRABS: \d+$/.test(s2.top.sign), `the target was reached: the CRABS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('beach-sign');
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the beach hands back to the map (on ${s3.screen})`);
      const line3 = (s3.run.needs || []).find((n) => n.startsWith('crab:')) || '';
      const have = parseInt(line3.split(':')[1], 10);
      assert(line3 && have === Math.min(lastTotal, s0.top.target), `run.gather('crab') banked the party's total (${line3}, total ${lastTotal})`);
    });
  },

  async beachSalt(server) {
    await withPage(server, BOOT_SALT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'beach' && s0.top.ing === 'salt', `the beach is up for salt (on ${s0.screen}, ${s0.top.ing})`);
      assert(s0.top.things.length === 2 && s0.top.things.every((t) => t[2] === 'run'), `two pans are filling when the truck pulls up (${JSON.stringify(s0.top.things)})`);
      await holdTarget(page);
      await page.evaluate(() => { window.__game.game.screen.nextSpawn = 100000; });
      // a pan still crusting cannot be scraped
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x; }, PAN_X[0]);
      await api.press(0, { action: true }, 1, 2);
      let s = await api.summary();
      assert(s.top.total === 0 && s.top.seats[0].pounceT === 0, `a pan still crusting cannot be scraped (total ${s.top.total})`);
      // once the crust is white, it can
      await api.step(CRUST + 2);
      s = await api.summary();
      assert(s.top.things[0][2] === 'stop', `the pan has crusted after ${CRUST} frames (${s.top.things[0][2]})`);
      await api.press(0, { action: true }, 1, 2);
      s = await api.summary();
      assert(s.top.total === 1 && s.top.seats[0].count === 1, `and a crusted pan is scraped for +1 (total ${s.top.total})`);
      assert(s.top.things.length === 1, `the scraped pan is empty again (${s.top.things.length} pan left)`);
    });
  },
};
