// Playtest scenarios for the coop work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   coop - four seats in the coop: seat 0 is driven to the nearest egg (polling summary() for its reach point and
//          holding the stick toward it), presses action and has one egg in its basket; then seat 0 is walked into
//          the nearest hen so a bump is caught on camera (tools/screens/coop-bump.png, when one lands); then the
//          clock is forced to its last frames: the EGGS sign drops, is held, and the screen returns to the map with
//          the order's egg line updated by the party's total. Also writes tools/screens/coop-pluck.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The stick to hold toward (dx, dy): only axes still more than a step away. */
function toward(dx, dy) {
  const k = {};
  if (dx > 2) k.right = true; else if (dx < -2) k.left = true;
  if (dy > 1) k.down = true; else if (dy < -1) k.up = true;
  return k;
}
/** Nearest [x, y, ...] of `list` to (x, y) by manhattan distance, or null. */
function nearest(list, x, y) {
  let best = null, bd = 1e9;
  for (const p of list) { const d = Math.abs(p[0] - x) + Math.abs(p[1] - y); if (d < bd) { bd = d; best = p; } }
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
      const others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => [s[1], s[2]]));

      // wait for an egg, then drive seat 0 onto its reach point and pluck it; a hen may bump us on the way, so the
      // drive re-aims every four frames and gives up after a generous budget rather than asserting the path
      let plucked = false, bumpShot = false, last = s0;
      for (let attempt = 0; attempt < 4 && !plucked; attempt++) {
        let egg = null;
        for (let i = 0; i < 60 && !egg; i++) { await api.step(4); last = await api.summary(); egg = nearest(last.top.eggs, last.top.seats[0][1], last.top.seats[0][2]); }
        if (!egg) break;
        for (let i = 0; i < 150; i++) {
          const me = last.top.seats[0], dx = egg[0] - me[1], dy = egg[1] - me[2];
          if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) break;
          await api.hold(0, toward(dx, dy));
          await api.step(4);
          last = await api.summary();
          if (!last.top.eggs.some((e) => e[0] === egg[0] && e[1] === egg[1])) break;   // the egg went (a bump does not remove eggs, but be safe)
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
      // the other seats never move on their own, but a wandering hen may shove one 8 px: only their baskets are held to
      assert(p.top.seats.slice(1).every((s) => s[3] === 0), 'the other seats, with no input, plucked nothing');
      assert(p.top.bumps > 0 || JSON.stringify(p.top.seats.slice(1).map((s) => [s[1], s[2]])) === others0, 'with no bump yet, the other seats stayed put');

      // hunt a hen so seat 0's bump beat lands on camera: the egg pops out of the basket and cracks
      let b = p;
      for (let i = 0; i < 250 && !bumpShot && b.screen === 'coop' && b.top.phase === 0; i++) {
        const me = b.top.seats[0], hen = nearest(b.top.hens, me[1], me[2]);
        await api.hold(0, toward(hen[0] - me[1], hen[1] - me[2]));
        await api.step(3);
        const s = await api.summary();
        if (s.screen === 'coop' && s.top.seats[0][3] < b.top.seats[0][3]) { bumpShot = true; await api.release(0); await api.step(3); await api.shot('coop-bump'); }
        b = s;
      }
      await api.release(0);
      assert(bumpShot, `seat 0 walked into a hen and lost its egg to the bump (${b.top.bumps} bumps so far)`);

      // force the clock to its end (or watch the early ending) and expect the sign, then the map
      let s2 = await api.summary();
      if (s2.screen === 'coop' && s2.top.phase === 0) {
        await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
        await api.step(4 + SLAM + 20);
        s2 = await api.summary();
        assert(s2.screen === 'coop' && s2.top.phase === 1 && /^EGGS: \d+$/.test(s2.top.sign), `the clock ran out: the EGGS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
        await api.shot('coop-sign');
        await api.step(HOLD);
      } else if (s2.screen === 'coop') await api.step(SLAM + HOLD);
      const lastCoop = s2.screen === 'coop' ? s2 : b;
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the coop hands back to the map (on ${s3.screen})`);
      const count = lastCoop.top.count, target = lastCoop.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('egg:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(count, target), `run.gather('egg') banked the party's total (${line}, count ${count})`);
    });
  },
};
