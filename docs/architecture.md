# Architecture and failure recovery

## Runtime

A single Node.js process maintains the Discord Gateway connection. discord.js queues REST requests and handles Discord rate limits and gateway resume/reconnect. There is no public interaction webhook. PostgreSQL is the durable source of truth; local disk is not used for production ticket state.

A dedicated PostgreSQL connection holds a session advisory lock keyed by guild ID. Another instance refuses startup. Losing that connection shuts down the process. Use one replica and stop the old deployment before replacing it. This is intentionally not a horizontally scaled interaction processor.

SIGINT/SIGTERM stops intake and the recovery timer, marks health unavailable, drains tracked work, destroys the Discord client, and disconnects the database. A 25-second deadline exits if remote work cannot finish; durable operations resume on the next boot. Liveness is /live; readiness and the default hosting check are /ready and /health.

## Persistence

- GuildSettings: validated JSON and optimistic revision number.
- Panel: guild/kind to Discord message mapping for update-in-place.
- Ticket: owner, sequential number, role/destination snapshots, lifecycle, current operation, intake, claimant, priority, close metadata, and transcript generation.
- Participant: explicit member additions.
- Transcript: HTML parts, destination channel, upload acknowledgements, lifecycle generation.
- AuditEvent: actor, ticket, action, timestamp.
- Confirmation: user-bound, ticket-bound, expiring close/delete confirmation and lifecycle generation.

PostgreSQL migrations include a **partial unique index** on guild/owner for CREATING, OPEN, CLOSING, and REOPENING. It is intentionally maintained in migration SQL because the Prisma model cannot express this predicate fully. Do not replace migrations with `prisma db push` in production. Numbers are database sequences; gaps after rejected concurrent inserts are normal.

## State transitions

```text
CREATING → OPEN → CLOSING → CLOSED → DELETING → DELETED
              ↑               |
              └─ REOPENING ←──┘
```

The claim is independent of OPEN state. Claiming uses one conditional database update, so competing claimants cannot overwrite the winner. Operation acquisition also uses one conditional update with expected lifecycle and generation. Database transactions are short and never held open across Discord requests.

Each long-running ticket change stores its desired operation and parameters before touching Discord. A local in-flight guard prevents the worker and interaction handler from executing the same operation concurrently. The recovery loop retries unfinished operations every 30 seconds.

This is not a distributed transaction with Discord. Channel creation uses a durable topic marker to find channels created before a lost acknowledgement. Welcome recovery checks recent bot messages and uses Discord nonce enforcement. The bot cannot promise exactly-once messages across an arbitrarily long network partition. A rare ambiguous upload or audit-summary acknowledgement can cause a duplicate staff log message; preserving the transcript is preferred to deleting uncertain data.

## Closing and deleting

1. Reserve CLOSING and persist actor, reason, and close-request timestamp.
2. Replace permission overwrites to freeze conversation.
3. Fetch all currently available channel messages in pages of 100.
4. Add the original intake and render HTML with escaped content and safe HTTPS links.
5. Store all numbered HTML parts in PostgreSQL in a transaction.
6. Upload each part to the validated private log and record message IDs.
7. Post the audit summary and record the successful transcript generation.
8. Move the channel without syncing parent permissions, reapply the locked policy, and finalize CLOSED.

The close timestamp denotes when closure was accepted; final upload may finish later. Administrators bypass Discord locks. Transcripts are a snapshot of available messages, not a forensic history of edits or deletions.

A failed step retains the operation and channel. Already-created transcript parts are reused after restart. If the log destination is changed during an unfinished upload, restore the previous destination until the operation completes. Changing routing does not silently send parts of one transcript to multiple channels.

Delete requires CLOSED state, a fresh user confirmation, and live verification of every attachment for the current generation. There is no automatic deletion policy. If an upload is missing, deletion remains pending and the channel survives. Restore the archived message/attachment through an operator-reviewed recovery, or preserve the channel; do not remove the database safety marker to force deletion.

Reopening restores the original destination and current recorded access policy, clears closure metadata, and increments the transcript generation in the same transaction that clears its operation. A second active ticket for that owner blocks reopening.

## Security boundaries

The interaction router fetches current member roles, checks guild/channel/ticket identity, and authorizes each command, button, select, and modal submission. Confirmation IDs are unguessable database UUIDs, bound to user and lifecycle, and consumed once. Labels/custom IDs are not authorization.

Only setup administrators can save settings. Discord IDs are validated syntactically and resolved against the current server. Input lengths, category keys, URLs, and colors are validated. Channel names are normalized to bounded lowercase slugs. User-generated HTML is escaped, URL schemes are allowlisted, and transcript HTML has no active scripts.

Default allowedMentions disables all parsing and replied-user mentions. The creation message explicitly allows only the owner and assigned role once. Later edits cannot ping them. No external HTTP fetch is made for configurable artwork; Discord renders those image URLs.

Only safe error type/code metadata is logged. Raw Discord request errors, database URLs, tokens, headers, intake, and message content are not serialized to logs.

## Capacity and operational boundaries

This is a single-guild, single-instance bot. Transcript collection currently materializes one ticket's message history in memory before rendering; provision memory for your ticket size and close unusually large conversations before they grow without bound. Multiple ticket operations can run concurrently, but Discord rate limits still apply.

Discord limits category capacity and permission overwrite counts. The bot caps explicit participants at 80. If a category becomes full or is deleted, preserve the pending ticket and repair its destination. Watch pending-operation counts, database size (HTML archives accumulate), service memory, and logs.

The unit tests validate policy and payloads. Integration tests exercise real PostgreSQL constraints and lifecycle orchestration with simulated Discord adapters. A real-server acceptance test remains necessary before serving customers.
