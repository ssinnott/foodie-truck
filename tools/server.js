// Zero-dependency static file server for development and headless tests.
// Usage: node tools/server.js [port]   (default 8080)
import http from 'node:http';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // Served transformed, never raw: see transformTs below.
  '.ts': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

/**
 * Strip the types out of one module and hand back JavaScript.
 *
 * Import specifiers are left exactly as written, so the JS returned here still says
 * `from './game/run.ts'`. The browser requests THAT path, it lands back in this server, and it is
 * transformed the same way -- the served module graph closes on itself. That is what keeps
 * edit-and-reload working with no watcher and no output directory between saving a file and
 * reloading the page. transformSync is sub-millisecond per file.
 */
function transformTs(source, file) {
  const { code } = transformSync(source.toString('utf8'), {
    loader: 'ts', format: 'esm', target: 'es2022',
    sourcefile: path.relative(ROOT, file),
    sourcemap: 'inline',   // the browser debugger shows the .ts source, with no extra request
  });
  return Buffer.from(code, 'utf8');
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, raw) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + pathname); return; }
      let data = raw;
      if (path.extname(file).toLowerCase() === '.ts') {
        // A browser cannot parse TypeScript. Serving it raw under a JavaScript content type fails with
        // "Unexpected token" on the first annotation, which is a blank page, not a helpful error.
        try { data = transformTs(raw, file); }
        catch (e) {
          // Report the syntax error as a module that throws, so it surfaces in the page's error
          // handler (and therefore in the playtest) instead of arriving as unparseable bytes.
          const msg = `${path.relative(ROOT, file)}: ${e.message}`;
          data = Buffer.from(`throw new SyntaxError(${JSON.stringify(msg)});`, 'utf8');
          console.error('transform failed: ' + msg);
        }
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      res.end(data);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(`Foodie Truck dev server: http://localhost:${PORT}/`));
}
