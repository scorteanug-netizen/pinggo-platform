import { LeadStatus, MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "../db";

const FIRST_TOUCH_PROOF_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
] as const;

export type FunnelStageKey = "new" | "contacted" | "qualified" | "booked" | "closing";

export type ConversionFunnelStage = {
  key: FunnelStageKey;
  label: string;
  count: number;
  percentage: number;
};

export type ConversionFunnelDropoff = {
  from: FunnelStageKey;
  to: FunnelStageKey;
  ratePct: number;
};

export type ConversionFunnelResult = {
  from: string;
  to: string;
  stages: ConversionFunnelStage[];
  overallConversionPct: number;
  biggestDropoff: ConversionFunnelDropoff | null;
};

type GetConversionFunnelParams = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
  now?: Date;
  tx?: Prisma.TransactionClient | typeof prisma;
};

function startOfCurrentUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toPercentage(value: number, total: number) {
  if (total === 0) return 0;
  return roundTo((value / total) * 100, 1);
}

function isQualifiedStatusChange(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const toStatus = (payload as Prisma.JsonObject).toStatus;
  return toStatus === LeadStatus.QUALIFIED;
}

export async function getConversionFunnel(
  params: GetConversionFunnelParams
): Promise<ConversionFunnelResult> {
  const tx = params.tx ?? prisma;
  const now = params.now ?? new Date();
  const monthStart = startOfCurrentUtcMonth(now);

  const leadWhere: Prisma.LeadWhereInput = {
    workspaceId: params.workspaceId,
    createdAt: {
      gte: monthStart,
      lte: now,
    },
  };

  if (params.viewerRole === MembershipRole.AGENT) {
    leadWhere.ownerUserId = params.viewerUserId;
  }

  const leads = await tx.lead.findMany({
    where: leadWhere,
    select: {
      id: true,
      status: true,
    },
  });

  if (leads.length === 0) {
    return {
      from: monthStart.toISOString(),
      to: now.toISOString(),
      stages: [
        { key: "new", label: "Leaduri Noi", count: 0, percentage: 0 },
        { key: "contacted", label: "Contactate", count: 0, percentage: 0 },
        { key: "qualified", label: "Calificate", count: 0, percentage: 0 },
        { key: "booked", label: "Programate", count: 0, percentage: 0 },
        { key: "closing", label: "Closing", count: 0, percentage: 0 },
      ],
      overallConversionPct: 0,
      biggestDropoff: null,
    };
  }

  const leadIds = leads.map((lead) => lead.id);

  const [contactedEvents, bookedEvents, qualifiedStatusChanges] = await Promise.all([
    tx.leadEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        leadId: { in: leadIds },
        type: { in: [...FIRST_TOUCH_PROOF_TYPES] },
        createdAt: { lte: now },
      },
      select: {
        leadId: true,
      },
      distinct: ["leadId"],
    }),
    tx.leadEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        leadId: { in: leadIds },
        type: "meeting_created",
        createdAt: { lte: now },
      },
      select: {
        leadId: true,
      },
      distinct: ["leadId"],
    }),
    tx.leadEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        leadId: { in: leadIds },
        type: "status_changed",
        createdAt: { lte: now },
      },
      select: {
        leadId: true,
        payload: true,
      },
    }),
  ]);

  const contactedLeadIds = new Set(contactedEvents.map((event) => event.leadId));
  const bookedLeadIds = new Set(bookedEvents.map((event) => event.leadId));
  const qualifiedFromEvents = new Set(
    qualifiedStatusChanges
      .filter((event) => isQualifiedStatusChange(event.payload))
      .map((event) => event.leadId)
  );

  let contactedCount = 0;
  let qualifiedCount = 0;
  let bookedCount = 0;
  let closingCount = 0;

  for (const lead of leads) {
    const contacted = contactedLeadIds.has(lead.id);
    if (!contacted) {
      continue;
    }
    contactedCount += 1;

    const qualified =
      qualifiedFromEvents.has(lead.id) ||
      lead.status === LeadStatus.QUALIFIED ||
      lead.status === LeadStatus.ARCHIVED;
    if (!qualified) {
      continue;
    }
    qualifiedCount += 1;

    const booked = bookedLeadIds.has(lead.id);
    if (!booked) {
      continue;
    }
    bookedCount += 1;

    if (lead.status === LeadStatus.ARCHIVED) {
      closingCount += 1;
    }
  }

  const newCount = leads.length;
  const stages: ConversionFunnelStage[] = [
    {
      key: "new",
      label: "Leaduri Noi",
      count: newCount,
      percentage: toPercentage(newCount, newCount),
    },
    {
      key: "contacted",
      label: "Contactate",
      count: contactedCount,
      percentage: toPercentage(contactedCount, newCount),
    },
    {
      key: "qualified",
      label: "Calificate",
      count: qualifiedCount,
      percentage: toPercentage(qualifiedCount, newCount),
    },
    {
      key: "booked",
      label: "Programate",
      count: bookedCount,
      percentage: toPercentage(bookedCount, newCount),
    },
    {
      key: "closing",
      label: "Closing",
      count: closingCount,
      percentage: toPercentage(closingCount, newCount),
    },
  ];

  let biggestDropoff: ConversionFunnelDropoff | null = null;
  for (let index = 0; index < stages.length - 1; index += 1) {
    const current = stages[index];
    const next = stages[index + 1];
    const dropoffRate = current.count === 0 ? 0 : toPercentage(current.count - next.count, current.count);

    if (!biggestDropoff || dropoffRate > biggestDropoff.ratePct) {
      biggestDropoff = {
        from: current.key,
        to: next.key,
        ratePct: dropoffRate,
      };
    }
  }

  return {
    from: monthStart.toISOString(),
    to: now.toISOString(),
    stages,
    overallConversionPct: toPercentage(closingCount, newCount),
    biggestDropoff,
  };
}
