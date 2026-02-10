import { NextResponse } from "next/server";
import {
  isWorkspaceAccessError,
  requirePermission,
} from "@/server/authMode";
import { duplicateFlowAsDraft } from "@/server/services/flowWizardService";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, userId } = await requirePermission("canEditFlows");
    const { id: sourceFlowId } = await params;

    const duplicated = await duplicateFlowAsDraft({
      workspaceId,
      sourceFlowId,
      actorUserId: userId,
    });

    if (!duplicated) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    return NextResponse.json({
      ...duplicated,
      isDraft: true,
      message: "Flux duplicat ca draft.",
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
