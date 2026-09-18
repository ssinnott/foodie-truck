// Playtest scenarios for the cast work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   cast - opens the CREW gallery with the four critters, steps through every animation in its list for 40 frames
//          each (every hook, chain and accessory of every rig runs at least once), flips the facing and flips it
//          back, then draws EVERY authored key of EVERY critter - including the signature keys the gallery's fixed
//          list does not cycle (sneak, honk, cast) - straight through drawRig on a scratch canvas, so a broken key
//          or a throwing hook cannot ship unseen. Asserts the cast is four strong, the gallery stayed up, and the
//          page recorded no error.
import { withPage, assert } from '../playtest.js';

// The gallery owns its own list (game/screens/gallery.js ANIMS) and may grow it; the scenario reads the list off
// the screen rather than holding a copy that goes stale the day a signature key is added.
const BASE_ANIMS = ['idle', 'walk', 'run', 'carry', 'carryWalk', 'reach', 'catch', 'cheer', 'sad', 'eat', 'chop', 'stir', 'bump', 'hop', 'wave', 'sit'];
const FRAMES_PER_ANIM = 40;
/** Keys no screen plays yet, so nothing else in the suite would ever draw them. */
const SIGNATURE = ['sneak', 'honk', 'cast'];

/**
 * Draw every keyframe of every animation of every critter in the page, with the item each pose is authored
 * around. Returns { cells, keys, missing } - `missing` names any signature key that has gone from a rig.
 */
async function drawEveryKey(page, signature) {
  return page.evaluate(async (sig) => {
    const [reg, common, items, rig, anim] = await Promise.all([
      import('/src/content/critters/index.ts'), import('/src/content/critters/common.ts'),
      import('/src/content/critters/items.ts'), import('/src/lib/art/rig.ts'), import('/src/lib/art/animation.ts'),
    ]);
    const ITEM_FOR = { carry: 'basket', carryWalk: 'basket', catch: 'basket', eat: 'food', chop: 'knife', stir: 'spoon', cast: 'rod', honk: 'horn' };
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
    const ctx = cv.getContext('2d');
    let cells = 0, keys = [];
    const missing = [];
    for (let i = 0; i < reg.CRITTERS.length; i++) {
      const def = reg.CRITTERS[i], r = common.critterRig(def, i), player = new anim.AnimPlayer(def.anims);
      for (const name of Object.keys(def.anims)) {
        r.weapon = ITEM_FOR[name] ? items.ITEMS[ITEM_FOR[name]] : null;
        r.basketFill = 0.6;
        const frames = def.anims[name].frames.length;
        for (let k = 0; k < frames; k++) {
          player.play(name, { restart: true });
          for (let t = 0; t < k; t++) { player.frameIndex = t + 1 <= frames - 1 ? t + 1 : t; player.frameTime = 0; }
          player.tick();
          ctx.clearRect(0, 0, 160, 160);
          rig.drawRig(ctx, r, player.pose, { x: 80, y: 140, facing: k & 1 ? -1 : 1, scale: 2 });
          cells++;
        }
        keys.push(def.id + ':' + name);
      }
      for (const s of sig) if (def.anims[s] && !keys.includes(def.id + ':' + s)) missing.push(def.id + ':' + s);
    }
    return { cells, keys, missing };
  }, signature);
}

export const SCENARIOS = {
  async cast(server) {
    await withPage(server, 'skipTo=gallery', async (api, page) => {
      const cast = await page.evaluate(() => window.__game.critterList().map((c) => c.id));
      assert(cast.join() === 'barley,sorrel,chicory,cress', `the cast is Barley, Sorrel, Chicory, Cress in that order (${cast.join()})`);
      const first = await api.summary();
      assert(first.screen === 'gallery' && first.top.critters === 4, `the gallery seats all four critters (${first.top.critters})`);
      // Walk the gallery one step at a time until it comes back to where it started: that IS the list.
      const seen = [];
      for (let i = 0; i < 64; i++) {
        const before = (await api.summary()).top.anim;
        seen.push(before);
        await api.step(FRAMES_PER_ANIM);
        if (i === 4) await api.press(0, { alt: true });   // mirror test halfway through: every accessory drawn flipped too
        if (i === 11) await api.press(0, { alt: true });  // and back, so the committed reference shot faces +x like the rigs
        await api.press(0, { right: true });
        const errs = await api.errors();
        if (errs.length) { assert(false, `no error while cycling ${before} -> next (${JSON.stringify(errs.slice(0, 2))})`); break; }
        if ((await api.summary()).top.anim === seen[0]) break;      // wrapped
      }
      const missing = BASE_ANIMS.filter((a) => !seen.includes(a));
      assert(!missing.length, `every animation in the shared table was shown (${seen.length} shown, missing ${missing.join() || 'none'})`);
      const last = await api.summary();
      assert(last.screen === 'gallery' && last.top.anim === seen[0], `the gallery wrapped back to ${seen[0]} and is still up (${last.screen}/${last.top.anim})`);
      await api.shot('40-cast-gallery');

      // The carry key, with the basket in every paw: the basket's two weave bands are the SEAT's colour
      // (content/critters/items.js), so the loudest mark on a working critter is the player's own and not its
      // luggage (docs/ART_STYLE.md section 4). One committed frame of it, beside the idle sheet.
      let hops = 0;
      while ((await api.summary()).top.anim !== 'carry' && hops++ < 32) { await api.press(0, { right: true }); await api.step(2); }
      assert((await api.summary()).top.anim === 'carry', `the gallery can be walked to the carry key (${(await api.summary()).top.anim})`);
      await api.step(20);
      await api.shot('41-cast-carry');

      // Every authored key, including the ones no screen plays yet.
      const drawn = await drawEveryKey(page, SIGNATURE);
      assert(drawn.cells > 200, `every keyframe of every critter drew (${drawn.cells} cells)`);
      for (const s of SIGNATURE) assert(drawn.keys.some((k) => k.endsWith(':' + s)), `the signature key ${s} exists on a rig and was drawn`);
      assert(drawn.missing.length === 0, `no signature key skipped (${drawn.missing.join()})`);
      const errs = await api.errors();
      assert(errs.length === 0, `no error drawing the authored keys (${JSON.stringify(errs.slice(0, 2))})`);
    });
  },
};
