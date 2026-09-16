// Headless contact-sheet capture. Usage:
//   node tools/sheet-capture.js <outDir> [critter=<id>] [jobs] ["<sheet query>><file.png>" ...]
//   jobs (comma list, default all): anims,walk,closeup,cast,bench
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from './server.js';
import { launch } from './browser.js';

const outDir = path.resolve(process.argv[2] || 'tools/screens');
const who = process.argv[3] || '';
const jobs = (process.argv[4] || 'anims,walk,closeup,cast,bench').split(',');
fs.mkdirSync(outDir, { recursive: true });
const server = createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
async function shoot(params, file) {
  await page.goto(`http://localhost:${port}/tools/sheet.html?${who}&${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.__sheet.error);
  if (err) { console.log('SHEET ERROR', params, err); return; }
  const el = await page.$('#sheet');
  await el.screenshot({ path: path.join(outDir, file) });
  console.log('wrote', path.join(outDir, file));
}
const SHEETS = {
  anims: ['mode=anims&zoom=3&cols=6', 'sheet-anims.png'],
  walk: ['mode=strip&zoom=3&anims=walk,run,carryWalk&samples=8', 'sheet-walk.png'],
  closeup: ['mode=closeup&zoom=6', 'sheet-closeup.png'],
  cast: ['mode=cast&zoom=3', 'sheet-cast.png'],
};
for (const j of jobs) if (SHEETS[j]) await shoot(SHEETS[j][0], SHEETS[j][1]);
for (const extra of process.argv.slice(5)) { const [params, file] = extra.split('>'); if (params && file) await shoot(params, file); }
if (jobs.includes('bench')) {
  await page.goto(`http://localhost:${port}/tools/sheet.html?${who}&mode=closeup&zoom=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });
  const ms = await page.evaluate(() => { window.__sheet.bench(100); return window.__sheet.bench(1000); });
  console.log(`drawRig avg: ${ms.toFixed(4)} ms`);
}
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
await browser.close();
server.close();
