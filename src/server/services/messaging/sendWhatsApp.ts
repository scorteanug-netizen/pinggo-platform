import type { SendWhatsAppInput, SendWhatsAppResult } from "@/server/services/messaging/types";
import { sendWhatsApp as sendStubWhatsApp } from "@/server/services/messaging/providers/stubWhatsAppProvider";

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  return sendStubWhatsApp(input);
}
