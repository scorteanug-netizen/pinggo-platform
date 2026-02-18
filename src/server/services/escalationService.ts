import { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { reassignLeadFromFlowRouting } from "./routingService";

type TxOrClient = Prisma.TransactionClient | typeof prisma;

type DetectEscalationsOptions = {
  tx?: TxOrClient;
  workspaceId?: string;
  now?: Date;
};

type DetectEscalationsResult = {
  reminders: number;
  reassignments: number;
  managerAlerts: number;
};

type RunningStage = {
  id: string;
  leadId: string;
  flowId: string;
  stageKey: string;
  startedAt: Date;
  dueAt: Date;
  lead: {
    workspaceId: string;
    ownerUserId: string | null;
  };
};

function toPercentValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function computeElapsedPct(startedAt: Date, dueAt: Date, now: Date) {
  const totalMs = Math.max(1, dueAt.getTime() - startedAt.getTime());
  const elapsedMs = Math.max(0, now.getTime() - startedAt.getTime());
  return toPercentValue((elapsedMs / totalMs) * 100);
}

function getRuleKey(flowId: string, stageKey: string) {
  return `${flowId}:${stageKey}`;
}

async function hasEventSinceStageStart(params: {
  tx: TxOrClient;
  workspaceId: string;
  leadId: string;
  type: string;
  stageStartedAt: Date;
}) {
  const existing = await params.tx.leadEvent.findFirst({
    where: {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      type: params.type,
      createdAt: { gte: params.stageStartedAt },
    },
    select: { id: true },
  });

  return Boolean(existing);
}

const PROOF_ACTION_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
  "manual_proof_note",
] as const;

async function hasProofActionSinceStageStart(params: {
  tx: TxOrClient;
  workspaceId: string;
  leadId: string;
  stageStartedAt: Date;
}) {
  const existing = await params.tx.leadEvent.findFirst({
    where: {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      type: { in: [...PROOF_ACTION_TYPES] },
      createdAt: { gte: params.stageStartedAt },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function createReminder(params: {
  tx: TxOrClient;
  stage: RunningStage;
  thresholdPct: number;
  elapsedPct: number;
}) {
  const { tx, stage, thresholdPct, elapsedPct } = params;
  const ownerUserId = stage.lead.ownerUserId;

  await tx.leadEvent.create({
    data: {
      leadId: stage.leadId,
      workspaceId: stage.lead.workspaceId,
      type: "reminder_sent",
      payload: {
        stageInstanceId: stage.id,
        flowId: stage.flowId,
        stageKey: stage.stageKey,
        thresholdPct,
        elapsedPct,
        ownerUserId,
      } as Prisma.InputJsonValue,
    },
  });

  if (!ownerUserId) return;

  await tx.notification.create({
    data: {
      workspaceId: stage.lead.workspaceId,
      userId: ownerUserId,
      type: "REMINDER",
      title: "Reminder SLA",
      body: `Lead ${stage.leadId} este la ${Math.floor(elapsedPct)}% din etapa ${stage.stageKey}.`,
    },
  });
}

async function createReassignment(params: {
  tx: TxOrClient;
  stage: RunningStage;
  thresholdPct: number;
  elapsedPct: number;
}) {
  const { tx, stage, thresholdPct, elapsedPct } = params;
  const reassignment = await reassignLeadFromFlowRouting({
    tx,
    workspaceId: stage.lead.workspaceId,
    flowId: stage.flowId,
    leadId: stage.leadId,
  });

  await tx.leadEvent.create({
    data: {
      leadId: stage.leadId,
      workspaceId: stage.lead.workspaceId,
      type: "reassigned",
      payload: {
        stageInstanceId: stage.id,
        flowId: stage.flowId,
        stageKey: stage.stageKey,
        thresholdPct,
        elapsedPct,
        previousOwnerUserId: reassignment.previousOwnerUserId,
        ownerUserId: reassignment.ownerUserId,
        method: reassignment.method,
        changed: reassignment.changed,
      } as Prisma.InputJsonValue,
    },
  });

  const previousOwner = reassignment.previousOwnerUserId;
  const nextOwner = reassignment.ownerUserId;
  const notifications: Prisma.NotificationCreateManyInput[] = [];

  if (previousOwner && previousOwner !== nextOwner) {
    notifications.push({
      workspaceId: stage.lead.workspaceId,
      userId: previousOwner,
      type: "REASSIGNED_OUT",
      title: "Lead reasignat",
      body: `Lead ${stage.leadId} a fost mutat catre alt owner.`,
    });
  }

  if (nextOwner) {
    notifications.push({
      workspaceId: stage.lead.workspaceId,
      userId: nextOwner,
      type: "REASSIGNED_IN",
      title: "Lead nou in lucru",
      body: `Lead ${stage.leadId} a fost asignat catre tine prin escaladare.`,
    });
  }

  if (notifications.length > 0) {
    await tx.notification.createMany({ data: notifications });
  }
}

async function createManagerAlert(params: {
  tx: TxOrClient;
  stage: RunningStage;
  thresholdPct: number;
  elapsedPct: number;
  managerIds: string[];
}) {
  const { tx, stage, thresholdPct, elapsedPct, managerIds } = params;

  await tx.leadEvent.create({
    data: {
      leadId: stage.leadId,
      workspaceId: stage.lead.workspaceId,
      type: "manager_alert",
      payload: {
        stageInstanceId: stage.id,
        flowId: stage.flowId,
        stageKey: stage.stageKey,
        thresholdPct,
        elapsedPct,
      } as Prisma.InputJsonValue,
    },
  });

  if (managerIds.length === 0) return;

  await tx.notification.createMany({
    data: managerIds.map((userId) => ({
      workspaceId: stage.lead.workspaceId,
      userId,
      type: "MANAGER_ALERT",
      title: "Alerta manager",
      body: `Lead ${stage.leadId} a depasit pragul de escaladare in etapa ${stage.stageKey}.`,
    })),
  });
}

export async function detectEscalations(
  options: DetectEscalationsOptions = {}
): Promise<DetectEscalationsResult> {
  const tx = options.tx ?? prisma;
  const now = options.now ?? new Date();

  const where: Prisma.SLAStageInstanceWhereInput = { status: "RUNNING" };
  if (options.workspaceId) {
    where.workspaceId = options.workspaceId;
  }

  const runningStages = await tx.sLAStageInstance.findMany({
    where,
    select: {
      id: true,
      leadId: true,
      flowId: true,
      stageKey: true,
      startedAt: true,
      dueAt: true,
      lead: {
        select: {
          workspaceId: true,
          ownerUserId: true,
        },
      },
    },
  });

  if (runningStages.length === 0) {
    return { reminders: 0, reassignments: 0, managerAlerts: 0 };
  }

  const flowIds = [...new Set(runningStages.map((stage) => stage.flowId))];
  const stageKeys = [...new Set(runningStages.map((stage) => stage.stageKey))];
  const workspaceIds = [...new Set(runningStages.map((stage) => stage.lead.workspaceId))];

  const [rules, managerMemberships] = await Promise.all([
    tx.escalationRule.findMany({
      where: {
        enabled: true,
        flowId: { in: flowIds },
        stageKey: { in: stageKeys },
      },
      select: {
        flowId: true,
        stageKey: true,
        remindAtPct: true,
        reassignAtPct: true,
        managerAlertAtPct: true,
      },
    }),
    tx.membership.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        role: MembershipRole.MANAGER,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        workspaceId: true,
        userId: true,
      },
    }),
  ]);

  const rulesMap = new Map(rules.map((rule) => [getRuleKey(rule.flowId, rule.stageKey), rule]));
  const managerIdsByWorkspace = new Map<string, string[]>();
  for (const membership of managerMemberships) {
    const list = managerIdsByWorkspace.get(membership.workspaceId) ?? [];
    list.push(membership.userId);
    managerIdsByWorkspace.set(membership.workspaceId, list);
  }

  const result: DetectEscalationsResult = {
    reminders: 0,
    reassignments: 0,
    managerAlerts: 0,
  };

  for (const stage of runningStages as RunningStage[]) {
    const rule = rulesMap.get(getRuleKey(stage.flowId, stage.stageKey));
    if (!rule) continue;

    const elapsedPct = computeElapsedPct(stage.startedAt, stage.dueAt, now);

    if (rule.remindAtPct > 0 && elapsedPct >= rule.remindAtPct) {
      const alreadyTriggered = await hasEventSinceStageStart({
        tx,
        workspaceId: stage.lead.workspaceId,
        leadId: stage.leadId,
        type: "reminder_sent",
        stageStartedAt: stage.startedAt,
      });
      if (!alreadyTriggered) {
        await createReminder({
          tx,
          stage,
          thresholdPct: rule.remindAtPct,
          elapsedPct,
        });
        result.reminders += 1;
      }
    }

    if (rule.reassignAtPct > 0 && elapsedPct >= rule.reassignAtPct) {
      const alreadyTriggered = await hasEventSinceStageStart({
        tx,
        workspaceId: stage.lead.workspaceId,
        leadId: stage.leadId,
        type: "reassigned",
        stageStartedAt: stage.startedAt,
      });
      // Nu reasignăm dacă agentul a acționat deja (proof event existent)
      const agentActed = await hasProofActionSinceStageStart({
        tx,
        workspaceId: stage.lead.workspaceId,
        leadId: stage.leadId,
        stageStartedAt: stage.startedAt,
      });
      if (!alreadyTriggered && !agentActed) {
        await createReassignment({
          tx,
          stage,
          thresholdPct: rule.reassignAtPct,
          elapsedPct,
        });
        result.reassignments += 1;
      }
    }

    if (rule.managerAlertAtPct > 0 && elapsedPct >= rule.managerAlertAtPct) {
      const alreadyTriggered = await hasEventSinceStageStart({
        tx,
        workspaceId: stage.lead.workspaceId,
        leadId: stage.leadId,
        type: "manager_alert",
        stageStartedAt: stage.startedAt,
      });
      if (!alreadyTriggered) {
        await createManagerAlert({
          tx,
          stage,
          thresholdPct: rule.managerAlertAtPct,
          elapsedPct,
          managerIds: managerIdsByWorkspace.get(stage.lead.workspaceId) ?? [],
        });
        result.managerAlerts += 1;
      }
    }
  }

  return result;
}
