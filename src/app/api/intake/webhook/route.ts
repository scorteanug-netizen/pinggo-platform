import { NextRequest, NextResponse } from "next/server";
import { webhookIntakeSchema } from "@/lib/validations/leads";
import { createLeadFromWebhook } from "@/server/services/intakeService";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = webhookIntakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const workspaceId =
      request.headers.get("x-workspace-id") ??
      request.nextUrl.searchParams.get("workspaceId") ??
      request.headers.get("x-org-id") ??
      request.nextUrl.searchParams.get("orgId");
    const flowId = request.headers.get("x-flow-id") ?? request.nextUrl.searchParams.get("flowId");
    if (!workspaceId || !flowId) {
      return NextResponse.json(
        {
          error:
            "Missing workspaceId/flowId (accepta x-workspace-id + x-flow-id sau query workspaceId/flowId).",
        },
        { status: 400 }
      );
    }
    const flow = await prisma.flow.findFirst({ where: { id: flowId, workspaceId, isActive: true } });
    if (!flow) {
      return NextResponse.json({ error: "Flow not found or not active" }, { status: 404 });
    }
    const lead = await createLeadFromWebhook(workspaceId, flowId, parsed.data);
    return NextResponse.json(lead);
  } catch (e) {
    logger.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
