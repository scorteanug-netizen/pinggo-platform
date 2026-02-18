/**
 * Core autopilot reply logic - shared by POST /api/v1/autopilot/reply and inbound webhook.
 * Processes an inbound message and advances the autopilot state.
 *
 * Split into three phases to avoid transaction timeout (no network/OpenAI inside tx):
 * - Phase A (tx): read run/lead/scenario, create inbound EventLog.
 * - Phase B (no tx): resolve transition (AI or RULES) — may call OpenAI.
 * - Phase C (tx): persist transition, create outbound/events.
 */
import {
  AutopilotRunStatus,
  AutopilotScenarioMode,
  AutopilotScenarioType,
  OutboundChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";
import { createCalendarEvent, getWorkspaceGoogleCalendarIntegration } from "@/server/services/googleCalendarService";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { getDefaultScenario } from "./getDefaultScenario";
import { aiPlanner } from "./aiPlanner";
import { buildScenarioPrompt, promptPreview } from "./promptBuilder";

type TxClient = Prisma.TransactionClient;

type AutopilotStateJson = {
  node: string;
  answers: Record<string, string>;
  questionIndex: number;
};

const DEFAULT_STATE: AutopilotStateJson = { node: "q1", answers: {}, questionIndex: 0 };

type TransitionResult = {
  nextNode: string;
  outboundText: string;
  answersUpdate: Record<string, string>;
  terminal: boolean;
  newQuestionIndex: number;
  aiMeta?: { model: string; latencyMs: number; jsonValid: boolean };
  fallbackUsed?: boolean;
};

/** Deterministic intent from keywords. Never use numeric menu (1/2/3). */
function detectIntentFromKeywords(replyText: string): string {
  const lower = replyText.toLowerCase().trim();
  if (lower.includes("pret") || lower.includes("preț") || lower.includes("cost") || lower.includes("price") || lower.includes("tarif")) {
    return "pricing";
  }
  if (lower.includes("programare") || lower.includes("program") || lower.includes("booking") || lower.includes("calendar") || lower.includes("intalnire") || lower.includes("întâlnire")) {
    return "booking";
  }
  if (lower.includes("contact") || lower.includes("agent") || lower.includes("vorbesc") || lower.includes("operator")) {
    return "contact";
  }
  return "other";
}

/** True if message looks like only name, email, or phone (filling a slot), not an intent. */
function isLikelyFillingSlot(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("@") && t.length <= 80) return true;
  if (/^[\d+\s\-()]{7,}$/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && words.every((w) => /^[A-Za-z\u0080-\u024F]+$/.test(w)) && t.length <= 40) return true;
  return false;
}

/** Greetings: do not treat as intent; next slot stays "intent" so next reply fills it. */
function isGreeting(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return /^(salut|buna|bună|hi|hello|hey|ciao|servus)$/.test(lower) || lower.startsWith("buna ") || lower.startsWith("bună ");
}

const COLLECTED_KEYS = ["intent", "name", "phone", "email", "service", "preferredTime"] as const;
function getNextMissingSlot(answers: Record<string, string>): (typeof COLLECTED_KEYS)[number] | null {
  for (const key of COLLECTED_KEYS) {
    if (!answers[key]?.trim()) return key;
  }
  return null;
}

function parseStateJson(raw: Prisma.JsonValue | null | undefined): AutopilotStateJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_STATE };
  const obj = raw as Record<string, unknown>;
  const node = typeof obj.node === "string" ? obj.node : DEFAULT_STATE.node;
  const answers =
    obj.answers && typeof obj.answers === "object" && !Array.isArray(obj.answers)
      ? (obj.answers as Record<string, string>)
      : {};
  const questionIndex = typeof obj.questionIndex === "number" ? obj.questionIndex : 0;
  return { node, answers, questionIndex };
}

type RulesScenarioContext = { companyName?: string | null; calendarLinkRaw?: string | null };

function resolveRulesTransition(
  stateBefore: AutopilotStateJson,
  text: string,
  maxQuestions: number,
  firstName: string | null,
  scenarioContext?: RulesScenarioContext
): TransitionResult {
  const nodeBefore = stateBefore.node;
  const currentQIndex = stateBefore.questionIndex;
  const answers = stateBefore.answers;
  const company = scenarioContext?.companyName?.trim() || "echipa noastra";

  if (nodeBefore === "handover") {
    return {
      nextNode: "handover",
      outboundText: "Un agent te va contacta in curand.",
      answersUpdate: {},
      terminal: false,
      newQuestionIndex: currentQIndex,
    };
  }

  const newQIndex = currentQIndex + 1;
  const answersUpdate: Record<string, string> = {};

  if (currentQIndex === 0) {
    if (isGreeting(text)) {
      // leave intent unset so next turn we collect intent (e.g. "Vreau programare")
    } else if (!isLikelyFillingSlot(text)) {
      answersUpdate.intent = detectIntentFromKeywords(text);
    } else {
      answersUpdate.name = text.trim();
      answersUpdate.intent = answers.intent || "other";
    }
    if (!isGreeting(text) && !answersUpdate.intent && !answers.intent) answersUpdate.intent = "other";
    if (newQIndex >= maxQuestions) {
      return {
        nextNode: "handover",
        outboundText: "Multumesc! Te conectez cu un coleg.",
        answersUpdate,
        terminal: true,
        newQuestionIndex: newQIndex,
      };
    }
    return {
      nextNode: "qualify",
      outboundText: "Salut! Cu ce te pot ajuta azi?",
      answersUpdate,
      terminal: false,
      newQuestionIndex: newQIndex,
    };
  }

  const slotWeJustFilled = getNextMissingSlot(answers) || "intent";
  if (slotWeJustFilled === "intent") {
    if (!answers.intent && !isLikelyFillingSlot(text)) answersUpdate.intent = detectIntentFromKeywords(text);
    else if (isLikelyFillingSlot(text)) answersUpdate.name = text.trim();
    if (!answersUpdate.intent && !answers.intent) answersUpdate.intent = "other";
  } else if (slotWeJustFilled === "name") {
    answersUpdate.name = text.trim();
  } else if (slotWeJustFilled === "phone") {
    answersUpdate.phone = text.trim();
  } else if (slotWeJustFilled === "email") {
    answersUpdate.email = text.trim();
  } else if (slotWeJustFilled === "service") {
    answersUpdate.service = text.trim();
  } else if (slotWeJustFilled === "preferredTime") {
    answersUpdate.preferredTime = text.trim();
  }

  const merged = { ...answers, ...answersUpdate };
  if (newQIndex >= maxQuestions) {
    return {
      nextNode: "handover",
      outboundText: scenarioContext?.calendarLinkRaw?.trim()
        ? "Multumesc! Iata link-ul pentru programare. Te asteptam."
        : "Multumesc! Te conectez cu un coleg.",
      answersUpdate,
      terminal: true,
      newQuestionIndex: newQIndex,
    };
  }

  const nextSlot = getNextMissingSlot(merged);
  let outboundText: string;
  const greeting = (merged.name || firstName) ? `${merged.name || firstName}, ` : "";
  if (nextSlot === "intent" || !nextSlot) {
    outboundText = "Cu ce te pot ajuta azi?";
  } else if (nextSlot === "name") {
    outboundText = `${greeting}Cum te numesti?`;
  } else if (nextSlot === "phone") {
    outboundText = `${greeting}Ce numar de telefon ai?`;
  } else if (nextSlot === "email") {
    outboundText = `${greeting}Ce adresa de email?`;
  } else if (nextSlot === "service") {
    const intent = merged.intent || "other";
    outboundText = intent === "pricing"
      ? `${greeting}Pentru ce serviciu vrei informatii de pret?`
      : intent === "booking"
        ? `${greeting}Pentru ce serviciu vrei programarea?`
        : `${greeting}Spune-mi pe scurt ce ai nevoie.`;
  } else if (nextSlot === "preferredTime") {
    outboundText = `${greeting}Ce zi sau interval preferi?`;
  } else {
    outboundText = "Mai ai ceva de adaugat?";
  }

  return {
    nextNode: "qualify",
    outboundText: outboundText.trim(),
    answersUpdate,
    terminal: false,
    newQuestionIndex: newQIndex,
  };
}

type AiTransitionArgs = {
  stateBefore: AutopilotStateJson;
  text: string;
  maxQuestions: number;
  firstName: string | null;
  aiPrompt: string;
  scenarioContext?: {
    agentName?: string | null;
    companyName?: string | null;
    companyDescription?: string | null;
    offerSummary?: string | null;
    calendarLinkRaw?: string | null;
  };
  leadContext?: {
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    externalId?: string | null;
  };
  recentEvents?: Array<{ eventType: string; text?: string; at?: string }>;
  recentOutboundTexts?: string[];
  requiredSlots?: string[];
};

async function resolveAiTransition(args: AiTransitionArgs): Promise<TransitionResult> {
  const { stateBefore, text, maxQuestions, firstName, aiPrompt } = args;
  const currentQIndex = stateBefore.questionIndex;

  if (stateBefore.node === "handover") {
    return {
      nextNode: "handover",
      outboundText: "Un agent te va contacta in curand.",
      answersUpdate: {},
      terminal: false,
      newQuestionIndex: currentQIndex,
    };
  }

  const result = await aiPlanner({
    aiPrompt,
    maxQuestions,
    questionIndex: currentQIndex,
    replyText: text,
    firstName,
    currentAnswers: stateBefore.answers,
    scenarioContext: args.scenarioContext,
    leadContext: args.leadContext,
    recentEvents: args.recentEvents,
    recentOutboundTexts: args.recentOutboundTexts,
    requiredSlots: args.requiredSlots,
  });

  const newQIndex = currentQIndex + 1;
  const nextNode = result.shouldHandover ? "handover" : `ai_q${newQIndex + 1}`;

  return {
    nextNode,
    outboundText: result.nextMessage,
    answersUpdate: {
      ...result.answersUpdate,
      ...(result.intent && !stateBefore.answers.intent ? { intent: result.intent } : {}),
    },
    terminal: result.shouldHandover,
    newQuestionIndex: newQIndex,
    aiMeta: result.aiMeta,
    fallbackUsed: result.fallbackUsed,
  };
}

export type ProcessReplyResult = {
  leadId: string;
  autopilot: { status: string; node: string; answers: Record<string, string> };
  queuedMessage: { id: string; text: string; toPhone: string } | null;
  messageBlocked?: boolean;
  /** Set when status is HANDED_OVER, for agent notification */
  handoverUserId?: string | null;
  scenarioId?: string | null;
  /** Last inbound text, for handover summary */
  lastInboundText?: string;
};

/** Payload from Phase A (DB-only) for Phase B (AI/RULES) and Phase C (persist). */
type PhaseAPayload = {
  leadId: string;
  text: string;
  run: { id: string; status: string; stateJson: unknown; workspaceId: string; scenarioId: string | null };
  lead: { firstName: string | null; phone: string | null; email: string | null; source: string | null; externalId: string | null; identity: { phone: string | null } | null } | null;
  scenario: {
    id: string;
    maxQuestions: number;
    mode: string;
    scenarioType?: string;
    handoverUserId: string | null;
    aiPrompt: string;
    agentName: string | null;
    companyName: string | null;
    companyDescription: string | null;
    offerSummary: string | null;
    calendarLinkRaw: string | null;
    qualificationCriteria: unknown;
  };
  scenarioId: string;
  stateBefore: AutopilotStateJson;
  nodeBefore: string;
  now: Date;
  recentEvents?: Array<{ eventType: string; text?: string; at?: string }>;
  recentOutboundTexts?: string[];
};

/** Phase A: DB-only. Read run/lead/scenario, create inbound EventLog. No network. */
async function phaseA(tx: TxClient, leadId: string, text: string): Promise<PhaseAPayload | null> {
  const run = await tx.autopilotRun.findUnique({
    where: { leadId },
    select: { id: true, status: true, stateJson: true, workspaceId: true, scenarioId: true },
  });
  if (!run) return null;

  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      firstName: true,
      phone: true,
      email: true,
      source: true,
      externalId: true,
      workspaceId: true,
      identity: { select: { phone: true } },
    },
  });

  let scenarioId = run.scenarioId;
  if (!scenarioId) {
    const defaultScenario = await getDefaultScenario(tx, run.workspaceId);
    scenarioId = defaultScenario.id;
  }

  let scenario = await tx.autopilotScenario.findUnique({
    where: { id: scenarioId },
    select: {
      id: true,
      maxQuestions: true,
      mode: true,
      scenarioType: true,
      handoverUserId: true,
      aiPrompt: true,
      agentName: true,
      companyName: true,
      companyDescription: true,
      offerSummary: true,
      calendarLinkRaw: true,
      qualificationCriteria: true,
    },
  });
  if (!scenario) {
    const defaultScenario = await getDefaultScenario(tx, run.workspaceId);
    scenario = await tx.autopilotScenario.findUnique({
      where: { id: defaultScenario.id },
      select: {
        id: true,
        maxQuestions: true,
        mode: true,
        scenarioType: true,
        handoverUserId: true,
        aiPrompt: true,
        agentName: true,
        companyName: true,
        companyDescription: true,
        offerSummary: true,
        calendarLinkRaw: true,
        qualificationCriteria: true,
      },
    });
  }
  if (!scenario) return null;

  const stateBefore = parseStateJson(run.stateJson);
  const nodeBefore = stateBefore.node;
  const now = new Date();

  let recentEvents: PhaseAPayload["recentEvents"];
  let recentOutboundTexts: string[] | undefined;
  if (scenario.mode === AutopilotScenarioMode.AI) {
    const [recentEventsRaw, recentOutboundRaw] = await Promise.all([
      tx.eventLog.findMany({
        where: { leadId },
        orderBy: { occurredAt: "desc" },
        take: 10,
        select: { eventType: true, payload: true, occurredAt: true },
      }),
      tx.outboundMessage.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { text: true },
      }),
    ]);
    recentEvents = recentEventsRaw.reverse().map((e) => {
      const p = e.payload as Record<string, unknown> | null;
      return { eventType: e.eventType, text: (p?.text as string) ?? undefined, at: e.occurredAt?.toISOString() };
    });
    recentOutboundTexts = recentOutboundRaw.reverse().map((m) => m.text).filter((t): t is string => t !== null);
  }

  await tx.eventLog.create({
    data: {
      leadId,
      eventType: "autopilot_inbound",
      payload: { text, nodeBefore, scenarioId, mode: scenario.mode } as unknown as Prisma.InputJsonValue,
      occurredAt: now,
    },
  });

  return {
    leadId,
    text,
    run,
    lead,
    scenario,
    scenarioId,
    stateBefore,
    nodeBefore,
    now,
    recentEvents,
    recentOutboundTexts,
  };
}

/** Phase B: No DB. Compute transition (may call OpenAI). */
async function phaseB(payload: PhaseAPayload): Promise<TransitionResult> {
  const { scenario, stateBefore, text, lead, recentEvents, recentOutboundTexts } = payload;
  const maxQuestions = scenario.maxQuestions ?? 2;
  const mode = scenario.mode;

  let transition: TransitionResult;

  if (mode === AutopilotScenarioMode.AI) {
    transition = await resolveAiTransition({
      stateBefore,
      text,
      maxQuestions,
      firstName: lead?.firstName ?? null,
      aiPrompt: scenario.aiPrompt,
      scenarioContext: {
        agentName: scenario.agentName,
        companyName: scenario.companyName,
        companyDescription: scenario.companyDescription,
        offerSummary: scenario.offerSummary,
        calendarLinkRaw: scenario.calendarLinkRaw,
      },
      leadContext: {
        phone: lead?.phone ?? lead?.identity?.phone,
        email: lead?.email,
        source: lead?.source,
        externalId: lead?.externalId,
      },
      recentEvents: recentEvents ?? [],
      recentOutboundTexts: recentOutboundTexts ?? [],
      requiredSlots: (scenario.qualificationCriteria as { requiredSlots?: string[] } | null)?.requiredSlots ?? [],
    });
  } else {
    transition = resolveRulesTransition(
      stateBefore,
      text,
      maxQuestions,
      lead?.firstName ?? null,
      { companyName: scenario.companyName, calendarLinkRaw: scenario.calendarLinkRaw }
    );
  }

  // qualificationCriteria enforcement: force handover when all required slots are filled
  const criteria = scenario.qualificationCriteria as { requiredSlots?: string[] } | null;
  const requiredSlots = criteria?.requiredSlots ?? [];
  if (requiredSlots.length > 0 && !transition.terminal) {
    const mergedAnswers = { ...stateBefore.answers, ...transition.answersUpdate };
    const allFilled = requiredSlots.every(
      (slot) => typeof mergedAnswers[slot] === "string" && mergedAnswers[slot].trim().length > 0
    );
    if (allFilled) {
      transition = { ...transition, nextNode: "handover", terminal: true };
    }
  }

  return transition;
}

/** Phase C: DB-only. Persist transition, create outbound/events. */
async function phaseC(
  tx: TxClient,
  payload: PhaseAPayload,
  transition: TransitionResult
): Promise<ProcessReplyResult> {
  const { leadId, text, run, lead, scenario, scenarioId, stateBefore, now } = payload;
  const maxQuestions = scenario.maxQuestions ?? 2;
  const handoverUserId = scenario.handoverUserId ?? null;
  const newAnswers = { ...stateBefore.answers, ...transition.answersUpdate };
  const newState: AutopilotStateJson = {
    node: transition.nextNode,
    answers: newAnswers,
    questionIndex: transition.newQuestionIndex,
  };
  let newStatus = run.status;
  if (transition.terminal) newStatus = AutopilotRunStatus.HANDED_OVER;

  if (scenario.mode === AutopilotScenarioMode.AI) {
    const resolvedPrompt = buildScenarioPrompt({
      aiPrompt: scenario.aiPrompt,
      agentName: scenario.agentName,
      companyName: scenario.companyName,
      companyDescription: scenario.companyDescription,
      offerSummary: scenario.offerSummary,
      calendarLinkRaw: scenario.calendarLinkRaw,
      maxQuestions,
      leadName: lead?.firstName,
    });
    await tx.eventLog.create({
      data: {
        leadId,
        eventType: "autopilot_ai_planned",
        payload: {
          scenarioId,
          fallbackUsed: transition.fallbackUsed ?? false,
          jsonValid: transition.aiMeta?.jsonValid ?? false,
          latencyMs: transition.aiMeta?.latencyMs ?? 0,
          model: transition.aiMeta?.model ?? null,
          promptPreview: promptPreview(resolvedPrompt),
        } as unknown as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });
  }

  await tx.autopilotRun.update({
    where: { leadId },
    data: {
      stateJson: newState as unknown as Prisma.InputJsonValue,
      currentStep: transition.nextNode,
      lastInboundAt: now,
      status: newStatus,
      ...(run.scenarioId !== scenarioId ? { scenarioId } : {}),
    },
  });

  const toPhone = (lead?.phone ?? lead?.identity?.phone ?? "").trim();
  if (!toPhone) {
    const observedPhone = (lead?.phone ?? lead?.identity?.phone ?? "").trim() || null;
    await tx.eventLog.create({
      data: {
        leadId,
        eventType: "message_blocked",
        payload: {
          reason: "missing_phone",
          channel: "whatsapp",
          scenarioId,
          nodeAfter: transition.nextNode,
          observedPhone,
          observedTrimmedPhone: observedPhone,
        } as unknown as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });
    return {
      leadId,
      autopilot: { status: newStatus, node: transition.nextNode, answers: newAnswers },
      queuedMessage: null,
      messageBlocked: true,
    };
  }

  const outbound = await tx.outboundMessage.create({
    data: {
      leadId,
      workspaceId: run.workspaceId,
      channel: OutboundChannel.WHATSAPP,
      toPhone,
      text: transition.outboundText,
      status: OutboundMessageStatus.QUEUED,
    },
    select: { id: true, text: true },
  });

  await tx.autopilotRun.update({
    where: { leadId },
    data: { lastOutboundAt: now },
  });

  if (transition.terminal) {
    await tx.eventLog.create({
      data: {
        leadId,
        eventType: "autopilot_handover",
        payload: { scenarioId, handoverUserId } as unknown as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });
  }

  await tx.eventLog.create({
    data: {
      leadId,
      eventType: "message_queued",
      payload: {
        messageId: outbound.id,
        nodeAfter: transition.nextNode,
        scenarioId,
        text: transition.outboundText,
      } as unknown as Prisma.InputJsonValue,
      occurredAt: now,
    },
  });

  return {
    leadId,
    autopilot: { status: newStatus, node: transition.nextNode, answers: newAnswers },
    queuedMessage: { id: outbound.id, text: outbound.text, toPhone },
    ...(transition.terminal && handoverUserId ? { handoverUserId, scenarioId, lastInboundText: text } : {}),
  };
}

/**
 * Process an autopilot reply. Uses two short DB transactions and one slow phase (AI) outside any transaction.
 * Returns null if AutopilotRun not found.
 */
export async function processAutopilotReply(params: {
  leadId: string;
  text: string;
}): Promise<ProcessReplyResult | null> {
  const { leadId, text } = params;

  const payload = await prisma.$transaction((tx) => phaseA(tx, leadId, text));
  if (!payload) return null;

  const transition = await phaseB(payload);

  const result = await prisma.$transaction((tx) => phaseC(tx, payload, transition));

  // Google Calendar booking: create event after handover for QUALIFY_AND_BOOK scenarios
  if (
    result &&
    transition.terminal &&
    payload.scenario &&
    payload.scenario.scenarioType === AutopilotScenarioType.QUALIFY_AND_BOOK
  ) {
    try {
      const gcConfig = await getWorkspaceGoogleCalendarIntegration(payload.run.workspaceId);
      if (gcConfig) {
        const answers = { ...payload.stateBefore.answers, ...transition.answersUpdate };
        const leadName = answers.name || payload.lead?.firstName || "Lead";
        const preferredTime = answers.preferredTime || "";
        const now = new Date();
        const startTime = preferredTime ? new Date(preferredTime) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
        if (isNaN(startTime.getTime())) {
          startTime.setTime(now.getTime() + 24 * 60 * 60 * 1000);
        }
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

        const { eventId, meetLink } = await createCalendarEvent(payload.run.workspaceId, {
          summary: `Pinggo: ${leadName}`,
          description: `Lead: ${leadName}\nPhone: ${answers.phone || ""}\nEmail: ${answers.email || ""}\nService: ${answers.service || ""}`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attendeeEmail: answers.email || undefined,
        });

        // Create Booking row and log event
        await prisma.$transaction(async (tx) => {
          await tx.booking.create({
            data: {
              leadId,
              provider: "GOOGLE_CALENDAR",
              eventId,
              meetLink,
              startAt: startTime,
              endAt: endTime,
            },
          });

          await tx.eventLog.create({
            data: {
              leadId,
              eventType: "google_calendar_event_created",
              payload: { eventId, meetLink, calendarEmail: gcConfig.accountEmail } as unknown as Prisma.InputJsonValue,
              occurredAt: new Date(),
            },
          });
        });
      }
    } catch (err) {
      // Log but don't fail the handover
      logger.error({ err, leadId }, "Failed to create Google Calendar event after handover");
    }
  }

  return result;
}
