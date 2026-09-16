import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
const setup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the support bot')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((c) => c.setName('panels').setDescription('Post or refresh the two public panels'))
  .addSubcommand((c) =>
    c.setName('settings').setDescription('Edit server configuration privately'),
  );
const ticket = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage this ticket')
  .setContexts(InteractionContextType.Guild);
for (const name of ['add', 'remove'])
  ticket.addSubcommand((c) =>
    c
      .setName(name)
      .setDescription(name + ' a ticket participant')
      .addUserOption((o) => o.setName('member').setDescription('Server member').setRequired(true)),
  );
ticket.addSubcommand((c) =>
  c
    .setName('rename')
    .setDescription('Rename this ticket')
    .addStringOption((o) =>
      o.setName('name').setDescription('New channel name').setMaxLength(80).setRequired(true),
    ),
);
ticket.addSubcommand((c) =>
  c
    .setName('close')
    .setDescription('Close with confirmation')
    .addStringOption((o) =>
      o.setName('reason').setDescription('Optional closing reason').setMaxLength(1000),
    ),
);
for (const name of ['reopen', 'delete', 'info', 'transcript'])
  ticket.addSubcommand((c) => c.setName(name).setDescription(name + ' this ticket'));
const bot = new SlashCommandBuilder()
  .setName('bot')
  .setDescription('Bot diagnostics')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((c) => c.setName('status').setDescription('Show bot connectivity and uptime'));
export const commands = [setup, ticket, bot].map((c) => c.toJSON());
