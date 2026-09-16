// Playtest scenarios for the cast work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   cast - opens the CREW gallery with the four critters, steps through every animation in its list for 40 frames
//          each (every hook, chain and accessory of every rig runs at least once), flips the facing, and asserts
//          that the cast is four strong, that the gallery stayed up and that the page recorded no error.
import { withPage, assert } from '../playtest.js';

const ANIMS = ['idle', 'walk', 'run', 'carry', 'carryWalk', 'reach', 'catch', 'cheer', 'sad', 'eat', 'chop', 'stir', 'bump', 'hop', 'wave', 'sit'];
const FRAMES_PER_ANIM = 40;

export const SCENARIOS = {
  async cast(server) {
    await withPage(server, 'skipTo=gallery', async (api, page) => {
      const cast = await page.evaluate(() => window.__game.critterList().map((c) => c.id));
      assert(cast.join() === 'barley,sorrel,chicory,cress', `the cast is Barley, Sorrel, Chicory, Cress in that order (${cast.join()})`);
      const first = await api.summary();
      assert(first.screen === 'gallery' && first.top.critters === 4, `the gallery seats all four critters (${first.top.critters})`);
      const seen = [];
      for (let i = 0; i < ANIMS.length; i++) {
        const before = (await api.summary()).top.anim;
        seen.push(before);
        await api.step(FRAMES_PER_ANIM);
        if (i === 4) await api.press(0, { alt: true });   // mirror test halfway through: every accessory drawn flipped too
        await api.press(0, { right: true });
        const errs = await api.errors();
        if (errs.length) { assert(false, `no error while cycling ${before} -> next (${JSON.stringify(errs.slice(0, 2))})`); break; }
      }
      assert(seen.join() === ANIMS.join(), `every animation in the gallery list was shown (${seen.join()})`);
      const last = await api.summary();
      assert(last.screen === 'gallery' && last.top.anim === ANIMS[0], `the gallery wrapped back to ${ANIMS[0]} and is still up (${last.screen}/${last.top.anim})`);
      await api.shot('40-cast-gallery');
    });
  },
};
