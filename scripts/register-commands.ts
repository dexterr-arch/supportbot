import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from '../src/discord/commands.js';
import { loadEnv } from '../src/config/env.js';
import { logger, safeError } from '../src/infrastructure/logger.js';
try {
  const env = loadEnv();
  await new REST({ version: '10' })
    .setToken(env.DISCORD_TOKEN)
    .put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
      body: commands,
    });
  logger.info('Guild commands registered.');
} catch (e) {
  logger.error(safeError(e), 'Registration failed. Check credentials and configuration privately.');
  process.exitCode = 1;
}
