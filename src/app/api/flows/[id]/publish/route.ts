import { NextRequest, NextResponse } from "next/server";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import {
  mergeWizardStateIntoFlowConfig,
  readFlowWizardState,
  sanitizeRoutingUsersForWorkspace,
  syncFlowRuntimeFromWizardState,
  validateWizardForPublish,
} from "@/server/services/flowWizardService";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, userId } = await requirePermission("canEditFlows");

    const { id: flowId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const payload = await readFlowWizardState({ workspaceId, flowId, tx });
      if (!payload) return null;

      const sanitizedWizard = await sanitizeRoutingUsersForWorkspace(
        tx,
        workspaceId,
        payload.wizard
      );
      const validation = validateWizardForPublish(sanitizedWizard);
      if (!validation.valid) {
        return {
          type: "validation_error" as const,
          errors: validation.errors,
        };
      }

      await syncFlowRuntimeFromWizardState(tx, flowId, sanitizedWizard);

      await tx.flow.updateMany({
        where: { workspaceId },
        data: { isActive: false },
      });

      const flow = await tx.flow.update({
        where: { id: flowId },
        data: {
          isActive: true,
          publishedAt: new Date(),
          lastEditedByUserId: userId,
          config: mergeWizardStateIntoFlowConfig(payload.flow.config, sanitizedWizard),
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          publishedAt: true,
          lastEditedByUserId: true,
          updatedAt: true,
        },
      });

      return {
        type: "ok" as const,
        flow,
      };
    });

    if (!result) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    if (result.type === "validation_error") {
      return NextResponse.json(
        {
          error: "Configuratia fluxului este incompleta.",
          details: result.errors,
          fieldErrors: result.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ...result.flow,
      isDraft: false,
      message: "Flux publicat cu succes.",
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
