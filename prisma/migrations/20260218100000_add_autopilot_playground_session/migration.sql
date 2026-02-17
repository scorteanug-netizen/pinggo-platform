-- CreateTable
CREATE TABLE "AutopilotPlaygroundSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "conversationJson" JSONB NOT NULL DEFAULT '[]',
    "lastRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotPlaygroundSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutopilotPlaygroundSession_scenarioId_userId_key" ON "AutopilotPlaygroundSession"("scenarioId", "userId");

-- CreateIndex
CREATE INDEX "AutopilotPlaygroundSession_workspaceId_idx" ON "AutopilotPlaygroundSession"("workspaceId");

-- AddForeignKey
ALTER TABLE "AutopilotPlaygroundSession" ADD CONSTRAINT "AutopilotPlaygroundSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotPlaygroundSession" ADD CONSTRAINT "AutopilotPlaygroundSession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutopilotScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
