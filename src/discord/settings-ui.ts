import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  LabelBuilder,
  ModalBuilder,
  type Guild,
  type RepliableInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Database } from '../database/client.js';
import { getSettings, settingsSchema, categorySchema, type Settings } from '../config/settings.js';
import { modal, noMentions, panel } from './ui.js';
import { UserError } from '../infrastructure/logger.js';
import { validateRouting, validateLog } from './permissions.js';
import { sections, fieldInfo } from './settings-fields.js';
export const groups: Record<string, string[]> = {
  identity: ['brandName', 'accentColor', 'cooldownSeconds'],
  routing: [
    'supportRoleId',
    'managementRoleId',
    'ticketCategoryId',
    'archiveCategoryId',
    'transcriptLogChannelId',
    'panelChannelId',
  ],
  images: ['contactBannerUrl', 'footerImageUrl'],
  panels: ['contactTitle', 'contactIntro', 'chooseCategory', 'welcome', 'privacy'].map(
    (k) => 'copy.' + k,
  ),
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
  ].map((k) => 'copy.' + k),
};
export function setupButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('v1:settings:home')
      .setLabel('Setup home')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('v1:settings:publish')
      .setLabel('Post / refresh panel')
      .setStyle(ButtonStyle.Success),
  );
}
export function settingsMenu(s?: Settings) {
  const required = groups.routing!;
  const missing = s ? required.filter((key) => !s[key as keyof Settings]) : required;
  return {
    content: '',
    embeds: [
      {
        title: 'Support bot setup',
        color: parseInt((s?.accentColor ?? '#FF6B24').slice(1), 16),
        description:
          '**Start with Channels & staff roles.** Choose each destination from Discord’s pickers. Then customize your two ticket types and click **Post / refresh panel**.\n\n' +
          (missing.length
            ? '**Still to choose:**\n' +
              missing.map((key) => '• ' + fieldInfo(key).label).join('\n')
            : '✅ All required destinations are selected. Posting the panel will also check permissions.'),
        footer: { text: 'Only you can see this setup screen. Saved changes survive restarts.' },
      },
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('v1:settings:group')
          .setPlaceholder('Choose what you want to set up…')
          .addOptions(Object.entries(sections).map(([key, info]) => ({ ...info, value: key }))),
      ),
      setupButtons(),
    ],
    allowedMentions: noMentions,
  };
}
export async function fieldsMenu(db: Database, guildId: string, group: string) {
  const { settings: s } = await getSettings(db, guildId);
  const keys =
    group === 'categories' ? s.categories.map((c) => 'category.' + c.key) : groups[group];
  if (!keys) throw new UserError('Unknown settings section.');
  return {
    content: '',
    embeds: [
      {
        title: sections[group]!.label,
        color: parseInt(s.accentColor.slice(1), 16),
        description:
          sections[group]!.description +
          '\n\n' +
          (group === 'routing'
            ? keys
                .map((key) => {
                  const value = s[key as keyof Settings];
                  return (
                    (value ? '✅ ' : '⬜ ') +
                    fieldInfo(key).label +
                    (value
                      ? ': <' + (key.endsWith('RoleId') ? '@&' : '#') + String(value) + '>'
                      : ': not selected')
                  );
                })
                .join('\n')
            : 'Choose an item below to edit it. Changes save immediately; refresh the public panel when finished.'),
      },
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('v1:settings:field')
          .setPlaceholder('Choose what to change…')
          .addOptions(
            keys.map((key) =>
              key.startsWith('category.')
                ? {
                    label: key === 'category.support' ? 'Support tickets' : 'Management tickets',
                    value: key,
                    description:
                      'Edit the name, description, emoji and optional routing overrides.',
                  }
                : {
                    label: fieldInfo(key).label,
                    description: fieldInfo(key).description.slice(0, 100),
                    value: key,
                  },
            ),
          ),
      ),
      setupButtons(),
    ],
    allowedMentions: noMentions,
  };
}
export async function settingsModal(db: Database, guildId: string, key: string) {
  if (
    !Object.values(groups).flat().includes(key) &&
    !['category.support', 'category.management'].includes(key)
  )
    throw new UserError(
      'This setting has been retired. Open /setup settings for the updated menu.',
    );
  const { settings: s, revision } = await getSettings(db, guildId);
  const customId = 'v1:config:' + revision + ':' + key;
  if (key.startsWith('category.')) {
    const c = s.categories.find((c) => c.key === key.slice(9));
    if (!c) throw new UserError('Choose Support or Management from the current setup menu.');
    const form = modal(
      customId,
      c.key === 'support' ? 'Edit Support tickets' : 'Edit Management tickets',
      [
        { id: 'label', label: 'Name shown in the ticket menu', value: c.label, max: 50 },
        {
          id: 'description',
          label: 'When should members choose this?',
          value: c.description,
          max: 100,
          long: true,
        },
        { id: 'emoji', label: 'Emoji (optional)', value: c.emoji, max: 60, required: false },
      ],
    );
    const role = new RoleSelectMenuBuilder()
      .setCustomId('roleId')
      .setMinValues(0)
      .setMaxValues(1)
      .setRequired(false);
    if (c.roleId) role.setDefaultRoles(c.roleId);
    const parent = new ChannelSelectMenuBuilder()
      .setCustomId('parentId')
      .addChannelTypes(ChannelType.GuildCategory)
      .setMinValues(0)
      .setMaxValues(1)
      .setRequired(false);
    if (c.parentId) parent.setDefaultChannels(c.parentId);
    return form.addLabelComponents(
      new LabelBuilder()
        .setLabel('Staff role override (optional)')
        .setDescription('Leave empty to use the team role from Channels & staff roles.')
        .setRoleSelectMenuComponent(role),
      new LabelBuilder()
        .setLabel('Ticket folder override (optional)')
        .setDescription('Leave empty to use the Open tickets folder.')
        .setChannelSelectMenuComponent(parent),
    );
  }
  if (groups.routing!.includes(key)) {
    const current = String(s[key as keyof Settings]);
    const info = fieldInfo(key);
    const label = new LabelBuilder().setLabel(info.label).setDescription(info.description);
    if (key.endsWith('RoleId')) {
      const choice = new RoleSelectMenuBuilder()
        .setCustomId('value')
        .setMinValues(1)
        .setMaxValues(1);
      if (current) choice.setDefaultRoles(current);
      label.setRoleSelectMenuComponent(choice);
    } else {
      const choice = new ChannelSelectMenuBuilder()
        .setCustomId('value')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(
          key.endsWith('CategoryId') ? ChannelType.GuildCategory : ChannelType.GuildText,
        );
      if (current) choice.setDefaultChannels(current);
      label.setChannelSelectMenuComponent(choice);
    }
    return new ModalBuilder().setCustomId(customId).setTitle(info.label).addLabelComponents(label);
  }
  let value: unknown;
  if (key.startsWith('copy.')) value = s.copy[key.slice(5) as keyof Settings['copy']];
  else value = s[key as keyof Settings];
  if (value === undefined) throw new UserError('Unknown configuration field.');
  const info = fieldInfo(key);
  return modal(customId, info.label, [
    {
      id: 'value',
      label: info.label,
      description: info.description,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
      long: true,
      required: false,
      max: info.max ?? 80,
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
  const value = key.startsWith('category.')
    ? ''
    : groups.routing!.includes(key)
      ? key.endsWith('RoleId')
        ? i.fields.getSelectedRoles('value', true).first()!.id
        : i.fields.getSelectedChannels('value', true).first()!.id
      : i.fields.getTextInputValue('value');
  const next = structuredClone(s);
  if (key.startsWith('category.')) {
    const existing = key.slice(9);
    const data = {
      key: existing,
      label: i.fields.getTextInputValue('label'),
      description: i.fields.getTextInputValue('description'),
      emoji: i.fields.getTextInputValue('emoji'),
      roleId: i.fields.getSelectedRoles('roleId')?.first()?.id ?? '',
      parentId: i.fields.getSelectedChannels('parentId')?.first()?.id ?? '',
      order: false,
    };
    const category = categorySchema.safeParse(data);
    if (
      !category.success ||
      category.data.key !== existing ||
      !['support', 'management'].includes(existing) ||
      category.data.order
    )
      throw new UserError('Keep the existing support or management key and set order to false.');
    next.categories = next.categories.map((c) => (c.key === existing ? category.data : c));
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
    for (const kind of ['contact'] as const)
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
  // Retire only the old panel tracked by this bot; preserve all ticket history.
  const legacy = await db.panel.findUnique({
    where: { guildId_kind: { guildId: guild.id, kind: 'order' } },
  });
  if (legacy) {
    const oldChannel = await guild.channels.fetch(legacy.channelId);
    if (oldChannel?.type === ChannelType.GuildText) {
      try {
        await oldChannel.messages.delete(legacy.messageId);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 10008))
          throw new UserError(
            'Unable to remove the old Order Info panel. Check bot access to its channel and retry.',
          );
      }
    }
    await db.panel.delete({ where: { guildId_kind: { guildId: guild.id, kind: 'order' } } });
  }
  for (const kind of ['contact'] as const) {
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
