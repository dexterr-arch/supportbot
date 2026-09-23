# September 23 category access and notification update

Local validation: formatting, ESLint, TypeScript, production build, and all 65 tests passed. Integration tests use a disposable PostgreSQL database and simulated Discord channels. They verify both category access policies, persistent role notifications, and retry deduplication. No live Discord notification delivery test was performed. Docker verification runs in GitHub Actions because Docker is unavailable on this computer.

## Earlier verification records

# Verification report

Verified on 16 September 2026 on Windows, using Node.js 24.21.0 and a workspace-local PostgreSQL 17.6 test server. No real Discord token was created, supplied, or used.

| Step                             | Result                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Install dependencies             | Passed; package-lock.json included                                                                     |
| Prisma client generation         | Passed                                                                                                 |
| Prisma schema validation         | Passed                                                                                                 |
| Apply checked-in migration       | Passed against a disposable UTF-8 PostgreSQL database                                                  |
| Migration status / schema drift  | Up to date; no difference detected                                                                     |
| Format and formatting check      | Passed                                                                                                 |
| ESLint                           | Passed                                                                                                 |
| Strict TypeScript compiler       | Passed                                                                                                 |
| Unit tests                       | 38 passed                                                                                              |
| PostgreSQL integration tests     | 12 passed                                                                                              |
| Total automated tests            | 50 passed                                                                                              |
| Compile production JavaScript    | Passed                                                                                                 |
| npm vulnerability audit          | Zero known vulnerabilities at verification time                                                        |
| Invalid-credential startup check | Passed: placeholder environment rejected with exit code 1, without credential output                   |
| Docker image build               | Attempted, but **blocked: Docker is not installed in this environment**                                |
| Live Discord / real Gateway test | **Not performed: no token or test server was used**                                                    |
| Cloud deployment                 | Not performed; operator setup is documented                                                            |
| ZIP contents                     | Source, lockfile, migrations, deployment files, tests, and documentation; no real .env or node_modules |

## What the tests cover

Permission decisions; explicit channel-overwrite rules; administrator-free installation permissions; configuration validation; safe channel names; allowed lifecycle transitions; HTML/URL escaping; transcript splitting; panel and modal serialization; persistent control IDs; component/text budgets; health endpoint failure behavior; safe diagnostic logging; concurrent duplicate prevention; claim races; close races; claim-versus-close behavior; reopen conflicts; stale lifecycle confirmations; settings revision conflicts; initial ticket creation; failed transcript upload and restart recovery; missing-transcript deletion protection; and close/reopen/reclose/delete sequencing.

Database integration tests use real PostgreSQL, including the partial unique index and conditional concurrent writes. Lifecycle tests simulate Discord through in-process adapters. They do not demonstrate that Discord accepted a real message or permission edit.

Expected synthetic failure tests emit sanitized error log lines while verifying that channels are preserved. These are intentional test inputs.

## Remaining release gates

Before customer use:

1. Run `docker build -t support-ticket-bot:1.0.0 .` on Docker Desktop, a Docker host, or the included CI workflow. This package must not be described as having a successfully verified Docker image until that command succeeds.
2. Supply credentials privately and complete the real-server acceptance checklist in [docs/deployment.md](docs/deployment.md).
3. Deploy exactly one always-running bot instance, configure durable PostgreSQL and backups, and customize terms, pricing, privacy, roles, channels, and artwork.

The CI workflow contains installation, migration, formatting, lint, TypeScript, tests, build, dependency audit, and Docker build steps. It was supplied but not dispatched to an external account during this task.

## Update verification — 2026-09-17

Support/Management-only interface, guided setup, and stale-channel recovery:

- Formatting, lint, TypeScript, production build: passed locally.
- 63 tests passed: unit tests plus real disposable PostgreSQL with simulated Discord, including both ticket categories, close/reopen, new tickets after closure, missing-channel recovery, and permission-error safeguards.
- GitHub verification passed for commit 2477f672b630f151f9f6995115038c0ea40f6929, including the production Docker image build and dependency audit.
- All 14 uploaded change files matched the locally tested release.
- The release ZIP excludes secrets and uses placeholders in .env.example.
- Live Discord lifecycle testing is separate from these simulated tests. See deployment status in the conversation for cloud rollout results.

Live deployment: Railway deployment 130b7330-7dc1-4756-8c66-a595a43960af became Active on September 17, 2026. Startup logs confirm guild command registration, Support bot ready, and removal of the stale active-ticket block after Discord confirmed the channel no longer exists. A complete manual Discord ticket lifecycle was not performed.

## Transcript-first deletion update - 2026-09-18

62 tests passed with disposable PostgreSQL and simulated Discord. Formatting, lint, type checking and production compilation passed. A subsequent configuration-only change passed lint, type checking and all 44 unit tests. Tests verify upload failure preserves a channel, uploaded attachments are checked before deletion, successful closure permits a new request, simplified controls omit branding/escalation/priority, and role-notification permission is scoped to the bot in private tickets. All 16 changed files matched the uploaded branch. This does not constitute a manual Discord lifecycle test.

Final notification adjustment: channel creation uses baseline overwrites; the private-channel notification overwrite is applied before the welcome send. All 62 tests passed again after restarting the disposable local PostgreSQL service. Lint, type checking and production compilation passed. GitHub PR #2 passed both cloud checks including Docker. Final follow-up: PR #3.

Final deployment verified on 2026-09-18: PR #3 passed both GitHub checks including Docker build and was merged. Railway deployment 0c255ab0-b79c-43a7-b84b-faaab7e2d539 is Active; logs confirm guild command registration and Support bot ready after the previous instance released its singleton lock. No manual live Discord close/delete test was performed.

## Persistent Support Team notification fix - 2026-09-18

Both ticket categories now send a separate plain-text mention of the configured Support Team role. Category-specific access is unchanged. Audit and message-history recovery suppress duplicate notifications. Formatting, lint, TypeScript and production build passed; all 64 tests passed with disposable PostgreSQL and simulated Discord. Tests cover persistence across UI edits, retry after a missing audit acknowledgement, and no Support-role access grant in Management tickets. Three uploaded files matched local source. Live Discord push-notification delivery is not inferred from these tests.
