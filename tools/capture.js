// Headless screenshots of any screen (Playwright). Usage:
//   node tools/capture.js <outDir> [screen[:params]...]      default: every registered screen
//   e.g. node tools/capture.js tools/screens map orchard "kitchen:critters=0,1,2,3" "lobby:host=1&transport=broadcast"
// Each screen is opened with ?autotest=1&seed=1&skipTo=<screen>&<params>, stepped STEPS frames (or ?steps=N in
// params) and the 640x360 canvas is written at 2x as <outDir>/<screen>.png. Errors recorded by the page fail the run.
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from './server.js';
import { launch } from './browser.js';


const outDir = path.resolve(process.argv[2] || 'tools/screens');
fs.mkdirSync(outDir, { recursive: true });
const server = createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

async function open(params) {
  await page.goto(`http://localhost:${port}/index.html?autotest=1&seed=1&${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
}
let jobs = process.argv.slice(3);
if (!jobs.length) { await open('skipTo=title'); jobs = await page.evaluate(() => window.__game.screenIds().filter((s) => s !== 'pause')); }
let failed = 0;
for (const job of jobs) {
  const [screen, extra] = job.split(':');
  const q = new URLSearchParams(extra || '');
  const steps = Number(q.get('steps') || 90); q.delete('steps');
  const file = q.get('file') || screen; q.delete('file');
  await open(`skipTo=${screen}&${q.toString()}`);
  const before = errors.length;
  await page.evaluate((n) => window.__game.step(n), steps);
  const errs = await page.evaluate(() => window.__game.errors.slice());
  const el = await page.$('#game');
  await el.screenshot({ path: path.join(outDir, file + '.png') });
  const bad = errs.length || errors.length > before;
  if (bad) failed++;
  console.log(`${bad ? 'ERROR' : 'wrote'} ${path.join(outDir, file + '.png')}${errs.length ? '  ' + JSON.stringify(errs.slice(0, 3)) : ''}`);
}
if (errors.length) console.log('page errors:', errors.slice(0, 10));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
