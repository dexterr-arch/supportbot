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
