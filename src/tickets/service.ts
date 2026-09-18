import { ChannelType, PermissionFlagsBits, type Guild, type TextChannel } from 'discord.js';
import { Prisma, type Ticket } from '@prisma/client';
import type { Database } from '../database/client.js';
import { getSettings, categoryRole } from '../config/settings.js';
import { overwrites, textChannel, validateRouting } from '../discord/permissions.js';
import { ticketPanel } from '../discord/ui.js';
import { archive, verifyArchive } from '../transcripts/service.js';
import { channelName } from './policy.js';
import { reserve, begin } from './repository.js';
import { logger, safeError, UserError } from '../infrastructure/logger.js';
export class TicketService {
  private running = new Set<string>();
  constructor(
    readonly db: Database,
    readonly guild: Guild,
  ) {}
  // Only a confirmed missing channel releases the owner's slot. Permission and
  // network failures must never be mistaken for channel deletion.
  async reconcileMissing(t: Ticket): Promise<boolean> {
    if (!t.channelId || t.status === 'DELETED') return false;
    let channel;
    try {
      channel = await this.guild.channels.fetch(t.channelId, { force: true });
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 10003))
        throw error;
      channel = null;
    }
    if (channel) return false;
    const changed = await this.db.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: t.id, status: t.status, operation: t.operation, generation: t.generation },
        data: {
          status: 'DELETED',
          operation: null,
          operationData: Prisma.DbNull,
          lastFailureAt: null,
        },
      });
      if (result.count)
        await tx.auditEvent.create({
          data: {
            ticketId: t.id,
            actorId: this.guild.client.user.id,
            action: 'channel_missing',
            detail:
              'Discord confirmed the channel was removed. Stored history preserved; no transcript completion assumed.',
          },
        });
      return result.count > 0;
    });
    if (changed)
      logger.warn(
        { ticketId: t.id },
        'Removed stale active-ticket block: channel no longer exists.',
      );
    return changed;
  }
  async activeTicket(ownerId: string) {
    const active = await this.db.ticket.findFirst({
      where: {
        guildId: this.guild.id,
        ownerId,
        status: { in: ['CREATING', 'OPEN', 'CLOSING', 'REOPENING'] },
      },
    });
    if (!active) return null;
    if (!this.running.has(active.id)) await this.reconcileMissing(active);
    return this.db.ticket.findFirst({
      where: {
        guildId: this.guild.id,
        ownerId,
        status: { in: ['CREATING', 'OPEN', 'CLOSING', 'REOPENING'] },
      },
    });
  }
  async open(
    ownerId: string,
    key: string,
    subject: string,
    description: string,
    details: Record<string, string>,
  ) {
    const { settings: s } = await getSettings(this.db, this.guild.id);
    await validateRouting(this.guild, s);
    const category = s.categories.find((c) => c.key === key);
    if (!category) throw new UserError('This category no longer exists. Refresh the panel.');
    const active = await this.activeTicket(ownerId);
    if (active)
      throw new UserError(
        active.status === 'CLOSING'
          ? 'Ticket #' +
              active.number +
              ' is still finishing its transcript and closure. Ask staff to check the private log channel and /bot status. Your ticket history is preserved.'
          : 'Ticket #' +
              active.number +
              ' is still active. Continue there or ask staff to close it. If you cannot see its channel, ask staff to restore access.',
      );
    const t = await reserve(this.db, {
      guildId: this.guild.id,
      ownerId,
      categoryKey: key,
      roleId: categoryRole(s, category),
      subject,
      description,
      details,
      operation: 'create',
      operationData: { actorId: ownerId },
      parentId: category.parentId || s.ticketCategoryId,
    });
    await this.run(t.id);
    return this.db.ticket.findUniqueOrThrow({ where: { id: t.id } });
  }
  async request(
    t: Ticket,
    action: string,
    actorId: string,
    data: Record<string, string> = {},
    generation = t.generation,
  ) {
    if (action === 'escalate' || action === 'priority')
      throw new UserError('This control has been removed.');
    if (action === 'reopen' && t.status === 'DELETED')
      throw new UserError(
        'This ticket was deleted after saving its transcript. Open a new ticket from the support panel.',
      );
    if (action === 'reopen') {
      if (await this.reconcileMissing(t))
        throw new UserError(
          'This ticket channel was deleted, so it cannot be reopened. Open a new Support or Management ticket instead.',
        );
      const active = await this.activeTicket(t.ownerId);
      if (active && active.id !== t.id)
        throw new UserError(
          'The owner already has active ticket #' +
            active.number +
            '. Close it before reopening this ticket.',
        );
    }
    try {
      await begin(this.db, t, action, actorId, data, generation);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new UserError(
          'The owner already has another active ticket. Close it before reopening this one.',
        );
      throw e;
    }
    await this.run(t.id);
  }
  async getChannel(t: Ticket) {
    if (!t.channelId) throw new UserError('Ticket channel is not ready.');
    return textChannel(this.guild, t.channelId);
  }
  async applyAccess(t: Ticket, channel: TextChannel, locked: boolean) {
    const participants = await this.db.participant.findMany({ where: { ticketId: t.id } });
    await channel.permissionOverwrites.set(
      overwrites(
        this.guild.id,
        this.guild.client.user.id,
        t.ownerId,
        t.roleId,
        participants.map((p) => p.userId),
        locked,
      ),
      'Ticket access policy',
    );
  }
  async refresh(id: string) {
    const t = await this.db.ticket.findUniqueOrThrow({ where: { id } });
    if (!t.channelId || !t.welcomeMessageId || t.status === 'DELETED') return;
    const s = (await getSettings(this.db, this.guild.id)).settings;
    const channel = await this.getChannel(t);
    await channel.messages.edit(t.welcomeMessageId, ticketPanel(s, t));
  }
  private async finish(t: Ticket, actorId: string, status?: string) {
    await this.db.$transaction([
      this.db.ticket.update({
        where: { id: t.id },
        data: {
          operation: null,
          operationData: Prisma.DbNull,
          lastFailureAt: null,
          ...(status ? { status } : {}),
        },
      }),
      this.db.auditEvent.create({
        data: { ticketId: t.id, actorId, action: t.operation ?? 'unknown' },
      }),
    ]);
    await this.refresh(t.id).catch((e) =>
      logger.warn(
        { ticketId: t.id, ...safeError(e) },
        'Ticket display refresh failed; actions still check database state.',
      ),
    );
  }
  async run(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      let t = await this.db.ticket.findUniqueOrThrow({ where: { id } });
      if (!t.operation) return;
      if (await this.reconcileMissing(t)) return;
      const s = (await getSettings(this.db, this.guild.id)).settings;
      const op = (t.operationData ?? {}) as Record<string, string>;
      const actorId = op.actorId ?? this.guild.client.user.id;
      if (t.operation === 'create') {
        let channel: TextChannel;
        if (t.channelId) channel = await this.getChannel(t);
        else {
          const all = await this.guild.channels.fetch();
          const candidates = all.filter(
            (c) => c?.type === ChannelType.GuildText && c.topic === 'support-ticket:' + t.id,
          );
          if (candidates.size > 1)
            throw new Error('Multiple matching ticket channels need administrator review.');
          const existing = candidates.first();
          channel =
            existing?.type === ChannelType.GuildText
              ? existing
              : await this.guild.channels.create({
                  name: 'ticket-' + t.number + '-' + channelName(t.subject).slice(0, 40),
                  type: ChannelType.GuildText,
                  parent: t.parentId!,
                  topic: 'support-ticket:' + t.id,
                  permissionOverwrites: overwrites(
                    this.guild.id,
                    this.guild.client.user.id,
                    t.ownerId,
                    t.roleId,
                    [],
                    false,
                    false,
                  ),
                  reason: 'Create support ticket #' + t.number,
                });
          t = await this.db.ticket.update({ where: { id }, data: { channelId: channel.id } });
        }
        // Notification permission is added after creation, using the bot channel overwrite.
        await this.applyAccess(t, channel, false);
        if (!t.welcomeMessageId) {
          // Search after ambiguous delivery before sending again. The channel is new and private.
          const recent = await channel.messages.fetch({ limit: 100 });
          const previous = recent.find(
            (m) =>
              m.author.id === this.guild.client.user.id &&
              JSON.stringify(m.components).includes(t.id),
          );
          if (previous)
            await this.db.ticket.update({ where: { id }, data: { welcomeMessageId: previous.id } });
          else {
            const payload = ticketPanel(s, { ...t, status: 'OPEN', operation: null });
            const sent = await channel.send({
              ...payload,
              nonce: String(t.number),
              enforceNonce: true,
            });
            await this.db.ticket.update({ where: { id }, data: { welcomeMessageId: sent.id } });
          }
        }
        await this.notifyOpening(t, channel);
        await this.finish(t, actorId, 'OPEN');
        return;
      }
      const channel = await this.getChannel(t).catch(async (e) => {
        if (t.operation === 'delete' && t.channelId) {
          const exists = await this.guild.channels.fetch(t.channelId);
          if (!exists) return null;
        }
        throw e;
      });
      if (t.operation === 'close') {
        if (!channel) throw new Error('Channel unavailable.');
        await this.applyAccess(t, channel, true);
        await archive(this.db, this.guild, channel, t, s, op.reason ?? '', actorId);
        const saved = await this.db.ticket.findUniqueOrThrow({ where: { id } });
        await verifyArchive(this.db, this.guild, saved);
        await channel.delete('Ticket closed; transcript verified. Requested by ' + actorId);
        await this.finish(t, actorId, 'DELETED');
      } else if (t.operation === 'delete') {
        // Always recheck durable uploads; never delete after an upload failure.
        await verifyArchive(this.db, this.guild, t);
        if (channel) await channel.delete('Confirmed ticket deletion by ' + actorId);
        await this.finish(t, actorId, 'DELETED');
      } else if (t.operation === 'reopen') {
        if (!channel) throw new Error('Channel unavailable.');
        if (channel.parentId !== t.parentId)
          await channel.setParent(t.parentId || s.ticketCategoryId, { lockPermissions: false });
        await this.applyAccess(t, channel, false);
        // Clear operation and advance generation in one transaction so recovery cannot increment twice.
        await this.db.$transaction([
          this.db.ticket.update({
            where: { id },
            data: {
              status: 'OPEN',
              operation: null,
              operationData: Prisma.DbNull,
              generation: { increment: 1 },
              closedAt: null,
              closedBy: null,
              closeReason: null,
              transcriptGeneration: null,
              lastFailureAt: null,
            },
          }),
          this.db.auditEvent.create({ data: { ticketId: id, actorId, action: 'reopen' } }),
        ]);
        await this.refresh(id);
      } else {
        if (!channel) throw new Error('Channel unavailable.');
        switch (t.operation) {
          case 'add': {
            const target = await this.guild.members.fetch(op.member!);
            if (target.user.bot) throw new UserError('Bot accounts cannot be ticket participants.');
            const count = await this.db.participant.count({ where: { ticketId: id } });
            if (
              count >= 80 &&
              !(await this.db.participant.findUnique({
                where: { ticketId_userId: { ticketId: id, userId: target.id } },
              }))
            )
              throw new UserError('This ticket has reached its participant limit.');
            await this.db.participant.upsert({
              where: { ticketId_userId: { ticketId: id, userId: target.id } },
              create: { ticketId: id, userId: target.id },
              update: {},
            });
            await this.applyAccess(t, channel, false);
            break;
          }
          case 'remove':
            await this.db.participant.deleteMany({ where: { ticketId: id, userId: op.member! } });
            await this.applyAccess(t, channel, false);
            break;
          case 'rename':
            await channel.setName(channelName(op.name!));
            await this.db.ticket.update({ where: { id }, data: { name: channelName(op.name!) } });
            break;
          case 'escalate': {
            const cat = s.categories.find((c) => c.key === 'management');
            const parentId = cat?.parentId || s.ticketCategoryId;
            t = await this.db.ticket.update({
              where: { id },
              data: {
                roleId: s.managementRoleId,
                categoryKey: cat?.key ?? 'management',
                parentId,
                claimId: null,
              },
            });
            if (channel.parentId !== parentId)
              await channel.setParent(parentId, { lockPermissions: false });
            await this.applyAccess(t, channel, false);
            break;
          }
          case 'move': {
            const parent = await this.guild.channels.fetch(op.parent!);
            if (
              parent?.type !== ChannelType.GuildCategory ||
              !parent
                .permissionsFor(this.guild.members.me!)
                ?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            )
              throw new UserError('Choose a category the bot can manage.');
            await channel.setParent(parent.id, { lockPermissions: false });
            await this.db.ticket.update({ where: { id }, data: { parentId: parent.id } });
            await this.applyAccess(t, channel, false);
            break;
          }
          case 'priority':
            if (!['low', 'normal', 'high', 'urgent'].includes(op.priority!))
              throw new UserError('Invalid priority.');
            await this.db.ticket.update({ where: { id }, data: { priority: op.priority } });
            break;
          default:
            throw new Error('Unknown persisted operation.');
        }
        await this.finish(t, actorId);
      }
    } catch (e) {
      await this.db.ticket
        .updateMany({
          where: { id, operation: { not: null } },
          data: { lastFailureAt: new Date() },
        })
        .catch(() => undefined);
      logger.error(
        { ticketId: id, ...safeError(e) },
        'Ticket operation paused; recovery will retry. Channel preserved.',
      );
      throw new UserError(
        'The operation could not finish. The channel is preserved and recovery will retry. Ask an administrator to check /bot status, permissions, and logs.',
      );
    } finally {
      this.running.delete(id);
    }
  }
  async notifyOpening(t: Ticket, channel: TextChannel) {
    const action = 'opening_notification';
    const { settings } = await getSettings(this.db, this.guild.id);
    const notificationRoleId = settings.supportRoleId;
    if (await this.db.auditEvent.findFirst({ where: { ticketId: t.id, action } })) return;
    const content =
      '<@&' +
      notificationRoleId +
      '> <@' +
      t.ownerId +
      '>\nTicket #' +
      t.number +
      ' is ready for staff.';
    // Recover an acknowledged or ambiguously delivered message without re-pinging.
    let before: string | undefined;
    let messageId: string | undefined;
    for (;;) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      const previous = batch.find(
        (m) => m.author.id === this.guild.client.user.id && m.content === content,
      );
      if (previous) {
        messageId = previous.id;
        break;
      }
      if (!batch.size) break;
      const oldest = batch.last()!.id;
      if (oldest === before) throw new Error('Notification recovery pagination did not advance.');
      before = oldest;
    }
    if (!messageId) {
      const sent = await channel.send({
        content,
        allowedMentions: {
          parse: [],
          roles: [notificationRoleId],
          users: [t.ownerId],
          repliedUser: false,
        },
        nonce: 'notify-' + t.number,
        enforceNonce: true,
      });
      messageId = sent.id;
    }
    await this.db.auditEvent.create({
      data: {
        ticketId: t.id,
        actorId: this.guild.client.user.id,
        action,
        detail: messageId,
      },
    });
  }
  async recover() {
    const pending = await this.db.ticket.findMany({
      where: { guildId: this.guild.id, operation: { not: null } },
      orderBy: [{ lastFailureAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      take: 100,
    });
    for (const t of pending) await this.run(t.id).catch(() => undefined);
    await this.db.confirmation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
  async reconcileActiveChannels() {
    const tickets = await this.db.ticket.findMany({
      where: { guildId: this.guild.id, status: 'OPEN', channelId: { not: null } },
      take: 500,
    });
    for (const ticket of tickets) {
      if (this.running.has(ticket.id)) continue;
      await this.reconcileMissing(ticket)
        .then(async (missing) => {
          if (!missing) await this.refresh(ticket.id);
        })
        .catch((error) =>
          logger.warn(
            { ticketId: ticket.id, ...safeError(error) },
            'Could not verify ticket channel; record retained.',
          ),
        );
    }
  }
  get activeOperations() {
    return this.running.size;
  }
}
