import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("DB health check failed", error);
    return NextResponse.json({ ok: false, error: "Database unreachable" }, { status: 500 });
  }
}
