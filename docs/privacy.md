# Ticket privacy notice

Adapt this notice to your organization and display it alongside your Terms of Service.

When you open a support ticket, this bot stores your Discord user ID, server/channel IDs, category, subject, description, and any order service, budget, and deadline you submit. It also stores staff assignment, priority, added participants, lifecycle dates, closing actor/reason, and management audit events.

Authorized staff can access ticket channels. The ticket owner and explicitly added members can access their conversation. Server administrators have access under Discord's permission model. An escalation can replace the staff role allowed to see the channel.

When a ticket closes, available message content, author information, timestamps, embeds, components, and attachment links are copied into an HTML transcript. Original intake is included. HTML copies are stored in PostgreSQL for recovery and uploaded to a private staff log channel. Staff may also request private on-demand exports. Deleted messages and previous edits are not recoverable.

The bot does not download or back up the bytes of user attachments. Discord attachment links can expire. Optional artwork is hosted at URLs chosen by your administrators; placeholders initially use placehold.co.

Deleting the ticket channel does not automatically delete its database metadata or transcripts. The default retention policy is **retain until the operator removes the data**. Set a documented retention period suitable for your business before launch. An authorized operator must remove relevant private log messages, PostgreSQL ticket/transcript/audit/participant records, exports, and backups according to that policy. Backups may retain older copies until their retention expires.

Do not include passwords, payment card details, API tokens, or other secrets in tickets. Contact your server administrators to request access, correction, or deletion of stored ticket data.

Your organization operates the Discord application, cloud service, PostgreSQL database, and backups. Restrict hosting access to trusted administrators and protect database connections and backups. This notice describes the software's behavior and is not a substitute for your organization's privacy policy.
