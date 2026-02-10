import { NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import { getWorkspaceWebhookIngestStatus } from "@/server/services/integrationService";

export async function GET() {
  try {
    const context = await getCurrentUserAndWorkspace();
    if (!context.permissions.canViewIntegrations) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = await getWorkspaceWebhookIngestStatus(context.workspaceId);
    return NextResponse.json(status);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

