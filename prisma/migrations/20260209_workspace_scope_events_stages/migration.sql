-- Add workspace scope for LeadEvent
ALTER TABLE "LeadEvent" ADD COLUMN "workspaceId" TEXT;

UPDATE "LeadEvent" AS event
SET "workspaceId" = lead."workspaceId"
FROM "Lead" AS lead
WHERE lead."id" = event."leadId";

ALTER TABLE "LeadEvent" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE INDEX "LeadEvent_workspaceId_createdAt_idx" ON "LeadEvent"("workspaceId", "createdAt");

ALTER TABLE "LeadEvent"
ADD CONSTRAINT "LeadEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Add workspace scope for SLAStageInstance
ALTER TABLE "SLAStageInstance" ADD COLUMN "workspaceId" TEXT;

UPDATE "SLAStageInstance" AS stage
SET "workspaceId" = lead."workspaceId"
FROM "Lead" AS lead
WHERE lead."id" = stage."leadId";

UPDATE "SLAStageInstance" AS stage
SET "workspaceId" = flow."workspaceId"
FROM "Flow" AS flow
WHERE stage."workspaceId" IS NULL
  AND flow."id" = stage."flowId";

ALTER TABLE "SLAStageInstance" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE INDEX "SLAStageInstance_workspaceId_status_dueAt_idx"
ON "SLAStageInstance"("workspaceId", "status", "dueAt");

ALTER TABLE "SLAStageInstance"
ADD CONSTRAINT "SLAStageInstance_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
