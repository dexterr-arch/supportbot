import { AttachmentBuilder, EmbedBuilder, type Guild, type TextChannel } from 'discord.js';
import type { Ticket } from '@prisma/client';
import type { Database } from '../database/client.js';
import type { Settings } from '../config/settings.js';
import { validateLog } from '../discord/permissions.js';
import { noMentions } from '../discord/ui.js';
import { renderParts, type TranscriptMessage } from './html.js';
export async function collect(channel: TextChannel): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = [];
  let before: string | undefined;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    for (const m of batch.values())
      messages.push({
        id: m.id,
        author: m.author.tag,
        authorId: m.author.id,
        timestamp: m.createdAt.toISOString(),
        text: m.content,
        embeds: m.embeds.map((e) => e.toJSON()),
        components: m.components.map((c) => c.toJSON()),
        attachments: m.attachments.map((a) => ({ name: a.name, url: a.url })),
      });
    const oldest = batch.last()!.id;
    if (oldest === before) throw new Error('Transcript pagination did not advance.');
    before = oldest;
  }
  return messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}
export async function archive(
  db: Database,
  guild: Guild,
  channel: TextChannel,
  t: Ticket,
  s: Settings,
  reason: string,
  actorId: string,
) {
  const log = await validateLog(guild, s);
  let parts = await db.transcript.findMany({
    where: { ticketId: t.id, generation: t.generation },
    orderBy: { part: 'asc' },
  });
  if (!parts.length) {
    const messages = await collect(channel);
    messages.unshift({
      id: 'intake',
      author: 'Original ticket intake',
      authorId: t.ownerId,
      timestamp: t.createdAt.toISOString(),
      text: t.subject + '\n\n' + t.description + '\n\n' + JSON.stringify(t.details, null, 2),
      embeds: [],
      attachments: [],
    });
    const html = renderParts('Ticket #' + t.number + ' · ' + s.brandName, messages, 1_000_000);
    // Persist the full snapshot before uploading; a restart resumes the same parts.
    await db.$transaction(
      html.map((part, i) =>
        db.transcript.create({
          data: {
            ticketId: t.id,
            generation: t.generation,
            part: i + 1,
            html: part,
            logChannelId: log.id,
          },
        }),
      ),
    );
    parts = await db.transcript.findMany({
      where: { ticketId: t.id, generation: t.generation },
      orderBy: { part: 'asc' },
    });
  }
  for (const part of parts) {
    const destination = await guild.channels.fetch(part.logChannelId);
    if (!destination || destination.id !== log.id)
      throw new Error('Transcript destination changed; restore its configuration before retrying.');
    if (part.messageId) {
      const existing = await log.messages.fetch(part.messageId).catch(() => null);
      if (existing?.attachments.size) continue;
    }
    const title = 'Ticket #' + t.number + ' · transcript ' + part.part + '/' + parts.length;
    const sent = await log.send({
      content: title,
      files: [
        new AttachmentBuilder(Buffer.from(part.html, 'utf8'), {
          name: 'ticket-' + t.number + '-cycle-' + t.generation + '-part-' + part.part + '.html',
        }),
      ],
      allowedMentions: noMentions,
    });
    if (!sent.attachments.size) throw new Error('Transcript upload was not confirmed.');
    await db.transcript.update({ where: { id: part.id }, data: { messageId: sent.id } });
  }
  const summary = new EmbedBuilder()
    .setColor(parseInt(s.accentColor.slice(1), 16))
    .setTitle('Ticket #' + t.number + ' closed')
    .addFields(
      { name: 'Owner', value: '<@' + t.ownerId + '>', inline: true },
      { name: 'Category', value: t.categoryKey, inline: true },
      { name: 'Claimed by', value: t.claimId ? '<@' + t.claimId + '>' : 'Unclaimed', inline: true },
      { name: 'Opened', value: t.createdAt.toISOString() },
      { name: 'Closed', value: (t.closedAt ?? new Date()).toISOString() },
      { name: 'Closed by', value: '<@' + actorId + '>' },
      { name: 'Reason', value: reason || 'No reason provided' },
    )
    .setFooter({ text: 'Archive cycle ' + t.generation });
  // Upload acknowledgement precedes the database archive marker.
  await log.send({ embeds: [summary], allowedMentions: noMentions });
  await db.ticket.update({ where: { id: t.id }, data: { transcriptGeneration: t.generation } });
}
export async function verifyArchive(db: Database, guild: Guild, t: Ticket) {
  if (t.transcriptGeneration !== t.generation)
    throw new Error('No successful transcript for this lifecycle.');
  const parts = await db.transcript.findMany({
    where: { ticketId: t.id, generation: t.generation },
  });
  if (!parts.length || parts.some((p) => !p.messageId))
    throw new Error('Transcript upload is incomplete.');
  for (const p of parts) {
    const channel = await guild.channels.fetch(p.logChannelId);
    if (!channel?.isTextBased() || !('messages' in channel))
      throw new Error('Transcript log missing.');
    const message = await channel.messages.fetch(p.messageId!);
    if (!message.attachments.size) throw new Error('Transcript attachment missing.');
  }
}
