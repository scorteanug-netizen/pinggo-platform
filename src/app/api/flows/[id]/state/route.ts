import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { setFlowActiveState } from "@/server/services/flowWizardService";
import { logger } from "@/lib/logger";

const updateStateSchema = z.object({
  isActive: z.boolean(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, userId } = await requirePermission("canEditFlows");

    const { id: flowId } = await params;
    const body = await request.json();
    const parsed = updateStateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const flow = await setFlowActiveState({
      workspaceId,
      flowId,
      isActive: parsed.data.isActive,
      actorUserId: userId,
    });

    if (!flow) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    return NextResponse.json({
      ...flow,
      isDraft: flow.publishedAt === null,
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
