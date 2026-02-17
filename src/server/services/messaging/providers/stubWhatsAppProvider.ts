import { randomUUID } from "crypto";
import type { SendWhatsAppInput, SendWhatsAppResult } from "@/server/services/messaging/types";

export async function sendWhatsApp(_input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  return {
    provider: "stub",
    providerMessageId: `stub_${randomUUID()}`,
    sentAt: new Date(),
  };
}
