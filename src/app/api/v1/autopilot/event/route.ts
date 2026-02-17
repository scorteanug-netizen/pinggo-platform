import { NextRequest, NextResponse } from "next/server";
import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { processAutopilotEvent } from "@/server/services/autopilotService";
import { logger } from "@/lib/logger";

const autopilotEventSchema = z.object({
  leadId: z.string().trim().min(1),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId, membershipRole, userId } = context;

    const body = await request.json();
    const parsed = autopilotEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (membershipRole === MembershipRole.AGENT) {
      const ownLead = await prisma.lead.findFirst({
        where: {
          id: parsed.data.leadId,
          workspaceId,
          ownerUserId: userId,
        },
        select: { id: true },
      });
      if (!ownLead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
    }

    const result = await processAutopilotEvent({
      workspaceId,
      leadId: parsed.data.leadId,
      message: parsed.data.message,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "LEAD_NOT_FOUND") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
