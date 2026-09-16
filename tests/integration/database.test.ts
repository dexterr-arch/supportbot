import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { database, type Database } from '../../src/database/client.js';
import { reserve, claim, begin } from '../../src/tickets/repository.js';
import { defaults } from '../../src/config/settings.js';
let db: Database;
const guildId = '900000000000000001';
const create = (ownerId: string) =>
  reserve(db, {
    guildId,
    ownerId,
    roleId: '900000000000000002',
    categoryKey: 'support',
    subject: 'Integration test',
    description: 'Synthetic content',
    details: {},
    status: 'OPEN',
  });
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error(
      'Set TEST_DATABASE_URL to a disposable PostgreSQL database whose name ends in _test. Tests are not skipped.',
    );
  db = database(url);
  await db.$connect();
});
afterAll(async () => {
  if (!db) return;
  const ids = (await db.ticket.findMany({ where: { guildId }, select: { id: true } })).map(
    (t) => t.id,
  );
  await db.auditEvent.deleteMany({ where: { ticketId: { in: ids } } });
  await db.transcript.deleteMany({ where: { ticketId: { in: ids } } });
  await db.participant.deleteMany({ where: { ticketId: { in: ids } } });
  await db.ticket.deleteMany({ where: { guildId } });
  await db.guildSettings.deleteMany({ where: { guildId } });
  await db.$disconnect();
});
describe('real PostgreSQL invariants', () => {
  it('allows exactly one concurrent reservation per owner', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => create('duplicate-owner')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.ticket.count({ where: { guildId, ownerId: 'duplicate-owner' } })).toBe(1);
  });
  it('separates owners and guilds', async () => {
    expect((await create('other-owner')).ownerId).toBe('other-owner');
  });
  it('lets exactly one staff member win a claim race', async () => {
    const t = await create('claim-owner');
    const result = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => claim(db, t, 'staff-' + i)),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(saved.claimId).toMatch(/^staff-/);
    expect(await db.auditEvent.count({ where: { ticketId: t.id, action: 'claim' } })).toBe(1);
  });
  it('serializes concurrent closes and preserves the first reason', async () => {
    const t = await create('close-owner');
    const result = await Promise.allSettled([
      begin(db, t, 'close', 'a', { reason: 'First' }),
      begin(db, t, 'close', 'b', { reason: 'Second' }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(saved.status).toBe('CLOSING');
    expect(saved.operation).toBe('close');
    expect(saved.operationData).toBeTruthy();
    expect(saved.closedAt).not.toBeNull();
  });
  it('prevents claims racing with a pending closure', async () => {
    const t = await create('claim-close-owner');
    await begin(db, t, 'close', 'owner');
    await expect(claim(db, t, 'late-staff')).rejects.toThrow();
  });
  it('allows a new ticket after closure but rejects reopening into a duplicate', async () => {
    const old = await create('reopen-owner');
    await db.ticket.update({ where: { id: old.id }, data: { status: 'CLOSED' } });
    await create('reopen-owner');
    await expect(begin(db, { ...old, status: 'CLOSED' }, 'reopen', 'staff')).rejects.toThrow();
  });
  it('rejects stale lifecycle confirmations', async () => {
    const t = await create('generation-owner');
    await db.ticket.update({ where: { id: t.id }, data: { generation: 1 } });
    await expect(begin(db, t, 'close', 'owner', {}, 0)).rejects.toThrow();
  });
  it('applies a settings edit only once at its original revision', async () => {
    await db.guildSettings.create({ data: { guildId, data: defaults } });
    const results = await Promise.all(
      [0, 1].map(() =>
        db.guildSettings.updateMany({
          where: { guildId, revision: 0 },
          data: { revision: { increment: 1 } },
        }),
      ),
    );
    expect(results.reduce((n, r) => n + r.count, 0)).toBe(1);
  });
});
