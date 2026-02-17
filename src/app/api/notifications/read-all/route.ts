import { NextRequest, NextResponse } from "next/server";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { markNotificationsReadForUser } from "@/server/services/notificationService";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePermission("canViewNotifications");

    await markNotificationsReadForUser({
      workspaceId: context.workspaceId,
      email: context.email,
    });

    const redirectTo = request.nextUrl.searchParams.get("redirectTo")?.trim() || "/notifications";
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
