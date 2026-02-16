import { randomUUID } from "crypto";

type SendWhatsAppStubInput = {
  leadId: string;
  text: string;
};

type SendWhatsAppStubResult = {
  provider: "stub";
  providerMessageId: string;
};

export async function sendWhatsAppStub({
  leadId: _leadId,
  text: _text,
}: SendWhatsAppStubInput): Promise<SendWhatsAppStubResult> {
  return {
    provider: "stub",
    providerMessageId: `stub_${randomUUID()}`,
  };
}
