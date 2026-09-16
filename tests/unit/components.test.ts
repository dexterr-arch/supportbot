import { describe, it, expect } from 'vitest';
import { MessageFlags } from 'discord.js';
import type { Ticket } from '@prisma/client';
import { defaults, settingsSchema } from '../../src/config/settings.js';
import { panel, ticketPanel, modal } from '../../src/discord/ui.js';
import { commands } from '../../src/discord/commands.js';
const s = settingsSchema.parse(defaults);
function count(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((sum, v) => sum + count(v), 0);
  const v = value as Record<string, unknown>;
  return (
    (typeof v.type === 'number' ? 1 : 0) +
    Object.values(v).reduce<number>((sum, x) => sum + count(x), 0)
  );
}
const t: Ticket = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  number: 1,
  guildId: '1',
  ownerId: '2',
  categoryKey: 'order',
  roleId: '3',
  channelId: '4',
  welcomeMessageId: null,
  subject: 'A new order',
  description: 'Some details',
  details: { service: 'Website', budget: 'Discuss', deadline: 'Next month' },
  status: 'OPEN',
  claimId: null,
  priority: 'normal',
  name: null,
  parentId: '5',
  operation: null,
  operationData: null,
  lastFailureAt: null,
  createdAt: new Date(),
  closedAt: null,
  closedBy: null,
  closeReason: null,
  generation: 0,
  transcriptGeneration: null,
};
describe('Discord component payloads', () => {
  for (const kind of ['order', 'contact'] as const)
    it(kind + ' uses V2, valid builders, no embeds, no automatic mentions', () => {
      const payload = panel(s, kind);
      expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
      const data = payload.components.map((c) => c.toJSON());
      expect(count(data)).toBeLessThanOrEqual(40);
      expect(payload).not.toHaveProperty('embeds');
      expect(payload.allowedMentions.parse).toEqual([]);
      expect(JSON.stringify(data)).toContain('v1:panel:' + kind);
    });
  it('omits optional media when disabled', () => {
    const json = JSON.stringify(
      panel({ ...s, orderBannerUrl: '', footerImageUrl: '' }, 'order').components.map((c) =>
        c.toJSON(),
      ),
    );
    expect(json).not.toContain('"type":12');
  });
  it('renders all persistent ticket controls within limits', () => {
    const data = ticketPanel(s, t).components.map((c) => c.toJSON());
    expect(count(data)).toBeLessThanOrEqual(40);
    for (const action of [
      'claim',
      'unclaim',
      'close',
      'add',
      'remove',
      'rename',
      'escalate',
      'move',
      'priority',
      'transcript',
    ])
      expect(JSON.stringify(data)).toContain('v1:t:' + action + ':' + t.id);
  });
  it('closed controls allow reopening and confirmed deletion', () => {
    const data = JSON.stringify(
      ticketPanel(s, { ...t, status: 'CLOSED' }).components.map((c) => c.toJSON()),
    );
    expect(data).toContain('v1:t:reopen:');
    expect(data).toContain('v1:t:delete:');
    expect(data).not.toContain('v1:t:claim:');
  });
  it('initial notification stays in the container and later updates suppress the role mention', () => {
    const initial = ticketPanel(s, t, true).components[0]!.toJSON();
    expect(initial.components.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(initial).match(/<@&3>/g)).toHaveLength(1);
    expect(JSON.stringify(ticketPanel(s, t).components[0]!.toJSON())).not.toContain('<@&3>');
  });
  it('order modal uses exactly five Label components', () => {
    const m = modal(
      'v1:open:order',
      'New order',
      ['subject', 'description', 'service', 'budget', 'deadline'].map((id) => ({ id, label: id })),
    ).toJSON();
    expect(m.components).toHaveLength(5);
    expect(m.components.every((c) => c.type === 18)).toBe(true);
  });
  it('registers all requested guild slash subcommands', () => {
    const setup = commands.find((c) => c.name === 'setup')!;
    expect(setup.default_member_permissions).toBe('8');
    expect(commands.find((c) => c.name === 'ticket')!.options!.map((o) => o.name)).toEqual([
      'add',
      'remove',
      'rename',
      'close',
      'reopen',
      'delete',
      'info',
      'transcript',
    ]);
  });
  it('keeps worst-case ticket text below a conservative 4000-character budget', () => {
    const longSettings = structuredClone(s);
    longSettings.brandName = '*'.repeat(80);
    longSettings.copy.welcome = 'w'.repeat(500);
    longSettings.copy.privacy = 'p'.repeat(500);
    const payload = ticketPanel(longSettings, {
      ...t,
      subject: '*'.repeat(120),
      description: '*'.repeat(1800),
      details: { service: '*'.repeat(200), budget: '*'.repeat(100), deadline: '*'.repeat(100) },
    }).components.map((c) => c.toJSON());
    function visible(value: unknown): number {
      if (!value || typeof value !== 'object') return 0;
      if (Array.isArray(value)) return value.reduce((sum, v) => sum + visible(v), 0);
      const object = value as Record<string, unknown>;
      return (
        (typeof object.content === 'string' ? object.content.length : 0) +
        (typeof object.label === 'string' ? object.label.length : 0) +
        Object.values(object).reduce<number>((sum, v) => sum + visible(v), 0)
      );
    }
    expect(visible(payload)).toBeLessThan(4000);
    expect(JSON.stringify(payload)).toContain('/ticket info');
  });
});
