-- CreateEnum
CREATE TYPE "AutopilotScenarioType" AS ENUM ('QUALIFY_ONLY', 'QUALIFY_AND_BOOK');

-- CreateEnum
CREATE TYPE "AutopilotScenarioMode" AS ENUM ('RULES', 'AI');

-- CreateTable
CREATE TABLE "AutopilotScenario" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scenarioType" "AutopilotScenarioType" NOT NULL DEFAULT 'QUALIFY_ONLY',
    "mode" "AutopilotScenarioMode" NOT NULL DEFAULT 'RULES',
    "aiPrompt" TEXT,
    "slaMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxQuestions" INTEGER NOT NULL DEFAULT 2,
    "handoverUserId" TEXT,
    "bookingConfigJson" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutopilotScenario_workspaceId_idx" ON "AutopilotScenario"("workspaceId");

-- CreateIndex
CREATE INDEX "AutopilotScenario_workspaceId_isDefault_idx" ON "AutopilotScenario"("workspaceId", "isDefault");

-- CreateIndex
CREATE INDEX "AutopilotScenario_handoverUserId_idx" ON "AutopilotScenario"("handoverUserId");

-- AddForeignKey
ALTER TABLE "AutopilotScenario" ADD CONSTRAINT "AutopilotScenario_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotScenario" ADD CONSTRAINT "AutopilotScenario_handoverUserId_fkey" FOREIGN KEY ("handoverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add nullable scenarioId to AutopilotRun
ALTER TABLE "AutopilotRun" ADD COLUMN "scenarioId" TEXT;

-- CreateIndex
CREATE INDEX "AutopilotRun_scenarioId_idx" ON "AutopilotRun"("scenarioId");

-- AddForeignKey
ALTER TABLE "AutopilotRun" ADD CONSTRAINT "AutopilotRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutopilotScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
