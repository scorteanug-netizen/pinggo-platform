export type SendWhatsAppInput = {
  workspaceId: string;
  leadId: string;
  toPhone: string;
  text: string;
  outboundMessageId?: string;
};

export type SendWhatsAppResult = {
  provider: string;
  providerMessageId: string;
  sentAt?: Date;
};
