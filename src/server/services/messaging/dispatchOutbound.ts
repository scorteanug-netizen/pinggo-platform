import {
  OutboundMessageStatus,
  ProofChannel,
  ProofType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db";
import { stubProvider } from "./providers/stubProvider";

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
    if (!msg.toPhone) {
      // No phone → mark FAILED
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
              reason: "missing_toPhone",
            } as unknown as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      });
      failed++;
      continue;
    }

    try {
      const result = await stubProvider.sendWhatsApp({
        toPhone: msg.toPhone,
        text: msg.text,
      });

      await prisma.$transaction(async (tx) => {
        await tx.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: OutboundMessageStatus.SENT,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            sentAt: result.sentAt,
          },
        });

        await tx.proofEvent.create({
          data: {
            leadId: msg.leadId,
            channel: ProofChannel.WHATSAPP,
            type: ProofType.SENT,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            occurredAt: result.sentAt,
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
              toPhone: msg.toPhone,
            } as unknown as Prisma.InputJsonValue,
            occurredAt: result.sentAt,
          },
        });
      });
      sent++;
    } catch {
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
