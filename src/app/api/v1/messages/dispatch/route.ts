import { OutboundChannel, OutboundMessageStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { sendWhatsApp } from "@/server/services/messaging/sendWhatsApp";

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

    for (const message of queuedMessages) {
      try {
        const sendResult = await sendWhatsApp({
          workspaceId: message.workspaceId,
          leadId: message.leadId,
          toPhone: message.toPhone ?? "",
          text: message.text,
        });
        const sentAt = new Date();

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

          await tx.eventLog.create({
            data: {
              leadId: message.leadId,
              eventType: "message_sent",
              payload: {
                channel: "whatsapp",
                provider: sendResult.provider,
                providerMessageId: sendResult.providerMessageId,
                messageId: message.id,
              } as Prisma.InputJsonValue,
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
        console.error(error);
        failed += 1;
      }
    }

    return NextResponse.json({ processed, sent, failed });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
