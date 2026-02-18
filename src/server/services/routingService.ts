import { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";

export type FlowRoutingConfig = {
  eligibleAgents: string[];
  fallbackOwnerUserId: string | null;
  roundRobinCursor: number;
};

type TxOrClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_ROUTING_CONFIG: FlowRoutingConfig = {
  eligibleAgents: [],
  fallbackOwnerUserId: null,
  roundRobinCursor: 0,
};

const ASSIGNABLE_ROLES: MembershipRole[] = [
  MembershipRole.AGENT,
  MembershipRole.MANAGER,
  MembershipRole.ADMIN,
  MembershipRole.OWNER,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUserId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUserIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const userId = normalizeUserId(item);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    normalized.push(userId);
  }
  return normalized;
}

function normalizeCursor(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function parseRoutingRecord(value: unknown): FlowRoutingConfig {
  if (!isRecord(value)) return { ...DEFAULT_ROUTING_CONFIG };
  return {
    eligibleAgents: normalizeUserIdList(value.eligibleAgents),
    fallbackOwnerUserId: normalizeUserId(value.fallbackOwnerUserId),
    roundRobinCursor: normalizeCursor(value.roundRobinCursor),
  };
}

function toBaseConfig(value: Prisma.JsonValue | null | undefined) {
  if (!isRecord(value)) return {} as Record<string, unknown>;
  return { ...value };
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function listAssignableUserIds(tx: TxOrClient, workspaceId: string) {
  const memberships = await tx.membership.findMany({
    where: {
      workspaceId,
      role: { in: ASSIGNABLE_ROLES },
      status: MembershipStatus.ACTIVE,
      isAvailable: true,
    },
    select: { userId: true },
  });
  return new Set(memberships.map((entry) => entry.userId));
}

function pickRoundRobinOwner(params: {
  eligibleAgents: string[];
  roundRobinCursor: number;
  avoidUserId?: string | null;
}) {
  const { eligibleAgents, avoidUserId } = params;
  if (eligibleAgents.length === 0) {
    return { ownerUserId: null as string | null, nextCursor: params.roundRobinCursor };
  }

  const startCursor = normalizeCursor(params.roundRobinCursor);
  const candidateCount = eligibleAgents.length;

  for (let offset = 0; offset < candidateCount; offset += 1) {
    const index = (startCursor + offset) % candidateCount;
    const candidate = eligibleAgents[index];
    if (candidateCount > 1 && avoidUserId && candidate === avoidUserId) {
      continue;
    }

    return {
      ownerUserId: candidate,
      nextCursor: startCursor + offset + 1,
    };
  }

  return {
    ownerUserId: eligibleAgents[startCursor % candidateCount],
    nextCursor: startCursor + 1,
  };
}

async function updateFlowRoutingConfigIfNeeded(params: {
  tx: TxOrClient;
  flowId: string;
  existingConfig: Prisma.JsonValue | null;
  currentRouting: FlowRoutingConfig;
  nextRouting: FlowRoutingConfig;
}) {
  const { tx, flowId, existingConfig, currentRouting, nextRouting } = params;
  const hasChanges =
    !arraysEqual(currentRouting.eligibleAgents, nextRouting.eligibleAgents) ||
    currentRouting.fallbackOwnerUserId !== nextRouting.fallbackOwnerUserId ||
    currentRouting.roundRobinCursor !== nextRouting.roundRobinCursor;

  if (!hasChanges) return;

  await tx.flow.update({
    where: { id: flowId },
    data: {
      config: mergeFlowRoutingConfig(existingConfig, nextRouting),
    },
  });
}

function sanitizeRoutingForWorkspace(config: FlowRoutingConfig, validUserIds: Set<string>) {
  const eligibleAgents = config.eligibleAgents.filter((userId) => validUserIds.has(userId));
  const fallbackOwnerUserId =
    config.fallbackOwnerUserId && validUserIds.has(config.fallbackOwnerUserId)
      ? config.fallbackOwnerUserId
      : null;

  return {
    eligibleAgents,
    fallbackOwnerUserId,
    roundRobinCursor: normalizeCursor(config.roundRobinCursor),
  };
}

export function parseFlowRoutingConfig(config: Prisma.JsonValue | null | undefined): FlowRoutingConfig {
  if (!isRecord(config)) {
    return { ...DEFAULT_ROUTING_CONFIG };
  }

  if (isRecord(config.routing)) {
    return parseRoutingRecord(config.routing);
  }

  return parseRoutingRecord(config);
}

export function mergeFlowRoutingConfig(
  existingConfig: Prisma.JsonValue | null | undefined,
  routingConfig: FlowRoutingConfig
): Prisma.InputJsonValue {
  const baseConfig = toBaseConfig(existingConfig);
  const normalizedRouting = parseRoutingRecord(routingConfig);

  return {
    ...baseConfig,
    routing: normalizedRouting,
  } as Prisma.InputJsonValue;
}

export async function assignLeadFromFlowRouting(params: {
  tx?: TxOrClient;
  workspaceId: string;
  flowId: string;
  leadId: string;
}) {
  const tx = params.tx ?? prisma;

  const [flow, validUserIds] = await Promise.all([
    tx.flow.findFirst({
      where: { id: params.flowId, workspaceId: params.workspaceId },
      select: { id: true, config: true },
    }),
    listAssignableUserIds(tx, params.workspaceId),
  ]);

  if (!flow) {
    throw new Error("FLOW_NOT_FOUND");
  }

  const parsedRouting = parseFlowRoutingConfig(flow.config);
  const sanitizedRouting = sanitizeRoutingForWorkspace(parsedRouting, validUserIds);

  const roundRobinDecision = pickRoundRobinOwner({
    eligibleAgents: sanitizedRouting.eligibleAgents,
    roundRobinCursor: sanitizedRouting.roundRobinCursor,
  });

  const ownerUserId =
    roundRobinDecision.ownerUserId ?? sanitizedRouting.fallbackOwnerUserId ?? null;
  const method =
    roundRobinDecision.ownerUserId !== null
      ? ("round_robin" as const)
      : sanitizedRouting.fallbackOwnerUserId
        ? ("fallback" as const)
        : null;

  const nextRouting: FlowRoutingConfig = {
    ...sanitizedRouting,
    roundRobinCursor:
      roundRobinDecision.ownerUserId !== null
        ? roundRobinDecision.nextCursor
        : sanitizedRouting.roundRobinCursor,
  };

  await updateFlowRoutingConfigIfNeeded({
    tx,
    flowId: flow.id,
    existingConfig: flow.config,
    currentRouting: parsedRouting,
    nextRouting,
  });

  if (ownerUserId) {
    await tx.lead.update({
      where: { id: params.leadId },
      data: { ownerUserId },
    });

    await tx.leadEvent.create({
      data: {
        leadId: params.leadId,
        workspaceId: params.workspaceId,
        type: "assigned",
        payload: {
          ownerUserId,
          method: method ?? "none",
          flowId: params.flowId,
        } as Prisma.InputJsonValue,
      },
    });
  }

  return {
    ownerUserId,
    method,
    roundRobinCursor: nextRouting.roundRobinCursor,
    routing: nextRouting,
  };
}

export async function reassignLeadFromFlowRouting(params: {
  tx?: TxOrClient;
  workspaceId: string;
  flowId: string;
  leadId: string;
}) {
  const tx = params.tx ?? prisma;

  const [lead, flow, validUserIds] = await Promise.all([
    tx.lead.findFirst({
      where: { id: params.leadId, workspaceId: params.workspaceId },
      select: { id: true, ownerUserId: true },
    }),
    tx.flow.findFirst({
      where: { id: params.flowId, workspaceId: params.workspaceId },
      select: { id: true, config: true },
    }),
    listAssignableUserIds(tx, params.workspaceId),
  ]);

  if (!lead) throw new Error("LEAD_NOT_FOUND");
  if (!flow) throw new Error("FLOW_NOT_FOUND");

  const previousOwnerUserId = lead.ownerUserId ?? null;
  const parsedRouting = parseFlowRoutingConfig(flow.config);
  const sanitizedRouting = sanitizeRoutingForWorkspace(parsedRouting, validUserIds);

  const roundRobinDecision = pickRoundRobinOwner({
    eligibleAgents: sanitizedRouting.eligibleAgents,
    roundRobinCursor: sanitizedRouting.roundRobinCursor,
    avoidUserId: previousOwnerUserId,
  });

  const nextOwnerUserId =
    roundRobinDecision.ownerUserId ?? sanitizedRouting.fallbackOwnerUserId ?? previousOwnerUserId;
  const method =
    roundRobinDecision.ownerUserId !== null
      ? ("round_robin" as const)
      : sanitizedRouting.fallbackOwnerUserId
        ? ("fallback" as const)
        : ("unchanged" as const);

  const nextRouting: FlowRoutingConfig = {
    ...sanitizedRouting,
    roundRobinCursor:
      roundRobinDecision.ownerUserId !== null
        ? roundRobinDecision.nextCursor
        : sanitizedRouting.roundRobinCursor,
  };

  await updateFlowRoutingConfigIfNeeded({
    tx,
    flowId: flow.id,
    existingConfig: flow.config,
    currentRouting: parsedRouting,
    nextRouting,
  });

  if (nextOwnerUserId !== previousOwnerUserId) {
    await tx.lead.update({
      where: { id: lead.id },
      data: { ownerUserId: nextOwnerUserId ?? undefined },
    });
  }

  return {
    previousOwnerUserId,
    ownerUserId: nextOwnerUserId,
    changed: nextOwnerUserId !== previousOwnerUserId,
    method,
    roundRobinCursor: nextRouting.roundRobinCursor,
  };
}
