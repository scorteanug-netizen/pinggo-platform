import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import {
  isFacebookConfigured,
  buildFacebookOAuthUrl,
} from "@/server/services/facebookLeadAdsService";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentUserAndWorkspace();

    if (!isFacebookConfigured()) {
      return NextResponse.json(
        { error: "Facebook integration is not configured on this server." },
        { status: 503 }
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/v1/integrations/facebook/callback`;
    const oauthUrl = buildFacebookOAuthUrl(context.workspaceId, redirectUri);

    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
