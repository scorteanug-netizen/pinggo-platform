import { Prisma, SLAStageInstanceStatus } from "@prisma/client";
import { prisma } from "../db";

const FIRST_TOUCH_PROOF_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
] as const;

const DEFAULT_RANGE_DAYS = 30;

const STAGE_ORDER = new Map(
  [
    "first_touch",
    "handover",
    "qualification",
    "next_step_scheduled",
    "follow_up_closure",
  ].map((key, index) => [key, index])
);

function parseDateInput(value: string | null | undefined, mode: "from" | "to") {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(
      mode === "from" ? `${raw}T00:00:00.000Z` : `${raw}T23:59:59.999Z`
    );
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toRounded(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toMedian(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function buildRangeFilter(from: Date, to: Date) {
  return {
    gte: from,
    lte: to,
  };
}

function formatDateAsInput(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveReportDateRange(fromInput?: string | null, toInput?: string | null) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const defaultTo = new Date(now);
  defaultTo.setUTCHours(23, 59, 59, 999);

  const parsedFrom = parseDateInput(fromInput, "from") ?? defaultFrom;
  const parsedTo = parseDateInput(toInput, "to") ?? defaultTo;

  if (parsedFrom.getTime() <= parsedTo.getTime()) {
    return { from: parsedFrom, to: parsedTo };
  }

  return {
    from: new Date(parsedTo.getTime()),
    to: new Date(parsedFrom.getTime()),
  };
}

export type ReportsSummaryResult = {
  from: string;
  to: string;
  totalLeads: number;
  touchedLeads: number;
  ttftAvgMinutes: number | null;
  ttftMedianMinutes: number | null;
  bookingRatePct: number;
  bookingLeads: number;
  handoverRatePct: number;
  handoverEvents: number;
};

export async function getReportsSummary(params: {
  workspaceId: string;
  from: Date;
  to: Date;
  tx?: Prisma.TransactionClient | typeof prisma;
}): Promise<ReportsSummaryResult> {
  const tx = params.tx ?? prisma;
  const rangeFilter = buildRangeFilter(params.from, params.to);

  const leadReceivedEvents = await tx.leadEvent.findMany({
    where: {
      workspaceId: params.workspaceId,
      type: "lead_received",
      createdAt: rangeFilter,
    },
    select: {
      leadId: true,
      createdAt: true,
    },
    orderBy: [{ leadId: "asc" }, { createdAt: "asc" }],
  });

  const receivedAtByLead = new Map<string, Date>();
  for (const event of leadReceivedEvents) {
    if (!receivedAtByLead.has(event.leadId)) {
      receivedAtByLead.set(event.leadId, event.createdAt);
    }
  }

  const leadIds = [...receivedAtByLead.keys()];
  if (leadIds.length === 0) {
    return {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      totalLeads: 0,
      touchedLeads: 0,
      ttftAvgMinutes: null,
      ttftMedianMinutes: null,
      bookingRatePct: 0,
      bookingLeads: 0,
      handoverRatePct: 0,
      handoverEvents: 0,
    };
  }

  const [proofEvents, bookingEvents, handoverEventsCount] = await Promise.all([
    tx.leadEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        leadId: { in: leadIds },
        type: { in: [...FIRST_TOUCH_PROOF_TYPES] },
        createdAt: rangeFilter,
      },
      select: {
        leadId: true,
        createdAt: true,
      },
      orderBy: [{ leadId: "asc" }, { createdAt: "asc" }],
    }),
    tx.leadEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        leadId: { in: leadIds },
        type: "meeting_created",
        createdAt: rangeFilter,
      },
      select: {
        leadId: true,
      },
      distinct: ["leadId"],
    }),
    tx.leadEvent.count({
      where: {
        workspaceId: params.workspaceId,
        type: { contains: "handover", mode: "insensitive" },
        createdAt: rangeFilter,
      },
    }),
  ]);

  const firstProofByLead = new Map<string, Date>();
  for (const event of proofEvents) {
    const receivedAt = receivedAtByLead.get(event.leadId);
    if (!receivedAt) continue;
    if (event.createdAt.getTime() < receivedAt.getTime()) continue;
    if (!firstProofByLead.has(event.leadId)) {
      firstProofByLead.set(event.leadId, event.createdAt);
    }
  }

  const ttftMinutes: number[] = [];
  for (const [leadId, firstProofAt] of firstProofByLead) {
    const receivedAt = receivedAtByLead.get(leadId);
    if (!receivedAt) continue;
    const diffMinutes = (firstProofAt.getTime() - receivedAt.getTime()) / (60 * 1000);
    if (diffMinutes >= 0) {
      ttftMinutes.push(diffMinutes);
    }
  }

  const avg =
    ttftMinutes.length > 0
      ? ttftMinutes.reduce((sum, value) => sum + value, 0) / ttftMinutes.length
      : null;
  const median = toMedian(ttftMinutes);
  const bookingLeads = bookingEvents.length;
  const totalLeads = leadIds.length;

  return {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    totalLeads,
    touchedLeads: ttftMinutes.length,
    ttftAvgMinutes: avg === null ? null : toRounded(avg, 1),
    ttftMedianMinutes: median === null ? null : toRounded(median, 1),
    bookingRatePct: totalLeads === 0 ? 0 : toRounded((bookingLeads / totalLeads) * 100, 1),
    bookingLeads,
    handoverRatePct:
      totalLeads === 0 ? 0 : toRounded((handoverEventsCount / totalLeads) * 100, 1),
    handoverEvents: handoverEventsCount,
  };
}

export type ReportsStageRow = {
  stageKey: string;
  stageName: string;
  total: number;
  breached: number;
  breachRatePct: number;
};

export type ReportsStagesResult = {
  from: string;
  to: string;
  rows: ReportsStageRow[];
};

export async function getReportsStages(params: {
  workspaceId: string;
  from: Date;
  to: Date;
  tx?: Prisma.TransactionClient | typeof prisma;
}): Promise<ReportsStagesResult> {
  const tx = params.tx ?? prisma;
  const rangeFilter = buildRangeFilter(params.from, params.to);

  const stageInstances = await tx.sLAStageInstance.findMany({
    where: {
      workspaceId: params.workspaceId,
      startedAt: rangeFilter,
    },
    select: {
      stageKey: true,
      status: true,
    },
  });

  const countsByStage = new Map<
    string,
    {
      total: number;
      breached: number;
    }
  >();

  for (const instance of stageInstances) {
    const current = countsByStage.get(instance.stageKey) ?? {
      total: 0,
      breached: 0,
    };
    current.total += 1;
    if (instance.status === SLAStageInstanceStatus.BREACHED) {
      current.breached += 1;
    }
    countsByStage.set(instance.stageKey, current);
  }

  const definitions = await tx.sLAStageDefinition.findMany({
    where: {
      flow: { workspaceId: params.workspaceId },
    },
    select: {
      key: true,
      name: true,
    },
    orderBy: [{ key: "asc" }, { flowId: "asc" }],
  });

  const nameByKey = new Map<string, string>();
  for (const definition of definitions) {
    if (!nameByKey.has(definition.key)) {
      nameByKey.set(definition.key, definition.name);
    }
  }

  const stageKeys = [...new Set([...definitions.map((definition) => definition.key), ...countsByStage.keys()])];

  const rows: ReportsStageRow[] = stageKeys
    .map((stageKey) => {
      const counts = countsByStage.get(stageKey) ?? {
        total: 0,
        breached: 0,
      };
      const breachRatePct =
        counts.total === 0 ? 0 : toRounded((counts.breached / counts.total) * 100, 1);
      return {
        stageKey,
        stageName: nameByKey.get(stageKey) ?? stageKey,
        total: counts.total,
        breached: counts.breached,
        breachRatePct,
      };
    })
    .sort((left, right) => {
      const leftOrder = STAGE_ORDER.get(left.stageKey) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = STAGE_ORDER.get(right.stageKey) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.stageKey.localeCompare(right.stageKey);
    });

  return {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    rows,
  };
}

export function getDefaultReportRangeInputValues(from: Date, to: Date) {
  return {
    from: formatDateAsInput(from),
    to: formatDateAsInput(to),
  };
}
