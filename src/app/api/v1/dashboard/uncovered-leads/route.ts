import { NextResponse } from "next/server";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const { workspaceId } = await requirePermission("canViewLeads");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

    // Leads with handover that have NOT been confirmed by agent
    const uncoveredLeads = await prisma.$queryRaw<
      Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        email: string | null;
        ownerUserId: string | null;
        handoverAt: Date;
        slaDeadlineAt: Date | null;
      }>
    >`
      SELECT
        l.id,
        l."firstName",
        l."lastName",
        l.phone,
        l.email,
        l."ownerUserId",
        handover_event."occurredAt" AS "handoverAt",
        sla."deadlineAt" AS "slaDeadlineAt"
      FROM "Lead" l
      INNER JOIN "EventLog" handover_event
        ON handover_event."leadId" = l.id
        AND handover_event."eventType" = 'handover_notified'
      LEFT JOIN "EventLog" confirm_event
        ON confirm_event."leadId" = l.id
        AND confirm_event."eventType" = 'agent_confirmed_handover'
      LEFT JOIN "SLAState" sla
        ON sla."leadId" = l.id
      WHERE l."workspaceId" = ${workspaceId}
        AND handover_event."occurredAt" >= ${since}
        AND confirm_event.id IS NULL
        AND (sla."stoppedAt" IS NULL OR sla."stoppedAt" IS NOT NULL)
      ORDER BY sla."deadlineAt" ASC NULLS LAST
      LIMIT 50
    `;

    const results = uncoveredLeads.map((lead) => ({
      id: lead.id,
      name:
        [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
        lead.email ||
        lead.phone ||
        "-",
      phone: lead.phone,
      email: lead.email,
      ownerUserId: lead.ownerUserId,
      handoverAt: lead.handoverAt,
      slaDeadlineAt: lead.slaDeadlineAt,
      waitingMinutes: Math.round(
        (Date.now() - new Date(lead.handoverAt).getTime()) / 60000
      ),
    }));

    return NextResponse.json({ leads: results, count: results.length });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: (error as { message: string }).message }, { status: (error as { status: number }).status });
    }
    logger.error("[uncovered-leads]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
