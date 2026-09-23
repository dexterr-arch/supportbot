import { describe, expect, it } from 'vitest';
import {
  validateRoleAssignment,
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
