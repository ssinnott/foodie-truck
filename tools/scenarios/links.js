// Playtest scenarios for THE TWO OUTWARD LINKS (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   links - the crew screen's Ko-fi address and the title's repository address: both follow, by a click on the
//        drawn strip and by the key or row that opens them, and both ask for the address the constants name.
//   linksBlocked - a browser that refuses the tab. The game says so and leaves the address on screen: this is the
//        whole reason engine/links.ts reports what happened instead of calling window.open and hoping.
//   linksZone - the clickable rect belongs to the screen that drew it. Leaving releases it, so a click where an
//        address USED to be follows nothing.
//
// `window.open` is stubbed in the page throughout: a test suite must not open tabs, and the stub is also the only
// way to see WHICH address was asked for. Returning an object is a tab that opened; returning null is one refused.
import { withPage, assert } from '../playtest.js';
import { KOFI_URL, KOFI_LABEL, REPO_URL, REPO_LABEL } from '../../src/constants.ts';

/** Record every address the page is asked to open, and answer as a browser that allows tabs (or one that does not). */
async function stubOpen(page, allow = true) {
  await page.evaluate((ok) => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return ok ? { opener: null } : null; };
  }, allow);
}
const opened = (page) => page.evaluate(() => window.__opened.slice());

/** The middle of a summary's `linkZone`, in client px: internal 640x360 through the canvas's own box. */
async function centreOf(page, zone) {
  const box = await page.locator('canvas#game').boundingBox();
  return [box.x + (zone.x + zone.w / 2) * (box.width / 640), box.y + (zone.y + zone.h / 2) * (box.height / 360)];
}

export const SCENARIOS = {
  async links(server) {
    // ---- the crew screen: the cook's tip jar ----
    await withPage(server, 'skipTo=gallery', async (api, page) => {
      await api.step(5);
      await stubOpen(page);
      let s = await api.summary();
      assert(s.top.link === KOFI_URL, `the crew screen carries the Ko-fi address (${s.top.link})`);
      assert(s.top.linkLabel === KOFI_LABEL, `and draws it as ${KOFI_LABEL} (${s.top.linkLabel})`);
      assert(s.top.notice === '', `with nothing to report until it is followed (${JSON.stringify(s.top.notice)})`);

      // a click on the drawn strip: a real user gesture, so this is the path that always opens
      const [x, y] = await centreOf(page, s.top.linkZone);
      await page.mouse.click(x, y);
      await api.step(2);
      assert((await opened(page)).join() === KOFI_URL, `a click on the address opens it (${(await opened(page)).join()})`);
      s = await api.summary();
      assert(s.top.notice !== '', `and the screen says what happened (${JSON.stringify(s.top.notice)})`);
      assert((await api.screen()) === 'gallery', `the crew screen stays up (on ${await api.screen()})`);

      // the answer is not permanent furniture: it times out and the address is left alone
      await api.step(160);
      assert((await api.summary()).top.notice === '', 'the answer times out');

      // and the action key follows it too, for a player with no mouse - the hint on the strip below names it
      await stubOpen(page);
      await api.press(0, { action: true }, 2, 6);
      assert((await opened(page)).join() === KOFI_URL, `the action key opens it as well (${(await opened(page)).join()})`);
      assert((await api.screen()) === 'gallery', `and that leaves the crew screen up too (on ${await api.screen()})`);
      await api.shot('links-kofi');
    });

    // ---- the title: where this build came from ----
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      await stubOpen(page);
      let s = await api.summary();
      assert(s.top.link === REPO_URL && s.top.linkLabel === REPO_LABEL, `the title carries the repository address (${s.top.link})`);
      const [x, y] = await centreOf(page, s.top.linkZone);
      await page.mouse.click(x, y);
      await api.step(2);
      assert((await opened(page)).join() === REPO_URL, `a click on the address opens it (${(await opened(page)).join()})`);
      await api.step(160);

      // the SOURCE row is the same link by the other road
      await stubOpen(page);
      s = await api.summary();
      const row = s.top.menu.indexOf('SOURCE');
      assert(row > 0, `SOURCE is on the title menu (${s.top.menu.join()})`);
      for (let i = 0; i < row; i++) await api.press(0, { down: true }, 2, 4);
      assert((await api.summary()).top.row === 'SOURCE', `the cursor reaches SOURCE (${(await api.summary()).top.row})`);
      await api.press(0, { action: true }, 2, 6);
      assert((await opened(page)).join() === REPO_URL, `the SOURCE row opens the repository (${(await opened(page)).join()})`);
      assert((await api.screen()) === 'title', `and the game stays where it was (on ${await api.screen()})`);
    });
  },

  async linksBlocked(server) {
    await withPage(server, 'skipTo=gallery', async (api, page) => {
      await api.step(5);
      await stubOpen(page, false);                                  // a browser that refuses the tab
      await api.press(0, { action: true }, 2, 6);
      const s = await api.summary();
      assert((await opened(page)).join() === KOFI_URL, `the tab was asked for (${(await opened(page)).join()})`);
      assert(/BLOCKED/.test(s.top.notice), `a refused tab is reported, not swallowed (${JSON.stringify(s.top.notice)})`);
      assert(s.top.linkLabel === KOFI_LABEL, 'and the address is still on screen to type in');
      assert((await api.screen()) === 'gallery', `nothing else moved (on ${await api.screen()})`);
      await api.shot('links-blocked');
    });
  },

  async linksZone(server) {
    await withPage(server, 'skipTo=gallery', async (api, page) => {
      await api.step(5);
      const kofi = (await api.summary()).top.linkZone;
      const [x, y] = await centreOf(page, kofi);
      // out of the crew screen: its rect goes with it, and the title's own rect is elsewhere on the strip
      await api.press(0, { cancel: true }, 2, 8);
      await api.step(10);
      assert((await api.screen()) === 'title', `CANCEL goes back to the title (on ${await api.screen()})`);
      await stubOpen(page);
      const repo = (await api.summary()).top.linkZone;
      assert(repo.y !== kofi.y, `the title's address is not where the crew screen's was (${repo.y} vs ${kofi.y})`);
      await page.mouse.click(x, y);
      await api.step(2);
      assert((await opened(page)).length === 0, `a click where the Ko-fi address WAS opens nothing (${(await opened(page)).join()})`);
    });
  },
};
