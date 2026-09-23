import { UserError } from '../infrastructure/logger.js';

export interface RoleAssignmentPolicy {
  canManageRoles: boolean;
  isGuildOwner: boolean;
  actorAboveRole: boolean;
  actorAboveTarget: boolean;
  botCanManageRoles: boolean;
  botAboveRole: boolean;
  botAboveTarget: boolean;
  managedRole: boolean;
  everyoneRole: boolean;
}

export function validateRoleAssignment(p: RoleAssignmentPolicy) {
  if (!p.canManageRoles) throw new UserError('You need Manage Roles to use /addrole.');
  if (p.managedRole || p.everyoneRole)
    throw new UserError('The @everyone role and integration-managed roles cannot be added.');
  if (!p.isGuildOwner && (!p.actorAboveRole || !p.actorAboveTarget))
    throw new UserError('Your highest role must be above the selected role and member.');
  if (!p.botCanManageRoles || !p.botAboveRole || !p.botAboveTarget)
    throw new UserError(
      'Give the bot Manage Roles and move its role above the selected role and member.',
    );
}
