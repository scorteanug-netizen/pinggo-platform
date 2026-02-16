-- AlterTable: add conversation state fields to AutopilotRun
ALTER TABLE "AutopilotRun" ADD COLUMN "stateJson" JSONB;
ALTER TABLE "AutopilotRun" ADD COLUMN "lastInboundAt" TIMESTAMP(3);
ALTER TABLE "AutopilotRun" ADD COLUMN "lastOutboundAt" TIMESTAMP(3);
