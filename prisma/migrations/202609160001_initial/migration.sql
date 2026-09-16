-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "channelId" TEXT,
    "welcomeMessageId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "claimId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "name" TEXT,
    "parentId" TEXT,
    "operation" TEXT,
    "operationData" JSONB,
    "lastFailureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closeReason" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "transcriptGeneration" INTEGER,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("ticketId","userId")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "part" INTEGER NOT NULL,
    "html" TEXT NOT NULL,
    "logChannelId" TEXT NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Confirmation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Panel" (
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("guildId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_ownerId_idx" ON "Ticket"("guildId", "ownerId");

-- CreateIndex
CREATE INDEX "Ticket_operation_idx" ON "Ticket"("operation");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_ticketId_generation_part_key" ON "Transcript"("ticketId", "generation", "part");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Enforced by PostgreSQL even when concurrent requests arrive on separate connections.
CREATE UNIQUE INDEX "Ticket_one_active_per_owner" ON "Ticket" ("guildId", "ownerId") WHERE "status" IN ('CREATING', 'OPEN', 'CLOSING', 'REOPENING');
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_valid_status" CHECK ("status" IN ('CREATING', 'OPEN', 'CLOSING', 'CLOSED', 'REOPENING', 'DELETING', 'DELETED'));
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_valid_priority" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
