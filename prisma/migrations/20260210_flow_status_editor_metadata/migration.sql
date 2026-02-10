ALTER TABLE "Flow"
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "lastEditedByUserId" TEXT;

UPDATE "Flow"
SET "publishedAt" = "updatedAt"
WHERE "publishedAt" IS NULL;

CREATE INDEX "Flow_workspaceId_publishedAt_idx" ON "Flow"("workspaceId", "publishedAt");
CREATE INDEX "Flow_lastEditedByUserId_idx" ON "Flow"("lastEditedByUserId");

ALTER TABLE "Flow"
  ADD CONSTRAINT "Flow_lastEditedByUserId_fkey"
  FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
