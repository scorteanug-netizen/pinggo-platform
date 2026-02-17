import { NextRequest, NextResponse } from "next/server";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";

const INBOUND_TYPES = ["whatsapp_inbound", "autopilot_inbound"] as const;
const OUTBOUND_TYPES = ["message_queued", "message_sent"] as const;

type RouteContext = { params: { scenarioId: string } };

function json500(detail: string) {
  return NextResponse.json(
    { error: "Server misconfiguration", detail },
    { status: 500 }
  );
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId } = context;

    if (!workspaceId) {
      return json500("Missing workspaceId");
    }

    const scenarioId = params.scenarioId?.trim();
    if (!scenarioId) {
      return NextResponse.json(
        { error: "Bad request", detail: "Missing scenarioId" },
        { status: 400 }
      );
    }

    const leadId = request.nextUrl.searchParams.get("leadId")?.trim();
    if (!leadId) {
      return NextResponse.json(
        { error: "Bad request", detail: "leadId required" },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    const logs = await prisma.eventLog.findMany({
      where: {
        leadId,
        eventType: {
          in: [
            ...INBOUND_TYPES,
            ...OUTBOUND_TYPES,
            "autopilot_ai_planned",
            "autopilot_handover",
          ],
        },
      },
      orderBy: { occurredAt: "asc" },
      select: { eventType: true, payload: true, occurredAt: true },
    });

    const messages: Array<{
      role: "user" | "assistant" | "system";
      text: string;
      occurredAt: string;
      eventType: string;
    }> = [];

    for (const log of logs) {
      const payload = (log.payload ?? {}) as Record<string, unknown>;
      const at = log.occurredAt?.toISOString() ?? new Date().toISOString();

      if (INBOUND_TYPES.includes(log.eventType as (typeof INBOUND_TYPES)[number])) {
        const text = (payload.text as string) ?? "";
        if (text) {
          messages.push({
            role: "user",
            text,
            occurredAt: at,
            eventType: log.eventType,
          });
        }
      } else if (log.eventType === "message_queued" || log.eventType === "message_sent") {
        const text =
          (payload.text as string) ??
          (log.eventType === "message_sent" ? "" : null);
        if (text) {
          messages.push({
            role: "assistant",
            text,
            occurredAt: at,
            eventType: log.eventType,
          });
        }
      } else if (log.eventType === "autopilot_handover") {
        messages.push({
          role: "system",
          text: "Transfer catre operator",
          occurredAt: at,
          eventType: log.eventType,
        });
      }
    }

    return NextResponse.json({ messages });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as { status?: number }).status ?? 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[playground/messages]", message);
    return json500(message.slice(0, 200));
  }
}
