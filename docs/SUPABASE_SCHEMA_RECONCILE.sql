-- Pinggo Platform - Supabase schema reconcile patch
-- Safe to run multiple times (idempotent).
-- Run in Supabase SQL Editor against the same database used by DATABASE_URL.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) User roles used by current auth/RBAC code
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserGlobalRole') THEN
    CREATE TYPE "UserGlobalRole" AS ENUM ('USER', 'SUPER_ADMIN');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "globalRole" "UserGlobalRole";

UPDATE "User"
SET "globalRole" = 'USER'
WHERE "globalRole" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "globalRole" SET DEFAULT 'USER',
  ALTER COLUMN "globalRole" SET NOT NULL;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "supabaseUserId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_supabaseUserId_key"
ON "User" ("supabaseUserId");

-- ---------------------------------------------------------------------------
-- 2) Workspace scoping for LeadEvent (required by reports/leads)
-- ---------------------------------------------------------------------------
ALTER TABLE "LeadEvent"
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

UPDATE "LeadEvent" AS event
SET "workspaceId" = lead."workspaceId"
FROM "Lead" AS lead
WHERE event."workspaceId" IS NULL
  AND lead."id" = event."leadId";

ALTER TABLE "LeadEvent"
  ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "LeadEvent_workspaceId_createdAt_idx"
ON "LeadEvent" ("workspaceId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LeadEvent_workspaceId_fkey'
  ) THEN
    ALTER TABLE "LeadEvent"
      ADD CONSTRAINT "LeadEvent_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Workspace scoping for SLAStageInstance (required by reports/SLA engine)
-- ---------------------------------------------------------------------------
ALTER TABLE "SLAStageInstance"
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

UPDATE "SLAStageInstance" AS stage
SET "workspaceId" = lead."workspaceId"
FROM "Lead" AS lead
WHERE stage."workspaceId" IS NULL
  AND lead."id" = stage."leadId";

UPDATE "SLAStageInstance" AS stage
SET "workspaceId" = flow."workspaceId"
FROM "Flow" AS flow
WHERE stage."workspaceId" IS NULL
  AND flow."id" = stage."flowId";

ALTER TABLE "SLAStageInstance"
  ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SLAStageInstance_workspaceId_status_dueAt_idx"
ON "SLAStageInstance" ("workspaceId", "status", "dueAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SLAStageInstance_workspaceId_fkey'
  ) THEN
    ALTER TABLE "SLAStageInstance"
      ADD CONSTRAINT "SLAStageInstance_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Workspace settings table used by /settings and SLA dueAt logic
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "WorkspaceSettings" (
  "workspaceId" TEXT NOT NULL,
  "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Bucharest',
  "schedule" JSONB,
  "defaultFlowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceSettings"
  ADD COLUMN IF NOT EXISTS "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Europe/Bucharest',
  ADD COLUMN IF NOT EXISTS "schedule" JSONB,
  ADD COLUMN IF NOT EXISTS "defaultFlowId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "WorkspaceSettings_defaultFlowId_idx"
ON "WorkspaceSettings" ("defaultFlowId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkspaceSettings_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceSettings"
      ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkspaceSettings_defaultFlowId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceSettings"
      ADD CONSTRAINT "WorkspaceSettings_defaultFlowId_fkey"
      FOREIGN KEY ("defaultFlowId") REFERENCES "Flow"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Optional verification queries:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY 1;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'LeadEvent' ORDER BY 1;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'SLAStageInstance' ORDER BY 1;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'WorkspaceSettings' ORDER BY 1;
