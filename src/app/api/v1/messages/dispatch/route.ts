import {
  OutboundChannel,
  OutboundMessageStatus,
  ProofChannel,
  ProofType,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { sendWhatsApp } from "@/server/services/messaging/sendWhatsApp";
import { logger } from "@/lib/logger";

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

export async function POST(_request: NextRequest) {
  try {
    const queuedMessages = await prisma.outboundMessage.findMany({
      where: {
        status: OutboundMessageStatus.QUEUED,
        channel: OutboundChannel.WHATSAPP,
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: {
        id: true,
        workspaceId: true,
        leadId: true,
        toPhone: true,
        text: true,
      },
    });

    const processed = queuedMessages.length;
    let sent = 0;
    let failed = 0;
    const now = new Date();

    for (const message of queuedMessages) {
      const toPhone = (message.toPhone ?? "").trim();
      if (!toPhone) {
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
        });
        failed += 1;
        continue;
      }

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

          return true;
        });

        if (didSend) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        logger.error("[messages/dispatch]", error);
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
        });
        failed += 1;
      }
    }

    return NextResponse.json({ processed, sent, failed });
  } catch (error) {
    logger.error("[messages/dispatch]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
