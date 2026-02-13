import { MembershipRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { BreachAlertsBanner, type CriticalBreach } from "./BreachAlertsBanner";

const SOURCE_LABEL = {
  WEBHOOK: "Webhook",
  FORM: "Website",
  CRM: "CRM",
  WHATSAPP: "WhatsApp",
  API: "API",
  MANUAL: "Manual",
  IMPORT: "Import",
  EMAIL: "Email",
} as const;

type BreachAlertsSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

function formatDurationFromDueDate(dueAt: Date) {
  const diffMs = Math.max(0, Date.now() - dueAt.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    if (hours === 0) return `${days}z`;
    return `${days}z ${hours}h`;
  }
  if (hours > 0) {
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }
  if (minutes < 1) return "<1m";
  return `${minutes}m`;
}

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

export async function BreachAlertsSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: BreachAlertsSectionProps) {
  const leadWhere =
    viewerRole === MembershipRole.AGENT
      ? {
          workspaceId,
          ownerUserId: viewerUserId,
          slaStageInstances: { some: { status: "BREACHED" as const } },
        }
      : {
          workspaceId,
          slaStageInstances: { some: { status: "BREACHED" as const } },
        };

  const breachCount = await prisma.lead.count({
    where: leadWhere,
  });

  if (breachCount === 0) {
    return null;
  }

  const criticalStage = await prisma.sLAStageInstance.findFirst({
    where: {
      workspaceId,
      status: "BREACHED",
      ...(viewerRole === MembershipRole.AGENT
        ? {
            lead: {
              ownerUserId: viewerUserId,
            },
          }
        : {}),
    },
    orderBy: [{ dueAt: "asc" }],
    select: {
      dueAt: true,
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

  const criticalBreach: CriticalBreach | null = criticalStage
    ? {
        id: criticalStage.lead.id,
        name: getLeadName(criticalStage.lead),
        source: SOURCE_LABEL[criticalStage.lead.sourceType],
        breachDuration: formatDurationFromDueDate(criticalStage.dueAt),
      }
    : null;

  return (
    <BreachAlertsBanner breachCount={breachCount} criticalBreach={criticalBreach} />
  );
}
