# Latest update: transcript then delete

Close now asks for confirmation, saves and verifies the staff transcript, then deletes the channel. Failed uploads preserve the channel. There is no archive step. Escalate, Priority and the brand suffix in ticket headings are removed. Opening notifies the assigned category role once. Existing open ticket controls refresh during startup without re-pinging staff.

# Support and Management update — 2026-09-17

This update includes the unfinished shop removal, a guided setup dashboard, and recovery of stale active-ticket records.

- One Contact panel: Support and Management only. No Order Info, pricing, shop menu or order intake.
- Existing branding, images and role/channel settings are preserved. Older commerce fields remain stored solely for compatibility.
- Setup uses numbered sections with descriptions, role/channel pickers, and category forms instead of JSON.
- Setup home and Post / refresh panel buttons guide the next step. Navigation does not trigger the ticket-action cooldown.
- A successful closure permits a new ticket. Reopen applies only to old archived channels; newly closed tickets are deleted.
- Confirmed missing channels release stale duplicate blocks, including old records at startup. Network errors and missing permissions never clear the block.
- Ticket history and stored transcripts are preserved; no transcript completion is assumed for channels deleted outside the bot.
- Existing public panels refresh at startup. The bot removes only its tracked old Order Info message; copied messages are not touched.

## Update an existing Railway deployment

Replace the source files in the existing GitHub repository, keeping Dockerfile and package.json at the root. Keep the existing PostgreSQL database and Railway secrets. Do not upload .env or any token. No new database migration is needed.

Keep one bot instance. Build the replacement, stop the old bot deployment, then let the replacement start. The singleton lock intentionally prevents two copies processing interactions.

After deployment, run /setup settings in Discord to use the new dashboard. Existing saved settings remain in place. Use Post / refresh panel if automatic panel refresh reports a permission problem. To test, open a Support ticket, close and confirm, then open a new one. Verify transcript-first deletion for both Support and Management.

Local tests use a real disposable PostgreSQL database and simulated Discord. They do not prove a live Discord ticket lifecycle.
