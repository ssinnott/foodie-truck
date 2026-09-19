// Playtest scenarios for Thyme Terrace (registered in tools/scenarios/index.js).
//
//   terrace - two seats on the terrace on the MINT SAUCE order (?recipes=59): six full clumps; seat 0 at a clump
//             snips three times (+1 each, the clump down to stubble), a fourth press is nothing, and the clump grows
//             a stage back after REGROW_STEP frames. Then the hedgehog: put under a clump, the snip there is the
//             eek (no +1, reachT 20, the clump keeps its snips) and it trundles to another clump over 40 frames.
//             Writes terrace-snip and terrace-eek.
import { withPage, assert } from '../playtest.js';

const SNIP_FRAMES = 10, EEK_FRAMES = 20, REGROW_STEP = 50, TRUNDLE_FRAMES = 40;
const seat0 = (s) => s.top.seats[0];
const CLUMP_X = [70, 170, 270, 370, 470, 570];

export const SCENARIOS = {
  async terrace(server) {
    await withPage(server, 'skipTo=terrace&critters=0,1&recipes=59', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'terrace' && s0.top.ing === 'mint' && s0.top.target > 0, `the terrace is up as a mint visit (${s0.screen}, ${s0.top.ing}, target ${s0.top.target})`);
      assert(s0.top.clumps.length === 6 && s0.top.clumps.every((c) => c[1] === 3), `six full clumps (${s0.top.clumps.map((c) => c[1]).join()})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.hog.at = -1; sc.seats[0].x = 274; });
      await api.step(1);
      for (let k = 1; k <= 3; k++) {
        await api.press(0, { action: true }, 1, 0);
        await api.step(2);
        const s = await api.summary();
        assert(seat0(s).count === k && s.top.clumps[2][1] === 3 - k, `snip ${k}: +1 and the clump a stage shorter (count ${seat0(s).count}, snips ${s.top.clumps[2][1]})`);
        if (k === 1) { assert(seat0(s).reachT > 0 && seat0(s).anim === 'snip', `the snip beat plays (reachT ${seat0(s).reachT}, anim '${seat0(s).anim}')`); await api.shot('terrace-snip'); }
        await api.step(SNIP_FRAMES);
      }
      await api.press(0, { action: true }, 1, 2);
      const bare = await api.summary();
      assert(seat0(bare).count === 3 && bare.top.clumps[2][1] === 0, `a press at stubble is nothing (count ${seat0(bare).count})`);
      await api.step(REGROW_STEP + 1);
      const grown = await api.summary();
      assert(grown.top.clumps[2][1] === 1, `a stage grows back after ${REGROW_STEP} frames (snips ${grown.top.clumps[2][1]})`);
    });
  },
  async terraceHedgehog(server) {
    await withPage(server, 'skipTo=terrace&critters=0,1&recipes=59', async (api, page) => {
      await api.step(2);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.hog.at = 3; sc.hog.to = -1; sc.hog.t = 0; sc.seats[0].x = 366; });
      await api.step(1);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const e = await api.summary();
      assert(e.top.eeks === 1 && seat0(e).count === 0 && e.top.clumps[3][1] === 3, `the snip at the hedgehog's clump is the eek and no sprig (eeks ${e.top.eeks}, count ${seat0(e).count}, snips ${e.top.clumps[3][1]})`);
      assert(seat0(e).reachT === EEK_FRAMES - 2 && seat0(e).anim === 'eek', `the jump back plays (reachT ${seat0(e).reachT}, anim '${seat0(e).anim}')`);
      assert(e.top.hog.t > 0 && e.top.hog.to >= 0 && e.top.hog.to !== 3, `the hedgehog trundles off to another clump (${JSON.stringify(e.top.hog)})`);
      await api.step(8);
      await api.shot('terrace-eek');
      await api.step(TRUNDLE_FRAMES);
      const slept = await api.summary();
      assert(slept.top.hog.t === 0 && slept.top.hog.at !== 3, `and is asleep under the new one (${JSON.stringify(slept.top.hog)})`);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const got = await api.summary();
      assert(seat0(got).count === 1, `the same clump now gives its sprig (count ${seat0(got).count})`);
    });
  },
};
