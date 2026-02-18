import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, isWorkspaceAccessError } from "@/server/authMode";
import { prisma } from "@/server/db";
import { startAutopilot } from "@/server/services/autopilotService";
import { markStepDone } from "@/server/services/onboardingService";
import { logger } from "@/lib/logger";

const testLeadSchema = z.object({
  phone: z.string().min(7).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId } = context;

    const body = await request.json();
    const parsed = testLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        sourceType: "API",
        firstName: "Test Lead",
        phone: parsed.data.phone ?? null,
        status: "NEW",
      },
      select: { id: true },
    });

    let autopilotStarted = false;
    try {
      await startAutopilot({ workspaceId, leadId: lead.id });
      autopilotStarted = true;
    } catch (err) {
      logger.warn({ err }, "test-lead: autopilot not started");
    }

    await markStepDone(workspaceId, "testLead");

    return NextResponse.json({ ok: true, leadId: lead.id, autopilotStarted });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
