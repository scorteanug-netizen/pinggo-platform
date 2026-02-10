-- Add soft-disable support for workspaces/companies
ALTER TABLE "Workspace"
ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE INDEX "Workspace_disabledAt_idx" ON "Workspace"("disabledAt");
