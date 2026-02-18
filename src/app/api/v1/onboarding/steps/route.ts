import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, isWorkspaceAccessError } from "@/server/authMode";
import { markStepDone } from "@/server/services/onboardingService";
import { logger } from "@/lib/logger";

const stepSchema = z.object({
  step: z.enum(["workspace", "team", "whatsapp", "autopilot", "testLead"]),
});

export async function PATCH(request: NextRequest) {
  try {
    const context = await requirePermission("canViewSettings");
    const { workspaceId } = context;

    const body = await request.json();
    const parsed = stepSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const state = await markStepDone(workspaceId, parsed.data.step);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
