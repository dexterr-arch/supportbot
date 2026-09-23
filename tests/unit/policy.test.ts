import { describe, it, expect } from 'vitest';
import {
  allowed,
  channelName,
  canTransition,
  type Action,
  type Actor,
} from '../../src/tickets/policy.js';
import { overwrites, invitePermissions } from '../../src/discord/permissions.js';
import { PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
const ticket = { ownerId: 'owner', roleId: 'support', claimId: 'staff' };
const actor = (id: string, roles: string[] = [], admin = false): Actor => ({ id, roles, admin });
describe('ticket authorization', () => {
  it('owners can close and view, but cannot grant access or delete', () => {
    expect(allowed('close', actor('owner'), ticket, 'management')).toBe(true);
    for (const a of [
      'add',
      'remove',
      'rename',
      'delete',
      'claim',
      'reopen',
      'transcript',
    ] as Action[])
      expect(allowed(a, actor('owner'), ticket, 'management')).toBe(false);
  });
  it('only the assigned staff member or management can release a claim', () => {
    expect(allowed('unclaim', actor('staff', ['support']), ticket, 'management')).toBe(true);
    expect(allowed('unclaim', actor('other', ['support']), ticket, 'management')).toBe(false);
    expect(allowed('unclaim', actor('manager', ['management']), ticket, 'management')).toBe(true);
  });
  it('added members have conversation access, without management powers', () => {
    expect(allowed('view', actor('guest'), ticket, 'management', ['guest'])).toBe(true);
    expect(allowed('close', actor('guest'), ticket, 'management', ['guest'])).toBe(false);
  });
  it('stale support roles cannot manage escalated tickets', () =>
    expect(
      allowed(
        'rename',
        actor('staff', ['support']),
        { ...ticket, roleId: 'management' },
        'management',
      ),
    ).toBe(false));
  it('administrators can manage tickets', () => {
    for (const a of ['claim', 'delete', 'escalate', 'reopen'] as Action[])
      expect(allowed(a, actor('admin', [], true), ticket, 'management')).toBe(true);
  });
});
describe('channel access', () => {
  it('gives Management access to both types without granting Support access to Management', () => {
    const support = overwrites('guild', 'bot', 'owner', 'support', [], false, true, 'management');
    expect(support.map((o) => o.id)).toContain('management');
    const management = overwrites(
      'guild',
      'bot',
      'owner',
      'management',
      [],
      false,
      true,
      'management',
    );
    expect(management.map((o) => o.id)).not.toContain('support');
    expect(management.filter((o) => o.id === 'management')).toHaveLength(1);
  });
  it('allows role notification only through the bot private-channel overwrite', () => {
    const creation = overwrites('guild', 'bot', 'owner', 'support', [], false, false);
    expect(new PermissionsBitField(creation[1]!.allow).has(P.MentionEveryone)).toBe(false);
    const rows = overwrites('guild', 'bot', 'owner', 'support', [], false);
    for (const row of rows)
      expect(new PermissionsBitField(row.allow).has(P.MentionEveryone)).toBe(row.id === 'bot');
    expect(new PermissionsBitField(BigInt(invitePermissions)).has(P.MentionEveryone)).toBe(false);
  });
  it('denies everyone and only grants the intended parties', () => {
    const result = overwrites('guild', 'bot', 'owner', 'support', ['guest', 'owner'], false);
    expect(result.map((o) => o.id)).toEqual(['guild', 'bot', 'support', 'owner', 'guest']);
    expect(new PermissionsBitField(result[0]!.deny).has(P.ViewChannel)).toBe(true);
    expect(new PermissionsBitField(BigInt(invitePermissions)).has(P.Administrator)).toBe(false);
  });
  it('locks every human overwrite including explicit member grants', () => {
    const result = overwrites('guild', 'bot', 'owner', 'support', ['guest'], true);
    for (const row of result.filter((r) => r.id !== 'bot'))
      expect(new PermissionsBitField(row.deny).has(P.SendMessages)).toBe(true);
  });
});
describe('names and lifecycle', () => {
  it.each([
    ['Hello World!!', 'hello-world'],
    ['../../@everyone', 'everyone'],
    ['Čudno ime', 'cudno-ime'],
    ['💥', 'ticket'],
    ['a'.repeat(120), 'a'.repeat(80)],
  ])('sanitizes %s', (input, expected) => expect(channelName(input)).toBe(expected));
  it('requires closure and prevents resurrection after deletion', () => {
    expect(canTransition('OPEN', 'DELETED')).toBe(false);
    expect(canTransition('OPEN', 'CLOSING')).toBe(true);
    expect(canTransition('CLOSED', 'REOPENING')).toBe(true);
    expect(canTransition('DELETED', 'OPEN')).toBe(false);
  });
});
