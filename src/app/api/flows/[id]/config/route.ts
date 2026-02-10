import { NextRequest, NextResponse } from "next/server";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import {
  mergeWizardStateIntoFlowConfig,
  sanitizeRoutingUsersForWorkspace,
  syncFlowRuntimeFromWizardState,
} from "@/server/services/flowWizardService";
import { normalizeFlowWizardState } from "@/lib/flows/wizard";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, userId } = await requirePermission("canEditFlows");

    const { id: flowId } = await params;
    const body = await request.json();
    const wizardInput =
      body && typeof body === "object" && "wizard" in body
        ? (body as { wizard: unknown }).wizard
        : body;
    const normalizedWizard = normalizeFlowWizardState(wizardInput);

    const result = await prisma.$transaction(async (tx) => {
      const flow = await tx.flow.findFirst({
        where: { id: flowId, workspaceId },
        select: { id: true, config: true, updatedAt: true },
      });
      if (!flow) return null;

      const sanitizedWizard = await sanitizeRoutingUsersForWorkspace(
        tx,
        workspaceId,
        normalizedWizard
      );

      await syncFlowRuntimeFromWizardState(tx, flow.id, sanitizedWizard);

      const updatedFlow = await tx.flow.update({
        where: { id: flow.id },
        data: {
          config: mergeWizardStateIntoFlowConfig(flow.config, sanitizedWizard),
          lastEditedByUserId: userId,
        },
        select: {
          id: true,
          updatedAt: true,
          isActive: true,
        },
      });

      return {
        flow: updatedFlow,
        wizard: sanitizedWizard,
      };
    });

    if (!result) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
