// Shared Playwright lookup + launch for the headless tools (tools/capture.js, tools/playtest.js).
// Prefers a global Playwright whose bundled browser is present; falls back to the local playwright-core and, when
// its pinned browser build is missing, to the chromium the environment provides (PLAYWRIGHT_CHROMIUM or
// /opt/pw-browsers/chromium) rather than downloading anything.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @returns {{ chromium: object }} the Playwright module, wherever it is installed. */
export function loadPlaywright() {
  const candidates = ['/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', 'playwright', 'playwright-core'];
  for (const c of candidates) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found. Install with `npm i -D playwright-core` or set NODE_PATH to the global node_modules.');
}

/** Launch headless Chromium, falling back to the environment's browser when the module's own build is absent. */
export async function launch(opts = {}) {
  const { chromium } = loadPlaywright();
  try { return await chromium.launch(opts); }
  catch (e) {
    const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
    if (fs.existsSync(exe)) return chromium.launch({ ...opts, executablePath: exe });
    throw e;
  }
}
