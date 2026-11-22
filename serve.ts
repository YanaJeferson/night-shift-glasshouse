import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game/', import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const port = Number(process.env.PORT ?? 8080);

createServer((request, response) => {
  const rawPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relative = normalize(rawPath === '/' ? 'index.html' : rawPath.slice(1));
  const file = resolve(join(root, relative));
  if (!file.startsWith(`${root}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Night Shift is running at http://127.0.0.1:${port}\n`);
});
