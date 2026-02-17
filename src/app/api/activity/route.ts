import { NextRequest, NextResponse } from "next/server";
import { isWorkspaceAccessError, requirePermission } from "@/server/authMode";
import { getActivityFeed } from "@/server/services/activityFeedService";
import { logger } from "@/lib/logger";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseNumberParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePermission("canViewLeads");

    const searchParams = request.nextUrl.searchParams;
    const offset = Math.max(0, parseNumberParam(searchParams.get("offset"), 0));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseNumberParam(searchParams.get("limit"), DEFAULT_LIMIT))
    );

    const payload = await getActivityFeed({
      workspaceId: context.workspaceId,
      viewerRole: context.membershipRole,
      viewerUserId: context.userId,
      offset,
      limit,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
