import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const INGEST_EVENT_TYPES = ["lead_received", "lead_updated", "lead_spam", "lead_incomplete"];

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentUserAndWorkspace();
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit") ?? 10), 50);
    const workspaceId = searchParams.get("workspaceId") || context.workspaceId;

    // Verify workspace access
    if (workspaceId !== context.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const events = await prisma.leadEvent.findMany({
      where: {
        workspaceId,
        type: { in: INGEST_EVENT_TYPES },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        createdAt: true,
        payload: true,
        lead: {
          select: {
            id: true,
            sourceType: true,
            status: true,
            identity: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const rows = events.map((event) => ({
      id: event.id,
      timestamp: event.createdAt.toISOString(),
      eventType: event.type,
      source: event.lead.sourceType,
      status: event.lead.status,
      leadId: event.lead.id,
      identity: event.lead.identity
        ? {
            name: event.lead.identity.name,
            email: event.lead.identity.email,
            phone: event.lead.identity.phone,
          }
        : null,
    }));

    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
