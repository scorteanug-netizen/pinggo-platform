import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";

const escalationRuleSchema = z
  .object({
    stageKey: z.string().trim().min(1),
    enabled: z.boolean(),
    remindAtPct: z.number().int().min(1).max(500),
    reassignAtPct: z.number().int().min(1).max(500),
    managerAlertAtPct: z.number().int().min(1).max(500),
  })
  .refine((value) => value.reassignAtPct >= value.remindAtPct, {
    message: "Pragul de reasignare trebuie sa fie >= reminder.",
    path: ["reassignAtPct"],
  })
  .refine((value) => value.managerAlertAtPct >= value.reassignAtPct, {
    message: "Pragul de manager alert trebuie sa fie >= reasignare.",
    path: ["managerAlertAtPct"],
  });

const updateEscalationSchema = z.object({
  rules: z.array(escalationRuleSchema).max(100),
});

async function loadFlowWithStages(workspaceId: string, flowId: string) {
  const flow = await prisma.flow.findFirst({
    where: { id: flowId, workspaceId },
    select: {
      id: true,
      name: true,
      slaStageDefinitions: {
        select: {
          key: true,
          name: true,
          targetMinutes: true,
        },
        orderBy: { key: "asc" },
      },
      escalationRules: {
        select: {
          stageKey: true,
          remindAtPct: true,
          reassignAtPct: true,
          managerAlertAtPct: true,
          enabled: true,
        },
      },
    },
  });

  return flow;
}

function orderStages<T extends { key: string }>(stages: T[]) {
  const stageOrder = new Map(
    [
      "first_touch",
      "handover",
      "qualification",
      "next_step_scheduled",
      "follow_up_closure",
    ].map((key, index) => [key, index])
  );

  return [...stages].sort((left, right) => {
    const leftOrder = stageOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = stageOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.key.localeCompare(right.key);
  });
}

function mapEscalationRulesByStage<T extends { stageKey: string }>(rules: T[]) {
  return new Map(rules.map((rule) => [rule.stageKey, rule]));
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requirePermission("canViewFlows");

    const { id: flowId } = await context.params;
    const flow = await loadFlowWithStages(workspaceId, flowId);
    if (!flow) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    const orderedStages = orderStages(flow.slaStageDefinitions);

    return NextResponse.json({
      flowId: flow.id,
      flowName: flow.name,
      stages: orderedStages,
      rules: flow.escalationRules,
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
    const flow = await loadFlowWithStages(workspaceId, flowId);
    if (!flow) {
      return NextResponse.json({ error: "Flux inexistent." }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateEscalationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const stageKeys = new Set(flow.slaStageDefinitions.map((stage) => stage.key));
    const seen = new Set<string>();
    for (const rule of parsed.data.rules) {
      if (!stageKeys.has(rule.stageKey)) {
        return NextResponse.json(
          { error: `Etapa invalida in payload: ${rule.stageKey}` },
          { status: 400 }
        );
      }
      if (seen.has(rule.stageKey)) {
        return NextResponse.json(
          { error: `Etapa duplicata in payload: ${rule.stageKey}` },
          { status: 400 }
        );
      }
      seen.add(rule.stageKey);
    }

    await prisma.$transaction(async (tx) => {
      for (const rule of parsed.data.rules) {
        await tx.escalationRule.upsert({
          where: {
            flowId_stageKey: {
              flowId: flow.id,
              stageKey: rule.stageKey,
            },
          },
          create: {
            flowId: flow.id,
            stageKey: rule.stageKey,
            remindAtPct: rule.remindAtPct,
            reassignAtPct: rule.reassignAtPct,
            managerAlertAtPct: rule.managerAlertAtPct,
            enabled: rule.enabled,
          },
          update: {
            remindAtPct: rule.remindAtPct,
            reassignAtPct: rule.reassignAtPct,
            managerAlertAtPct: rule.managerAlertAtPct,
            enabled: rule.enabled,
          },
        });
      }

      await tx.flow.update({
        where: { id: flow.id },
        data: { lastEditedByUserId: userId },
      });
    });

    const reloaded = await loadFlowWithStages(workspaceId, flow.id);
    const orderedStages = orderStages(flow.slaStageDefinitions);
    const rulesByStage = mapEscalationRulesByStage(reloaded?.escalationRules ?? []);

    return NextResponse.json({
      flowId: flow.id,
      flowName: flow.name,
      stages: orderedStages,
      rules: orderedStages.map((stage) => {
        const rule = rulesByStage.get(stage.key);
        return {
          stageKey: stage.key,
          remindAtPct: rule?.remindAtPct ?? 50,
          reassignAtPct: rule?.reassignAtPct ?? 75,
          managerAlertAtPct: rule?.managerAlertAtPct ?? 100,
          enabled: rule?.enabled ?? false,
        };
      }),
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
