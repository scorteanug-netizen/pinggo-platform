import type { SendWhatsAppInput, SendWhatsAppResult } from "@/server/services/messaging/types";
import { isTwilioConfigured, sendWhatsAppMessage } from "@/server/integrations/twilioClient";
import { sendWhatsApp as sendStubWhatsApp } from "@/server/services/messaging/providers/stubWhatsAppProvider";

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  if (isTwilioConfigured()) {
    const result = await sendWhatsAppMessage({
      toPhone: input.toPhone,
      body: input.text,
      outboundMessageId: input.outboundMessageId,
    });
    return {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt: result.sentAt,
    };
  }
  return sendStubWhatsApp(input);
}
