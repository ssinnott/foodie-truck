// Playtest scenarios for Tangle Wood (registered in tools/scenarios/index.js).
//
//   wood - two seats in the wood on the MUSHROOM SOUP order (?recipes=55): bumps are showing when the truck arrives
//          and more lift on the spawn timer; seat 0 is stood at a showing bump and brushes it - +1, the bump gone;
//          a press at bare litter is nothing. Then the toadstool: a bump made one, brushed: no +1, the pooh beat
//          (reachT 20), the bump gone. Writes wood-brush and wood-pooh.
import { withPage, assert } from '../playtest.js';

const LIFT_FRAMES = 20, BRUSH_FRAMES = 12, POOH_FRAMES = 20;
const seat0 = (s) => s.top.seats[0];

export const SCENARIOS = {
  async wood(server) {
    await withPage(server, 'skipTo=wood&critters=0,1&recipes=55', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'wood' && s0.top.ing === 'mushroom' && s0.top.target > 0, `the wood is up as a mushroom visit (${s0.screen}, ${s0.top.ing}, target ${s0.top.target})`);
      assert(s0.top.bumps.length >= 3, `bumps are showing when the truck arrives (${s0.top.bumps.length})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.nextSpawn = 100000; });
      // a bump that is up and no toadstool: stand at it and brush
      const b = await page.evaluate(() => { const sc = window.__game.game.screen; const b = sc.bumps.find((b) => b.active); b.toadstool = 0; b.lift = 20; sc.seats[0].x = b.x + 4; return b.x; });
      await api.step(1);
      const before = await api.summary();
      await api.press(0, { action: true }, 1, 0);
      await api.step(3);
      const got = await api.summary();
      assert(seat0(got).count === seat0(before).count + 1 && got.top.total === before.top.total + 1, `brushing a showing bump is +1 (count ${seat0(got).count})`);
      assert(!got.top.bumps.some((x) => x[0] === b), `and the bump is gone from the litter`);
      assert(seat0(got).reachT > 0 && seat0(got).reachT <= BRUSH_FRAMES && seat0(got).anim === 'brush', `the crouch plays (reachT ${seat0(got).reachT}, anim '${seat0(got).anim}')`);
      await api.shot('wood-brush');
      await api.step(BRUSH_FRAMES);
      // bare litter: nothing
      await page.evaluate(() => { const sc = window.__game.game.screen; for (const b of sc.bumps) b.active = false; });
      await api.press(0, { action: true }, 1, 2);
      const nothing = await api.summary();
      assert(nothing.top.total === got.top.total && seat0(nothing).reachT === 0, `a press at bare litter does nothing (total ${nothing.top.total})`);
      // a bump lifts on the timer and shows after LIFT_FRAMES
      await page.evaluate(() => { window.__game.game.screen.nextSpawn = 1; });
      await api.step(2);
      const lifting = await api.summary();
      assert(lifting.top.bumps.length === 1 && lifting.top.bumps[0][1] < LIFT_FRAMES, `a new bump is lifting (${JSON.stringify(lifting.top.bumps)})`);
      await api.step(LIFT_FRAMES);
      const up = await api.summary();
      assert(up.top.bumps.length === 1 && up.top.bumps[0][1] === LIFT_FRAMES, `and shows after ${LIFT_FRAMES} frames`);
    });
  },
  async woodToadstool(server) {
    await withPage(server, 'skipTo=wood&critters=0,1&recipes=55', async (api, page) => {
      await api.step(2);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.nextSpawn = 100000; for (const b of sc.bumps) b.active = false; const b = sc.bumps[0]; b.active = true; b.x = 300; b.lift = 20; b.show = 0; b.toadstool = 1; sc.seats[0].x = 296; });
      await api.step(1);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const p = await api.summary();
      assert(p.top.poohs === 1 && seat0(p).count === 0 && p.top.total === 0, `brushing the toadstool is the pooh and no +1 (poohs ${p.top.poohs}, count ${seat0(p).count})`);
      assert(seat0(p).reachT === POOH_FRAMES - 2 && seat0(p).anim === 'pooh', `the step back plays for ${POOH_FRAMES} frames (reachT ${seat0(p).reachT}, anim '${seat0(p).anim}')`);
      assert(p.top.bumps.length === 0, 'and the toadstool has sunk back');
      await api.step(6);
      await api.shot('wood-pooh');
    });
  },
};
