export type Action =
  | 'view'
  | 'close'
  | 'claim'
  | 'unclaim'
  | 'add'
  | 'remove'
  | 'rename'
  | 'escalate'
  | 'move'
  | 'priority'
  | 'reopen'
  | 'delete'
  | 'transcript';
export interface Actor {
  id: string;
  admin: boolean;
  roles: readonly string[];
}
export function allowed(
  action: Action,
  actor: Actor,
  ticket: { ownerId: string; roleId: string; claimId: string | null },
  managementRoleId: string,
  participants: readonly string[] = [],
) {
  const manager = actor.admin || actor.roles.includes(managementRoleId);
  const staff = manager || actor.roles.includes(ticket.roleId);
  if (action === 'delete' || action === 'escalate') return manager;
  if (action === 'view')
    return staff || actor.id === ticket.ownerId || participants.includes(actor.id);
  if (action === 'close') return staff || actor.id === ticket.ownerId;
  if (action === 'unclaim') return manager || (staff && ticket.claimId === actor.id);
  return staff;
}
export const transitions: Record<string, readonly string[]> = {
  CREATING: ['OPEN'],
  OPEN: ['CLOSING'],
  CLOSING: ['CLOSED'],
  CLOSED: ['REOPENING', 'DELETING'],
  REOPENING: ['OPEN'],
  DELETING: ['DELETED'],
  DELETED: [],
};
export function canTransition(from: string, to: string) {
  return transitions[from]?.includes(to) ?? false;
}
export function channelName(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'ticket'
  );
}
export function activeKey(guildId: string, ownerId: string) {
  return guildId + ':' + ownerId;
}
