// Playtest scenarios for Hazel Holt (registered in tools/scenarios/index.js).
//
//   holt - two seats in the grove on the HAZELNUT BROWNIES order (?recipes=51), so the visit is for hazelnuts: seat
//          0 is parked at a tree and holds; the tree's bar climbs, letting go early KEEPS it, holding on to
//          SHAKE_HOLD brings the shower - one nut every SHOWER_EVERY frames into the basket, never past the target -
//          and the tree goes bare. Then the squirrel: a shower with it due lands it on the head for SQUIRREL_FRAMES
//          with the stick locked. Writes holt-shake and holt-squirrel.
import { withPage, assert } from '../playtest.js';

const SHAKE_HOLD = 60, SHOWER_EVERY = 5, SQUIRREL_FRAMES = 40, BARE_FRAMES = 150;

function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { x: s.x, count: s.count, tree: s.tree, squirrelT: s.squirrelT, anim: s.anim, total: sc.total, target: sc.target, trees: sc.trees.map((t) => ({ ...t })), squirrels: sc.squirrels };
  });
}
/** Park seat 0 under tree `i` with every tree full and unheld, the target held high, and nothing in the air. */
function park(page, i) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    for (const t of sc.trees) { t.shake = 0; t.held = 0; t.refill = 0; t.shower = 0; }
    s.x = [90, 250, 410, 570][k]; s.tree = -1; s.squirrelT = 0; s.moving = false;
    sc.target = Math.max(sc.target, sc.total + 20); sc.setTotal(sc.total);
  }, i);
}

export const SCENARIOS = {
  async holt(server) {
    await withPage(server, 'skipTo=holt&critters=0,1&recipes=51', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'holt' && s0.top.ing === 'hazelnut' && s0.top.target > 0, `the holt is up as a hazelnut visit (${s0.screen}, ${s0.top.ing}, target ${s0.top.target})`);
      assert(s0.top.trees.length === 4, `four trees in the grove (${s0.top.trees.length})`);
      // the hold: the bar climbs; let go at 30 and it KEEPS its 30
      await park(page, 1);
      await api.hold(0, { action: true }); await api.step(30); await api.release(0); await api.step(2);
      const kept = await seat0(page);
      assert(kept.tree === -1 && kept.trees[1].shake === 30 && kept.trees[1].held === 0 && kept.count === 0, `letting go early keeps the tree's shake (shake ${kept.trees[1].shake}, held ${kept.trees[1].held}, count ${kept.count})`);
      // hold on: the shower comes at SHAKE_HOLD, one nut every SHOWER_EVERY frames
      await api.hold(0, { action: true }); await api.step(SHAKE_HOLD - 30 + 1);
      await api.shot('holt-shake');
      const sh = await seat0(page);
      assert(sh.trees[1].refill > 0 && sh.trees[1].refill <= BARE_FRAMES && sh.trees[1].shower + sh.count >= 5, `the shower starts and the tree goes bare (refill ${sh.trees[1].refill}, shower left ${sh.trees[1].shower}, count ${sh.count})`);
      await api.release(0);
      await api.step(SHOWER_EVERY * 9);
      const done = await seat0(page);
      assert(done.count >= 5 && done.count <= 8 && done.total === done.count && done.trees[1].shower === 0, `five to eight nuts land in the basket (count ${done.count}, total ${done.total})`);
      // never past the target: a shower on a target one away is one nut
      await park(page, 2);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total + 1; sc.setTotal(sc.total); sc.trees[2].shake = 59; });
      await api.hold(0, { action: true }); await api.step(2); await api.release(0); await api.step(SHOWER_EVERY * 9);
      const capped = await seat0(page);
      assert(capped.total === capped.target && capped.trees[2].shower === 0, `a shower never counts past the target (total ${capped.total}, target ${capped.target})`);
    });
  },
  async holtSquirrel(server) {
    await withPage(server, 'skipTo=holt&critters=0,1&recipes=51', async (api, page) => {
      await api.step(2);
      await park(page, 1);
      // the joke is rolled at the shower: run showers until one brings the squirrel, at most twelve tries
      let got = null;
      for (let k = 0; k < 12 && !got; k++) {
        await page.evaluate(() => { const sc = window.__game.game.screen; sc.trees[1].refill = 0; sc.trees[1].shower = 0; sc.trees[1].shake = 59; sc.seats[0].tree = -1; sc.seats[0].squirrelT = 0; });
        await api.hold(0, { action: true }); await api.step(2); await api.release(0);
        const s = await seat0(page);
        if (s.squirrelT > 0) got = s;
        else await api.step(SHOWER_EVERY * 9);
      }
      assert(!!got && got.squirrels === 1 && got.anim === 'squirrelHat', `one shower in six brings the squirrel down onto the head (${got ? got.squirrelT : 'never'})`);
      await api.step(10);
      await api.shot('holt-squirrel');
      const x0 = (await seat0(page)).x;
      await api.hold(0, { right: true }); await api.step(SQUIRREL_FRAMES - 12 - 4); await api.release(0);
      const held = await seat0(page);
      assert(held.x === x0 && held.squirrelT > 0, `the stick is locked while it sits there (x ${x0} -> ${held.x}, squirrelT ${held.squirrelT})`);
      await api.step(6);
      const off = await seat0(page);
      assert(off.squirrelT === 0 && off.count >= 5, `it runs off and the nuts all landed (squirrelT ${off.squirrelT}, count ${off.count})`);
    });
  },
};
