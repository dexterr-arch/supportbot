import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { it, expect } from 'vitest';
import { healthServer } from '../../src/infrastructure/health.js';
import type { Database } from '../../src/database/client.js';
import { safeError } from '../../src/infrastructure/logger.js';
it('health distinguishes live, ready, disconnected, and database failure', async () => {
  let ready = false,
    dbOk = true;
  const db = {
    $queryRaw: async () => {
      if (!dbOk) throw new Error('private connection data');
      return [1];
    },
  } as unknown as Database;
  const server = healthServer(0, db, () => ready);
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  try {
    expect((await fetch(url + '/live')).status).toBe(200);
    expect((await fetch(url + '/health')).status).toBe(503);
    ready = true;
    expect((await fetch(url + '/ready')).status).toBe(200);
    dbOk = false;
    const failed = await fetch(url + '/health');
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private');
    expect((await fetch(url + '/unknown')).status).toBe(404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
it('safe logs retain diagnostic type/code without exception messages or credentials', () => {
  const error = Object.assign(new Error('postgresql://secret:password@host/db and bot-token'), {
    code: 'P2002',
    token: 'private-value',
    request: { authorization: 'private-value' },
  });
  const safe = JSON.stringify(safeError(error));
  expect(safe).toContain('P2002');
  for (const word of ['secret', 'password', 'bot-token', 'private-value', 'authorization'])
    expect(safe).not.toContain(word);
});
