import {
  ChannelType,
  PermissionFlagsBits as P,
  type Guild,
  type OverwriteResolvable,
  type TextChannel,
} from 'discord.js';
import type { Settings } from '../config/settings.js';
import { categoryRole } from '../config/settings.js';
import { UserError } from '../infrastructure/logger.js';
export const botPermissions = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.EmbedLinks,
  P.AttachFiles,
  P.ManageChannels,
  P.ManageRoles,
];
export const invitePermissions = botPermissions.reduce((a, b) => a | b, 0n).toString();
export const conversation = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.AttachFiles,
  P.EmbedLinks,
];
const writePermissions = [
  P.SendMessages,
  P.AddReactions,
  P.CreatePublicThreads,
  P.CreatePrivateThreads,
  P.SendMessagesInThreads,
  P.SendVoiceMessages,
  P.SendPolls,
];
export function overwrites(
  guildId: string,
  botId: string,
  ownerId: string,
  roleId: string,
  members: readonly string[],
  locked: boolean,
  notifyRole = true,
): OverwriteResolvable[] {
  const people = [...new Set([ownerId, ...members])].filter((id) => id !== botId);
  return [
    { id: guildId, type: 0, deny: [P.ViewChannel, ...writePermissions] },
    {
      id: botId,
      type: 1,
      allow: notifyRole ? [...botPermissions, P.MentionEveryone] : botPermissions,
    },
    {
      id: roleId,
      type: 0,
      allow: locked ? [P.ViewChannel, P.ReadMessageHistory] : conversation,
      deny: locked ? writePermissions : [],
    },
    ...people.map((id) => ({
      id,
      type: 1 as const,
      allow: locked ? [P.ViewChannel, P.ReadMessageHistory] : conversation,
      deny: locked ? writePermissions : [],
    })),
  ];
}
export async function textChannel(guild: Guild, id: string) {
  const c = await guild.channels.fetch(id);
  if (!c || c.type !== ChannelType.GuildText)
    throw new UserError('Configure a standard server text channel.');
  return c;
}
export async function validateLog(guild: Guild, s: Settings): Promise<TextChannel> {
  const log = await textChannel(guild, s.transcriptLogChannelId);
  await guild.roles.fetch();
  const staff = new Set([
    s.supportRoleId,
    s.managementRoleId,
    ...s.categories.map((c) => categoryRole(s, c)),
  ]);
  for (const role of guild.roles.cache.values()) {
    if (
      role.permissions.has(P.Administrator) ||
      staff.has(role.id) ||
      role.tags?.botId === guild.client.user.id
    )
      continue;
    if (log.permissionsFor(role)?.has(P.ViewChannel))
      throw new UserError(
        'The transcript channel must be private to configured staff roles and the bot.',
      );
  }
  for (const overwrite of log.permissionOverwrites.cache.values()) {
    if (
      overwrite.type !== 1 ||
      overwrite.id === guild.client.user.id ||
      !overwrite.allow.has(P.ViewChannel)
    )
      continue;
    const member = await guild.members.fetch(overwrite.id).catch(() => null);
    if (
      !member ||
      (!member.permissions.has(P.Administrator) && !member.roles.cache.some((r) => staff.has(r.id)))
    )
      throw new UserError('Remove non-staff member access from the transcript log channel.');
  }
  if (
    !log
      .permissionsFor(guild.members.me!)
      ?.has([P.ViewChannel, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory])
  )
    throw new UserError('The bot cannot write transcripts in the configured log channel.');
  return log;
}
export async function validateRouting(guild: Guild, s: Settings) {
  for (const key of [
    'supportRoleId',
    'managementRoleId',
    'ticketCategoryId',
    'transcriptLogChannelId',
    'panelChannelId',
  ] as const)
    if (!s[key]) throw new UserError('Configure ' + key + ' using /setup settings first.');
  for (const roleId of new Set([
    s.supportRoleId,
    s.managementRoleId,
    ...s.categories.map((c) => categoryRole(s, c)),
  ])) {
    const role = await guild.roles.fetch(roleId);
    if (!role || role.id === guild.id || role.managed || role.permissions.has(P.Administrator))
      throw new UserError('Support roles must be existing, non-managed, non-administrator roles.');
  }
  for (const id of new Set([
    s.ticketCategoryId,
    ...s.categories.map((c) => c.parentId).filter(Boolean),
  ])) {
    const c = await guild.channels.fetch(id);
    if (!c || c.type !== ChannelType.GuildCategory)
      throw new UserError('Ticket and archive destinations must be server categories.');
    if (!c.permissionsFor(guild.members.me!)?.has(botPermissions))
      throw new UserError(
        'Grant the bot its required permissions in ticket and archive categories.',
      );
  }
  await validateLog(guild, s);
  const panel = await textChannel(guild, s.panelChannelId);
  if (
    !panel
      .permissionsFor(guild.members.me!)
      ?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks])
  )
    throw new UserError('The bot needs permission to post panels.');
  if (s.contactChannelId) await textChannel(guild, s.contactChannelId);
}
