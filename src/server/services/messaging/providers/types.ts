export type ProviderName = "stub";

export type SendResult = {
  provider: ProviderName;
  providerMessageId: string;
  sentAt: Date;
};

export interface MessagingProvider {
  sendWhatsApp(args: { toPhone: string; text: string }): Promise<SendResult>;
}
