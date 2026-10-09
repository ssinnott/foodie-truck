// Playtest scenario for THE ARCADE (src/engine/arcade.ts; registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / makeApi / assert from ../playtest.js.
//
//   arcade - github.com/ssinnott/arcade frames this page beside its other games. Standalone, and in any frame that
//        is NOT the arcade, the title is exactly the game's own seven rows and the page says nothing to anybody.
//        Framed by the arcade it gains BACK TO ARCADE, which asks the arcade for its shelf, and a hosted table's
//        invite opens the arcade at this game rather than the bare page inside it.
//
// The arcade here is a stand-in, tools/arcade-host.html: a page that frames index.html under a given name and keeps
// every message the frame posts it. Which origin it is served from is the other half of what the game checks, and
// 127.0.0.1 is another origin than the localhost the game itself is on.
import { withPage, makeApi, assert } from '../playtest.js';
import { launch } from '../browser.js';

const ARCADE_ROW = 'BACK TO ARCADE';
/** The arcade's link to this game with the key left off, as the arcade names the frame (engine/arcade.ts). */
const linkFor = (server) => `http://localhost:${server.port}/#foodie-truck?room=`;

/** Open the stand-in on `host`, wait for the game in its frame, and hand `fn` the frame's api and the page. */
async function withFrame(server, { host = 'localhost', name, params = 'skipTo=title' }, fn) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const src = `http://localhost:${server.port}/index.html?autotest=1&${params}`;
  const at = `http://${host}:${server.port}/tools/arcade-host.html?` + new URLSearchParams({ name, src });
  try {
    await page.goto(at, { waitUntil: 'load' });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    const api = { ...makeApi(frame), shot: makeApi(page).shot };
    const got = () => page.evaluate(() => window.__got.map((m) => m.data));
    await fn(api, { page, frame, got });
    const all = [...await api.errors(), ...errs];
    assert(all.length === 0, `no errors in the frame or around it (${name} from ${host}) ${all.length ? JSON.stringify(all.slice(0, 3)) : ''}`);
  } catch (e) {
    assert(false, `arcade scenario crashed (${name} from ${host}): ${e.message}`);
  } finally { await browser.close(); }
}

/** Wait until the page has been posted a message of `type`, and return it (or null after a few seconds). */
async function posted(page, type) {
  try { await page.waitForFunction((t) => window.__got.some((m) => m.data && m.data.type === t), type, { timeout: 5000 }); } catch { return null; }
  return page.evaluate((t) => window.__got.find((m) => m.data && m.data.type === t), type);
}

export const SCENARIOS = {
  async arcade(server) {
    // ---- a page of its own: nothing changes ----
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      const s = await api.summary();
      assert(!(await page.evaluate(() => window.__game.arcade.active)), 'a page of its own is not in the arcade');
      assert(s.top.menu.length === 7 && s.top.menu[6] === 'SOURCE' && !s.top.menu.includes(ARCADE_ROW),
        `and its title is the game's own seven rows, SOURCE last (${s.top.menu.join()})`);
    });

    // ---- framed, but not by the arcade ----
    const others = [
      ['a same-site page that names the frame anything else', 'localhost', 'game'],
      ['another origin using the arcade name', '127.0.0.1', 'arcade:' + linkFor(server)],
      ['an arcade name whose link points at another site', 'localhost', 'arcade:https://example.com/#foodie-truck?room='],
    ];
    for (const [label, host, name] of others) {
      await withFrame(server, { host, name }, async (api, { frame, got }) => {
        await api.step(5);
        const s = await api.summary();
        assert(!(await frame.evaluate(() => window.__game.arcade.active)), `${label}: is not the arcade`);
        assert(!s.top.menu.includes(ARCADE_ROW), `${label}: no ${ARCADE_ROW} row (${s.top.menu.join()})`);
        assert((await got()).length === 0, `${label}: is told nothing (${JSON.stringify(await got())})`);
      });
    }

    // ---- the arcade: the row, and the way back ----
    await withFrame(server, { name: 'arcade:' + linkFor(server) }, async (api, { page, frame }) => {
      await api.step(5);
      assert(await frame.evaluate(() => window.__game.arcade.active), 'framed by the arcade, the game knows it');
      const hello = await posted(page, 'arcade:hello');
      assert(!!hello && hello.origin === `http://localhost:${server.port}`, `and says hello, so the arcade can drop its own back button (${JSON.stringify(hello)})`);
      let s = await api.summary();
      assert(s.top.menu.length === 8 && s.top.menu[6] === 'SOURCE' && s.top.menu[7] === ARCADE_ROW,
        `${ARCADE_ROW} is an eighth row, under SOURCE (${s.top.menu.join()})`);
      await api.shot('arcade-title');
      // the menu wraps, so one UP from the first row is the last
      await api.press(0, { up: true }, 2, 4);
      s = await api.summary();
      assert(s.top.row === ARCADE_ROW, `the cursor reaches it (${s.top.row})`);
      await api.press(0, { action: true }, 2, 4);
      assert(!!(await posted(page, 'arcade:exit')), 'choosing it asks the arcade for its shelf');
      assert((await api.screen()) === 'title', `and leaves the game itself alone: taking the frame away is the arcade's job (${await api.screen()})`);
    });

    // ---- the arcade: a hosted table's invite opens the arcade at this game ----
    await withFrame(server, { name: 'arcade:' + linkFor(server), params: 'host=1&transport=broadcast' }, async (api, { page }) => {
      await api.step(10);
      const s = await api.summary();
      const room = s.net && s.net.room;
      assert(s.screen === 'lobby' && !!room, `?host=1 opens a table (${s.screen}, ${JSON.stringify(s.net && s.net.room)})`);
      assert(s.top.link === (linkFor(server) + room).toUpperCase(), `its invite opens the arcade at this game (${s.top.link})`);
      const told = await posted(page, 'arcade:room');
      assert(!!told && told.data.room === room, `and the arcade is told the key for its address bar (${JSON.stringify(told && told.data)})`);
    });
  },
};
