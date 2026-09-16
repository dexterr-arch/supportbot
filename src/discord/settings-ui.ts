import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type Guild,
  type RepliableInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Database } from '../database/client.js';
import { getSettings, settingsSchema, categorySchema, type Settings } from '../config/settings.js';
import { modal, noMentions, panel } from './ui.js';
import { UserError } from '../infrastructure/logger.js';
import { validateRouting, validateLog } from './permissions.js';
export const groups: Record<string, string[]> = {
  identity: ['brandName', 'accentColor', 'cooldownSeconds'],
  routing: [
    'supportRoleId',
    'managementRoleId',
    'ticketCategoryId',
    'archiveCategoryId',
    'transcriptLogChannelId',
    'panelChannelId',
    'contactChannelId',
  ],
  images: ['orderBannerUrl', 'contactBannerUrl', 'footerImageUrl'],
  information: ['terms', 'pricing', 'faq'],
  panels: [
    'orderTitle',
    'contactTitle',
    'orderIntro',
    'contactIntro',
    'contactLink',
    'learnMore',
    'chooseCategory',
    'termsLabel',
    'pricingLabel',
    'faqLabel',
    'welcome',
    'privacy',
  ].map((k) => 'copy.' + k),
  controls: [
    'claim',
    'unclaim',
    'close',
    'add',
    'remove',
    'rename',
    'escalate',
    'move',
    'priority',
    'reopen',
    'delete',
    'transcript',
    'subject',
    'description',
    'service',
    'budget',
    'deadline',
  ].map((k) => 'copy.' + k),
};
export function settingsMenu() {
  return {
    content:
      'Choose settings to edit. Changes are saved in PostgreSQL. Run /setup panels afterward to refresh public panels.',
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('v1:settings:group')
          .setPlaceholder('Settings section')
          .addOptions([...Object.keys(groups), 'categories'].map((k) => ({ label: k, value: k }))),
      ),
    ],
    allowedMentions: noMentions,
  };
}
export async function fieldsMenu(db: Database, guildId: string, group: string) {
  const { settings: s } = await getSettings(db, guildId);
  const keys =
    group === 'categories'
      ? [...s.categories.map((c) => 'category.' + c.key), 'category.new']
      : groups[group];
  if (!keys) throw new UserError('Unknown settings section.');
  return {
    content: 'Select a field. Empty optional IDs or image URLs disable that setting.',
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('v1:settings:field')
          .setPlaceholder('Choose a setting')
          .addOptions(keys.map((k) => ({ label: k, value: k }))),
      ),
    ],
    allowedMentions: noMentions,
  };
}
export async function settingsModal(db: Database, guildId: string, key: string) {
  const { settings: s, revision } = await getSettings(db, guildId);
  let value: unknown;
  if (key.startsWith('category.'))
    value = s.categories.find((c) => c.key === key.slice(9)) ?? {
      key: 'new-category',
      label: 'New category',
      description: 'Describe this category',
      emoji: '💬',
      roleId: '',
      parentId: '',
      order: false,
    };
  else if (key.startsWith('copy.')) value = s.copy[key.slice(5) as keyof Settings['copy']];
  else value = s[key as keyof Settings];
  if (value === undefined) throw new UserError('Unknown configuration field.');
  return modal('v1:config:' + revision + ':' + key, 'Edit ' + key, [
    {
      id: 'value',
      label: key.startsWith('category.') ? 'Category JSON; {"delete":true} to remove' : 'New value',
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
      long: true,
      required: false,
      max: 4000,
    },
  ]);
}
export async function saveSetting(
  db: Database,
  i: ModalSubmitInteraction,
  revision: number,
  key: string,
) {
  const { settings: s } = await getSettings(db, i.guildId!);
  const value = i.fields.getTextInputValue('value');
  const next = structuredClone(s);
  if (key.startsWith('category.')) {
    let data: unknown;
    try {
      data = JSON.parse(value);
    } catch {
      throw new UserError('Category must be valid JSON.');
    }
    const existing = key.slice(9);
    if (typeof data === 'object' && data !== null && 'delete' in data && data.delete === true)
      next.categories = next.categories.filter((c) => c.key !== existing);
    else {
      const parsed = categorySchema.safeParse(data);
      if (!parsed.success)
        throw new UserError('Invalid category fields. Check the documented JSON example.');
      const index = next.categories.findIndex((c) => c.key === existing);
      if (index < 0) next.categories.push(parsed.data);
      else next.categories[index] = parsed.data;
    }
  } else if (key.startsWith('copy.') && groups.panels!.concat(groups.controls!).includes(key))
    next.copy[key.slice(5) as keyof Settings['copy']] = value;
  else if (Object.values(groups).flat().includes(key))
    Object.assign(next, { [key]: key === 'cooldownSeconds' ? Number(value) : value });
  else throw new UserError('Unknown configuration field.');
  const parsed = settingsSchema.safeParse(next);
  if (!parsed.success)
    throw new UserError(
      'Invalid setting: ' +
        parsed.error.issues.map((e) => e.path.join('.')).join(', ') +
        '. See README for limits.',
    );
  await validatePresentIds(i.guild!, parsed.data);
  // Validate serialized Discord builders before committing a configuration edit.
  try {
    for (const kind of ['order', 'contact'] as const)
      panel(parsed.data, kind).components.forEach((component) => component.toJSON());
  } catch {
    throw new UserError('This setting cannot form a valid Discord panel. Check labels and emoji.');
  }
  const result = await db.guildSettings.updateMany({
    where: { guildId: i.guildId!, revision },
    data: { data: parsed.data, revision: { increment: 1 } },
  });
  if (result.count !== 1)
    throw new UserError(
      'Settings changed while you were editing. Reopen /setup settings and try again.',
    );
}
export async function validatePresentIds(guild: Guild, s: Settings) {
  for (const id of new Set(
    [s.supportRoleId, s.managementRoleId, ...s.categories.map((c) => c.roleId)].filter(Boolean),
  )) {
    const role = await guild.roles.fetch(id);
    if (
      !role ||
      role.id === guild.id ||
      role.managed ||
      role.permissions.has(PermissionFlagsBits.Administrator)
    )
      throw new UserError('Choose existing non-administrator support roles in this server.');
  }
  for (const id of new Set(
    [s.ticketCategoryId, s.archiveCategoryId, ...s.categories.map((c) => c.parentId)].filter(
      Boolean,
    ),
  )) {
    const c = await guild.channels.fetch(id);
    if (c?.type !== ChannelType.GuildCategory)
      throw new UserError('Choose existing server category IDs.');
  }
  for (const id of [s.panelChannelId, s.contactChannelId, s.transcriptLogChannelId].filter(
    Boolean,
  )) {
    const c = await guild.channels.fetch(id);
    if (c?.type !== ChannelType.GuildText)
      throw new UserError('Choose existing standard text channel IDs.');
  }
  if (s.transcriptLogChannelId && s.supportRoleId && s.managementRoleId)
    await validateLog(guild, s);
}
export async function publishPanels(db: Database, guild: Guild) {
  const s = (await getSettings(db, guild.id)).settings;
  await validateRouting(guild, s);
  const channel = await guild.channels.fetch(s.panelChannelId);
  if (channel?.type !== ChannelType.GuildText) throw new UserError('Invalid panel channel.');
  for (const kind of ['order', 'contact'] as const) {
    const existing = await db.panel.findUnique({
      where: { guildId_kind: { guildId: guild.id, kind } },
    });
    let message =
      existing && existing.channelId === channel.id
        ? await channel.messages.fetch(existing.messageId).catch(() => null)
        : null;
    if (message) await message.edit(panel(s, kind));
    else message = await channel.send(panel(s, kind));
    await db.panel.upsert({
      where: { guildId_kind: { guildId: guild.id, kind } },
      create: { guildId: guild.id, kind, channelId: channel.id, messageId: message.id },
      update: { channelId: channel.id, messageId: message.id },
    });
    if (existing && existing.channelId !== channel.id) {
      const old = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (old?.type === ChannelType.GuildText)
        await old.messages.delete(existing.messageId).catch(() => undefined);
    }
  }
}
export async function privateReply(i: RepliableInteraction, content: string) {
  if (i.deferred || i.replied)
    await i.editReply({ content, components: [], allowedMentions: noMentions });
  else await i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: noMentions });
}
