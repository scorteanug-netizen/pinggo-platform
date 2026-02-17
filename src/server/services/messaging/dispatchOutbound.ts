import {
  OutboundMessageStatus,
  ProofChannel,
  ProofType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db";
import { sendWhatsApp } from "./sendWhatsApp";

type DispatchSummary = {
  processed: number;
  sent: number;
  failed: number;
};

/**
 * Picks up QUEUED outbound messages and dispatches them via the stub provider.
 * Creates ProofEvent + EventLog for each successfully sent message.
 */
export async function dispatchQueuedOutbound(
  now = new Date(),
  limit = 20,
): Promise<DispatchSummary> {
  const queued = await prisma.outboundMessage.findMany({
    where: { status: OutboundMessageStatus.QUEUED },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      leadId: true,
      workspaceId: true,
      toPhone: true,
      text: true,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const msg of queued) {
    const toPhone = (msg.toPhone ?? "").trim();
    if (!toPhone) {
      await prisma.$transaction(async (tx) => {
        await tx.outboundMessage.update({
          where: { id: msg.id },
          data: { status: OutboundMessageStatus.FAILED },
        });
        await tx.eventLog.create({
          data: {
            leadId: msg.leadId,
            eventType: "message_failed",
            payload: {
              reason: "missing_toPhone",
              outboundMessageId: msg.id,
            } as unknown as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      });
      failed++;
      continue;
    }

    try {
      const result = await sendWhatsApp({
        workspaceId: msg.workspaceId,
        leadId: msg.leadId,
        toPhone,
        text: msg.text,
        outboundMessageId: msg.id,
      });
      const sentAt = result.sentAt ?? now;

      await prisma.$transaction(async (tx) => {
        await tx.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: OutboundMessageStatus.SENT,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            sentAt,
          },
        });

        await tx.proofEvent.create({
          data: {
            leadId: msg.leadId,
            channel: ProofChannel.WHATSAPP,
            type: ProofType.SENT,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            occurredAt: sentAt,
          },
        });

        await tx.eventLog.create({
          data: {
            leadId: msg.leadId,
            eventType: "message_sent",
            payload: {
              outboundMessageId: msg.id,
              provider: result.provider,
              providerMessageId: result.providerMessageId,
              toPhone,
            } as unknown as Prisma.InputJsonValue,
            occurredAt: sentAt,
          },
        });
      });
      sent++;
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : "";
      const errorMessage =
        /TWILIO|sid|[A-Z]{2}[a-z0-9]{32}/.test(rawMsg)
          ? "provider_error"
          : rawMsg.slice(0, 200).replace(/\s+/g, " ").trim() || "provider_error";
      await prisma.$transaction(async (tx) => {
        await tx.outboundMessage.update({
          where: { id: msg.id },
          data: { status: OutboundMessageStatus.FAILED },
        });
        await tx.eventLog.create({
          data: {
            leadId: msg.leadId,
            eventType: "message_failed",
            payload: {
              outboundMessageId: msg.id,
              reason: "provider_error",
              errorMessage,
            } as unknown as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      });
      failed++;
    }
  }

  return { processed: queued.length, sent, failed };
}
