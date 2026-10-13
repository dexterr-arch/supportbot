import { describe, expect, it } from 'vitest';
import {
  validateRoleAssignment,
  validateSelfRole,
  type RoleAssignmentPolicy,
} from '../../src/discord/role-policy.js';
import { commands } from '../../src/discord/commands.js';
import { PermissionFlagsBits } from 'discord.js';

const valid: RoleAssignmentPolicy = {
  canManageRoles: true,
  isGuildOwner: false,
  actorAboveRole: true,
  actorAboveTarget: true,
  botCanManageRoles: true,
  botAboveRole: true,
  botAboveTarget: true,
  managedRole: false,
  everyoneRole: false,
};
describe('role assignment', () => {
  it('allows authorized staff within both role hierarchies', () => {
    expect(() => validateRoleAssignment(valid)).not.toThrow();
  });
  it.each([
    'canManageRoles',
    'actorAboveRole',
    'actorAboveTarget',
    'botCanManageRoles',
    'botAboveRole',
    'botAboveTarget',
  ] as const)('rejects a missing %s requirement', (key) => {
    expect(() => validateRoleAssignment({ ...valid, [key]: false })).toThrow();
  });
  it.each(['managedRole', 'everyoneRole'] as const)('rejects %s', (key) => {
    expect(() => validateRoleAssignment({ ...valid, [key]: true })).toThrow();
  });
  it('lets the server owner bypass their hierarchy but never the bot hierarchy', () => {
    const owner = { ...valid, isGuildOwner: true, actorAboveRole: false, actorAboveTarget: false };
    expect(() => validateRoleAssignment(owner)).not.toThrow();
    expect(() => validateRoleAssignment({ ...owner, botAboveRole: false })).toThrow();
  });
  it('registers member and role pickers with Manage Roles permission', () => {
    const command = commands.find((c) => c.name === 'addrole')!;
    expect(command.default_member_permissions).toBe(PermissionFlagsBits.ManageRoles.toString());
    expect(command.options!.map((o) => [o.name, o.type])).toEqual([
      ['user', 6],
      ['role', 8],
    ]);
  });
});
describe('self-assignment whitelist', () => {
  const valid = {
    whitelisted: true,
    managedRole: false,
    everyoneRole: false,
    botCanManageRoles: true,
    botAboveRole: true,
  };
  it('allows explicitly approved roles, including staff roles', () => {
    expect(() => validateSelfRole(valid)).not.toThrow();
  });
  it.each(['whitelisted', 'botCanManageRoles', 'botAboveRole'] as const)(
    'blocks a missing %s requirement',
    (key) => {
      expect(() => validateSelfRole({ ...valid, [key]: false })).toThrow();
    },
  );
  it.each(['managedRole', 'everyoneRole'] as const)('blocks %s roles even when approved', (key) => {
    expect(() => validateSelfRole({ ...valid, [key]: true })).toThrow();
  });
  it('lets everyone use selfrole only on themselves and keeps whitelist configuration administrator-only', () => {
    const publicCommand = commands.find((c) => c.name === 'selfrole')!;
    expect(publicCommand.default_member_permissions).toBeUndefined();
    expect(publicCommand.options!.map((o) => [o.name, o.type])).toEqual([['role', 8]]);
    const adminCommand = commands.find((c) => c.name === 'selfroles')!;
    expect(adminCommand.default_member_permissions).toBe('8');
    expect(adminCommand.options!.map((o) => o.name)).toEqual(['allow', 'deny', 'list']);
  });
});
