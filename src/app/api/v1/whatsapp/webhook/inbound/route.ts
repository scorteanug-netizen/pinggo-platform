import { LeadSourceType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { processAutopilotReply } from "@/server/services/autopilot/processReply";
import { ProofChannel, ProofType } from "@prisma/client";
import { getDefaultScenario } from "@/server/services/autopilot/getDefaultScenario";

const inboundSchema = z.object({
  workspaceId: z.string().trim().min(1),
  fromPhone: z.string().trim().min(1),
  text: z.string().trim().min(1),
  provider: z.string().trim().default("stub"),
  providerMessageId: z.string().trim().min(1),
});

const CLOSED_STATUSES = ["WON", "LOST", "ARCHIVED", "SPAM"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = inboundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { workspaceId, fromPhone, text, provider, providerMessageId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      // 1) Lead lookup: workspaceId + phone exact match, status not closed
      const lead = await tx.lead.findFirst({
        where: {
          workspaceId,
          phone: fromPhone,
          status: { notIn: [...CLOSED_STATUSES] },
        },
        select: { id: true },
      });

      if (!lead) {
        // Unmatched: create EventLog via inbox lead
        const inboxLead = await tx.lead.upsert({
          where: {
            workspaceId_sourceType_externalId: {
              workspaceId,
              sourceType: LeadSourceType.WEBHOOK,
              externalId: "__webhook_inbox__",
            },
          },
          create: {
            workspaceId,
            sourceType: LeadSourceType.WEBHOOK,
            externalId: "__webhook_inbox__",
          },
          update: {},
          select: { id: true },
        });

        await tx.eventLog.create({
          data: {
            leadId: inboxLead.id,
            eventType: "whatsapp_inbound_unmatched",
            payload: {
              workspaceId,
              fromPhone,
              provider,
              providerMessageId,
            } as Prisma.InputJsonValue,
          },
        });

        return {
          leadId: null as string | null,
          processed: false,
          reused: false,
          status: 200 as const,
        };
      }

      // 2) Idempotency: try create ProofEvent INBOUND (unique on leadId, providerMessageId, type, channel)
      const now = new Date();
      try {
        await tx.proofEvent.create({
          data: {
            leadId: lead.id,
            channel: ProofChannel.WHATSAPP,
            type: ProofType.INBOUND,
            provider,
            providerMessageId,
            occurredAt: now,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return {
            leadId: lead.id,
            processed: false,
            reused: true,
            status: 200 as const,
          };
        }
        throw err;
      }

      // 3) Create EventLog whatsapp_inbound
      const run = await tx.autopilotRun.findUnique({
        where: { leadId: lead.id },
        select: { scenarioId: true },
      });
      let scenarioId = run?.scenarioId ?? null;
      if (!scenarioId) {
        const defaultScenario = await getDefaultScenario(tx, workspaceId);
        scenarioId = defaultScenario.id;
      }

      await tx.eventLog.create({
        data: {
          leadId: lead.id,
          eventType: "whatsapp_inbound",
          payload: {
            fromPhone,
            text,
            provider,
            providerMessageId,
            scenarioId,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      // 4) Call autopilot reply logic
      await processAutopilotReply(tx, { leadId: lead.id, text });

      return {
        leadId: lead.id,
        processed: true,
        reused: false,
        status: 201 as const,
      };
    });

    const status = result.status;
    return NextResponse.json(
      {
        leadId: result.leadId,
        processed: result.processed,
        reused: result.reused,
      },
      { status }
    );
  } catch (error) {
    console.error("[whatsapp/inbound]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
