import { Client, Events, GatewayIntentBits } from 'discord.js';
import pg from 'pg';
import { loadEnv } from './config/env.js';
import { database } from './database/client.js';
import { getSettings } from './config/settings.js';
import { logger, safeError } from './infrastructure/logger.js';
import { healthServer } from './infrastructure/health.js';
import { TicketService } from './tickets/service.js';
import { Router } from './discord/router.js';
async function main() {
  const env = loadEnv();
  const db = database(env.DATABASE_URL);
  const lock = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    application_name: 'ticket-bot-singleton',
  });
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [], repliedUser: false },
    rest: { timeout: 15000, retries: 3 },
  });
  let ready = false,
    stopping = false;
  let timer: NodeJS.Timeout | undefined;
  const pending = new Set<Promise<void>>();
  const server = healthServer(env.PORT, db, () => ready && !stopping && client.isReady());
  const shutdown = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    ready = false;
    if (timer) clearInterval(timer);
    logger.info('Stopping: draining interactions and disconnecting.');
    const forced = setTimeout(() => process.exit(code || 1), 25000);
    forced.unref();
    server.close();
    await Promise.allSettled([...pending]);
    await client.destroy();
    await lock.end().catch(() => undefined);
    await db.$disconnect();
    clearTimeout(forced);
    process.exitCode = code;
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  process.on('uncaughtException', (e) => {
    logger.fatal(safeError(e), 'Fatal exception.');
    void shutdown(1);
  });
  process.on('unhandledRejection', (e) => {
    logger.fatal(safeError(e), 'Unhandled rejection.');
    void shutdown(1);
  });
  lock.on('error', (e) => {
    logger.error(
      safeError(e),
      'Singleton database lock lost. Exiting to prevent duplicate processing.',
    );
    void shutdown(1);
  });
  server.on('error', (e) => {
    logger.error(safeError(e), 'Health endpoint failed.');
    void shutdown(1);
  });
  try {
    await lock.connect();
    const locked = await lock.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      ['ticket-bot:' + env.DISCORD_GUILD_ID],
    );
    if (!locked.rows[0]?.locked) throw new Error('Another bot instance owns this guild.');
    await db.$connect();
    await getSettings(db, env.DISCORD_GUILD_ID);
    client.on(Events.Error, (e) => logger.error(safeError(e), 'Discord client error.'));
    client.on(Events.Warn, () => logger.warn('Discord gateway warning.'));
    client.on(Events.ShardDisconnect, () =>
      logger.warn('Discord gateway disconnected; automatic reconnection active.'),
    );
    client.on(Events.ShardResume, () => logger.info('Discord gateway resumed.'));
    client.rest.on('rateLimited', (event) =>
      logger.warn(
        { retryAfterMs: event.timeToReset, global: event.global },
        'Discord rate limit; REST manager will wait.',
      ),
    );
    client.once(Events.ClientReady, () => {
      const bootstrap = async () => {
        if (client.user?.id !== env.DISCORD_CLIENT_ID)
          throw new Error('Application ID does not match this bot.');
        const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
        await guild.members.fetchMe();
        const service = new TicketService(db, guild);
        const router = new Router(db, service);
        client.on(Events.InteractionCreate, (i) => {
          if (stopping) return;
          const work = router.handle(i);
          pending.add(work);
          void work.finally(() => pending.delete(work));
        });
        let recovering = false;
        const recovery = async () => {
          if (stopping || recovering) return;
          recovering = true;
          try {
            await service.recover();
          } finally {
            recovering = false;
          }
        };
        const initial = recovery().catch((e) =>
          logger.error(safeError(e), 'Initial recovery failed.'),
        );
        pending.add(initial);
        void initial.finally(() => pending.delete(initial));
        timer = setInterval(() => {
          const work = recovery().catch((e) => logger.error(safeError(e), 'Recovery scan failed.'));
          pending.add(work);
          void work.finally(() => pending.delete(work));
        }, 30000);
        timer.unref();
        ready = true;
        logger.info({ guildId: guild.id }, 'Support bot ready.');
      };
      const work = bootstrap().catch((e) => {
        logger.fatal(safeError(e), 'Startup configuration failed.');
        void shutdown(1);
      });
      pending.add(work);
      void work.finally(() => pending.delete(work));
    });
    await client.login(env.DISCORD_TOKEN);
  } catch (e) {
    logger.fatal(
      safeError(e),
      'Startup failed. Check configuration, migrations, and instance count.',
    );
    await shutdown(1);
  }
}
main().catch((e) => {
  logger.fatal(safeError(e), 'Environment configuration failed.');
  process.exitCode = 1;
});
