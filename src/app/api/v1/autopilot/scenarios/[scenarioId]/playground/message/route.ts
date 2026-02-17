import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { processAutopilotReply } from "@/server/services/autopilot/processReply";

const messageSchema = z.object({
  leadId: z.string().trim().min(1),
  text: z.string().trim().min(1),
});

type RouteContext = { params: { scenarioId: string } };

function json500(detail: string) {
  return NextResponse.json(
    { error: "Server misconfiguration", detail },
    { status: 500 }
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId, userId } = context;

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

    const body = await request.json();
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { leadId, text } = parsed.data;

    const scenario = await prisma.autopilotScenario.findFirst({
      where: { id: scenarioId, workspaceId },
      select: { id: true },
    });
    if (!scenario) {
      return json500("Scenario not found");
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      select: { id: true },
    });
    if (!lead) {
      return json500("Lead not found");
    }

    const result = await processAutopilotReply({ leadId, text });

    if (!result) {
      return json500("AutopilotRun not found");
    }

    let assistantText: string | null = result.queuedMessage?.text ?? null;
    const queuedMessageId = result.queuedMessage?.id ?? null;

    if (queuedMessageId) {
      await prisma.outboundMessage.delete({
        where: { id: queuedMessageId },
      }).catch(() => {
        // Ignore if already deleted
      });
    }

    const handoverTriggered =
      result.autopilot.status === "HANDED_OVER" && Boolean(result.scenarioId);

    return NextResponse.json({
      ok: true,
      result: {
        status: result.autopilot.status,
        nodeAfter: result.autopilot.node,
        messageBlocked: result.messageBlocked ?? false,
        handoverTriggered,
        assistantText,
        ...(result.messageBlocked && {
          messageBlockedReason: "missing_phone",
        }),
      },
      raw: {
        leadId: result.leadId,
        autopilot: result.autopilot,
        queuedMessage: result.queuedMessage,
        messageBlocked: result.messageBlocked,
        handoverUserId: result.handoverUserId,
        scenarioId: result.scenarioId,
        lastInboundText: result.lastInboundText,
      },
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as { status?: number }).status ?? 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[playground/message]", message);
    const sanitized = message.replace(/[\s\n\r]+/g, " ").slice(0, 200);
    return json500(`Prisma error: ${sanitized}`);
  }
}
