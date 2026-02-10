ALTER TYPE "LeadSourceType" ADD VALUE IF NOT EXISTS 'FORM';
ALTER TYPE "LeadSourceType" ADD VALUE IF NOT EXISTS 'CRM';
ALTER TYPE "LeadSourceType" ADD VALUE IF NOT EXISTS 'WHATSAPP';

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_workspaceId_sourceType_externalId_key"
  ON "Lead"("workspaceId", "sourceType", "externalId");
