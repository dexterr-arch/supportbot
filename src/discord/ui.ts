import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown,
} from 'discord.js';
import type { Ticket } from '@prisma/client';
import type { Settings } from '../config/settings.js';
export const noMentions = { parse: [] as [], repliedUser: false };
export function compact(value: string, max: number) {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}
export function text(content: string) {
  return new TextDisplayBuilder().setContent(content);
}
function media(url: string) {
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
}
export function panel(s: Settings, kind: 'contact' = 'contact') {
  const c = new ContainerBuilder().setAccentColor(parseInt(s.accentColor.slice(1), 16));
  if (s.contactBannerUrl) c.addMediaGalleryComponents(media(s.contactBannerUrl));
  c.addTextDisplayComponents(text('# ' + s.copy.contactTitle))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(s.copy.contactIntro),
      text(
        s.categories
          .map((v) => (v.emoji || '•') + ' **' + v.label + '** — ' + v.description)
          .join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder());
  const menu = new StringSelectMenuBuilder()
    .setCustomId('v1:panel:' + kind)
    .setPlaceholder(s.copy.chooseCategory)
    .addOptions(
      s.categories.map((v) => ({
        label: v.label,
        value: v.key,
        description: v.description,
        ...(v.emoji ? { emoji: v.emoji } : {}),
      })),
    );
  c.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  if (s.footerImageUrl)
    c.addSeparatorComponents(new SeparatorBuilder()).addMediaGalleryComponents(
      media(s.footerImageUrl),
    );
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [c],
    allowedMentions: noMentions,
  };
}
export function ticketPanel(s: Settings, t: Ticket, notifyRole = false) {
  const c = new ContainerBuilder().setAccentColor(parseInt(s.accentColor.slice(1), 16));
  c.addTextDisplayComponents(
    text('# Ticket #' + t.number),
    text(
      compact(s.copy.welcome || 'Welcome to your ticket.', 250) +
        (notifyRole ? '\n<@&' + t.roleId + '>' : ''),
    ),
  );
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addTextDisplayComponents(
    text(
      '**Subject:** ' +
        escapeMarkdown(t.subject) +
        '\n**Category:** ' +
        escapeMarkdown(t.categoryKey) +
        '\n**Creator:** <@' +
        t.ownerId +
        '>\n**Opened:** <t:' +
        Math.floor(t.createdAt.getTime() / 1000) +
        ':F>\n**Status:** ' +
        t.status +
        '\n**Assigned:** ' +
        (t.claimId ? '<@' + t.claimId + '>' : 'Unclaimed'),
    ),
  );
  c.addTextDisplayComponents(text(compact(escapeMarkdown(t.description), 1100)));
  const details = t.details as Record<string, string>;
  const detailText = Object.entries(details)
    .map(([k, v]) => '**' + escapeMarkdown(k) + ':** ' + escapeMarkdown(v))
    .join('\n');
  if (detailText) c.addTextDisplayComponents(text(compact(detailText, 500)));
  c.addSeparatorComponents(new SeparatorBuilder());
  const actions =
    t.status === 'CLOSED'
      ? ['reopen', 'delete']
      : ['claim', 'unclaim', 'close', 'add', 'remove', 'rename', 'notes'];
  for (let i = 0; i < actions.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const action of actions.slice(i, i + 5))
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('v1:t:' + action + ':' + t.id)
          .setLabel(
            action === 'notes'
              ? 'Staff Notes'
              : compact(s.copy[action as keyof Settings['copy']], 32),
          )
          .setStyle(
            action === 'close' || action === 'delete' ? ButtonStyle.Danger : ButtonStyle.Secondary,
          )
          .setDisabled(t.operation !== null),
      );
    c.addActionRowComponents(row);
  }
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [c],
    allowedMentions: noMentions,
  };
}
export interface Field {
  id: string;
  label: string;
  value?: string;
  long?: boolean;
  required?: boolean;
  max?: number;
  description?: string;
}
export function modal(customId: string, title: string, fields: Field[]) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addLabelComponents(
      ...fields.map((f) => {
        const input = new TextInputBuilder()
          .setCustomId(f.id)
          .setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(f.required !== false)
          .setMaxLength(f.max ?? 200);
        if (f.value) input.setValue(f.value);
        const label = new LabelBuilder()
          .setLabel(f.label.slice(0, 45))
          .setTextInputComponent(input);
        if (f.description) label.setDescription(f.description);
        return label;
      }),
    );
}
export function confirmation(id: string, action: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('v1:confirm:' + id)
      .setLabel('Confirm ' + action)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('v1:cancel:' + id)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}
