import crypto from "node:crypto";
import type { MessagingProvider, SendResult } from "./types";

/**
 * Stub WhatsApp provider — no external calls, returns a random message ID.
 * Used for local development and testing.
 */
export const stubProvider: MessagingProvider = {
  async sendWhatsApp({ toPhone: _toPhone, text: _text }): Promise<SendResult> {
    return {
      provider: "stub",
      providerMessageId: `stub-${crypto.randomUUID()}`,
      sentAt: new Date(),
    };
  },
};
