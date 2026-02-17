/**
 * Twilio WhatsApp client. Uses env vars:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886 for sandbox)
 */
import Twilio from "twilio";

export type SendWhatsAppMessageInput = {
  toPhone: string;
  body: string;
  outboundMessageId?: string;
};

export type SendWhatsAppMessageResult = {
  provider: "twilio";
  providerMessageId: string;
  sentAt: Date;
};

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) {
    return null;
  }
  return { accountSid, authToken, from };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null;
}

function toWhatsAppNumber(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  if (trimmed.startsWith("+")) return `whatsapp:${trimmed}`;
  return `whatsapp:+${trimmed}`;
}

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput
): Promise<SendWhatsAppMessageResult> {
  const config = getTwilioConfig();
  if (!config) {
    throw new Error("Twilio not configured: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM");
  }

  const client = Twilio(config.accountSid, config.authToken);
  const to = toWhatsAppNumber(input.toPhone);

  const message = await client.messages.create({
    body: input.body,
    from: config.from,
    to,
  });

  return {
    provider: "twilio",
    providerMessageId: message.sid,
    sentAt: message.dateCreated ? new Date(message.dateCreated) : new Date(),
  };
}
