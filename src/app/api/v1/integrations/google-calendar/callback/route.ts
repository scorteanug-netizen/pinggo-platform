export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import {
  exchangeGoogleCode,
  connectGoogleCalendar,
} from "@/server/services/googleCalendarService";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentUserAndWorkspace();
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      const error = searchParams.get("error") || "Missing code parameter";
      return NextResponse.redirect(
        new URL(`/integrations?google=error&message=${encodeURIComponent(error)}`, request.nextUrl.origin)
      );
    }

    if (state && state !== context.workspaceId) {
      return NextResponse.redirect(
        new URL("/integrations?google=error&message=workspace_mismatch", request.nextUrl.origin)
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/v1/integrations/google-calendar/callback`;

    const tokens = await exchangeGoogleCode(code, redirectUri);
    await connectGoogleCalendar(context.workspaceId, context.userId, tokens);

    return NextResponse.redirect(
      new URL("/integrations?google=connected", request.nextUrl.origin)
    );
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.redirect(
        new URL("/integrations?google=error&message=auth_failed", "/")
      );
    }
    logger.error(error);
    return NextResponse.redirect(
      new URL("/integrations?google=error&message=internal_error", "/")
    );
  }
}
