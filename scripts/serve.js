/**
 * Zero-dependency static server.
 *
 * GitHub Pages needs nothing, but fetch() over file:// is blocked by CORS in
 * every modern browser — so the project ships its own server for local review.
 *
 *   node scripts/serve.js [--port 5173]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const portArg = process.argv.indexOf('--port');
const PORT = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = normalize(urlPath === '/' ? 'index.html' : urlPath.slice(1));
  const file = join(ROOT, rel);

  // Directory traversal guard: resolved path must stay inside ROOT.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 — not found: ${rel}`);
  }
});

server.listen(PORT, () => {
  console.log(`Cafe Finder → http://localhost:${PORT}`);
  console.log(`Demo data  → http://localhost:${PORT}/?demo=1`);
  console.log('Ctrl+C to stop.');
});
