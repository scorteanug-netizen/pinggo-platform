import { LeadSourceType, MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "../db";

const FEED_EVENT_TYPES = [
  "lead_received",
  "autopilot_started",
  "autopilot_ack",
  "autopilot_question_asked",
  "autopilot_message_received",
  "autopilot_booking_offered",
  "meeting_created",
  "manager_alert",
  "reminder_sent",
  "handover_requested",
  "reassigned",
] as const;

type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

const AUTOPILOT_EVENT_TYPES = new Set<FeedEventType>([
  "autopilot_started",
  "autopilot_ack",
  "autopilot_question_asked",
  "autopilot_message_received",
  "autopilot_booking_offered",
]);

const BREACH_EVENT_TYPES = new Set<FeedEventType>(["manager_alert", "reminder_sent"]);
const HANDOVER_EVENT_TYPES = new Set<FeedEventType>(["handover_requested", "reassigned"]);

const SOURCE_LABEL: Record<LeadSourceType, string> = {
  WEBHOOK: "Webhook",
  FORM: "Website",
  CRM: "CRM",
  WHATSAPP: "WhatsApp",
  API: "API",
  MANUAL: "Manual",
  IMPORT: "Import",
  EMAIL: "Email",
  FACEBOOK: "Facebook",
};

export type ActivityEventType =
  | "lead_new"
  | "autopilot_response"
  | "booking_confirmed"
  | "breach"
  | "handover";

export type ActivityFeedItem = {
  id: string;
  type: ActivityEventType;
  leadId: string;
  leadName: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
};

export type ActivityFeedResult = {
  events: ActivityFeedItem[];
  hasMore: boolean;
};

function getLeadName(lead: {
  id: string;
  externalId: string | null;
  identity: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null;
}) {
  return (
    lead.identity?.name ||
    lead.identity?.email ||
    lead.identity?.phone ||
    lead.identity?.company ||
    lead.externalId ||
    lead.id
  );
}

function parseMetadata(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function mapToActivityType(type: FeedEventType): ActivityEventType {
  if (type === "lead_received") return "lead_new";
  if (type === "meeting_created") return "booking_confirmed";
  if (AUTOPILOT_EVENT_TYPES.has(type)) return "autopilot_response";
  if (BREACH_EVENT_TYPES.has(type)) return "breach";
  if (HANDOVER_EVENT_TYPES.has(type)) return "handover";
  return "autopilot_response";
}

function buildEventMessage(params: {
  type: FeedEventType;
  sourceType: LeadSourceType;
}): string {
  const { type, sourceType } = params;

  if (type === "lead_received") {
    return `Lead nou din ${SOURCE_LABEL[sourceType]}`;
  }
  if (type === "meeting_created") {
    return "Programare confirmata";
  }
  if (type === "autopilot_booking_offered") {
    return "Autopilot a trimis link de programare";
  }
  if (AUTOPILOT_EVENT_TYPES.has(type)) {
    return "Autopilot a trimis un raspuns";
  }
  if (type === "manager_alert") {
    return "Alerta SLA: lead critic";
  }
  if (type === "reminder_sent") {
    return "Reminder SLA trimis";
  }
  if (type === "handover_requested") {
    return "Handover solicitat catre operator";
  }
  if (type === "reassigned") {
    return "Lead reasignat automat";
  }

  return "Eveniment operational";
}

export async function getActivityFeed(params: {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
  offset?: number;
  limit?: number;
}): Promise<ActivityFeedResult> {
  const offset = Math.max(0, Math.floor(params.offset ?? 0));
  const limit = Math.min(50, Math.max(1, Math.floor(params.limit ?? 20)));

  const rows = await prisma.leadEvent.findMany({
    where: {
      workspaceId: params.workspaceId,
      type: { in: [...FEED_EVENT_TYPES] },
      ...(params.viewerRole === MembershipRole.AGENT
        ? {
            lead: {
              ownerUserId: params.viewerUserId,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: limit + 1,
    select: {
      id: true,
      type: true,
      createdAt: true,
      payload: true,
      lead: {
        select: {
          id: true,
          externalId: true,
          sourceType: true,
          identity: {
            select: {
              name: true,
              email: true,
              phone: true,
              company: true,
            },
          },
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;

  const events: ActivityFeedItem[] = visibleRows.map((row) => {
    const rawType = row.type as FeedEventType;
    return {
      id: row.id,
      type: mapToActivityType(rawType),
      leadId: row.lead.id,
      leadName: getLeadName(row.lead),
      message: buildEventMessage({
        type: rawType,
        sourceType: row.lead.sourceType,
      }),
      timestamp: row.createdAt.toISOString(),
      metadata: parseMetadata(row.payload),
    };
  });

  return {
    events,
    hasMore,
  };
}
