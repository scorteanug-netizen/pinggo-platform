import { NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import { disconnectFacebookPage } from "@/server/services/facebookLeadAdsService";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const context = await getCurrentUserAndWorkspace();
    await disconnectFacebookPage(context.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
