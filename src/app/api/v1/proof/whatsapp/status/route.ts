import { Prisma, ProofChannel, ProofType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { stopSlaClock } from "@/server/services/slaEngine";

const schema = z.object({
  leadId: z.string().trim().min(1),
  provider: z.enum(["stub", "twilio", "360dialog"]),
  providerMessageId: z.string().trim().min(1),
  status: z.enum(["delivered", "read"]),
});

const STATUS_TO_PROOF_TYPE: Record<z.infer<typeof schema>["status"], ProofType> = {
  delivered: ProofType.DELIVERED,
  read: ProofType.READ,
};

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    const proofType = STATUS_TO_PROOF_TYPE[payload.status];
    const now = new Date();

    const proofEventResult = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: payload.leadId },
        select: { id: true },
      });

      if (!lead) {
        return { leadNotFound: true as const };
      }

      const existing = await tx.proofEvent.findFirst({
        where: {
          leadId: payload.leadId,
          channel: ProofChannel.WHATSAPP,
          providerMessageId: payload.providerMessageId,
          type: proofType,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.eventLog.create({
          data: {
            leadId: payload.leadId,
            eventType: "proof_whatsapp_status",
            payload: {
              provider: payload.provider,
              providerMessageId: payload.providerMessageId,
              status: payload.status,
              reused: true,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
        return {
          leadNotFound: false as const,
          proofEventId: existing.id,
          reused: true as const,
        };
      }

      const proofEvent = await tx.proofEvent.create({
        data: {
          leadId: payload.leadId,
          channel: ProofChannel.WHATSAPP,
          provider: payload.provider,
          providerMessageId: payload.providerMessageId,
          type: proofType,
          occurredAt: now,
          isManual: false,
        },
        select: { id: true },
      });

      await tx.eventLog.create({
        data: {
          leadId: payload.leadId,
          eventType: "proof_whatsapp_status",
          payload: {
            provider: payload.provider,
            providerMessageId: payload.providerMessageId,
            status: payload.status,
            reused: false,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return {
        leadNotFound: false as const,
        proofEventId: proofEvent.id,
        reused: false as const,
      };
    });

    if (proofEventResult.leadNotFound) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const stopResult = await stopSlaClock(
      payload.leadId,
      `Dovada: WhatsApp ${payload.status}`,
      proofEventResult.proofEventId,
    );
    const slaStopped = stopResult.alreadyStopped === false;

    return NextResponse.json(
      {
        proofEventId: proofEventResult.proofEventId,
        leadId: payload.leadId,
        status: payload.status,
        reused: proofEventResult.reused,
        slaStopped,
      },
      { status: proofEventResult.reused ? 200 : 201 },
    );
  } catch (error) {
    console.error("[proof/whatsapp/status]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
