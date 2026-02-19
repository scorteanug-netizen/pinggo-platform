import Link from "next/link";
import { LeadStatus, SLAStageInstanceStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
// Legacy autopilot service imports removed — now using AutopilotRun + EventLog directly
import { detectEscalations } from "@/server/services/escalationService";
import { getLeadDetailScoped } from "@/server/services/leadService";
import { detectBreaches } from "@/server/services/slaService";
import { AutopilotSection } from "./AutopilotSection";
import { LeadActions } from "./LeadActions";
import { TimelineCards } from "./TimelineCards";
import { EditLeadButton } from "@/app/app/leads/[id]/EditLeadButton";

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Nou",
  OPEN: "Deschis",
  QUALIFIED: "Calificat",
  NOT_QUALIFIED: "Neeligibil",
  SPAM: "Spam",
  ARCHIVED: "Arhivat",
  WON: "Câștigat",
  LOST: "Pierdut",
  INCOMPLETE: "Incomplet",
};

const SOURCE_LABEL: Record<string, string> = {
  WEBHOOK: "WhatsApp / Webhook",
  API: "API",
  MANUAL: "Manual",
  IMPORT: "Import",
  EMAIL: "Email",
};

const STAGE_STATUS_LABEL: Record<SLAStageInstanceStatus, string> = {
  RUNNING: "In curs",
  STOPPED: "Finalizata",
  BREACHED: "Depasita",
};

const STAGE_KEY_LABEL: Record<string, string> = {
  first_touch: "Primul contact",
  handover: "Transfer catre operator",
  qualification: "Calificare",
  next_step_scheduled: "Programare pas urmator",
  follow_up_closure: "Inchidere follow-up",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  lead_received: "Lead creat",
  lead_updated: "Lead actualizat",
  assigned: "Lead alocat",
  reassigned: "Lead realocat",
  reminder_sent: "Reminder SLA trimis",
  manager_alert: "Alerta manager",
  status_changed: "Status schimbat",
  marked_spam: "Marcat ca spam",
  message_sent: "Mesaj trimis catre lead",
  reply_received: "Raspuns primit de la lead",
  meeting_created: "Intalnire programata",
  call_logged: "Apel inregistrat",
  manual_proof_note: "Nota manuala adaugata",
  escalation_reminder: "Escaladare manuala: reminder",
  escalation_reassign: "Escaladare manuala: realocare",
  escalation_manager_alert: "Escaladare manuala: alerta manager",
  autopilot_started: "Autopilot pornit",
  autopilot_ack: "Confirmare automata trimisa",
  autopilot_message_received: "Mesaj client primit",
  autopilot_question_asked: "Intrebare automata trimisa",
  autopilot_booking_offered: "Link de programare trimis",
  handover_requested: "Transfer catre operator solicitat",
  message_blocked: "Mesaj blocat: lipseste numar",
  whatsapp_inbound: "Mesaj WhatsApp primit",
  autopilot_inbound: "Reply primit (autopilot)",
  autopilot_ai_planned: "AI planner",
  message_queued: "Mesaj in coada",
  handover_notified: "Agent notificat",
  handover_notification_failed: "Notificare agent esuata",
  handover_notification_blocked: "Notificare agent blocata",
  agent_confirmed_handover: "Agent a confirmat preluarea",
  agent_declined_handover: "Agent nu poate prelua",
  agent_outcome_reported: "Agent a raportat rezultatul",
};

const ASSIGNMENT_METHOD_LABEL: Record<string, string> = {
  round_robin: "Round-robin",
  fallback: "Owner implicit",
  none: "Fara regula",
  unchanged: "Neschimbat",
};

const SPAM_REASON_LABEL: Record<string, string> = {
  missing_contact: "Lipsa date de contact",
  spam_keyword: "Mesaj suspect",
};

type TimelineTone = "neutral" | "info" | "success" | "warning" | "danger" | "ai" | "agent";

type TimelineDetail = {
  label: string;
  value: string;
};

type TimelinePresentation = {
  title: string;
  subtitle?: string;
  details: TimelineDetail[];
  tone: TimelineTone;
};

type JsonObject = Record<string, unknown>;

function toJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function readString(object: JsonObject | null, key: string) {
  if (!object) return undefined;
  const value = object[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(object: JsonObject | null, key: string) {
  if (!object) return undefined;
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(object: JsonObject | null, key: string) {
  if (!object) return undefined;
  const value = object[key];
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(object: JsonObject | null, key: string) {
  if (!object) return [] as string[];
  const value = object[key];
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function humanizeToken(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function truncateText(value: string | undefined, maxLength = 120) {
  if (!value) return undefined;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toSourceLabel(sourceType: string | undefined) {
  if (!sourceType) return undefined;
  return SOURCE_LABEL[sourceType] ?? humanizeToken(sourceType);
}

function toAssignmentMethodLabel(method: string | undefined) {
  if (!method) return undefined;
  return ASSIGNMENT_METHOD_LABEL[method] ?? humanizeToken(method);
}

function toLeadStatusLabel(status: string | undefined) {
  if (!status) return undefined;
  if (status in STATUS_LABEL) {
    return STATUS_LABEL[status as LeadStatus];
  }
  return humanizeToken(status);
}

function toEventTypeLabel(type: string) {
  return EVENT_TYPE_LABEL[type] ?? humanizeToken(type);
}

function toStageLabel(
  definitionMap: Map<string, string>,
  params: { flowId?: string; stageKey?: string }
) {
  if (!params.stageKey) return undefined;
  if (params.flowId) {
    const knownName = definitionMap.get(`${params.flowId}:${params.stageKey}`);
    if (knownName) return knownName;
  }
  return STAGE_KEY_LABEL[params.stageKey] ?? humanizeToken(params.stageKey);
}

function toStopReasonLabel(
  reason: string | null | undefined,
  definitionMap: Map<string, string>,
  flowId: string
) {
  if (!reason) return undefined;
  if (reason === "deadline_exceeded") return "Termen depasit";
  if (reason.startsWith("proof:")) {
    return `Dovada: ${toEventTypeLabel(reason.slice("proof:".length))}`;
  }
  if (reason.startsWith("advanced_to_")) {
    const stageKey = reason.slice("advanced_to_".length);
    const stageLabel = toStageLabel(definitionMap, { flowId, stageKey }) ?? humanizeToken(stageKey);
    return `Mutata la etapa: ${stageLabel}`;
  }
  return humanizeToken(reason);
}

function getTimelineToneClasses(tone: TimelineTone) {
  if (tone === "success") {
    return {
      dotClass: "bg-emerald-500",
      chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (tone === "info") {
    return {
      dotClass: "bg-sky-500",
      chipClass: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  if (tone === "warning") {
    return {
      dotClass: "bg-amber-500",
      chipClass: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (tone === "danger") {
    return {
      dotClass: "bg-rose-500",
      chipClass: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  // AI / Autopilot events — violet
  if (tone === "ai") {
    return {
      dotClass: "bg-violet-500",
      chipClass: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }
  // Agent manual actions — green
  if (tone === "agent") {
    return {
      dotClass: "bg-green-500",
      chipClass: "border-green-200 bg-green-50 text-green-700",
    };
  }
  return {
    dotClass: "bg-slate-400",
    chipClass: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function stageStatusBadge(status: SLAStageInstanceStatus) {
  if (status === "RUNNING") return "bg-orange-100 text-orange-700 font-extrabold";
  if (status === "STOPPED") return "bg-emerald-100 text-emerald-700";
  return "bg-rose-100 text-rose-700";
}

function getStageOrder(stageKey: string) {
  const map = new Map([
    ["first_touch", 1],
    ["handover", 2],
    ["qualification", 3],
    ["next_step_scheduled", 4],
    ["follow_up_closure", 5],
  ]);
  return map.get(stageKey) ?? 999;
}

function getUserLabel(userLabelById: Map<string, string>, userId: string | undefined) {
  if (!userId) return undefined;
  return userLabelById.get(userId) ?? "Membru din echipa";
}

function extractPayloadUserIds(payload: unknown) {
  const payloadObject = toJsonObject(payload);
  const ownerUserId = readString(payloadObject, "ownerUserId");
  const previousOwnerUserId = readString(payloadObject, "previousOwnerUserId");
  const userId = readString(payloadObject, "userId");

  return [ownerUserId, previousOwnerUserId, userId].filter(
    (value): value is string => Boolean(value)
  );
}

function buildTimelineSummary(presentation: TimelinePresentation) {
  const detailSnippet = presentation.details
    .slice(0, 2)
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join(", ");

  if (presentation.subtitle && detailSnippet) {
    return `${presentation.subtitle}. ${detailSnippet}.`;
  }
  if (presentation.subtitle) return `${presentation.subtitle}.`;
  if (detailSnippet) return `${presentation.title}. ${detailSnippet}.`;
  return `${presentation.title}.`;
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function createTimelinePresentation(params: {
  event: {
    type: string;
    payload: unknown;
    actorUserId: string | null;
  };
  definitionMap: Map<string, string>;
  userLabelById: Map<string, string>;
}): TimelinePresentation {
  const { event, definitionMap, userLabelById } = params;
  const payload = toJsonObject(event.payload);
  const details: TimelineDetail[] = [];

  const addDetail = (label: string, value: string | undefined) => {
    if (!value) return;
    details.push({ label, value });
  };

  const stageLabel = toStageLabel(definitionMap, {
    flowId: readString(payload, "flowId"),
    stageKey: readString(payload, "stageKey"),
  });

  const actorLabel = getUserLabel(userLabelById, event.actorUserId ?? undefined);

  if (event.type === "lead_received") {
    const sourceLabel = toSourceLabel(readString(payload, "mappedSourceType") ?? readString(payload, "sourceType"));
    const identity = toJsonObject(payload?.identity);
    const contactParts = [
      readString(identity, "name"),
      readString(identity, "email"),
      readString(identity, "phone"),
    ].filter((value): value is string => Boolean(value));
    addDetail("Contact", contactParts.length > 0 ? contactParts.join(" / ") : undefined);
    addDetail("Companie", readString(identity, "company"));
    addDetail("ID extern", readString(payload, "externalId"));
    addDetail("Mesaj", truncateText(readString(payload, "message")));
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: sourceLabel ? `Canal: ${sourceLabel}` : "Lead nou inregistrat",
      details,
      tone: "success" as const,
    };
  }

  if (event.type === "lead_updated") {
    const sourceLabel = toSourceLabel(readString(payload, "mappedSourceType") ?? readString(payload, "sourceType"));
    const identity = toJsonObject(payload?.identity);
    const contactParts = [
      readString(identity, "name"),
      readString(identity, "email"),
      readString(identity, "phone"),
    ].filter((value): value is string => Boolean(value));
    addDetail("Contact", contactParts.length > 0 ? contactParts.join(" / ") : undefined);
    addDetail("Companie", readString(identity, "company"));
    addDetail("Mesaj", truncateText(readString(payload, "message")));
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: sourceLabel ? `Sursa update: ${sourceLabel}` : "Datele lead-ului au fost actualizate",
      details,
      tone: "info" as const,
    };
  }

  if (event.type === "assigned") {
    const ownerLabel = getUserLabel(userLabelById, readString(payload, "ownerUserId"));
    addDetail("Responsabil", ownerLabel);
    addDetail("Metoda", toAssignmentMethodLabel(readString(payload, "method")));
    addDetail("Etapa", stageLabel);
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: ownerLabel ? `Lead alocat catre ${ownerLabel}` : "Lead alocat",
      details,
      tone: "info" as const,
    };
  }

  if (event.type === "reassigned") {
    const previousOwnerLabel = getUserLabel(userLabelById, readString(payload, "previousOwnerUserId"));
    const nextOwnerLabel = getUserLabel(userLabelById, readString(payload, "ownerUserId"));
    const changed = readBoolean(payload, "changed");
    addDetail("De la", previousOwnerLabel);
    addDetail("Catre", nextOwnerLabel);
    addDetail("Metoda", toAssignmentMethodLabel(readString(payload, "method")));
    addDetail("Etapa", stageLabel);
    const elapsedPct = readNumber(payload, "elapsedPct");
    addDetail("Progres etapa", elapsedPct !== undefined ? `${Math.round(elapsedPct)}%` : undefined);
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle:
        changed === false
          ? "Ownerul a ramas neschimbat"
          : nextOwnerLabel
            ? `Nou responsabil: ${nextOwnerLabel}`
            : "Lead realocat",
      details,
      tone: "warning" as const,
    };
  }

  if (event.type === "reminder_sent") {
    const threshold = readNumber(payload, "thresholdPct");
    const elapsed = readNumber(payload, "elapsedPct");
    addDetail("Etapa", stageLabel);
    addDetail("Prag reminder", threshold !== undefined ? `${Math.round(threshold)}%` : undefined);
    addDetail("Progres curent", elapsed !== undefined ? `${Math.round(elapsed)}%` : undefined);
    addDetail("Responsabil", getUserLabel(userLabelById, readString(payload, "ownerUserId")));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Notificare de atentie pe SLA",
      details,
      tone: "warning" as const,
    };
  }

  if (event.type === "manager_alert") {
    const threshold = readNumber(payload, "thresholdPct");
    const elapsed = readNumber(payload, "elapsedPct");
    addDetail("Etapa", stageLabel);
    addDetail("Prag alerta", threshold !== undefined ? `${Math.round(threshold)}%` : undefined);
    addDetail("Progres curent", elapsed !== undefined ? `${Math.round(elapsed)}%` : undefined);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Escaladare catre management",
      details,
      tone: "danger" as const,
    };
  }

  if (event.type === "status_changed") {
    const fromStatus = toLeadStatusLabel(readString(payload, "fromStatus"));
    const toStatus = toLeadStatusLabel(readString(payload, "toStatus"));
    addDetail("Status", fromStatus && toStatus ? `${fromStatus} -> ${toStatus}` : undefined);
    addDetail("Nota", truncateText(readString(payload, "note"), 150));
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: fromStatus && toStatus ? `${fromStatus} -> ${toStatus}` : "Status actualizat",
      details,
      tone: "info" as const,
    };
  }

  if (event.type === "marked_spam") {
    const reasons = readStringArray(payload, "reasons");
    const mappedReasons = reasons.map((reason) => SPAM_REASON_LABEL[reason] ?? humanizeToken(reason));
    addDetail("Motive", mappedReasons.length > 0 ? mappedReasons.join(", ") : undefined);
    addDetail("Mesaj", truncateText(readString(payload, "message")));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Lead filtrat automat",
      details,
      tone: "danger" as const,
    };
  }

  if (event.type === "handover_requested") {
    const keywords = readStringArray(payload, "keywords");
    addDetail("Etapa", stageLabel);
    addDetail("Motiv", readString(payload, "reason"));
    addDetail("Cuvinte detectate", keywords.length > 0 ? keywords.join(", ") : undefined);
    addDetail("Mesaj client", truncateText(readString(payload, "message"), 140));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Clientul cere transfer catre operator",
      details,
      tone: "warning" as const,
    };
  }

  if (event.type === "agent_confirmed_handover") {
    const agentLabel = getUserLabel(userLabelById, readString(payload, "agentUserId"));
    addDetail("Agent", agentLabel);
    addDetail("Canal", readString(payload, "channel"));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: agentLabel ? `${agentLabel} a confirmat preluarea` : "Agent a confirmat preluarea",
      details,
      tone: "success" as const,
    };
  }

  if (event.type === "agent_declined_handover") {
    const agentLabel = getUserLabel(userLabelById, readString(payload, "agentUserId"));
    addDetail("Agent", agentLabel);
    addDetail("Canal", readString(payload, "channel"));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: agentLabel ? `${agentLabel} nu poate prelua acum` : "Agent nu poate prelua acum",
      details,
      tone: "danger" as const,
    };
  }

  if (event.type === "agent_outcome_reported") {
    const agentLabel = getUserLabel(userLabelById, readString(payload, "agentUserId"));
    const outcomeLabel = readString(payload, "outcomeLabel");
    addDetail("Agent", agentLabel);
    addDetail("Rezultat", outcomeLabel);
    addDetail("Canal", readString(payload, "channel"));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: outcomeLabel ? `Rezultat: ${outcomeLabel}` : "Agent a raportat rezultatul",
      details,
      tone: "info" as const,
    };
  }

  if (event.type === "whatsapp_inbound") {
    addDetail("Mesaj", truncateText(readString(payload, "text"), 140));
    addDetail("De la", readString(payload, "from"));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Mesaj primit pe WhatsApp",
      details,
      tone: "neutral" as const,
    };
  }

  if (event.type === "autopilot_message_received") {
    addDetail("Mesaj client", truncateText(readString(payload, "message"), 140));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Mesaj primit de fluxul automat",
      details,
      tone: "ai" as const,
    };
  }

  if (event.type === "autopilot_question_asked") {
    const index = readNumber(payload, "index");
    addDetail("Intrebare", index !== undefined ? `${index}/2` : undefined);
    addDetail("Text", truncateText(readString(payload, "text"), 140));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Autopilot continuă conversația",
      details,
      tone: "ai" as const,
    };
  }

  if (event.type === "autopilot_booking_offered") {
    addDetail("Mesaj", truncateText(readString(payload, "text"), 140));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Clientul a primit link-ul de programare",
      details,
      tone: "ai" as const,
    };
  }

  if (event.type === "message_sent") {
    addDetail("Mesaj", truncateText(readString(payload, "message"), 140));
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Contact trimis către lead",
      details,
      tone: "agent" as const,
    };
  }

  if (event.type === "reply_received") {
    addDetail("Mesaj", truncateText(readString(payload, "message"), 140));
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Lead-ul a răspuns",
      details,
      tone: "agent" as const,
    };
  }

  if (event.type === "meeting_created" || event.type === "call_logged" || event.type === "manual_proof_note") {
    addDetail("Nota", truncateText(readString(payload, "note"), 140));
    addDetail("Operator", actorLabel);
    return {
      title: toEventTypeLabel(event.type),
      subtitle: "Acțiune manuală înregistrată",
      details,
      tone: "agent" as const,
    };
  }

  if (
    event.type === "autopilot_started" ||
    event.type === "autopilot_ack" ||
    event.type === "escalation_reminder" ||
    event.type === "escalation_reassign" ||
    event.type === "escalation_manager_alert"
  ) {
    addDetail("Operator", actorLabel);
    const isEscalation = event.type.startsWith("escalation_");
    const isAutopilot = event.type.startsWith("autopilot_");
    return {
      title: toEventTypeLabel(event.type),
      subtitle: isEscalation ? "Escaladare automată" : "Eveniment automat Autopilot",
      details,
      tone: isEscalation ? ("warning" as const) : isAutopilot ? ("ai" as const) : ("neutral" as const),
    };
  }

  addDetail("Operator", actorLabel);
  return {
    title: toEventTypeLabel(event.type),
    subtitle: "Eveniment inregistrat in istoric",
    details,
    tone: "neutral" as const,
  };
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function computeStageOverageMinutes(params: {
  status: SLAStageInstanceStatus;
  dueAt: Date;
  breachedAt: Date | null;
  now: Date;
}) {
  if (params.status !== "BREACHED") return null;
  const referenceTime = params.breachedAt ?? params.now;
  const diffMs = referenceTime.getTime() - params.dueAt.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 60_000);
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewLeads) {
    redirect("/dashboard");
  }
  const { workspaceId, userId, membershipRole } = context;

  const { id: leadId } = await params;
  await detectEscalations({ workspaceId });
  await detectBreaches({ workspaceId });

  const lead = await getLeadDetailScoped(leadId, workspaceId, {
    userId,
    role: membershipRole,
  });
  if (!lead) {
    notFound();
  }

  const flowIds = [...new Set(lead.slaStageInstances.map((stage) => stage.flowId))];
  const definitions = flowIds.length
    ? await prisma.sLAStageDefinition.findMany({
        where: { flowId: { in: flowIds } },
        select: { flowId: true, key: true, name: true },
      })
    : [];
  const definitionMap = new Map(
    definitions.map((definition) => [`${definition.flowId}:${definition.key}`, definition.name])
  );

  const timelineUserIds = [
    ...new Set(
      lead.events.flatMap((event) =>
        [event.actorUserId, ...extractPayloadUserIds(event.payload)].filter(
          (value): value is string => Boolean(value)
        )
      )
    ),
  ];

  const relatedMembers =
    timelineUserIds.length > 0
      ? await prisma.membership.findMany({
          where: {
            workspaceId,
            userId: { in: timelineUserIds },
          },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })
      : [];

  const userLabelById = new Map(
    relatedMembers.map((membership) => [
      membership.user.id,
      membership.user.name?.trim() || membership.user.email,
    ])
  );

  if (lead.ownerUser?.id) {
    userLabelById.set(lead.ownerUser.id, lead.ownerUser.name?.trim() || lead.ownerUser.email);
  }

  const orderedStages = [...lead.slaStageInstances].sort((left, right) => {
    const leftOrder = getStageOrder(left.stageKey);
    const rightOrder = getStageOrder(right.stageKey);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.startedAt.getTime() - right.startedAt.getTime();
  });
  const now = new Date();
  const currentStageCandidate = [...lead.slaStageInstances]
    .filter((stage) => stage.status === "RUNNING" || stage.status === "BREACHED")
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0];
  const currentStageLabel = currentStageCandidate
    ? toStageLabel(definitionMap, {
        flowId: currentStageCandidate.flowId,
        stageKey: currentStageCandidate.stageKey,
      }) ?? currentStageCandidate.stageKey
    : "-";
  const currentOwnerLabel = lead.ownerUser?.name || lead.ownerUser?.email || "-";

  const displayName =
    [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
    lead.identity?.name ||
    lead.email ||
    lead.identity?.email ||
    lead.phone ||
    lead.identity?.phone ||
    lead.id;

  // Autopilot + SLA: query real AutopilotRun, EventLog, SLAState, scenarios, OutboundMessages
  const [autopilotRunRow, autopilotEventLogs, slaState, scenarios, outboundMessagesRaw] = await Promise.all([
    prisma.autopilotRun.findUnique({
      where: { leadId: lead.id },
      select: {
        id: true,
        status: true,
        currentStep: true,
        stateJson: true,
        scenarioId: true,
        scenario: {
          select: {
            id: true,
            name: true,
            mode: true,
            isDefault: true,
            handoverUserId: true,
            handoverUser: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.eventLog.findMany({
      where: { leadId: lead.id },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: {
        id: true,
        eventType: true,
        payload: true,
        occurredAt: true,
      },
    }),
    prisma.sLAState.findFirst({
      where: { leadId: lead.id },
      orderBy: { startedAt: "desc" },
      select: {
        startedAt: true,
        deadlineAt: true,
        stoppedAt: true,
        stopReason: true,
        breachedAt: true,
      },
    }),
    prisma.autopilotScenario.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, mode: true },
    }),
    prisma.outboundMessage.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        text: true,
        status: true,
        createdAt: true,
        providerMessageId: true,
        toPhone: true,
      },
    }),
  ]);

  const outboundMessages = outboundMessagesRaw.map((m) => ({
    id: m.id,
    text: m.text,
    status: m.status,
    createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
    providerMessageId: m.providerMessageId,
    toPhone: m.toPhone,
  }));

  const autopilotRun = autopilotRunRow
    ? {
        id: autopilotRunRow.id,
        status: autopilotRunRow.status,
        currentStep: autopilotRunRow.currentStep,
        stateJson: autopilotRunRow.stateJson,
        scenarioId: autopilotRunRow.scenarioId,
        scenarioMode: autopilotRunRow.scenario?.mode ?? null,
        scenario: autopilotRunRow.scenario
          ? {
              id: autopilotRunRow.scenario.id,
              name: autopilotRunRow.scenario.name,
              mode: autopilotRunRow.scenario.mode,
              isDefault: autopilotRunRow.scenario.isDefault,
            }
          : null,
      }
    : null;

  const eventLogTimeline = autopilotEventLogs
    .reverse()
    .map((e) => ({
      id: e.id,
      eventType: e.eventType,
      payload: e.payload,
      occurredAt: e.occurredAt?.toISOString() ?? new Date().toISOString(),
    }));

  // SLA status derivation
  const handoverUser = autopilotRunRow?.scenario?.handoverUser;
  const handoverLabel = handoverUser
    ? handoverUser.name?.trim() || handoverUser.email
    : null;

  // Derive SLA status from SLAState first, then fall back to legacy stage
  const slaStatusLabel = slaState
    ? slaState.breachedAt
      ? "Depasit"
      : slaState.stoppedAt
        ? "Oprit"
        : "In derulare"
    : currentStageCandidate
      ? currentStageCandidate.status === "BREACHED"
        ? "Depasit"
        : currentStageCandidate.status === "STOPPED"
          ? "Oprit"
          : "In derulare"
      : "-";

  const slaStatusBadge = slaState
    ? slaState.breachedAt
      ? "bg-rose-100 text-rose-700"
      : slaState.stoppedAt
        ? "bg-slate-100 text-slate-600"
        : "bg-emerald-100 text-emerald-700"
    : currentStageCandidate
      ? currentStageCandidate.status === "BREACHED"
        ? "bg-rose-100 text-rose-700"
        : currentStageCandidate.status === "STOPPED"
          ? "bg-slate-100 text-slate-600"
          : "bg-emerald-100 text-emerald-700"
    : "bg-slate-100 text-slate-600";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Detalii lead</h1>
          <p className="text-sm text-slate-600">Vizualizare SLA, timeline si actiuni rapide.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditLeadButton
            leadId={lead.id}
            lead={{
              firstName: lead.firstName ?? lead.identity?.name?.split(" ")[0] ?? null,
              lastName: lead.lastName ?? (lead.identity?.name?.split(" ").slice(1).join(" ") || null),
              email: lead.email ?? lead.identity?.email ?? null,
              phone: lead.phone ?? lead.identity?.phone ?? null,
            }}
            variant="outline"
            size="default"
          />
          <Button variant="outline" size="sm" asChild>
            <Link href="/leads">← Leaduri</Link>
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{displayName}</CardTitle>
          <CardDescription className="text-slate-600">
            Header lead: identitate, owner si status curent.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          <p>Email: {lead.email ?? lead.identity?.email ?? "-"}</p>
          <p>Telefon: {lead.phone ?? lead.identity?.phone ?? "-"}</p>
          <p>Companie: {lead.identity?.company || "-"}</p>
          <p>Owner: {lead.ownerUser?.name || lead.ownerUser?.email || "-"}</p>
          <p>Status: {STATUS_LABEL[lead.status]}</p>
          <p>Sursa: {toSourceLabel(lead.sourceType) || lead.sourceType}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Actiuni</CardTitle>
          <CardDescription className="text-slate-600">
            Proof events simulate + schimbari de status fara impact direct pe SLA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadActions leadId={lead.id} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Autopilot</CardTitle>
          <CardDescription className="text-slate-600">
            Stare autopilot si simulare mesaje pentru tranzitia dintre pasi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AutopilotSection
            leadId={lead.id}
            autopilotRun={autopilotRun}
            eventLogTimeline={eventLogTimeline}
            outboundMessages={outboundMessages}
            scenarios={scenarios}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">SLA</CardTitle>
            <CardDescription className="text-slate-600">
              Starea SLA pentru acest lead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Summary badges */}
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Responsabil</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{handoverLabel ?? currentOwnerLabel}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status SLA</p>
                <p className="mt-1 flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${slaStatusBadge}`}>
                    {slaStatusLabel}
                  </span>
                </p>
              </div>
            </div>

            {/* SLAState details */}
            {slaState ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                    <p className="font-medium uppercase tracking-wide text-slate-500">Pornit la</p>
                    <p className="mt-1 text-sm text-slate-800">{formatDateTime(slaState.startedAt)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                    <p className="font-medium uppercase tracking-wide text-slate-500">Termen limita</p>
                    <p className="mt-1 text-sm text-slate-800">{formatDateTime(slaState.deadlineAt)}</p>
                  </div>
                  {slaState.stoppedAt ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <p className="font-medium uppercase tracking-wide text-slate-500">Oprit la</p>
                      <p className="mt-1 text-sm text-slate-800">{formatDateTime(slaState.stoppedAt)}</p>
                      {slaState.stopReason ? (
                        <p className="mt-1 text-xs text-slate-500">Motiv: {slaState.stopReason}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {slaState.breachedAt ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2">
                      <p className="font-medium uppercase tracking-wide text-rose-600">Depasit la</p>
                      <p className="mt-1 text-sm text-rose-800">{formatDateTime(slaState.breachedAt)}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : orderedStages.length === 0 ? (
              <p className="text-sm text-slate-600">Nu exista SLA pentru acest lead.</p>
            ) : null}

            {/* Legacy SLA stage instances (if any) */}
            {orderedStages.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Etape SLA (flow)</p>
                <ul className="space-y-2">
                  {orderedStages.map((stage) => {
                    const stageName =
                      toStageLabel(definitionMap, {
                        flowId: stage.flowId,
                        stageKey: stage.stageKey,
                      }) ?? stage.stageKey;
                    const stopReasonLabel = toStopReasonLabel(
                      stage.stopReason,
                      definitionMap,
                      stage.flowId
                    );
                    const overageMinutes = computeStageOverageMinutes({
                      status: stage.status,
                      dueAt: stage.dueAt,
                      breachedAt: stage.breachedAt,
                      now,
                    });
                    return (
                      <li
                        key={stage.id}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{stageName}</p>
                            <p className="text-xs text-slate-500">Etapa SLA</p>
                          </div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${stageStatusBadge(stage.status)}`}>
                            {STAGE_STATUS_LABEL[stage.status]}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="font-medium uppercase tracking-wide text-slate-500">Inceput</p>
                            <p className="mt-1 text-sm text-slate-800">{formatDateTime(stage.startedAt)}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="font-medium uppercase tracking-wide text-slate-500">Termen limita</p>
                            <p className="mt-1 text-sm text-slate-800">{formatDateTime(stage.dueAt)}</p>
                          </div>
                          {stage.stoppedAt ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                              <p className="font-medium uppercase tracking-wide text-slate-500">Inchisa la</p>
                              <p className="mt-1 text-sm text-slate-800">{formatDateTime(stage.stoppedAt)}</p>
                            </div>
                          ) : null}
                          {stage.breachedAt ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                              <p className="font-medium uppercase tracking-wide text-slate-500">Depasita la</p>
                              <p className="mt-1 text-sm text-slate-800">{formatDateTime(stage.breachedAt)}</p>
                            </div>
                          ) : null}
                        </div>
                        {(overageMinutes !== null || stopReasonLabel) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {overageMinutes !== null ? (
                              <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                Depasire: +{overageMinutes} min
                              </span>
                            ) : null}
                            {stopReasonLabel ? (
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                                Motiv inchidere: {stopReasonLabel}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Istoric lead</CardTitle>
            <CardDescription className="text-slate-600">
              Evenimente importante in ordine cronologica, fara cod tehnic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lead.events.length === 0 ? (
              <p className="text-sm text-slate-600">Nu exista evenimente pentru acest lead.</p>
            ) : (
              <TimelineCards
                items={lead.events.map((event) => {
                  const timeline = createTimelinePresentation({
                    event,
                    definitionMap,
                    userLabelById,
                  });
                  const summary = buildTimelineSummary(timeline);
                  const toneClasses = getTimelineToneClasses(timeline.tone);
                  return {
                    id: event.id,
                    createdAtLabel: formatDateTime(event.createdAt),
                    title: timeline.title,
                    subtitle: timeline.subtitle,
                    details: timeline.details,
                    summary,
                    toneClasses,
                    payloadForJson: {
                      id: event.id,
                      type: event.type,
                      actorUserId: event.actorUserId,
                      payload: event.payload,
                    },
                  };
                })}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
