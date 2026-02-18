import { NextResponse } from "next/server";
import { requirePermission, isWorkspaceAccessError } from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const { workspaceId } = await requirePermission("canViewLeads");
    const now = new Date();

    // SLA-uri care expiră în următoarele 30 de minute
    const soonBreachAt = new Date(now.getTime() + 30 * 60 * 1000);

    const nearBreachStages = await prisma.sLAStageInstance.findMany({
      where: {
        workspaceId,
        status: "RUNNING",
        dueAt: { lte: soonBreachAt },
      },
      select: {
        id: true,
        leadId: true,
        stageKey: true,
        dueAt: true,
        lead: {
          select: {
            firstName: true,
            lastName: true,
            status: true,
            ownerUserId: true,
          },
        },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    });

    // Agenți indisponibili cu lead-uri OPEN/NEW alocate
    const unavailableAgentsWithLeads = await prisma.membership.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        isAvailable: false,
      },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    const unavailableUserIds = unavailableAgentsWithLeads.map((m) => m.userId);
    const activeLeadsForUnavailable = unavailableUserIds.length > 0
      ? await prisma.lead.count({
          where: {
            workspaceId,
            ownerUserId: { in: unavailableUserIds },
            status: { in: ["NEW", "OPEN"] },
          },
        })
      : 0;

    return NextResponse.json({
      nearBreachStages: nearBreachStages.map((stage) => ({
        id: stage.id,
        leadId: stage.leadId,
        leadName: [stage.lead.firstName, stage.lead.lastName].filter(Boolean).join(" ") || "Lead fără nume",
        stageKey: stage.stageKey,
        dueAt: stage.dueAt.toISOString(),
        isOverdue: stage.dueAt < now,
      })),
      unavailableAgents: unavailableAgentsWithLeads.map((m) => ({
        userId: m.userId,
        name: m.user.name ?? m.user.email,
      })),
      activeLeadsForUnavailable,
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
