import { canTransition } from './policy.js';
import { Prisma, type Ticket } from '@prisma/client';
import type { Database } from '../database/client.js';
import { UserError } from '../infrastructure/logger.js';
export async function reserve(db: Database, data: Prisma.TicketCreateInput) {
  try {
    return await db.ticket.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new UserError('You already have an active ticket. Finish it before opening another.');
    throw e;
  }
}
export async function claim(db: Database, t: Ticket, actorId: string, release = false) {
  const result = await db.ticket.updateMany({
    where: { id: t.id, status: 'OPEN', operation: null, claimId: release ? t.claimId : null },
    data: { claimId: release ? null : actorId },
  });
  if (result.count !== 1)
    throw new UserError(
      'This ticket was changed or claimed by someone else. Refresh and try again.',
    );
  await db.auditEvent.create({
    data: { ticketId: t.id, actorId, action: release ? 'unclaim' : 'claim' },
  });
}
export async function begin(
  db: Database,
  t: Ticket,
  action: string,
  actorId: string,
  data: Record<string, string> = {},
  generation = t.generation,
) {
  const status =
    action === 'close'
      ? 'CLOSING'
      : action === 'reopen'
        ? 'REOPENING'
        : action === 'delete'
          ? 'DELETING'
          : t.status;
  const expected = ['reopen', 'delete'].includes(action) ? 'CLOSED' : 'OPEN';
  if (status !== t.status && !canTransition(t.status, status))
    throw new UserError('Invalid ticket state transition.');
  const result = await db.ticket.updateMany({
    where: { id: t.id, status: expected, operation: null, generation },
    data: {
      operation: action,
      operationData: { ...data, actorId },
      status,
      ...(action === 'close'
        ? { closedAt: new Date(), closedBy: actorId, closeReason: data.reason ?? '' }
        : {}),
    },
  });
  if (result.count !== 1)
    throw new UserError('This ticket changed or has work in progress. Refresh and try again.');
}
