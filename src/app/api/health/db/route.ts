import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DB health check failed", error);
    return NextResponse.json({ ok: false, error: "Database unreachable" }, { status: 500 });
  }
}
