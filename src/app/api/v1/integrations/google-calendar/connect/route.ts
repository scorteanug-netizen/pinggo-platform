import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import {
  isGoogleCalendarConfigured,
  buildGoogleOAuthUrl,
} from "@/server/services/googleCalendarService";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentUserAndWorkspace();

    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json(
        { error: "Google Calendar integration is not configured on this server." },
        { status: 503 }
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/v1/integrations/google-calendar/callback`;
    const oauthUrl = buildGoogleOAuthUrl(context.workspaceId, redirectUri);

    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
