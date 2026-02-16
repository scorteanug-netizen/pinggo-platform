-- AlterTable: add company & agent context fields to AutopilotScenario
ALTER TABLE "AutopilotScenario" ADD COLUMN "agentName" TEXT;
ALTER TABLE "AutopilotScenario" ADD COLUMN "companyName" TEXT;
ALTER TABLE "AutopilotScenario" ADD COLUMN "companyDescription" TEXT;
ALTER TABLE "AutopilotScenario" ADD COLUMN "offerSummary" TEXT;
ALTER TABLE "AutopilotScenario" ADD COLUMN "calendarLinkRaw" TEXT;
ALTER TABLE "AutopilotScenario" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ro';
ALTER TABLE "AutopilotScenario" ADD COLUMN "tone" TEXT;
ALTER TABLE "AutopilotScenario" ADD COLUMN "knowledgeBaseJson" JSONB;
