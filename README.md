# Support Ticket Bot

**Support-only edition:** this update publishes one Contact panel with Support and Management. It removes the tracked Order Info panel when `/setup panels` runs. See [SUPPORT-ONLY-UPDATE.md](SUPPORT-ONLY-UPDATE.md) for upgrading an existing Railway deployment. Legacy commerce settings remain compatible with existing databases but are hidden from the interface.

A customizable Discord support bot with orange Components V2 panels, private ticket channels, PostgreSQL persistence, HTML transcripts, and restart-safe controls. Branding and placeholder artwork are independent of the supplied design reference.

**Start here:** complete the Discord setup below, put secrets in your private environment, start the bot, run `/setup settings`, then `/setup panels`.

This project contains no real Discord token. Never send a token in chat, commit it, include it in screenshots, or paste it into an issue. Read [VERIFICATION.md](VERIFICATION.md) for the actual verification results and limitations.

## Requirements

- Node.js 24 LTS, at least 24.17.0; development and Docker target 24.21.0.
- PostgreSQL 17 or newer, with a **UTF-8** database.
- Docker Desktop with Linux containers for local Docker testing, or an always-running cloud Docker service.
- A Discord server where you can manage applications, channels, and roles.

The bot uses discord.js 14.27.0, Prisma 7.10.0, TypeScript, Vitest, ESLint, Prettier, and structured Pino logging. The lockfile pins the dependency tree. Two narrowly scoped dependency overrides provide patched deepmerge-ts and mysql2 versions used by Prisma tooling.

## 1. Create and invite the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application with your own brand name. Open **Bot** and create a bot if necessary.
3. In the Bot section, obtain/reset the bot token. Save it privately in your hosting secret settings or local `.env`. This project does not generate a token.
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**. Leave Server Members and Presence intents disabled.
5. Under General Information, copy the **Application ID** for `DISCORD_CLIENT_ID`.
6. Configure a **Guild Install** with the OAuth scopes **`bot`** and **`applications.commands`**. Do not configure a public Interactions Endpoint URL; this application uses the Gateway.
7. Grant exactly these baseline bot permissions:

| Permission                        | Purpose                                           |
| --------------------------------- | ------------------------------------------------- |
| View Channels                     | Access configured panels, tickets, and logs       |
| Send Messages                     | Post panels, ticket controls, and audit summaries |
| Read Message History              | Fetch transcripts and recover existing messages   |
| Embed Links                       | Audit summaries and private information replies   |
| Attach Files                      | Upload HTML transcripts                           |
| Manage Channels                   | Create, rename, move, and delete ticket channels  |
| Manage Roles / Manage Permissions | Edit channel permission overwrites                |

**Never grant Administrator.** Baseline permission integer: **268553232**. The bot does not need Manage Messages, Manage Webhooks, Kick Members, Ban Members, or Mention Everyone.

Use the Portal's installation link, or replace `YOUR_APPLICATION_ID` in:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot%20applications.commands&permissions=268553232&integration_type=0
```

Open the link in your browser, choose your server, and authorize it. The inviting account needs permission to manage that server. Use Unicode or same-server emoji; cross-server custom emoji may need the optional Use External Emojis permission.

The bot requests the Guilds, GuildMessages, and MessageContent intents in code. Message Content is necessary for ordinary messages, embeds, attachments, and components in transcripts. If Discord requires an intent review for your application, complete that review in the Portal. See [Discord's Gateway documentation](https://docs.discord.com/developers/events/gateway).

## 2. Prepare the server and copy IDs

Enable **User Settings → Advanced → Developer Mode**. Right-click the server, channel, category, role, or member and choose **Copy ID**. IDs are long numbers, not names or channel links.

Create:

- A Support role and a Management role. These must be ordinary roles without Administrator.
- An **Open Tickets** category.
- A private **ticket-logs** standard text channel.
- A public **support-desk** standard text channel for the Contact panel.

For ticket-logs, deny View Channel to @everyone. Allow only configured staff roles, the bot, and administrators. Remove unrelated role/member grants. The bot validates that this channel is private before uploading transcripts.

Give the bot its required permissions on the ticket category and the log/panel channels. Place its role above the staff roles as a practical setup precaution. Keep human staff roles free of channel-management powers unless they need them outside this bot.

On opening, the bot pings the configured Support Team role once in a separate plain-text message for both categories. It grants only itself Mention Everyone inside that private ticket, and allowedMentions permits only the ticket owner and Support Team role. No server-wide mention permission or public role-mentionability change is needed. Management ticket access still comes only from its configured Management role; the notification does not grant Support Team members access. Members who cannot view the ticket cannot follow its link or read it. Notification messages remain visible when ticket controls refresh.

## 3. Local Docker test on Windows

Local testing stops when your PC stops. Production deployment is covered in step 7.

1. Install Docker Desktop and start it in Linux-container mode.
2. Extract the ZIP. Open the `support-ticket-bot` folder in File Explorer, click the address bar, type `powershell`, and press Enter.
3. Create your private environment file:

```powershell
Copy-Item .env.example .env
notepad .env
```

4. Replace the placeholders. For Compose, the database hostname is **postgres**, not localhost:

```dotenv
DISCORD_TOKEN=YOUR_PRIVATE_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_APPLICATION_ID
DISCORD_GUILD_ID=YOUR_SERVER_ID
DATABASE_URL=postgresql://ticketbot:YOUR_LOCAL_DATABASE_PASSWORD@postgres:5432/tickets
PORT=3000
```

Use a strong database password; percent-encode special characters in the connection URL. Do not use the example placeholder in production.

5. Set the same raw database password in this PowerShell session for Compose's PostgreSQL service:

```powershell
$env:POSTGRES_PASSWORD = 'YOUR_LOCAL_DATABASE_PASSWORD'
docker compose up --build -d
docker compose run --rm bot npm run commands:register:prod
docker compose logs -f bot
```

`POSTGRES_PASSWORD` is a local database-container deployment secret, not a bot setting. It is deliberately absent from bot code. Compose uses a persistent PostgreSQL volume and runs migrations before the bot starts. PostgreSQL is exposed only on localhost for development.

6. Check health in your browser at [localhost:3000/health](http://localhost:3000/health). A successful response is `{"status":"ready"}`.
7. Run `/setup settings` in Discord and configure the server as described below.

To stop local testing: `docker compose down`. **Do not use `down -v` unless you intentionally want to erase the database volume.** Changing POSTGRES_PASSWORD after a volume is initialized does not change the database user's password; rotate it inside PostgreSQL first.

## 4. Configure the bot in Discord

Only server administrators can use `/setup settings` and `/setup panels`. There is a second runtime authorization check in addition to slash-command visibility.

Run **/setup settings** to open a private setup dashboard. It lists the destinations you still need to choose. No database editing or JSON is needed.

| Section                     | What it does                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Channels & staff roles   | Choose team roles, the public panel channel, open ticket folder and private transcript log using Discord pickers.      |
| 2. Support & Management     | Edit either option's name, description and emoji. Optional staff-role and ticket-folder pickers override the defaults. |
| 3. Name & appearance        | Set the brand name, accent color and ticket-action cooldown.                                                           |
| 4. Banner & footer images   | Set public HTTPS image URLs, or leave blank to hide images.                                                            |
| 5. Panel & welcome messages | Write the public instructions, ticket welcome and privacy note.                                                        |
| 6. Button & form wording    | Advanced customization of displayed labels.                                                                            |

Start with Channels & staff roles. Choose the Support and Management roles first, then the open-ticket Discord category, the staff-only log, and the public panel text channel. Human staff roles must not have Administrator. The private log must deny access to unrelated roles and members.

Each editor explains its purpose. After saving, use **Setup home** to continue. Click **Post / refresh panel** when ready (or run **/setup panels**). This publishes a single Contact panel with Support and Management and retires the old tracked Order Info message. Repeated use updates the recorded message. Existing configured branding and images are preserved.

Category editors contain five fields: displayed name, description, optional emoji, optional staff-role override and optional ticket-folder override. Leave overrides empty to use the main settings. Category keys are managed internally; both types ask only for a subject and description.

Images are optional. Use a public HTTPS image URL. Discord controls the displayed size and cropping. A banner around 1200 × 320 and footer around 1200 × 64 are suitable starting points.

## 5. Use tickets

Members choose Support or Management in the Contact panel and submit the modal. This opens a NEW request. Close saves the transcript and deletes the channel after confirmation. Completed tickets do not block new requests. Reopen remains only for legacy archived channels. A deleted channel cannot be reopened; open a new ticket instead. One active ticket per member per server is enforced by a PostgreSQL unique index, including tickets being created/closed/reopened.

A ticket grants channel access to its owner, its category role, the bot, administrators, and explicitly added members. Added members can converse but do not receive staff management powers.

| Command/control                                     | Who can use it                                                  |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `/ticket info`                                      | Owner, participants, category staff, management, administrators |
| Close button / `/ticket close [reason]`             | Owner or authorized staff; requires confirmation                |
| Claim / Unclaim                                     | Category staff; only claimant or management/admin can unclaim   |
| Add/Remove Member / `/ticket add`, `/ticket remove` | Authorized staff                                                |
| Rename / `/ticket rename`                           | Authorized staff                                                |
| Move                                                | Authorized staff                                                |
| Reopen / `/ticket reopen`                           | Authorized staff                                                |
| Delete / `/ticket delete`                           | Management or administrators; requires confirmation             |
| Transcript / `/ticket transcript`                   | Authorized staff; private on-demand export                      |
| `/bot status`                                       | Members; pending-operation count shown only to administrators   |

Use ticket commands **inside that ticket's channel**. Add/Remove buttons ask for a member ID; slash commands offer Discord's member picker. Confirmations expire after two minutes. The default interaction cooldown is three seconds.

On closure, the bot freezes conversation, snapshots available messages, saves and uploads transcripts, posts an audit summary, verifies all uploaded attachments, deletes the channel, and finalizes DELETED state. There is no archive category requirement. Failed uploads or verification keep the channel intact for recovery. Deleted tickets cannot be reopened; use the public panel to create a new request. Legacy archived tickets retain their existing reopen/delete controls.

If transcript generation or upload fails, the channel stays preserved in CLOSING. Recovery retries every 30 seconds and after restarts. Correct the reported configuration/permission issue; do not manually delete the channel. Permanent deletion is blocked unless all current-cycle transcript attachments can still be verified in the private log.

If a channel is removed outside the bot, startup and new-ticket checks verify its existence with Discord. Only a confirmed missing channel releases the stale active-ticket block, preserving the database record, audit and any existing transcripts. Permission failures and network errors retain the record. A ticket still finishing its transcript remains blocked until closure completes.

## 6. Develop without Docker

Install Node.js 24 LTS and provide a PostgreSQL server. Use `localhost` in DATABASE_URL when Node runs on your PC and PostgreSQL is local. Do not run this development process while your cloud instance uses the same application/server.

```powershell
npm ci
npm run generate
npm run migrate:deploy
npm run commands:register
npm run dev
```

| Script                                      | Purpose                                      |
| ------------------------------------------- | -------------------------------------------- |
| `npm run dev`                               | TypeScript development with restart          |
| `npm run build` / `npm start`               | Compile / run compiled application           |
| `npm run format` / `npm run format:check`   | Format / check formatting                    |
| `npm run lint`                              | ESLint                                       |
| `npm run type-check`                        | Strict TypeScript check                      |
| `npm test`                                  | Unit tests, no secrets or Discord required   |
| `npm run test:integration`                  | Real PostgreSQL integration tests            |
| `npm run test:all`                          | Both test projects                           |
| `npm run generate`                          | Generate the Prisma client                   |
| `npm run migrate:dev -- --name change_name` | Create a development migration               |
| `npm run migrate:deploy`                    | Apply checked-in production migrations       |
| `npm run commands:register`                 | Register guild commands from source          |
| `npm run commands:register:prod`            | Register commands from compiled Docker image |

Integration tests require `TEST_DATABASE_URL` pointing at a **disposable UTF-8 database ending in `_test`**, already migrated. They are intentionally not silently skipped. Never point tests at production.

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/tickets_test'
npm run migrate:deploy
$env:TEST_DATABASE_URL = $env:DATABASE_URL
npm run test:all
```

Use a separate terminal/session from your production or development bot to avoid overwriting its connection environment.

## 7. Deploy to Railway: your PC can be off

See [docs/deployment.md](docs/deployment.md) for the full deployment, backup, update, and recovery checklist.

1. Put the extracted project in a **private GitHub repository**. Include source, lockfile, migrations, and Dockerfile; never include `.env`.
2. In Railway, create a project and add PostgreSQL with persistent storage. Use a UTF-8 database.
3. Add a service from that repository. Railway should detect the root Dockerfile.
4. Add the five variables from `.env.example` in the service's private Variables screen. Reference the PostgreSQL service's DATABASE_URL. Enter your token privately.
5. Set the pre-deploy command to `npm run migrate:deploy`. Leave the start command at the Dockerfile default, `node dist/src/index.js`.
6. Set the health-check path to `/health` and use the service's PORT.
7. Use **one replica** and turn **Serverless/app sleeping off**. Do not run a second copy on your PC. Stop the previous deployment before starting a replacement because the bot deliberately holds a PostgreSQL singleton lock.
8. Open the service's shell and run `npm run commands:register:prod` once, and again after command definitions change.
9. Check logs for `Support bot ready.`, then complete `/setup settings` and `/setup panels` in Discord.

The host and PostgreSQL must stay running. Your PC is needed only for initial uploads or local development. Free plans may sleep, expire, or change limits; verify current host terms and select an always-running plan. No hosting account, payment, deployment, or real Discord connection was created as part of packaging.

## Operations, privacy, and limitations

- [Architecture and recovery](docs/architecture.md)
- [Deployment, backups, updates, and troubleshooting](docs/deployment.md)
- [Privacy note and retention](docs/privacy.md)
- [Actual verification results](VERIFICATION.md)

Discord controls fonts, background, rounded corners, widths, and button colors. Orange container accents and optional media provide the reference's visual direction; there is no arbitrary CSS in Discord. V2 messages cannot contain legacy embeds, so private information and audit summaries use separate embed messages.

Transcripts include available message text, authors, timestamps, embed data, component data, attachment links, and original intake. They cannot recover deleted messages or prior edits. Attachment links may expire; the bot does not mirror attachment bytes. HTML escapes user content, rejects non-HTTPS attachment links, and disables scripts via a Content Security Policy.

The HTML is retained in PostgreSQL to recover interrupted uploads, and uploaded to the private staff log. Access, retention, and backups are the server operator's responsibility. Deleting a Discord ticket channel does not erase its database record or staff transcript.

No live Discord testing should be inferred from offline or simulated tests. Use a separate test server and application for the manual acceptance checklist in the deployment guide.

## Project structure

```text
support-ticket-bot/
├── src/
│   ├── index.ts
│   ├── config/            env.ts, settings.ts
│   ├── database/          client.ts
│   ├── discord/           commands.ts, permissions.ts, router.ts, settings-ui.ts, ui.ts
│   ├── infrastructure/    health.ts, logger.ts
│   ├── tickets/           policy.ts, repository.ts, service.ts
│   └── transcripts/       html.ts, service.ts
├── prisma/                schema.prisma, migrations/
├── scripts/               register-commands.ts
├── tests/                 unit/, integration/
├── docs/                  architecture.md, deployment.md, privacy.md
├── .github/workflows/     verify.yml
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore / .dockerignore / .prettierignore
├── package.json / package-lock.json
├── tsconfig.json / tsconfig.build.json
├── eslint.config.js / prettier.config.js / vitest.config.ts
├── README.md
└── VERIFICATION.md
```

Official references checked during implementation: [Discord components](https://docs.discord.com/developers/components/reference), [interactions](https://docs.discord.com/developers/interactions/receiving-and-responding), [permissions](https://docs.discord.com/developers/topics/permissions), [discord.js](https://discord.js.org/docs/packages/discord.js/14.27.0), [Prisma](https://www.prisma.io/docs/orm), and [Railway deployment documentation](https://docs.railway.com/deployments).
