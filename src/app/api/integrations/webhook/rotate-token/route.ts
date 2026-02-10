import { NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import { rotateWorkspaceWebhookToken } from "@/server/services/integrationService";

export async function POST() {
  try {
    const context = await getCurrentUserAndWorkspace();
    if (context.globalRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rotated = await rotateWorkspaceWebhookToken(context.workspaceId);
    return NextResponse.json({ ok: true, ...rotated });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

