-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "workspaceId" TEXT NOT NULL,
    "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Bucharest',
    "schedule" JSONB,
    "defaultFlowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE INDEX "WorkspaceSettings_defaultFlowId_idx" ON "WorkspaceSettings"("defaultFlowId");

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_defaultFlowId_fkey" FOREIGN KEY ("defaultFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
