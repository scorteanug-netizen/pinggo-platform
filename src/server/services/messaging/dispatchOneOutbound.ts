import {
  OutboundChannel,
  OutboundMessageStatus,
  ProofChannel,
  ProofType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db";
import { sendWhatsApp } from "./sendWhatsApp";

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message ?? "";
    if (msg.includes("TWILIO") || msg.includes("sid") || /[A-Z]{2}[a-z0-9]{32}/.test(msg)) {
      return "provider_error";
    }
    return msg.slice(0, 200).replace(/\s+/g, " ").trim() || "provider_error";
  }
  return "provider_error";
}

export type DispatchOneResult =
  | { sent: true }
  | { failed: true; reason?: string }
  | { skipped: true; reason: string };

async function logAutoDispatchAttempted(
  leadId: string,
  outboundMessageId: string,
  result: "sent" | "failed" | "skipped",
  reason?: string
) {
  await prisma.eventLog.create({
    data: {
      leadId,
      eventType: "auto_dispatch_attempted",
      payload: {
        outboundMessageId,
        result,
        ...(reason ? { reason } : {}),
      } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Dispatch a single outbound message by id. Idempotent: no-op if not QUEUED.
 * Uses same send + persist logic as POST /api/v1/messages/dispatch.
 */
export async function dispatchOneOutboundMessage(
  outboundMessageId: string
): Promise<DispatchOneResult> {
  const message = await prisma.outboundMessage.findFirst({
    where: { id: outboundMessageId, channel: OutboundChannel.WHATSAPP },
    select: { id: true, leadId: true, workspaceId: true, toPhone: true, text: true, status: true },
  });

  if (!message) {
    return { skipped: true, reason: "not_found" };
  }

  if (message.status !== OutboundMessageStatus.QUEUED) {
    await logAutoDispatchAttempted(message.leadId, outboundMessageId, "skipped", "not_queued");
    return { skipped: true, reason: "not_queued" };
  }

  const toPhone = (message.toPhone ?? "").trim();
  if (!toPhone) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.outboundMessage.updateMany({
        where: {
          id: message.id,
          status: OutboundMessageStatus.QUEUED,
          channel: OutboundChannel.WHATSAPP,
        },
        data: { status: OutboundMessageStatus.FAILED },
      });
      await tx.eventLog.create({
        data: {
          leadId: message.leadId,
          eventType: "message_failed",
          payload: {
            reason: "missing_toPhone",
            outboundMessageId: message.id,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      await tx.eventLog.create({
        data: {
          leadId: message.leadId,
          eventType: "auto_dispatch_attempted",
          payload: {
            outboundMessageId: message.id,
            result: "failed",
            reason: "missing_toPhone",
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });
    return { failed: true, reason: "missing_toPhone" };
  }

  const now = new Date();

  try {
    const sendResult = await sendWhatsApp({
      workspaceId: message.workspaceId,
      leadId: message.leadId,
      toPhone,
      text: message.text,
      outboundMessageId: message.id,
    });
    const sentAt = sendResult.sentAt ?? now;

    const didSend = await prisma.$transaction(async (tx) => {
      const updated = await tx.outboundMessage.updateMany({
        where: {
          id: message.id,
          status: OutboundMessageStatus.QUEUED,
          channel: OutboundChannel.WHATSAPP,
        },
        data: {
          status: OutboundMessageStatus.SENT,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          sentAt,
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.proofEvent.create({
        data: {
          leadId: message.leadId,
          channel: ProofChannel.WHATSAPP,
          type: ProofType.SENT,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          occurredAt: sentAt,
        },
      });

      await tx.eventLog.create({
        data: {
          leadId: message.leadId,
          eventType: "message_sent",
          payload: {
            channel: "whatsapp",
            provider: sendResult.provider,
            providerMessageId: sendResult.providerMessageId,
            messageId: message.id,
            toPhone,
          } as Prisma.InputJsonValue,
          occurredAt: sentAt,
        },
      });

      await tx.eventLog.create({
        data: {
          leadId: message.leadId,
          eventType: "auto_dispatch_attempted",
          payload: {
            outboundMessageId: message.id,
            result: "sent",
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return true;
    });

    if (didSend) {
      return { sent: true };
    }

    await logAutoDispatchAttempted(message.leadId, outboundMessageId, "skipped", "raced");
    return { skipped: true, reason: "raced" };
  } catch (error) {
    const reason = sanitizeErrorMessage(error);
    await prisma.$transaction(async (tx) => {
      await tx.outboundMessage.updateMany({
        where: {
          id: message.id,
          status: OutboundMessageStatus.QUEUED,
          channel: OutboundChannel.WHATSAPP,
        },
        data: { status: OutboundMessageStatus.FAILED },
      });
      await tx.eventLog.create({
        data: {
          leadId: message.leadId,
          eventType: "message_failed",
          payload: {
            outboundMessageId: message.id,
            reason: "provider_error",
            errorMessage: reason,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      await tx.eventLog.create({
        data: {
          leadId: message.leadId,
          eventType: "auto_dispatch_attempted",
          payload: {
            outboundMessageId: message.id,
            result: "failed",
            reason,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });
    return { failed: true, reason };
  }
}
