import { createServer } from 'node:http';
import type { Database } from '../database/client.js';
export function healthServer(port: number, db: Database, isReady: () => boolean) {
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/live') {
      res.end('{"status":"alive"}');
      return;
    }
    if (req.url !== '/ready' && req.url !== '/health') {
      res.writeHead(404).end('{"status":"not_found"}');
      return;
    }
    let ready = isReady();
    if (ready)
      try {
        await db.$queryRaw`SELECT 1`;
      } catch {
        ready = false;
      }
    res
      .writeHead(ready ? 200 : 503)
      .end(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }));
  });
  server.listen(port, '0.0.0.0');
  return server;
}
