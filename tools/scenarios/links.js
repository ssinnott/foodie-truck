// Playtest scenarios for THE TWO OUTWARD LINKS (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   links - the pair of addresses along the bottom of the title: where this build came from, and where to tip
//        the cook. Both follow from a click on the drawn address; the repository one follows from the SOURCE row
//        as well, and both ask for the address the constants name.
//   linksBlocked - a browser that refuses the tab. The game says so and leaves the address on screen: this is the
//        whole reason engine/links.ts reports what happened instead of calling window.open and hoping.
//   linksZone - the clickable rects belong to the screen that drew them. Leaving the title releases them, so a
//        click where an address USED to be follows nothing. The Ko-fi address also costs the game no key: the
//        action button on the title opens the row it is standing on and nothing else.
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

/** The two links the title draws, by url. */
async function linkOf(api, url) {
  const list = (await api.summary()).top.links || [];
  return list.find((l) => l.url === url);
}

/** The middle of a link's `zone`, in client px: internal 640x360 through the canvas's own box. */
async function centreOf(page, zone) {
  const box = await page.locator('canvas#game').boundingBox();
  return [box.x + (zone.x + zone.w / 2) * (box.width / 640), box.y + (zone.y + zone.h / 2) * (box.height / 360)];
}

export const SCENARIOS = {
  async links(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      await stubOpen(page);
      let s = await api.summary();
      assert(s.top.notice === '', `nothing to report until an address is followed (${JSON.stringify(s.top.notice)})`);

      const repo = await linkOf(api, REPO_URL), kofi = await linkOf(api, KOFI_URL);
      assert(repo && repo.label === REPO_LABEL, `the title draws the repository address (${repo && repo.label})`);
      assert(kofi && kofi.label === KOFI_LABEL, `and the Ko-fi address beside it (${kofi && kofi.label})`);
      assert(repo.zone.y === kofi.zone.y, `both on the one strip (${repo.zone.y} and ${kofi.zone.y})`);
      assert(repo.zone.x + repo.zone.w < kofi.zone.x, 'with clear paper between them, so a click cannot mean both');
      await api.shot('links-title');

      // ---- the tip jar: a click, and only a click ----
      const [kx, ky] = await centreOf(page, kofi.zone);
      await page.mouse.click(kx, ky);
      await api.step(2);
      assert((await opened(page)).join() === KOFI_URL, `a click on the Ko-fi address opens it (${(await opened(page)).join()})`);
      s = await api.summary();
      assert(s.top.notice !== '', `and the title says what happened (${JSON.stringify(s.top.notice)})`);
      assert((await api.screen()) === 'title', `the title stays up (on ${await api.screen()})`);

      // the answer is not permanent furniture: it times out and the addresses are left alone
      await api.step(160);
      assert((await api.summary()).top.notice === '', 'the answer times out');

      // ---- the repository: a click, or the row ----
      await stubOpen(page);
      const [rx, ry] = await centreOf(page, repo.zone);
      await page.mouse.click(rx, ry);
      await api.step(2);
      assert((await opened(page)).join() === REPO_URL, `a click on the repository address opens it (${(await opened(page)).join()})`);
      await api.step(160);

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
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      await stubOpen(page, false);                                  // a browser that refuses the tab
      const kofi = await linkOf(api, KOFI_URL);
      const [x, y] = await centreOf(page, kofi.zone);
      await page.mouse.click(x, y);
      await api.step(2);
      const s = await api.summary();
      assert((await opened(page)).join() === KOFI_URL, `the tab was asked for (${(await opened(page)).join()})`);
      assert(/BLOCKED/.test(s.top.notice), `a refused tab is reported, not swallowed (${JSON.stringify(s.top.notice)})`);
      assert((s.top.links || []).some((l) => l.label === KOFI_LABEL), 'and the address is still on screen to type in');
      assert((await api.screen()) === 'title', `nothing else moved (on ${await api.screen()})`);
      await api.shot('links-blocked');
    });
  },

  async linksZone(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      await stubOpen(page);
      const kofi = await linkOf(api, KOFI_URL);
      const [x, y] = await centreOf(page, kofi.zone);

      // The Ko-fi address costs the game no key: PLAY is what the action button does on the title.
      await api.press(0, { action: true }, 2, 8);
      await api.step(10);
      assert((await opened(page)).length === 0, `the action button opens no tab (${(await opened(page)).join()})`);
      assert((await api.screen()) === 'select', `it opens the row the cursor was on (on ${await api.screen()})`);

      // ...and off the title, the rects go too
      await page.mouse.click(x, y);
      await api.step(2);
      assert((await opened(page)).length === 0, `a click where the Ko-fi address WAS opens nothing (${(await opened(page)).join()})`);
      assert(((await api.summary()).top.links || []).length === 0, 'and no screen but the title carries links');
    });
  },
};
