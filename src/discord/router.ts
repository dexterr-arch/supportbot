import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type Interaction,
  type RepliableInteraction,
} from 'discord.js';
import { z } from 'zod';
import type { Ticket } from '@prisma/client';
import type { Database } from '../database/client.js';
import { getSettings, type Settings } from '../config/settings.js';
import { idSchema } from '../config/env.js';
import { TicketService } from '../tickets/service.js';
import { allowed, type Action, type Actor } from '../tickets/policy.js';
import { claim } from '../tickets/repository.js';
import { logger, safeError, UserError } from '../infrastructure/logger.js';
import { confirmation, modal, noMentions } from './ui.js';
import {
  fieldsMenu,
  settingsMenu,
  settingsModal,
  saveSetting,
  publishPanels,
  privateReply,
  setupButtons,
} from './settings-ui.js';
import { collect } from '../transcripts/service.js';
import { renderParts } from '../transcripts/html.js';
import { validateRoleAssignment } from './role-policy.js';
export class Router {
  private cooldowns = new Map<string, number>();
  private publishing = false;
  constructor(
    readonly db: Database,
    readonly service: TicketService,
  ) {}
  async handle(i: Interaction) {
    if (!i.isRepliable()) return;
    try {
      if (!i.inGuild() || i.guildId !== this.service.guild.id)
        throw new UserError('Use this bot in its configured server.');
      const { settings: s } = await getSettings(this.db, i.guildId);
      const now = Date.now();
      const key = i.user.id;
      const setupInteraction =
        (i.isChatInputCommand() && i.commandName === 'setup') ||
        ('customId' in i && /^(v1:settings:|v1:config:)/.test(i.customId));
      if (!setupInteraction && (this.cooldowns.get(key) ?? 0) > now)
        throw new UserError('Please wait a few seconds before trying again.');
      if (!setupInteraction) this.cooldowns.set(key, now + s.cooldownSeconds * 1000);
      if (this.cooldowns.size > 5000)
        for (const [id, expiry] of this.cooldowns) if (expiry < now) this.cooldowns.delete(id);
      const member = await this.service.guild.members.fetch({ user: i.user.id, force: true });
      const actor: Actor = {
        id: i.user.id,
        admin: member.permissions.has(PermissionFlagsBits.Administrator),
        roles: [...member.roles.cache.keys()],
      };
      if (i.isChatInputCommand()) {
        if (i.commandName === 'addrole') {
          await i.deferReply({ flags: MessageFlags.Ephemeral });
          const guild = this.service.guild;
          const target = await guild.members.fetch({
            user: i.options.getUser('user', true).id,
            force: true,
          });
          const role = await guild.roles.fetch(i.options.getRole('role', true).id);
          if (!role) throw new UserError('That role no longer exists.');
          const me = await guild.members.fetchMe({ force: true });
          validateRoleAssignment({
            canManageRoles: member.permissions.has(PermissionFlagsBits.ManageRoles),
            isGuildOwner: member.id === guild.ownerId,
            actorAboveRole: member.roles.highest.comparePositionTo(role) > 0,
            actorAboveTarget:
              target.id !== guild.ownerId &&
              member.roles.highest.comparePositionTo(target.roles.highest) > 0,
            botCanManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
            botAboveRole: me.roles.highest.comparePositionTo(role) > 0,
            botAboveTarget:
              target.id !== guild.ownerId &&
              me.roles.highest.comparePositionTo(target.roles.highest) > 0,
            managedRole: role.managed,
            everyoneRole: role.id === guild.id,
          });
          if (target.roles.cache.has(role.id)) {
            await privateReply(i, 'This member already has that role.');
            return;
          }
          await target.roles.add(role, '/addrole requested by ' + member.id);
          logger.info(
            { actorId: member.id, targetId: target.id, roleId: role.id },
            'Member role added.',
          );
          await privateReply(i, 'Added <@&' + role.id + '> to <@' + target.id + '>.');
          return;
        }
        if (i.commandName === 'setup') {
          this.admin(actor);
          if (i.options.getSubcommand() === 'settings') {
            await i.reply({ ...settingsMenu(s), flags: MessageFlags.Ephemeral });
            return;
          }
          await i.deferReply({ flags: MessageFlags.Ephemeral });
          if (this.publishing) throw new UserError('Panel publishing is already running.');
          this.publishing = true;
          try {
            await publishPanels(this.db, this.service.guild);
          } finally {
            this.publishing = false;
          }
          await privateReply(i, 'The Support and Management panel is ready.');
          return;
        }
        if (i.commandName === 'bot') {
          await i.deferReply({ flags: MessageFlags.Ephemeral });
          await this.db.$queryRaw`SELECT 1`;
          const pending = actor.admin
            ? await this.db.ticket.count({
                where: { guildId: i.guildId, operation: { not: null } },
              })
            : null;
          await privateReply(
            i,
            'Gateway: ' +
              (i.client.isReady() ? 'connected' : 'reconnecting') +
              '\nDatabase: connected\nUptime: ' +
              Math.floor(process.uptime()) +
              ' seconds' +
              (pending !== null ? '\nPending operations: ' + pending : ''),
          );
          return;
        }
        if (i.commandName === 'ticket') {
          const t = await this.ticket(i);
          const action = i.options.getSubcommand();
          const value =
            action === 'add' || action === 'remove'
              ? i.options.getUser('member', true).id
              : action === 'rename'
                ? i.options.getString('name', true)
                : action === 'close'
                  ? (i.options.getString('reason') ?? '')
                  : '';
          await this.action(i, t, action, actor, s, value);
          return;
        }
        throw new UserError('Unknown command. Register this version’s commands.');
      }
      if (i.isStringSelectMenu() && i.customId === 'v1:panel:order')
        throw new UserError('Ordering is disabled. Use the Support or Management ticket menu.');
      if (i.isStringSelectMenu() && i.customId === 'v1:panel:contact') {
        const c = s.categories.find((c) => c.key === i.values[0]);
        if (!c) throw new UserError('This category is no longer available.');
        // Duplicate/channel checks run after modal submission, when the reply
        // can be deferred safely while Discord verifies the old channel.
        await i.showModal(
          modal('v1:open:' + c.key, 'Open ' + c.label, [
            { id: 'subject', label: s.copy.subject, max: 120 },
            { id: 'description', label: s.copy.description, long: true, max: 1800 },
            ...(c.order
              ? [
                  { id: 'service', label: s.copy.service, max: 200 },
                  { id: 'budget', label: s.copy.budget, max: 100 },
                  { id: 'deadline', label: s.copy.deadline, max: 100 },
                ]
              : []),
          ]),
        );
        return;
      }
      if (i.isModalSubmit() && i.customId.startsWith('v1:open:')) {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const c = s.categories.find((c) => c.key === i.customId.slice(8));
        if (!c) throw new UserError('Category no longer available.');
        const details: Record<string, string> = {};
        for (const key of c.order ? ['service', 'budget', 'deadline'] : [])
          details[key] = z
            .string()
            .trim()
            .min(1)
            .max(key === 'service' ? 200 : 100)
            .parse(i.fields.getTextInputValue(key));
        const t = await this.service.open(
          i.user.id,
          c.key,
          z.string().trim().min(1).max(120).parse(i.fields.getTextInputValue('subject')),
          z.string().trim().min(1).max(1800).parse(i.fields.getTextInputValue('description')),
          details,
        );
        await privateReply(i, 'Your ticket is ready: <#' + t.channelId + '>');
        return;
      }
      if (
        (i.isStringSelectMenu() || i.isModalSubmit() || i.isButton()) &&
        /^(v1:settings:|v1:config:)/.test(i.customId)
      ) {
        this.admin(actor);
        if (i.isButton()) {
          if (i.customId === 'v1:settings:home') {
            await i.update(settingsMenu(s));
            return;
          }
          if (i.customId === 'v1:settings:publish') {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            if (this.publishing) throw new UserError('The panel is already being refreshed.');
            this.publishing = true;
            try {
              await publishPanels(this.db, this.service.guild);
            } finally {
              this.publishing = false;
            }
            await i.editReply({
              content:
                '✅ Your Support and Management panel is ready in <#' + s.panelChannelId + '>.',
              components: [setupButtons()],
              allowedMentions: noMentions,
            });
            return;
          }
          throw new UserError('Open /setup settings to get the current setup menu.');
        }
        if (i.isStringSelectMenu() && i.customId === 'v1:settings:group') {
          await i.update(await fieldsMenu(this.db, i.guildId, i.values[0]!));
          return;
        }
        if (i.isStringSelectMenu() && i.customId === 'v1:settings:field') {
          await i.showModal(await settingsModal(this.db, i.guildId, i.values[0]!));
          return;
        }
        if (i.isModalSubmit()) {
          const pieces = i.customId.split(':');
          await i.deferReply({ flags: MessageFlags.Ephemeral });
          await saveSetting(this.db, i, Number(pieces[2]), pieces[3]!);
          await i.editReply({
            content:
              '✅ Saved. Choose **Setup home** to continue, or **Post / refresh panel** to update what members see.',
            components: [setupButtons()],
            allowedMentions: noMentions,
          });
          return;
        }
      }
      if (i.isButton() && /^v1:(confirm|cancel):/.test(i.customId)) {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const id = i.customId.split(':')[2]!;
        const pending = await this.db.confirmation.findUnique({ where: { id } });
        if (!pending || pending.userId !== i.user.id || pending.expiresAt.getTime() < now)
          throw new UserError('This confirmation expired or belongs to another member.');
        const t = await this.ticket(i, pending.ticketId);
        await this.authorize(pending.action as Action, actor, t, s);
        const removed = await this.db.confirmation.deleteMany({
          where: { id, userId: i.user.id, expiresAt: { gt: new Date() } },
        });
        if (!removed.count) throw new UserError('This confirmation was already used.');
        if (i.customId.startsWith('v1:cancel:')) {
          await privateReply(i, 'Cancelled.');
          return;
        }
        await this.service.request(
          t,
          pending.action,
          actor.id,
          { reason: pending.reason ?? '' },
          pending.generation,
        );
        if (pending.action !== 'delete')
          await privateReply(i, 'Ticket ' + pending.action + ' completed.');
        else
          await i.editReply({ content: 'Ticket deleted.', components: [] }).catch(() => undefined);
        return;
      }
      if (i.isButton() && i.customId.startsWith('v1:t:')) {
        const [, , action, id] = i.customId.split(':');
        const t = await this.ticket(i, id);
        await this.action(i, t, action!, actor, s);
        return;
      }
      if (i.isModalSubmit() && i.customId.startsWith('v1:edit:')) {
        const [, , , action, id] = i.customId.split(':'); // v1:edit:form:action:id
        const t = await this.ticket(i, id);
        await this.action(i, t, action!, actor, s, i.fields.getTextInputValue('value'));
        return;
      }
      if (
        (i.isStringSelectMenu() || i.isChannelSelectMenu()) &&
        i.customId.startsWith('v1:choice:')
      ) {
        const [, , action, id] = i.customId.split(':');
        const t = await this.ticket(i, id);
        await this.action(i, t, action!, actor, s, i.values[0]!);
        return;
      }
      throw new UserError(
        'This control is no longer supported. Use a current panel or slash command.',
      );
    } catch (e) {
      logger.warn({ interactionId: i.id, ...safeError(e) }, 'Interaction failed.');
      await privateReply(
        i,
        e instanceof UserError
          ? e.message
          : e instanceof z.ZodError
            ? 'Invalid input. Check the field length and format.'
            : 'The request failed. Please try again or ask an administrator to check permissions and logs.',
      ).catch(() => undefined);
    }
  }
  private admin(actor: Actor) {
    if (!actor.admin)
      throw new UserError('Only server administrators can change settings and panels.');
  }
  private async ticket(i: RepliableInteraction, id?: string) {
    const t = id
      ? await this.db.ticket.findUnique({ where: { id } })
      : await this.db.ticket.findUnique({ where: { channelId: i.channelId ?? '' } });
    if (!t || t.guildId !== i.guildId || t.channelId !== i.channelId || t.status === 'DELETED')
      throw new UserError('Use this action inside its ticket channel.');
    return t;
  }
  private async authorize(action: Action, actor: Actor, t: Ticket, s: Settings) {
    const members = await this.db.participant.findMany({ where: { ticketId: t.id } });
    if (
      !allowed(
        action,
        actor,
        t,
        s.managementRoleId,
        members.map((p) => p.userId),
      )
    )
      throw new UserError('You do not have permission to perform this ticket action.');
  }
  private async action(
    i: RepliableInteraction,
    t: Ticket,
    action: string,
    actor: Actor,
    s: Settings,
    value?: string,
  ) {
    if (
      ![
        'info',
        'close',
        'delete',
        'reopen',
        'claim',
        'unclaim',
        'add',
        'remove',
        'rename',
        'transcript',
      ].includes(action)
    )
      throw new UserError('Unknown ticket action.');
    await this.authorize(action === 'info' ? 'view' : (action as Action), actor, t, s);
    if (action === 'info') {
      await i.reply({
        embeds: [
          {
            title: 'Ticket #' + t.number + ' · ' + t.subject,
            description: t.description,
            color: parseInt(s.accentColor.slice(1), 16),
            fields: [
              { name: 'Owner', value: '<@' + t.ownerId + '>' },
              {
                name: 'Category / status',
                value: t.categoryKey + ' / ' + t.status,
              },
              { name: 'Claimed', value: t.claimId ? '<@' + t.claimId + '>' : 'Unclaimed' },
              { name: 'Opened', value: t.createdAt.toISOString() },
              { name: 'Operation', value: t.operation ?? 'none' },
              ...Object.entries(t.details as Record<string, string>).map(([name, value]) => ({
                name,
                value: value || 'Not specified',
              })),
            ],
          },
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions,
      });
      return;
    }
    if (t.operation)
      throw new UserError(
        'This ticket has an operation in progress. Recovery retries interrupted operations automatically.',
      );
    const expected = ['reopen', 'delete'].includes(action)
      ? 'CLOSED'
      : action === 'transcript'
        ? t.status
        : 'OPEN';
    if (t.status !== expected || !['OPEN', 'CLOSED'].includes(t.status))
      throw new UserError('This action is not available in the current ticket state.');
    if (
      ['add', 'remove', 'rename', 'close'].includes(action) &&
      value === undefined &&
      (i.isButton() || i.isChatInputCommand())
    ) {
      await i.showModal(
        modal('v1:edit:form:' + action + ':' + t.id, s.copy[action as keyof Settings['copy']], [
          {
            id: 'value',
            label:
              action === 'close'
                ? 'Closing reason (optional)'
                : action === 'rename'
                  ? 'New channel name'
                  : 'Member ID',
            long: action === 'close',
            required: action !== 'close',
            max: action === 'close' ? 1000 : action === 'rename' ? 80 : 20,
          },
        ]),
      );
      return;
    }
    if ((action === 'priority' || action === 'move') && value === undefined) {
      const row =
        action === 'priority'
          ? new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('v1:choice:priority:' + t.id)
                .setPlaceholder('Choose priority')
                .addOptions(
                  ['low', 'normal', 'high', 'urgent'].map((v) => ({ label: v, value: v })),
                ),
            )
          : new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId('v1:choice:move:' + t.id)
                .setPlaceholder('Choose destination category')
                .addChannelTypes(ChannelType.GuildCategory),
            );
      await i.reply({
        content: 'Choose an option.',
        components: [row],
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions,
      });
      return;
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (action === 'close' || action === 'delete') {
      const reason = z
        .string()
        .max(1000)
        .parse(value ?? '');
      const pending = await this.db.confirmation.create({
        data: {
          ticketId: t.id,
          userId: i.user.id,
          action,
          generation: t.generation,
          reason,
          expiresAt: new Date(Date.now() + 120_000),
        },
      });
      await i.editReply({
        content:
          action === 'delete'
            ? 'Permanently delete this channel? Its transcript must still exist in the private log. This confirmation expires in two minutes.'
            : 'Save the transcript to the private staff log and permanently delete this ticket channel? You cannot reopen it. If saving fails, the channel is kept. This confirmation expires in two minutes.',
        components: [confirmation(pending.id, action)],
        allowedMentions: noMentions,
      });
      return;
    }
    if (action === 'claim' || action === 'unclaim') {
      await claim(this.db, t, actor.id, action === 'unclaim');
      await this.service.refresh(t.id);
    } else if (action === 'transcript') {
      const channel = await this.service.getChannel(t);
      const html = renderParts('Ticket #' + t.number, await collect(channel));
      for (let n = 0; n < html.length; n++)
        await i.followUp({
          content: 'Private transcript ' + (n + 1) + '/' + html.length,
          files: [
            new AttachmentBuilder(Buffer.from(html[n]!, 'utf8'), {
              name: 'ticket-' + t.number + '-' + (n + 1) + '.html',
            }),
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: noMentions,
        });
    } else {
      const data: Record<string, string> = {};
      if (action === 'add' || action === 'remove') {
        const memberId = idSchema.parse(value);
        const member = await this.service.guild.members.fetch(memberId);
        if (member.user.bot || memberId === t.ownerId)
          throw new UserError('Choose a human member other than the ticket owner.');
        if (
          action === 'add' &&
          (await this.db.participant.count({ where: { ticketId: t.id } })) >= 80
        )
          throw new UserError('Participant limit reached.');
        if (
          action === 'remove' &&
          (member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.roles.cache.has(t.roleId))
        )
          throw new UserError(
            'Staff access comes from their role; removing a participant cannot revoke it.',
          );
        data.member = memberId;
      } else if (action === 'rename') data.name = z.string().trim().min(1).max(80).parse(value);
      else if (action === 'priority')
        data.priority = z.enum(['low', 'normal', 'high', 'urgent']).parse(value);
      else if (action === 'move') data.parent = idSchema.parse(value);
      if (action === 'escalate' && !s.managementRoleId)
        throw new UserError('Configure a management role first.');
      await this.service.request(t, action, actor.id, data);
    }
    await privateReply(i, 'Ticket ' + action + ' completed.');
  }
}
