import { NextRequest, NextResponse } from "next/server";
import { breachOverdueSlas } from "@/server/services/slaEngine";
import { logger } from "@/lib/logger";

export async function POST(_request: NextRequest) {
  // TODO: secure this internal endpoint (auth/secret/IP allowlist) before production usage.
  try {
    const result = await breachOverdueSlas();
    return NextResponse.json(result);
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
