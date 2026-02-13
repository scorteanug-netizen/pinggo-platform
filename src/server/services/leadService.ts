import { LeadSourceType, LeadStatus, MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ProofEventType, stopCurrentStageIfProofQualifies } from "./slaService";

export async function addProofEvent(
  leadId: string,
  type: ProofEventType,
  payload?: Record<string, unknown>
) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: { id: true, workspaceId: true },
    });
    if (!lead) {
      throw new Error("LEAD_NOT_FOUND");
    }

    const event = await tx.leadEvent.create({
      data: {
        leadId,
        workspaceId: lead.workspaceId,
        type,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
      },
    });

    const stoppedStage = await stopCurrentStageIfProofQualifies({
      tx,
      leadId,
      proofEventType: type,
      proofEventId: event.id,
    });

    return {
      event,
      stoppedStage,
    };
  });
}

export async function addEscalationEvent(
  leadId: string,
  level: "REMINDER" | "REASSIGN" | "MANAGER_ALERT",
  payload?: Record<string, unknown>
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { workspaceId: true },
  });
  if (!lead) {
    throw new Error("LEAD_NOT_FOUND");
  }

  return prisma.leadEvent.create({
    data: {
      leadId,
      workspaceId: lead.workspaceId,
      type: `escalation_${level.toLowerCase()}`,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export type LeadSortField = "createdAt" | "updatedAt" | "status" | "sourceType";
export type LeadSortDirection = Prisma.SortOrder;
export type LeadStageFilter = "new" | "contacted" | "qualified" | "booked" | "closing";

const FIRST_TOUCH_EVENT_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
] as const;

type LeadQueryInput = {
  workspaceId: string;
  stage?: LeadStageFilter;
  status?: LeadStatus;
  source?: LeadSourceType;
  ownerId?: string;
  viewerUserId?: string;
  viewerRole?: MembershipRole;
  breach?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  q?: string;
};

const leadListInclude = {
  identity: true,
  ownerUser: {
    select: { id: true, email: true, name: true },
  },
  slaStageInstances: {
    where: {
      status: {
        in: ["RUNNING", "BREACHED"],
      },
    },
    orderBy: { dueAt: "asc" },
  },
} satisfies Prisma.LeadInclude;

function appendAndFilter(where: Prisma.LeadWhereInput, condition: Prisma.LeadWhereInput) {
  if (!where.AND) {
    where.AND = [condition];
    return;
  }

  where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [where.AND, condition];
}

function buildStageWhereInput(stage: LeadStageFilter): Prisma.LeadWhereInput {
  switch (stage) {
    case "new":
      return {
        status: LeadStatus.NEW,
      };
    case "contacted":
      return {
        status: LeadStatus.OPEN,
        events: {
          some: {
            type: {
              in: [...FIRST_TOUCH_EVENT_TYPES],
            },
          },
        },
      };
    case "qualified":
      return {
        status: LeadStatus.QUALIFIED,
      };
    case "booked":
      return {
        events: {
          some: {
            type: "meeting_created",
          },
        },
        status: {
          not: LeadStatus.ARCHIVED,
        },
      };
    case "closing":
      return {
        status: LeadStatus.ARCHIVED,
      };
    default:
      return {};
  }
}

export function buildLeadWhereInput(filters: LeadQueryInput): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { workspaceId: filters.workspaceId };

  if (filters.stage) {
    appendAndFilter(where, buildStageWhereInput(filters.stage));
  }
  if (filters.status) where.status = filters.status;
  if (filters.source) where.sourceType = filters.source;

  const trimmedQuery = filters.q?.trim();
  if (trimmedQuery) {
    where.OR = [
      { externalId: { contains: trimmedQuery, mode: "insensitive" } },
      { identity: { is: { name: { contains: trimmedQuery, mode: "insensitive" } } } },
      { identity: { is: { email: { contains: trimmedQuery, mode: "insensitive" } } } },
      { identity: { is: { phone: { contains: trimmedQuery, mode: "insensitive" } } } },
      { identity: { is: { company: { contains: trimmedQuery, mode: "insensitive" } } } },
    ];
  }

  const enforceOwnerUserId =
    filters.viewerRole === MembershipRole.AGENT
      ? (filters.viewerUserId ?? "__missing_viewer__")
      : filters.ownerId;
  if (enforceOwnerUserId) where.ownerUserId = enforceOwnerUserId;

  if (filters.dateFrom ?? filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
    if (filters.dateTo) where.createdAt.lte = filters.dateTo;
  }

  if (filters.breach === true) {
    where.slaStageInstances = { some: { status: "BREACHED" } };
  } else if (filters.breach === false) {
    where.NOT = { slaStageInstances: { some: { status: "BREACHED" } } };
  }

  return where;
}

export function buildLeadOrderBy(
  sort: LeadSortField = "createdAt",
  dir: LeadSortDirection = "desc"
): Prisma.LeadOrderByWithRelationInput {
  switch (sort) {
    case "updatedAt":
      return { updatedAt: dir };
    case "status":
      return { status: dir };
    case "sourceType":
      return { sourceType: dir };
    case "createdAt":
    default:
      return { createdAt: dir };
  }
}

export async function queryLeads(filters: LeadQueryInput & {
  page?: number;
  pageSize?: number;
  sort?: LeadSortField;
  dir?: LeadSortDirection;
}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(filters.pageSize ?? 25)));
  const where = buildLeadWhereInput(filters);
  const orderBy = buildLeadOrderBy(filters.sort, filters.dir);

  const [items, totalCount] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      include: leadListInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    items,
    totalCount,
    page,
    pageSize,
  };
}

export async function listLeads(filters: {
  workspaceId: string;
  stage?: LeadStageFilter;
  status?: LeadStatus;
  sourceType?: LeadSourceType;
  ownerUserId?: string;
  viewerUserId?: string;
  viewerRole?: MembershipRole;
  breached?: boolean;
  from?: Date;
  to?: Date;
  q?: string;
}) {
  const where = buildLeadWhereInput({
    workspaceId: filters.workspaceId,
    stage: filters.stage,
    status: filters.status,
    source: filters.sourceType,
    ownerId: filters.ownerUserId,
    viewerUserId: filters.viewerUserId,
    viewerRole: filters.viewerRole,
    breach: filters.breached,
    dateFrom: filters.from,
    dateTo: filters.to,
    q: filters.q,
  });

  return prisma.lead.findMany({
    where,
    include: leadListInclude,
    orderBy: buildLeadOrderBy("createdAt", "desc"),
  });
}

export async function getLeadDetail(leadId: string, workspaceId: string) {
  return getLeadDetailScoped(leadId, workspaceId);
}

export async function getLeadDetailScoped(
  leadId: string,
  workspaceId: string,
  viewer?: {
    userId: string;
    role: MembershipRole;
  }
) {
  const where: Prisma.LeadWhereInput = { id: leadId, workspaceId };
  if (viewer?.role === MembershipRole.AGENT) {
    where.ownerUserId = viewer.userId;
  }

  return prisma.lead.findFirst({
    where,
    include: {
      identity: true,
      ownerUser: {
        select: { id: true, email: true, name: true },
      },
      events: {
        orderBy: { createdAt: "desc" },
      },
      slaStageInstances: {
        orderBy: { startedAt: "asc" },
        include: {
          proofEvent: {
            select: {
              id: true,
              type: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
}
