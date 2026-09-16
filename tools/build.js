// Bundle src/main.js into a self-contained page: dist/index.html (open from disk or serve anywhere).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
fs.mkdirSync(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(ROOT, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: false,
  legalComments: 'none',
  write: false,
  logLevel: 'error',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const tagRe = /<script[^>]*type=["']module["'][^>]*src=["'][^"']*main\.js["'][^>]*>\s*<\/script>/i;
if (!tagRe.test(html)) throw new Error('index.html: could not find <script type="module" src="src/main.js"> to inline');
html = html.replace(tagRe, () => `<script>\n${js}\n</script>`);
if (/src=["'](\.\/)?src\//.test(html)) throw new Error('dist/index.html still references src/');
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
console.log(`built dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
