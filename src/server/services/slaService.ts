import { Prisma, SLAStageDefinition, SLAStageInstanceStatus } from "@prisma/client";
import { prisma } from "../db";
import {
  BusinessHoursConfig,
  computeDueAt,
  normalizeBusinessHoursConfig,
} from "./businessHours";

export const PROOF_EVENT_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
  "manual_proof_note",
] as const;

export type ProofEventType = (typeof PROOF_EVENT_TYPES)[number];

type TxOrClient = Prisma.TransactionClient | typeof prisma;

function toCanonicalProofType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "whatsapp_sent" || normalized === "email_sent") return "message_sent";
  if (normalized === "meeting_booked") return "meeting_created";
  return normalized;
}

function parseStopOnProofTypes(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => toCanonicalProofType(entry))
    .filter((entry) => entry.length > 0);
}

async function resolveBusinessHoursConfig(tx: TxOrClient, workspaceId: string): Promise<BusinessHoursConfig> {
  const settings = await tx.workspaceSettings.findUnique({
    where: { workspaceId },
    select: {
      businessHoursEnabled: true,
      timezone: true,
      schedule: true,
    },
  });

  return normalizeBusinessHoursConfig({
    businessHoursEnabled: settings?.businessHoursEnabled ?? true,
    timezone: settings?.timezone,
    schedule: settings?.schedule,
  });
}

async function getStageDefinitionOrThrow(tx: TxOrClient, flowId: string, stageKey: string) {
  const definition = await tx.sLAStageDefinition.findFirst({
    where: { flowId, key: stageKey },
  });
  if (!definition) {
    throw new Error(`SLA stage definition missing for flow=${flowId} stage=${stageKey}`);
  }
  return definition;
}

async function getLeadWorkspaceIdOrThrow(tx: TxOrClient, leadId: string) {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { workspaceId: true },
  });
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }
  return lead.workspaceId;
}

export async function startStage(
  leadId: string,
  flowId: string,
  stageKey: string,
  options?: {
    tx?: TxOrClient;
    startedAt?: Date;
  }
) {
  const tx = options?.tx ?? prisma;
  const startedAt = options?.startedAt ?? new Date();

  const [workspaceId, stageDefinition] = await Promise.all([
    getLeadWorkspaceIdOrThrow(tx, leadId),
    getStageDefinitionOrThrow(tx, flowId, stageKey),
  ]);
  const businessHoursConfig = await resolveBusinessHoursConfig(tx, workspaceId);
  const dueAt = computeDueAt(startedAt, stageDefinition.targetMinutes, {
    ...businessHoursConfig,
    businessHoursEnabled: businessHoursConfig.businessHoursEnabled && stageDefinition.businessHoursEnabled,
  });

  return tx.sLAStageInstance.create({
    data: {
      workspaceId,
      leadId,
      flowId,
      stageKey,
      startedAt,
      dueAt,
      status: "RUNNING",
    },
  });
}

export async function stopStage(
  leadId: string,
  flowId: string,
  stageKey: string,
  proofEventId: string | null,
  reason: string,
  options?: {
    tx?: TxOrClient;
    stoppedAt?: Date;
  }
) {
  const tx = options?.tx ?? prisma;
  const stoppedAt = options?.stoppedAt ?? new Date();

  const runningStage = await tx.sLAStageInstance.findFirst({
    where: {
      leadId,
      flowId,
      stageKey,
      status: "RUNNING",
    },
    orderBy: { startedAt: "desc" },
  });

  if (!runningStage) {
    return null;
  }

  return tx.sLAStageInstance.update({
    where: { id: runningStage.id },
    data: {
      status: "STOPPED",
      stoppedAt,
      stopReason: reason,
      proofEventId: proofEventId ?? undefined,
    },
  });
}

export async function advanceStage(
  leadId: string,
  toStageKey: string,
  options?: {
    tx?: TxOrClient;
    now?: Date;
  }
) {
  const tx = options?.tx ?? prisma;
  const now = options?.now ?? new Date();

  const runningStage = await tx.sLAStageInstance.findFirst({
    where: { leadId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });

  if (!runningStage) {
    return null;
  }

  await stopStage(
    leadId,
    runningStage.flowId,
    runningStage.stageKey,
    null,
    `advanced_to_${toStageKey}`,
    { tx, stoppedAt: now }
  );

  return startStage(leadId, runningStage.flowId, toStageKey, {
    tx,
    startedAt: now,
  });
}

export async function detectBreaches(options?: {
  tx?: TxOrClient;
  workspaceId?: string;
  now?: Date;
}) {
  const tx = options?.tx ?? prisma;
  const now = options?.now ?? new Date();

  const where: Prisma.SLAStageInstanceWhereInput = {
    status: "RUNNING",
    dueAt: { lt: now },
    breachedAt: null,
  };

  if (options?.workspaceId) {
    where.workspaceId = options.workspaceId;
  }

  const result = await tx.sLAStageInstance.updateMany({
    where,
    data: {
      status: "BREACHED",
      breachedAt: now,
      stopReason: "deadline_exceeded",
    },
  });

  return result.count;
}

export async function stopCurrentStageIfProofQualifies(params: {
  tx: TxOrClient;
  leadId: string;
  proofEventType: ProofEventType;
  proofEventId: string;
}) {
  const { tx, leadId, proofEventType, proofEventId } = params;

  const runningStage = await tx.sLAStageInstance.findFirst({
    where: { leadId, status: "RUNNING" },
    orderBy: { startedAt: "asc" },
  });

  if (!runningStage) {
    return null;
  }

  const stageDefinition = await tx.sLAStageDefinition.findFirst({
    where: {
      flowId: runningStage.flowId,
      key: runningStage.stageKey,
    },
  });

  if (!stageDefinition) {
    return null;
  }

  const stopOnProofTypes = parseStopOnProofTypes(stageDefinition.stopOnProofTypes);
  if (!stopOnProofTypes.includes(toCanonicalProofType(proofEventType))) {
    return null;
  }

  return stopStage(
    leadId,
    runningStage.flowId,
    runningStage.stageKey,
    proofEventId,
    `proof:${proofEventType}`,
    { tx }
  );
}

export function getOrderedStageDefinitions(definitions: SLAStageDefinition[]) {
  const desiredOrder = [
    "first_touch",
    "handover",
    "qualification",
    "next_step_scheduled",
    "follow_up_closure",
  ];
  const indexMap = new Map(desiredOrder.map((key, index) => [key, index]));
  return [...definitions].sort((left, right) => {
    const leftIndex = indexMap.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = indexMap.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.key.localeCompare(right.key);
  });
}

export function toSlaStatusLabel(status: SLAStageInstanceStatus) {
  if (status === "RUNNING") return "In curs";
  if (status === "STOPPED") return "Oprit";
  return "Depasit";
}
