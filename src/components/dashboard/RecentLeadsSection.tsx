import { LeadSourceType, LeadStatus, MembershipRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { RecentLeadsTable, type RecentLeadItem } from "./RecentLeadsTable";

const FIRST_TOUCH_EVENT_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
] as const;

const AUTOPILOT_EVENT_TYPES = [
  "autopilot_started",
  "autopilot_ack",
  "autopilot_question_asked",
  "autopilot_message_received",
] as const;

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

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; variant: RecentLeadItem["statusVariant"] }
> = {
  NEW: { label: "Nou", variant: "orange" },
  OPEN: { label: "Deschis", variant: "violet" },
  QUALIFIED: { label: "Calificat", variant: "green" },
  NOT_QUALIFIED: { label: "Neeligibil", variant: "gray" },
  SPAM: { label: "Spam", variant: "red" },
  ARCHIVED: { label: "Arhivat", variant: "gray" },
  WON: { label: "Câștigat", variant: "green" },
  LOST: { label: "Pierdut", variant: "red" },
  INCOMPLETE: { label: "Incomplet", variant: "orange" },
};

type RecentLeadsSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

function formatMinutes(value: number) {
  if (value < 1) return "<1m";
  if (value < 60) return `${Math.round(value)}m`;

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function computeFirstTouchMinutes(
  createdAt: Date,
  events: Array<{ type: string; createdAt: Date }>
) {
  const firstTouch = events.find((event) =>
    FIRST_TOUCH_EVENT_TYPES.includes(event.type as (typeof FIRST_TOUCH_EVENT_TYPES)[number])
  );
  if (!firstTouch) return null;

  const diffMinutes = (firstTouch.createdAt.getTime() - createdAt.getTime()) / 60000;
  if (diffMinutes < 0) return null;
  return formatMinutes(diffMinutes);
}

function getAssignedToLabel(
  ownerUser: { name: string | null; email: string } | null,
  events: Array<{ type: string; createdAt: Date }>
) {
  if (ownerUser) {
    return ownerUser.name || ownerUser.email;
  }

  const hasAutopilotActivity = events.some((event) =>
    AUTOPILOT_EVENT_TYPES.includes(event.type as (typeof AUTOPILOT_EVENT_TYPES)[number])
  );

  return hasAutopilotActivity ? "Autopilot" : "Neasignat";
}

function getLeadDisplayName(lead: {
  id: string;
  externalId: string | null;
  identity: { name: string | null; email: string | null; phone: string | null; company: string | null } | null;
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

export async function RecentLeadsSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: RecentLeadsSectionProps) {
  const where =
    viewerRole === MembershipRole.AGENT
      ? { workspaceId, ownerUserId: viewerUserId }
      : { workspaceId };

  const recentLeads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      externalId: true,
      sourceType: true,
      status: true,
      createdAt: true,
      identity: {
        select: {
          name: true,
          email: true,
          phone: true,
          company: true,
        },
      },
      ownerUser: {
        select: {
          name: true,
          email: true,
        },
      },
      events: {
        where: {
          type: {
            in: [...FIRST_TOUCH_EVENT_TYPES, ...AUTOPILOT_EVENT_TYPES],
          },
        },
        select: {
          type: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  const rows: RecentLeadItem[] = recentLeads.map((lead) => {
    const status = STATUS_CONFIG[lead.status];
    return {
      id: lead.id,
      name: getLeadDisplayName(lead),
      source: SOURCE_LABEL[lead.sourceType],
      statusLabel: status.label,
      statusVariant: status.variant,
      responseTime: computeFirstTouchMinutes(lead.createdAt, lead.events),
      assignedTo: getAssignedToLabel(lead.ownerUser, lead.events),
    };
  });

  return <RecentLeadsTable leads={rows} />;
}
