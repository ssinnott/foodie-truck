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
console.log(`${files.length} files checked, ${bad} with errors`);
process.exit(bad ? 1 : 0);
