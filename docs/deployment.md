# Deployment and operations

## Railway

Railway is an example always-running container host; a VPS or another Docker host works too. No account or deployment is created by the project.

1. Upload the project to a private repository without .env, node_modules, or local database files.
2. Create a Railway project with a PostgreSQL service and persistent volume. Confirm UTF-8 encoding.
3. Create an application service from the repository. Use its root Dockerfile.
4. Set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DATABASE_URL, and PORT privately. Use a Railway service reference for the PostgreSQL connection URL.
5. Pre-deploy command: `npm run migrate:deploy`. A failure must block the deployment.
6. Start command: the Dockerfile default, `node dist/src/index.js`. Do not run the development watcher.
7. Configure /health as the health-check path. It returns 503 until the bot, Gateway, and database are ready.
8. Set one replica, an appropriate restart policy, and disable Serverless/app sleeping.
9. Stop the previous deployment before starting a replacement. Rolling overlap is deliberately blocked by the singleton database lock. Allow a short maintenance window.
10. Run `npm run commands:register:prod` from the new service's shell once.
11. Read the application logs, verify `Support bot ready.`, and configure the server using the administrator commands.

Secrets belong in the host's secret-variable interface. Do not pass credentials as Docker build arguments: they are runtime values. The production container runs as the non-root node user. PostgreSQL must be a separate persistent service.

Use your provider's documented TLS connection configuration where needed. Do not disable certificate verification as a workaround. Keep the database on a private network where possible.

Railway references: [Dockerfiles](https://docs.railway.com/guides/dockerfiles), [pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command), [Serverless behavior](https://docs.railway.com/deployments/serverless), [deployment settings](https://docs.railway.com/deployments). Provider screens and pricing can change; verify current limits before paying. Free hosting may sleep, expire, or stop after quotas.

## Another Docker host

Build the image with `docker build -t support-ticket-bot:1.0.0 .`. Provide the five bot environment values through your host's secret mechanism.

Run a one-off container using the same image and secrets with `npm run migrate:deploy`. Only after it succeeds, start one bot container. Register commands with `npm run commands:register:prod`. Configure restarts and /health, and allow a 30-second graceful shutdown.

The supplied Compose file is for local testing. It includes PostgreSQL, a migration job, and the bot. Its database volume is persistent. Never expose PostgreSQL directly to the public internet.

## Logs and restarting

Locally:

```powershell
docker compose logs --tail 100 bot
docker compose logs -f bot
docker compose restart bot
docker compose ps
```

On a host, use the service's Logs and Restart controls. Logs are structured JSON and include safe error codes and ticket IDs, never raw request errors or credentials. Use `/bot status` as an administrator to see the pending-operation count.

A readiness failure may mean Gateway reconnection, unavailable PostgreSQL, missing migrations, invalid application/server IDs, a duplicate instance, or a misconfigured privileged intent. /live shows only whether the HTTP process is alive. Keep log retention appropriate to your privacy policy.

## Backups

Enable provider-managed scheduled PostgreSQL backups and test restoration regularly. Back up before migrations and upgrades. Backups contain private ticket data and HTML transcripts; encrypt them and restrict access.

For local Compose, avoid PowerShell binary redirection. Create the dump inside the container, then copy it:

```powershell
New-Item -ItemType Directory -Force backups
docker compose exec -T postgres pg_dump -U ticketbot -d tickets -Fc -f /tmp/tickets.backup
docker compose cp postgres:/tmp/tickets.backup ./backups/tickets.backup
```

Store that file securely off the machine. The backups directory is gitignored.

Test restoration into a **separate empty database**, not the live one:

```powershell
docker compose exec -T postgres createdb -U ticketbot tickets_restore_test
docker compose cp ./backups/tickets.backup postgres:/tmp/restore.backup
docker compose exec -T postgres pg_restore -U ticketbot -d tickets_restore_test --no-owner /tmp/restore.backup
```

Use PostgreSQL tools compatible with the server major version. Do not point the live bot at a restore test. Copying only source files does not back up PostgreSQL.

HTML copies in PostgreSQL allow operators to recover transcript content if Discord log messages are lost. They do not preserve attachment bytes. Plan separate authorized storage if permanent binary attachment archival is required.

## Updating

1. Read changes and back up the database.
2. Test the new version against a separate test application/server and disposable database.
3. Run npm ci, generate, formatting check, lint, type-check, tests, build, and Docker build.
4. Stop the old instance.
5. Run production migrations using the new image. Never use migrate reset or db push on production.
6. Start the new instance, verify /health and logs.
7. Re-register slash commands if definitions changed. Refresh panels if their layout changed.
8. Keep the previous image available. Database migrations are not automatically reversible; restore or roll back only with a reviewed recovery plan.

Do not blindly upgrade to a pre-release dependency. Revisit the pinned security overrides when upgrading Prisma.

## Manual Discord acceptance checklist

These checks require your own token and a test server; automated simulated tests do not perform them.

- Invite with only the documented permissions. Verify the bot works without Administrator.
- Configure all roles/channels and post panels twice; confirm one pair remains.
- Check both panels on desktop and mobile, with images enabled and disabled.
- Verify Terms/Pricing/FAQ replies are private.
- Open each category and verify order fields.
- Double-submit creation and try another category; confirm only one active ticket.
- Verify an unrelated member cannot view tickets or transcript logs.
- Race two staff Claim actions; confirm one winner.
- Restart the bot and use existing controls.
- Add/remove a test member; confirm actual access changes.
- Rename, move, change priority, and escalate; confirm old staff access is removed after escalation.
- Close, cancel confirmation, close again with a reason, inspect HTML and audit summary.
- Remove bot Attach Files permission temporarily and close another test ticket; verify the channel is preserved. Restore permission and verify recovery completes.
- Reopen and close again; confirm a new transcript generation.
- Attempt deletion with a missing transcript attachment; verify the channel is preserved.
- Confirm a successful deletion only after verifying the current archive.
- Confirm ordinary members cannot edit settings or perform staff-only actions.
- Disconnect/restart the database in the test environment; verify safe shutdown/recovery and absence of credentials in logs.

## Troubleshooting

**Commands missing:** Check the application and guild IDs, Guild Install scopes, and run the registration script. Commands are guild-scoped.

**Privileged-intent error:** Enable Message Content in the Portal; obtain approval if Discord requires it. Do not add unrelated intents.

**Configuration rejected:** Use real IDs from this server. Ticket/archive destinations must be categories; log/panel/contact destinations must be ordinary text channels. Support roles cannot be managed roles, @everyone, or Administrator roles.

**Transcript channel privacy error:** Remove View Channel from unrelated roles/member overrides. Only configured staff roles, the bot, and administrators should see it.

**Ticket pending:** Check bot permissions, category capacity, existing destination channels, database connectivity, and logs. Restore missing routing/log access. Recovery runs every 30 seconds. If a persisted destination was deleted, an experienced operator must repair that ticket's destination in PostgreSQL while the bot is stopped. Back up first; never clear transcript safety markers or force channel deletion.

**Database password changed in Compose but login still fails:** Existing volumes retain the old database user's password. Rotate it in PostgreSQL, then update the connection URL and container secret together.

**A second deployment refuses startup:** Stop the old process. The dedicated database advisory lock is released on disconnect. Do not disable the singleton guard to run replicas.

**Windows test database rejects emoji:** Create it with UTF-8 encoding and template0. Docker PostgreSQL defaults to a suitable encoding; an independently installed Windows PostgreSQL cluster may not.

**Images missing:** Use direct public HTTPS image URLs. Replace placeholder URLs with your own hosted artwork. Discord clients may cache images and control their rendering.

**Docker command missing:** Install/start Docker Desktop with Linux containers, or use a Docker-enabled CI/host. A Dockerfile existing on disk is not proof that the image has been built successfully.
