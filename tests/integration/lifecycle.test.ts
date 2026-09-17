import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { Collection, ChannelType, type Guild, type TextChannel } from 'discord.js';
import { database, type Database } from '../../src/database/client.js';
import { defaults } from '../../src/config/settings.js';
import { TicketService } from '../../src/tickets/service.js';
const registry = new Map<string, FakeChannel>();
let log: FakeChannel;
let sequence = 10000n;
class FakeChannel {
  id = String(sequence++);
  type = ChannelType.GuildText;
  topic = '';
  parentId: string | null = null;
  name = 'ticket';
  deleted = false;
  failUploads = false;
  sent = new Collection<string, FakeMessage>();
  access: unknown;
  permissionOverwrites = {
    set: vi.fn(async (value: unknown) => {
      this.access = value;
    }),
  };
  messages = {
    fetch: vi.fn(async (input: unknown) => {
      if (typeof input === 'string') {
        const m = this.sent.get(input);
        if (!m) throw new Error('Unknown message');
        return m;
      }
      const before = (input as { before?: string }).before;
      return new Collection(
        [...this.sent.entries()]
          .filter(([id]) => !before || BigInt(id) < BigInt(before))
          .sort(([a], [b]) => (BigInt(a) > BigInt(b) ? -1 : 1))
          .slice(0, 100),
      );
    }),
    edit: vi.fn(async (id: string, payload: Record<string, unknown>) => {
      const m = this.sent.get(id);
      if (!m) throw new Error('Unknown message');
      m.components = payload.components as FakeMessage['components'];
      return m;
    }),
  };
  async send(payload: Record<string, unknown>) {
    if (this.failUploads && payload.files) throw new Error('Synthetic upload failure');
    const id = String(sequence++);
    const m: FakeMessage = {
      id,
      content: String(payload.content ?? ''),
      author: { id: '999999999999999999', tag: 'Test Bot' },
      createdAt: new Date(),
      embeds: [],
      components: (payload.components ?? []) as FakeMessage['components'],
      attachments: new Collection(
        payload.files
          ? [[id, { name: 'transcript.html', url: 'https://example.org/transcript.html' }]]
          : [],
      ),
    };
    this.sent.set(id, m);
    return m;
  }
  isTextBased() {
    return true;
  }
  async setParent(id: string) {
    this.parentId = id;
    return this;
  }
  async setName(name: string) {
    this.name = name;
    return this;
  }
  async delete() {
    this.deleted = true;
    registry.delete(this.id);
  }
}
interface FakeMessage {
  id: string;
  content: string;
  author: { id: string; tag: string };
  createdAt: Date;
  embeds: { toJSON(): unknown }[];
  components: { toJSON(): unknown }[];
  attachments: Collection<string, { name: string; url: string }>;
}
vi.mock('../../src/discord/permissions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/discord/permissions.js')>();
  return {
    ...actual,
    validateRouting: vi.fn(async () => undefined),
    validateLog: vi.fn(async () => log as unknown as TextChannel),
  };
});
let db: Database, service: TicketService;
const guildId = '900000000000000003';
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Use a disposable TEST_DATABASE_URL ending in _test.');
  db = database(url);
  await db.guildSettings.create({
    data: {
      guildId,
      data: {
        ...defaults,
        supportRoleId: '900000000000000004',
        managementRoleId: '900000000000000005',
        ticketCategoryId: '900000000000000006',
        archiveCategoryId: '900000000000000007',
        transcriptLogChannelId: '900000000000000008',
      },
    },
  });
  const guild = {
    id: guildId,
    client: { user: { id: '999999999999999999' } },
    channels: {
      fetch: async (id?: string) =>
        id ? (registry.get(id) ?? null) : new Collection([...registry.entries()]),
      create: async (data: { topic: string; parent: string; name: string }) => {
        const c = new FakeChannel();
        c.topic = data.topic;
        c.parentId = data.parent;
        c.name = data.name;
        registry.set(c.id, c);
        return c;
      },
    },
  } as unknown as Guild;
  service = new TicketService(db, guild);
});
beforeEach(() => {
  log = new FakeChannel();
  registry.set(log.id, log);
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
describe('lifecycle orchestration with real PostgreSQL and simulated Discord', () => {
  it.each(['support', 'management'])(
    'allows a new %s ticket after closing the old ticket',
    async (category) => {
      const owner = 'new-after-close-' + category;
      const first = await service.open(owner, category, 'First', 'Close this normally', {});
      await service.request(first, 'close', 'staff');
      const second = await service.open(owner, category, 'Second', 'A new request', {});
      expect(second.status).toBe('OPEN');
      expect(second.id).not.toBe(first.id);
      const closed = await db.ticket.findUniqueOrThrow({ where: { id: first.id } });
      await expect(service.request(closed, 'reopen', 'staff')).rejects.toThrow(
        'already has active ticket',
      );
    },
  );
  it.each(['support', 'management'])(
    'releases a stale %s ticket when its channel was manually deleted',
    async (category) => {
      const owner = 'missing-' + category;
      const first = await service.open(owner, category, 'Old', 'Missing channel', {});
      registry.delete(first.channelId!);
      const second = await service.open(owner, category, 'New', 'No stale duplicate block', {});
      expect(second.status).toBe('OPEN');
      expect((await db.ticket.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
        'DELETED',
      );
      expect(
        await db.auditEvent.count({ where: { ticketId: first.id, action: 'channel_missing' } }),
      ).toBe(1);
    },
  );
  it('does not release a slot on missing access or a network failure', async () => {
    const first = await service.open('inaccessible', 'support', 'Protected', 'Keep slot', {});
    for (const code of [50001, 50013, 'ETIMEDOUT']) {
      const spy = vi
        .spyOn(service.guild.channels, 'fetch')
        .mockRejectedValueOnce(Object.assign(new Error('Synthetic'), { code }));
      await expect(service.activeTicket(first.ownerId)).rejects.toThrow('Synthetic');
      spy.mockRestore();
      expect((await db.ticket.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('OPEN');
    }
  });
  it('handles Discord Unknown Channel and records the recovery only once under concurrency', async () => {
    const first = await service.open('unknown-channel', 'support', 'Gone', 'Unknown channel', {});
    const spy = vi
      .spyOn(service.guild.channels, 'fetch')
      .mockRejectedValue(Object.assign(new Error('Unknown Channel'), { code: 10003 }));
    const result = await Promise.all([
      service.reconcileMissing(first),
      service.reconcileMissing(first),
    ]);
    spy.mockRestore();
    expect(result.filter(Boolean)).toHaveLength(1);
    expect(
      await db.auditEvent.count({ where: { ticketId: first.id, action: 'channel_missing' } }),
    ).toBe(1);
  });
  it.each(['support', 'management'])(
    'staff can close and reopen the same %s channel',
    async (category) => {
      const first = await service.open(
        'same-reopen-' + category,
        category,
        'Reopen same channel',
        'Lifecycle',
        {},
      );
      await service.request(first, 'close', 'staff');
      const closed = await db.ticket.findUniqueOrThrow({ where: { id: first.id } });
      await service.request(closed, 'reopen', 'staff');
      const reopened = await db.ticket.findUniqueOrThrow({ where: { id: first.id } });
      expect(reopened.status).toBe('OPEN');
      expect(reopened.channelId).toBe(first.channelId);
      expect(reopened.generation).toBe(1);
    },
  );
  it('creates a private channel and persists its restart-safe welcome controls', async () => {
    const t = await service.open('owner-create', 'support', 'Question', 'Help please', {});
    expect(t.status).toBe('OPEN');
    expect(t.operation).toBeNull();
    expect(t.welcomeMessageId).not.toBeNull();
    expect(registry.get(t.channelId!)!.topic).toBe('support-ticket:' + t.id);
  });
  it('keeps a ticket and pending operation when transcript upload fails, then resumes', async () => {
    const t = await service.open(
      'owner-failure',
      'support',
      'Upload failure',
      'Keep this channel',
      {},
    );
    log.failUploads = true;
    await expect(service.request(t, 'close', 'staff', { reason: 'Done' })).rejects.toThrow(
      'preserved',
    );
    const interrupted = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(interrupted.status).toBe('CLOSING');
    expect(interrupted.transcriptGeneration).toBeNull();
    expect(registry.get(t.channelId!)!.deleted).toBe(false);
    expect(await db.transcript.count({ where: { ticketId: t.id } })).toBeGreaterThan(0);
    log.failUploads = false;
    const restarted = new TicketService(db, service.guild);
    await restarted.run(t.id);
    const closed = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.operation).toBeNull();
    expect(closed.transcriptGeneration).toBe(0);
  });
  it('refuses deletion when the uploaded transcript is no longer present', async () => {
    const t = await service.open('owner-delete-fail', 'support', 'Delete guard', 'Keep safe', {});
    await service.request(t, 'close', 'staff');
    const closed = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    for (const m of log.sent.values()) m.attachments.clear();
    await expect(service.request(closed, 'delete', 'manager')).rejects.toThrow();
    expect(registry.get(t.channelId!)!.deleted).toBe(false);
  });
  it('reopens with a fresh archive generation and allows deletion only after re-archiving', async () => {
    const t = await service.open('owner-reopen', 'support', 'Reopen', 'Lifecycle test', {});
    await service.request(t, 'close', 'staff');
    let current = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    await service.request(current, 'reopen', 'staff');
    current = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(current.status).toBe('OPEN');
    expect(current.generation).toBe(1);
    expect(current.transcriptGeneration).toBeNull();
    await service.request(current, 'close', 'staff');
    current = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(current.transcriptGeneration).toBe(1);
    await service.request(current, 'delete', 'manager');
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('DELETED');
    expect(registry.has(t.channelId!)).toBe(false);
  });
});
