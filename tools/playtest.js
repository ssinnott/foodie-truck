// Headless playthrough harness (Playwright). Usage:
//   node tools/playtest.js                 # every scenario
//   node tools/playtest.js boot flow       # selected scenarios
// Boots the game, visits every screen, walks the run flow with virtual input, and (netplay) holds a two-page
// room over BroadcastChannel signalling + real WebRTC data channels. Any recorded page error fails the run.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';
import { launch } from './browser.js';
import { SCENARIOS as EXTRA } from './scenarios/index.js';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const results = [];
export function assert(cond, msg) {
  if (!cond) { failures++; results.push(`  FAIL: ${msg}`); console.log(`  FAIL: ${msg}`); }
  else results.push(`  ok:   ${msg}`);
}

export function makeApi(page) {
  return {
    step: (n = 1) => page.evaluate((k) => window.__game.step(k), n),
    screen: () => page.evaluate(() => window.__game.screen()),
    summary: () => page.evaluate(() => window.__game.summary()),
    goto: (id, params) => page.evaluate(([i, p]) => window.__game.goto(i, p || {}), [id, params || {}]),
    press: async (p, actions, hold = 1, release = 4) => {
      await page.evaluate(([pp, a]) => window.__game.setInput(pp, a), [p, actions]);
      await page.evaluate((k) => window.__game.step(k), hold);
      await page.evaluate((pp) => window.__game.clearInput(pp), p);
      await page.evaluate((k) => window.__game.step(k), release);
    },
    /** Stand fake gamepads in for the real ones: one { down, axes } per pad, null to clear them all. */
    pads: (specs) => page.evaluate((g) => window.__game.setPads(g), specs || null),
    /** Which pad is sitting in a seat, or -1. */
    padOf: (p) => page.evaluate((pp) => window.__game.padOf(pp), p),
    hold: (p, actions) => page.evaluate(([pp, a]) => window.__game.setInput(pp, a), [p, actions]),
    release: (p) => page.evaluate((pp) => window.__game.clearInput(pp), p),
    errors: () => page.evaluate(() => window.__game.errors.slice()),
    shot: (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') }),
  };
}

export async function withPage(server, params, fn) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); if (process.env.KEEP) console.log('   [browser]', m.text()); });
  try {
    await page.goto(`http://localhost:${server.port}/index.html?autotest=1&${params}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    const api = makeApi(page);
    await fn(api, page);
    const errs = await api.errors();
    assert(errs.length === 0, `no runtime errors (${params}) ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
    assert(consoleErrors.length === 0, `no console errors (${params}) ${consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 3)) : ''}`);
  } catch (e) {
    failures++; results.push(`  FAIL: scenario crashed (${params}): ${e.message}`); console.log(`  FAIL: scenario crashed (${params}): ${e.message}`);
    if (consoleErrors.length) console.log('   browser errors:', consoleErrors.slice(0, 5));
    try { await page.screenshot({ path: path.join(SHOTS, 'crash.png') }); } catch { /* ignore */ }
  } finally { await browser.close(); }
}

/** Several pages in ONE browser context (BroadcastChannel needs it), for the online co-op scenarios. */
export async function withPeers(server, paramsList, fn) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  const pages = [];
  try {
    for (const params of paramsList) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); if (process.env.KEEP) console.log('   [browser]', m.text()); });
      await page.goto(`http://localhost:${server.port}/index.html?autotest=1&${params}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      pages.push(page);
    }
    await fn(pages, pages.map(makeApi));
    for (const p of pages) if (!p.isClosed()) for (const e of await makeApi(p).errors()) errs.push(e);
    assert(errs.length === 0, `no runtime errors in the netplay room ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
  } catch (e) {
    failures++; results.push(`  FAIL: netplay scenario crashed: ${e.message}`); console.log(`  FAIL: netplay scenario crashed: ${e.message}`);
    if (errs.length) console.log('   browser errors:', errs.slice(0, 5));
  } finally { await browser.close(); }
}

const SCENARIOS = {
  /** Every registered screen boots, steps 120 frames and draws without an error. */
  async boot(server) {
    await withPage(server, 'skipTo=title', async (api) => {
      const ids = await api.summary().then(() => api.step(1)).then(() => null);
      const screens = await api.screen().then(() => null);
      void ids; void screens;
      const list = await (async () => (await api.summary()) && (await (async () => null)()))();
      void list;
    });
    const ids = await (async () => {
      let out = [];
      await withPage(server, 'skipTo=title', async (api, page) => { out = await page.evaluate(() => window.__game.screenIds()); });
      return out;
    })();
    for (const id of ids) {
      if (id === 'pause') continue;
      await withPage(server, `skipTo=${id}&critters=0,1,2,3`, async (api) => {
        await api.step(120);
        assert((await api.screen()) === id || id === 'results' || id === 'select', `${id} stays up for 120 frames (now on ${await api.screen()})`);
      });
    }
  },
  ...EXTRA,
};

async function main() {
  const wanted = process.argv.slice(2);
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  server.port = server.address().port;
  const names = wanted.length ? wanted : Object.keys(SCENARIOS);
  for (const name of names) {
    if (!SCENARIOS[name]) { console.log(`unknown scenario ${name}`); failures++; continue; }
    console.log(`\n== ${name}`);
    await SCENARIOS[name](server);
  }
  server.close();
  console.log(`\n${results.filter((r) => r.startsWith('  ok')).length} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
main();
