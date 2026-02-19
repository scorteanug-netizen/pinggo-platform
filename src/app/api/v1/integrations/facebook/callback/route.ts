export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import {
  exchangeCodeForTokens,
  getLongLivedToken,
  getUserPages,
  subscribePageToLeadgen,
  connectFacebookPage,
} from "@/server/services/facebookLeadAdsService";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentUserAndWorkspace();
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      const error = searchParams.get("error_description") || "Missing code parameter";
      return NextResponse.redirect(
        new URL(`/integrations?facebook=error&message=${encodeURIComponent(error)}`, request.nextUrl.origin)
      );
    }

    // Verify state matches workspace
    if (state && state !== context.workspaceId) {
      return NextResponse.redirect(
        new URL("/integrations?facebook=error&message=workspace_mismatch", request.nextUrl.origin)
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/v1/integrations/facebook/callback`;

    // Exchange code for short-lived token
    const { accessToken: shortLivedToken } = await exchangeCodeForTokens(code, redirectUri);

    // Exchange for long-lived token
    const longLivedToken = await getLongLivedToken(shortLivedToken);

    // Get user pages
    const pages = await getUserPages(longLivedToken);
    if (pages.length === 0) {
      return NextResponse.redirect(
        new URL("/integrations?facebook=error&message=no_pages_found", request.nextUrl.origin)
      );
    }

    // V1: use first page
    const page = pages[0];

    // Subscribe page to leadgen webhook
    await subscribePageToLeadgen(page.id, page.access_token);

    // Save integration
    await connectFacebookPage(context.workspaceId, context.userId, page);

    return NextResponse.redirect(
      new URL("/integrations?facebook=connected", request.nextUrl.origin)
    );
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.redirect(
        new URL("/integrations?facebook=error&message=auth_failed", (error as any).url || "/")
      );
    }
    logger.error(error);
    return NextResponse.redirect(
      new URL("/integrations?facebook=error&message=internal_error", "/")
    );
  }
}
