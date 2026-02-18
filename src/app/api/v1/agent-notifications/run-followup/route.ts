import { NextRequest, NextResponse } from "next/server";
import { sendPendingOutcomeFollowups } from "@/server/services/notifications/sendOutcomeFollowup";
import { logger } from "@/lib/logger";

export async function POST(_request: NextRequest) {
  // TODO: secure this internal endpoint (auth/secret/IP allowlist) before production usage.
  try {
    const result = await sendPendingOutcomeFollowups();
    return NextResponse.json(result);
  } catch (error) {
    logger.error("[run-followup]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
