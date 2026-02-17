import {
  AutopilotRunStatus,
  LeadEvent,
  OutboundChannel,
  OutboundMessageStatus,
  Prisma,
  SLAStageDefinition,
} from "@prisma/client";
import { prisma } from "../db";
import { getOrderedStageDefinitions, startStage } from "./slaService";
import { getDefaultScenario } from "./autopilot/getDefaultScenario";

type TxOrClient = Prisma.TransactionClient | typeof prisma;

const AUTOPILOT_TIMELINE_TYPES = [
  "autopilot_started",
  "autopilot_ack",
  "autopilot_message_received",
  "autopilot_question_asked",
  "autopilot_booking_offered",
  "handover_requested",
] as const;

const HANDOVER_KEYWORDS = ["om", "operator", "nu inteleg", "reclamatie"] as const;

const AUTOPILOT_QUESTIONS = [
  "Care este obiectivul principal pentru acest lead?",
  "Cand doresti o discutie de 15 minute?",
] as const;

const AUTOPILOT_BOOKING_LINK_BASE = "https://pinggo.local/booking/demo";

const AUTOPILOT_WELCOME_TEXT =
  "Salut! Sunt asistentul virtual Pinggo. Am primit solicitarea ta si revenim imediat cu urmatorii pasi.";

export type AutopilotState =
  | "IDLE"
  | "ACK_SENT"
  | "QUESTION_1_SENT"
  | "QUESTION_2_SENT"
  | "BOOKING_OFFERED"
  | "HANDOVER_REQUESTED";

export type AutopilotSnapshot = {
  state: AutopilotState;
  questionsAsked: number;
  bookingOffered: boolean;
  handoverRequested: boolean;
  started: boolean;
  ackSent: boolean;
};

export type AutopilotTimelineItem = {
  id: string;
  type: string;
  createdAt: Date;
  payload: Prisma.JsonValue | null;
};

function toLower(value: string) {
  return value.trim().toLowerCase();
}

function containsKeyword(message: string, keyword: string) {
  if (keyword === "om") {
    return /\bom\b/.test(message);
  }
  return message.includes(keyword);
}

function extractMatchedKeywords(message: string) {
  const normalized = toLower(message);
  return HANDOVER_KEYWORDS.filter((keyword) => containsKeyword(normalized, keyword));
}

function getRandomAckDelaySeconds() {
  return 10 + Math.floor(Math.random() * 11);
}

function isAutopilotTimelineEvent(type: string) {
  return (
    AUTOPILOT_TIMELINE_TYPES.includes(type as (typeof AUTOPILOT_TIMELINE_TYPES)[number]) ||
    type === "handover_requested"
  );
}

async function resolveFlowIdForLead(tx: TxOrClient, workspaceId: string, leadId: string) {
  const latestStage = await tx.sLAStageInstance.findFirst({
    where: { leadId, workspaceId },
    select: { flowId: true },
    orderBy: { startedAt: "desc" },
  });
  if (latestStage?.flowId) return latestStage.flowId;

  const settings = await tx.workspaceSettings.findUnique({
    where: { workspaceId },
    select: { defaultFlowId: true },
  });
  if (settings?.defaultFlowId) return settings.defaultFlowId;

  const activeFlow = await tx.flow.findFirst({
    where: { workspaceId, isActive: true },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (activeFlow?.id) return activeFlow.id;

  const firstFlow = await tx.flow.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return firstFlow?.id ?? null;
}

function pickHandoverStageKey(definitions: SLAStageDefinition[]) {
  const hasHandover = definitions.find((definition) => definition.key === "handover");
  if (hasHandover) return hasHandover.key;

  const ordered = getOrderedStageDefinitions(definitions);
  return ordered[1]?.key ?? null;
}

async function startHandoverStageIfNeeded(params: {
  tx: TxOrClient;
  workspaceId: string;
  leadId: string;
}) {
  const flowId = await resolveFlowIdForLead(params.tx, params.workspaceId, params.leadId);
  if (!flowId) return null;

  const definitions = await params.tx.sLAStageDefinition.findMany({
    where: { flowId },
  });
  if (definitions.length === 0) return null;

  const handoverStageKey = pickHandoverStageKey(definitions);
  if (!handoverStageKey) return null;

  const running = await params.tx.sLAStageInstance.findFirst({
    where: {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      flowId,
      stageKey: handoverStageKey,
      status: "RUNNING",
    },
    select: { id: true },
  });

  if (running) {
    return { started: false, flowId, stageKey: handoverStageKey };
  }

  await startStage(params.leadId, flowId, handoverStageKey, { tx: params.tx });
  return { started: true, flowId, stageKey: handoverStageKey };
}

async function listAutopilotEvents(
  tx: TxOrClient,
  workspaceId: string,
  leadId: string
) {
  return tx.leadEvent.findMany({
    where: {
      workspaceId,
      leadId,
      type: { in: [...AUTOPILOT_TIMELINE_TYPES] },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listAutopilotTimeline(
  tx: TxOrClient,
  workspaceId: string,
  leadId: string
): Promise<AutopilotTimelineItem[]> {
  const events = await tx.leadEvent.findMany({
    where: { workspaceId, leadId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      createdAt: true,
      payload: true,
    },
  });

  return events.filter((event) => isAutopilotTimelineEvent(event.type));
}

export function deriveAutopilotSnapshot(events: Array<Pick<LeadEvent, "type">>): AutopilotSnapshot {
  const started = events.some((event) => event.type === "autopilot_started");
  const ackSent = events.some((event) => event.type === "autopilot_ack");
  const questionsAsked = events.filter((event) => event.type === "autopilot_question_asked").length;
  const bookingOffered = events.some((event) => event.type === "autopilot_booking_offered");
  const handoverRequested = events.some((event) => event.type === "handover_requested");

  let state: AutopilotState = "IDLE";
  if (handoverRequested) {
    state = "HANDOVER_REQUESTED";
  } else if (bookingOffered) {
    state = "BOOKING_OFFERED";
  } else if (questionsAsked >= 2) {
    state = "QUESTION_2_SENT";
  } else if (questionsAsked === 1) {
    state = "QUESTION_1_SENT";
  } else if (ackSent || started) {
    state = "ACK_SENT";
  }

  return {
    state,
    questionsAsked,
    bookingOffered,
    handoverRequested,
    started,
    ackSent,
  };
}

export async function getAutopilotSnapshotForLead(
  tx: TxOrClient,
  workspaceId: string,
  leadId: string
) {
  const events = await listAutopilotEvents(tx, workspaceId, leadId);
  const timeline = await listAutopilotTimeline(tx, workspaceId, leadId);
  return {
    snapshot: deriveAutopilotSnapshot(events),
    timeline,
  };
}

export async function startAutopilot(params: {
  workspaceId: string;
  leadId: string;
}) {
  return prisma.$transaction(async (trx) => {
    const lead = await trx.lead.findFirst({
      where: { id: params.leadId, workspaceId: params.workspaceId },
      select: { id: true, phone: true },
    });
    if (!lead) {
      throw new Error("LEAD_NOT_FOUND");
    }

    // Create AutopilotRun if it doesn't exist (needed for new UI which uses AutopilotRun + EventLog)
    let run = await trx.autopilotRun.findUnique({
      where: { leadId: lead.id },
      select: { id: true, status: true },
    });

    if (!run) {
      const scenario = await getDefaultScenario(trx, params.workspaceId);
      const identity = await trx.leadIdentity.findUnique({
        where: { leadId: lead.id },
        select: { phone: true },
      });
      const toPhone = (lead.phone ?? identity?.phone ?? "").trim() || null;

      run = await trx.autopilotRun.create({
        data: {
          leadId: lead.id,
          workspaceId: params.workspaceId,
          scenarioId: scenario.id,
          status: AutopilotRunStatus.ACTIVE,
          currentStep: "welcome",
          stateJson: { node: "q1", answers: {}, questionIndex: 0 },
          lastOutboundAt: new Date(),
        },
        select: { id: true, status: true },
      });

      if (toPhone) {
        const outbound = await trx.outboundMessage.create({
          data: {
            leadId: lead.id,
            workspaceId: params.workspaceId,
            channel: OutboundChannel.WHATSAPP,
            toPhone,
            text: AUTOPILOT_WELCOME_TEXT,
            status: OutboundMessageStatus.QUEUED,
          },
          select: { id: true },
        });

        await trx.eventLog.createMany({
          data: [
            {
              leadId: lead.id,
              eventType: "autopilot_started",
              payload: {
                runId: run.id,
                scenarioId: scenario.id,
                mode: scenario.mode,
              } as Prisma.InputJsonValue,
            },
            {
              leadId: lead.id,
              eventType: "message_queued",
              payload: {
                channel: "whatsapp",
                messageId: outbound.id,
                scenarioId: scenario.id,
              } as Prisma.InputJsonValue,
            },
          ],
        });
      } else {
        const observedPhone = (lead.phone ?? identity?.phone ?? "").trim() || null;
        await trx.eventLog.createMany({
          data: [
            {
              leadId: lead.id,
              eventType: "autopilot_started",
              payload: {
                runId: run.id,
                scenarioId: scenario.id,
                mode: scenario.mode,
              } as Prisma.InputJsonValue,
            },
            {
              leadId: lead.id,
              eventType: "message_blocked",
              payload: {
                reason: "missing_phone",
                channel: "whatsapp",
                scenarioId: scenario.id,
                nodeAfter: "welcome",
                observedPhone: observedPhone ?? null,
                observedTrimmedPhone: observedPhone,
              } as Prisma.InputJsonValue,
            },
          ],
        });
      }
    }

    return {
      runId: run.id,
      leadId: lead.id,
      status: run.status,
      ...getAutopilotSnapshotForLead(trx, params.workspaceId, lead.id),
    };
  });
}

export async function processAutopilotEvent(params: {
  workspaceId: string;
  leadId: string;
  message: string;
}) {
  const trimmedMessage = params.message.trim();

  return prisma.$transaction(async (trx) => {
    const lead = await trx.lead.findFirst({
      where: { id: params.leadId, workspaceId: params.workspaceId },
      select: {
        id: true,
        ownerUserId: true,
      },
    });
    if (!lead) {
      throw new Error("LEAD_NOT_FOUND");
    }

    await trx.leadEvent.create({
      data: {
        leadId: lead.id,
        workspaceId: params.workspaceId,
        type: "autopilot_message_received",
        payload: {
          message: trimmedMessage,
        } as Prisma.InputJsonValue,
      },
    });

    let autopilotEvents = await listAutopilotEvents(trx, params.workspaceId, lead.id);
    const hasStarted = autopilotEvents.some((event) => event.type === "autopilot_started");
    const hasAck = autopilotEvents.some((event) => event.type === "autopilot_ack");

    if (!hasStarted) {
      const scenario = await getDefaultScenario(trx, params.workspaceId);
      await trx.leadEvent.create({
        data: {
          leadId: lead.id,
          workspaceId: params.workspaceId,
          type: "autopilot_started",
          payload: {
            mode: scenario.mode,
            scenarioId: scenario.id,
          } as Prisma.InputJsonValue,
        },
      });
    }

    if (!hasAck) {
      await trx.leadEvent.create({
        data: {
          leadId: lead.id,
          workspaceId: params.workspaceId,
          type: "autopilot_ack",
          payload: {
            ackDelaySeconds: getRandomAckDelaySeconds(),
            text: "Am primit mesajul. Revin imediat cu cateva intrebari.",
          } as Prisma.InputJsonValue,
        },
      });
    }

    if (!hasStarted || !hasAck) {
      autopilotEvents = await listAutopilotEvents(trx, params.workspaceId, lead.id);
    }

    const matchedKeywords = extractMatchedKeywords(trimmedMessage);
    const handoverAlreadyRequested = autopilotEvents.some(
      (event) => event.type === "handover_requested"
    );

    if (matchedKeywords.length > 0 && !handoverAlreadyRequested) {
      const stageStart = await startHandoverStageIfNeeded({
        tx: trx,
        workspaceId: params.workspaceId,
        leadId: lead.id,
      });

      await trx.leadEvent.create({
        data: {
          leadId: lead.id,
          workspaceId: params.workspaceId,
          type: "handover_requested",
          payload: {
            reason: "keyword_detected",
            keywords: matchedKeywords,
            message: trimmedMessage,
            startedStage2: Boolean(stageStart?.started),
            stageKey: stageStart?.stageKey ?? "handover",
          } as Prisma.InputJsonValue,
        },
      });

      if (lead.ownerUserId) {
        await trx.notification.create({
          data: {
            workspaceId: params.workspaceId,
            userId: lead.ownerUserId,
            type: "HANDOVER_REQUESTED",
            title: "Autopilot cere handover",
            body: `Lead ${lead.id} a cerut transfer catre operator.`,
          },
        });
      }

      return getAutopilotSnapshotForLead(trx, params.workspaceId, lead.id);
    }

    const questionEvents = autopilotEvents.filter(
      (event) => event.type === "autopilot_question_asked"
    );
    const bookingOffered = autopilotEvents.some(
      (event) => event.type === "autopilot_booking_offered"
    );

    if (questionEvents.length < 2) {
      const nextIndex = questionEvents.length + 1;
      await trx.leadEvent.create({
        data: {
          leadId: lead.id,
          workspaceId: params.workspaceId,
          type: "autopilot_question_asked",
          payload: {
            index: nextIndex,
            text: AUTOPILOT_QUESTIONS[nextIndex - 1] ?? AUTOPILOT_QUESTIONS[1],
          } as Prisma.InputJsonValue,
        },
      });
      return getAutopilotSnapshotForLead(trx, params.workspaceId, lead.id);
    }

    if (!bookingOffered) {
      await trx.leadEvent.create({
        data: {
          leadId: lead.id,
          workspaceId: params.workspaceId,
          type: "autopilot_booking_offered",
          payload: {
            bookingLink: `${AUTOPILOT_BOOKING_LINK_BASE}?leadId=${lead.id}`,
            text: "Iata linkul de programare pentru urmatorul pas.",
          } as Prisma.InputJsonValue,
        },
      });
    }

    return getAutopilotSnapshotForLead(trx, params.workspaceId, lead.id);
  });
}

export function filterAutopilotTimelineFromLeadEvents(
  events: Array<{
    id: string;
    type: string;
    createdAt: Date;
    payload: Prisma.JsonValue | null;
  }>
) {
  return events.filter((event) => isAutopilotTimelineEvent(event.type));
}
