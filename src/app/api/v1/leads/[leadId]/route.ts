import { LeadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";

type RouteContext = {
  params: { leadId: string };
};

const patchSchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
});

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const leadId = params.leadId?.trim();
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        workspaceId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        source: true,
        externalId: true,
        createdAt: true,
        status: true,
        slaState: {
          select: {
            startedAt: true,
            deadlineAt: true,
            stoppedAt: true,
            stopReason: true,
            breachedAt: true,
          },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [timeline, proof, autopilotRun, lastMessage] = await Promise.all([
      prisma.eventLog.findMany({
        where: { leadId },
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: {
          id: true,
          eventType: true,
          payload: true,
          occurredAt: true,
        },
      }),
      prisma.proofEvent.findMany({
        where: { leadId },
        orderBy: { occurredAt: "desc" },
        take: 20,
        select: {
          id: true,
          channel: true,
          type: true,
          provider: true,
          providerMessageId: true,
          occurredAt: true,
        },
      }),
      prisma.autopilotRun.findUnique({
        where: { leadId },
        select: {
          id: true,
          status: true,
          currentStep: true,
          stateJson: true,
          scenarioId: true,
          createdAt: true,
          updatedAt: true,
          scenario: { select: { id: true, name: true, mode: true, isDefault: true } },
        },
      }),
      prisma.outboundMessage.findFirst({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          channel: true,
          status: true,
          toPhone: true,
          text: true,
          provider: true,
          providerMessageId: true,
          sentAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      lead: {
        id: lead.id,
        workspaceId: lead.workspaceId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        externalId: lead.externalId,
        createdAt: lead.createdAt.toISOString(),
        status: lead.status,
      },
      sla: lead.slaState
        ? {
            startedAt: lead.slaState.startedAt.toISOString(),
            deadlineAt: lead.slaState.deadlineAt.toISOString(),
            stoppedAt: toIsoString(lead.slaState.stoppedAt),
            stopReason: lead.slaState.stopReason,
            breachedAt: toIsoString(lead.slaState.breachedAt),
          }
        : null,
      timeline: timeline.map((entry) => ({
        id: entry.id,
        eventType: entry.eventType,
        payload: entry.payload,
        occurredAt: entry.occurredAt.toISOString(),
      })),
      proof: proof.map((entry) => ({
        id: entry.id,
        channel: entry.channel.toLowerCase(),
        type: entry.type.toLowerCase(),
        provider: entry.provider,
        providerMessageId: entry.providerMessageId,
        occurredAt: entry.occurredAt.toISOString(),
      })),
      autopilot: autopilotRun
        ? {
            id: autopilotRun.id,
            status: autopilotRun.status,
            currentStep: autopilotRun.currentStep,
            stateJson: autopilotRun.stateJson ?? null,
            scenarioId: autopilotRun.scenarioId,
            scenarioMode: autopilotRun.scenario?.mode ?? null,
            scenario: autopilotRun.scenario
              ? {
                  id: autopilotRun.scenario.id,
                  name: autopilotRun.scenario.name,
                  mode: autopilotRun.scenario.mode,
                  isDefault: autopilotRun.scenario.isDefault,
                }
              : null,
            createdAt: autopilotRun.createdAt.toISOString(),
            updatedAt: autopilotRun.updatedAt.toISOString(),
          }
        : null,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            channel: lastMessage.channel,
            status: lastMessage.status,
            toPhone: lastMessage.toPhone,
            text: lastMessage.text,
            provider: lastMessage.provider,
            providerMessageId: lastMessage.providerMessageId,
            sentAt: lastMessage.sentAt ? lastMessage.sentAt.toISOString() : null,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const leadId = params.leadId?.trim();
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updates.firstName !== undefined) data.firstName = updates.firstName || null;
    if (updates.lastName !== undefined) data.lastName = updates.lastName || null;
    if (updates.email !== undefined) data.email = updates.email || null;
    if (updates.phone !== undefined) data.phone = updates.phone || null;
    if (updates.status !== undefined) data.status = updates.status;

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: data as Record<string, never>,
      });
      await tx.eventLog.create({
        data: {
          leadId,
          eventType: "lead_updated",
          payload: { changedFields: updates } as Record<string, unknown>,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[leads PATCH]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const leadId = params.leadId?.trim();
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [eventLogCount, proofEventCount, slaStateCount, autopilotRunCount, outboundMessageCount] =
      await Promise.all([
        prisma.eventLog.count({ where: { leadId } }),
        prisma.proofEvent.count({ where: { leadId } }),
        prisma.sLAState.count({ where: { leadId } }),
        prisma.autopilotRun.count({ where: { leadId } }),
        prisma.outboundMessage.count({ where: { leadId } }),
      ]);

    const counts = {
      eventLog: eventLogCount,
      proofEvent: proofEventCount,
      sLAState: slaStateCount,
      autopilotRun: autopilotRunCount,
      outboundMessage: outboundMessageCount,
    };

    if (
      eventLogCount > 0 ||
      proofEventCount > 0 ||
      slaStateCount > 0 ||
      autopilotRunCount > 0 ||
      outboundMessageCount > 0
    ) {
      return NextResponse.json(
        { error: "LEAD_HAS_HISTORY", counts },
        { status: 409 }
      );
    }

    await prisma.lead.delete({
      where: { id: leadId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[leads DELETE]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
