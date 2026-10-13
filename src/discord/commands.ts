import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
const setup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the support bot')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((c) => c.setName('panels').setDescription('Post or refresh the support panel'))
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
  c.setName('notes').setDescription('Join the private staff notes thread for this ticket'),
);
ticket.addSubcommand((c) =>
  c
    .setName('close')
    .setDescription('Save transcript and delete this channel with confirmation')
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
const addrole = new SlashCommandBuilder()
  .setName('addrole')
  .setDescription('Give a server member a role')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) =>
    o.setName('user').setDescription('Member receiving the role').setRequired(true),
  )
  .addRoleOption((o) => o.setName('role').setDescription('Role to add').setRequired(true));
const selfrole = new SlashCommandBuilder()
  .setName('selfrole')
  .setDescription('Give yourself a role approved by server administrators')
  .setContexts(InteractionContextType.Guild)
  .addRoleOption((o) =>
    o.setName('role').setDescription('Whitelisted role to give yourself').setRequired(true),
  );
const selfroles = new SlashCommandBuilder()
  .setName('selfroles')
  .setDescription('Manage roles that everyone can assign to themselves')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
for (const name of ['allow', 'deny'])
  selfroles.addSubcommand((c) =>
    c
      .setName(name)
      .setDescription(
        name === 'allow'
          ? 'Let everyone give themselves this role'
          : 'Remove a role from the self-assignment whitelist',
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to configure').setRequired(true),
      ),
  );
selfroles.addSubcommand((c) =>
  c.setName('list').setDescription('Show the self-assignment role whitelist'),
);
export const commands = [setup, ticket, bot, addrole, selfrole, selfroles].map((c) => c.toJSON());
