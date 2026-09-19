// `node --check` over every module in src/ and tools/ (the cheap half of `npm run lint`).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'screens-out') walk(p, out); }
    else if (/\.(m?js|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(ROOT, 'src'), []), ...walk(path.join(ROOT, 'tools'), [])];
let bad = 0;
for (const f of files) {
  // `node --check` parses JavaScript only. A .ts file is parsed by esbuild instead, which is the
  // same parser that serves and bundles it, so this catches exactly what would break either.
  if (f.endsWith('.ts')) {
    try { transformSync(fs.readFileSync(f, 'utf8'), { loader: 'ts', sourcefile: path.relative(ROOT, f) }); }
    catch (e) { bad++; console.log(`SYNTAX ${path.relative(ROOT, f)}\n${e.message}`); }
    continue;
  }
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.log(`SYNTAX ${path.relative(ROOT, f)}\n${r.stderr}`); }
}

// ---- THE BOOK'S INVARIANT (src/game/book.ts, docs/GDD.md section 12) ----
//
//     The book is WRITTEN by the game and READ only by the book screen. Nothing the book holds ever reaches
//     planWeek, planDay, gatherTarget, or any screen's update().
//
// That is what makes a saved file safe in a lockstep game: two peers with different books play byte-identical
// days because no code path exists from the book into the simulation. This is the executable half of that
// sentence, the way tools/art-check.js is the executable half of the art style. `recordDay` is importable
// anywhere - writing cannot branch the simulation - but `readBook` may be imported by ONE file.
const BOOK_READERS = ['src/game/screens/book.ts'];
const READ_EXPORTS = ['readBook', 'dishRows', 'dishesKnown', 'emptyBook'];
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (rel === 'src/game/book.ts' || BOOK_READERS.includes(rel)) continue;
  const src = fs.readFileSync(f, 'utf8');
  // every import of the book, however it is spelled, with the names it pulls in
  for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*\/book\.(?:ts|js)['"]/g)) {
    const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const reads = names.filter((n) => READ_EXPORTS.includes(n));
    if (reads.length) {
      bad++;
      console.log(`BOOK ${rel}\n  imports ${reads.join(', ')} from game/book.ts, which only ${BOOK_READERS.join(' and ')} may do.`);
      console.log('  The book records; it never unlocks. A read that reaches the simulation desyncs two peers whose saves differ.');
    }
  }
  // a namespace or default import would walk straight round the named check above
  if (/import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s*['"][^'"]*\/book\.(?:ts|js)['"]/.test(src)) {
    bad++;
    console.log(`BOOK ${rel}\n  imports game/book.ts wholesale; import { recordDay } by name instead.`);
  }
}

console.log(`${files.length} files checked, ${bad} with errors`);
process.exit(bad ? 1 : 0);
