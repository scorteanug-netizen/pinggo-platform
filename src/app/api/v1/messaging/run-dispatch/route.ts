import { NextResponse } from "next/server";
import { dispatchQueuedOutbound } from "@/server/services/messaging/dispatchOutbound";

// TODO: Secure this endpoint before production (API key, cron secret, or internal-only access).

export async function POST() {
  try {
    const summary = await dispatchQueuedOutbound();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[messaging/run-dispatch]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
