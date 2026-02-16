-- CreateEnum
CREATE TYPE "ProofChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'CALL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('SENT', 'DELIVERED', 'READ', 'REPLIED', 'BOOKED', 'MANUAL_CONFIRMED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'WON';
ALTER TYPE "LeadStatus" ADD VALUE 'LOST';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "email" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "SLAState" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "breachedAt" TIMESTAMP(3),

    CONSTRAINT "SLAState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "ProofChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "type" "ProofType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SLAState_leadId_key" ON "SLAState"("leadId");

-- CreateIndex
CREATE INDEX "SLAState_deadlineAt_idx" ON "SLAState"("deadlineAt");

-- CreateIndex
CREATE INDEX "ProofEvent_leadId_occurredAt_idx" ON "ProofEvent"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProofEvent_providerMessageId_idx" ON "ProofEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "EventLog_leadId_occurredAt_idx" ON "EventLog"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "EventLog_actorUserId_idx" ON "EventLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "SLAState" ADD CONSTRAINT "SLAState_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofEvent" ADD CONSTRAINT "ProofEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

