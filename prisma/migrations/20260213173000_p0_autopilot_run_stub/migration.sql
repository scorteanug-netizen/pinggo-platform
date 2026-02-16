-- CreateEnum
CREATE TYPE "AutopilotRunStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'HANDED_OVER', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboundChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AutopilotRun" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "AutopilotRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStep" TEXT NOT NULL DEFAULT 'welcome',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" "OutboundChannel" NOT NULL DEFAULT 'WHATSAPP',
    "text" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutopilotRun_leadId_key" ON "AutopilotRun"("leadId");

-- CreateIndex
CREATE INDEX "AutopilotRun_workspaceId_status_idx" ON "AutopilotRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OutboundMessage_leadId_createdAt_idx" ON "OutboundMessage"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_workspaceId_status_createdAt_idx" ON "OutboundMessage"("workspaceId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AutopilotRun" ADD CONSTRAINT "AutopilotRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotRun" ADD CONSTRAINT "AutopilotRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
