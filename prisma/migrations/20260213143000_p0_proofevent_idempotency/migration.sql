-- Add idempotency guard for ProofEvent webhook/provider retries.
ALTER TABLE "ProofEvent"
ADD CONSTRAINT "ProofEvent_leadId_providerMessageId_type_channel_key"
UNIQUE ("leadId", "providerMessageId", "type", "channel");
