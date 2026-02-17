import { NextRequest, NextResponse } from "next/server";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import {
import { logger } from "@/lib/logger";
  mergeFlowRoutingConfig,
  parseFlowRoutingConfig,
} from "@/server/services/routingService";

const updateRoutingSchema = z.object({
  eligibleAgents: z.array(z.string().trim().min(1)).max(500),
  fallbackOwnerUserId: z.string().trim().min(1).nullable(),
});

async function loadFlowAndMembers(workspaceId: string, flowId: string) {
  const [flow, memberships] = await Promise.all([
    prisma.flow.findFirst({
      where: { id: flowId, workspaceId },
      select: {
        id: true,
        name: true,
        config: true,
      },
    }),
    prisma.membership.findMany({
      where: {
        workspaceId,
        status: MembershipStatus.ACTIVE,
        role: {
          in: [MembershipRole.AGENT, MembershipRole.MANAGER, MembershipRole.ADMIN, MembershipRole.OWNER],
        },
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!flow) {
    return null;
  }

  const agents = memberships.map((membership) => ({
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    role: membership.role,
  }));

  return { flow, agents };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requirePermission("canViewFlows");

    const { id: flowId } = await context.params;
    const payload = await loadFlowAndMembers(workspaceId, flowId);
    if (!payload) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    return NextResponse.json({
      flowId: payload.flow.id,
      flowName: payload.flow.name,
      routing: parseFlowRoutingConfig(payload.flow.config),
      agents: payload.agents,
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, userId } = await requirePermission("canEditFlows");

    const { id: flowId } = await context.params;
    const payload = await loadFlowAndMembers(workspaceId, flowId);
    if (!payload) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateRoutingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const allowedUserIds = new Set(payload.agents.map((agent) => agent.userId));
    const eligibleAgents = [...new Set(parsed.data.eligibleAgents.map((value) => value.trim()))];
    const invalidEligibleAgents = eligibleAgents.filter((userId) => !allowedUserIds.has(userId));
    if (invalidEligibleAgents.length > 0) {
      return NextResponse.json(
        { error: "Lista de agenti contine utilizatori invalizi.", invalidEligibleAgents },
        { status: 400 }
      );
    }

    const fallbackOwnerUserId = parsed.data.fallbackOwnerUserId?.trim() ?? null;
    if (fallbackOwnerUserId && !allowedUserIds.has(fallbackOwnerUserId)) {
      return NextResponse.json(
        { error: "Fallback owner invalid pentru acest workspace." },
        { status: 400 }
      );
    }

    const current = parseFlowRoutingConfig(payload.flow.config);
    const nextRouting = {
      eligibleAgents,
      fallbackOwnerUserId,
      roundRobinCursor: current.roundRobinCursor,
    };

    const updatedFlow = await prisma.flow.update({
      where: { id: payload.flow.id },
      data: {
        config: mergeFlowRoutingConfig(payload.flow.config, nextRouting),
        lastEditedByUserId: userId,
      },
      select: {
        id: true,
        name: true,
        config: true,
      },
    });

    return NextResponse.json({
      flowId: updatedFlow.id,
      flowName: updatedFlow.name,
      routing: parseFlowRoutingConfig(updatedFlow.config),
      agents: payload.agents,
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
