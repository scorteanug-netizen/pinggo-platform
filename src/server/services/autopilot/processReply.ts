/**
 * Core autopilot reply logic - shared by POST /api/v1/autopilot/reply and inbound webhook.
 * Processes an inbound message and advances the autopilot state.
 */
import {
  AutopilotRunStatus,
  AutopilotScenarioMode,
  AutopilotScenarioType,
  OutboundChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";
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

function resolveIntentFromReply(replyText: string): { intent: string; intentLabel: string } {
  const lower = replyText.toLowerCase();
  if (lower.includes("1") || lower.includes("pret") || lower.includes("preț")) {
    return { intent: "pricing", intentLabel: "q2_pricing" };
  }
  if (lower.includes("2") || lower.includes("program")) {
    return { intent: "booking", intentLabel: "q2_booking" };
  }
  return { intent: "other", intentLabel: "q2_other" };
}

function getFollowUpForIntent(intent: string): string {
  switch (intent) {
    case "pricing":
      return "Super. Pentru ce serviciu/produs vrei pret?";
    case "booking":
      return "Perfect. Pentru ce zi preferi programarea? (ex: luni/marti)";
    default:
      return "Spune-mi pe scurt detaliile si revin imediat.";
  }
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

function resolveRulesTransition(
  stateBefore: AutopilotStateJson,
  text: string,
  maxQuestions: number,
  firstName: string | null
): TransitionResult {
  const nodeBefore = stateBefore.node;
  const currentQIndex = stateBefore.questionIndex;

  if (nodeBefore === "q1") {
    const { intent, intentLabel } = resolveIntentFromReply(text);
    const newQIndex = currentQIndex + 1;
    if (newQIndex >= maxQuestions) {
      return {
        nextNode: "handover",
        outboundText: "Multumesc! Te conectez cu un agent.",
        answersUpdate: { intent },
        terminal: true,
        newQuestionIndex: newQIndex,
      };
    }
    return {
      nextNode: intentLabel,
      outboundText: getFollowUpForIntent(intent),
      answersUpdate: { intent },
      terminal: false,
      newQuestionIndex: newQIndex,
    };
  }

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
  if (newQIndex >= maxQuestions) {
    return {
      nextNode: "handover",
      outboundText: "Multumesc! Te conectez cu un agent.",
      answersUpdate: { [`q${currentQIndex}_answer`]: text },
      terminal: true,
      newQuestionIndex: newQIndex,
    };
  }

  return {
    nextNode: `q${newQIndex + 1}`,
    outboundText: "Mai ai detalii de adaugat?",
    answersUpdate: { [`q${currentQIndex}_answer`]: text },
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
};

/**
 * Process an autopilot reply. Must be called within a transaction.
 * Returns null if AutopilotRun not found.
 */
export async function processAutopilotReply(
  tx: TxClient,
  params: { leadId: string; text: string }
): Promise<ProcessReplyResult | null> {
  const { leadId, text } = params;

  const run = await tx.autopilotRun.findUnique({
    where: { leadId },
    select: {
      id: true,
      status: true,
      stateJson: true,
      workspaceId: true,
      scenarioId: true,
    },
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
      },
    });
  }
  if (!scenario) return null;

  const maxQuestions = scenario.maxQuestions ?? 2;
  const handoverUserId = scenario.handoverUserId ?? null;
  const mode = scenario.mode;
  const aiPrompt = scenario.aiPrompt ?? "";

  const stateBefore = parseStateJson(run.stateJson);
  const nodeBefore = stateBefore.node;

  let transition: TransitionResult;
  if (mode === AutopilotScenarioMode.AI) {
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

    const recentEvents = recentEventsRaw.reverse().map((e) => {
      const p = e.payload as Record<string, unknown> | null;
      return {
        eventType: e.eventType,
        text: (p?.text as string) ?? undefined,
        at: e.occurredAt?.toISOString(),
      };
    });
    const recentOutboundTexts = recentOutboundRaw
      .reverse()
      .map((m) => m.text)
      .filter((t): t is string => t !== null);

    transition = await resolveAiTransition({
      stateBefore,
      text,
      maxQuestions,
      firstName: lead?.firstName ?? null,
      aiPrompt,
      scenarioContext: {
        agentName: scenario.agentName,
        companyName: scenario.companyName,
        companyDescription: scenario.companyDescription,
        offerSummary: scenario.offerSummary,
        calendarLinkRaw: scenario.calendarLinkRaw,
      },
      leadContext: {
        phone: lead?.identity?.phone ?? lead?.phone,
        email: lead?.email,
        source: lead?.source,
        externalId: lead?.externalId,
      },
      recentEvents,
      recentOutboundTexts,
    });
  } else {
    transition = resolveRulesTransition(
      stateBefore,
      text,
      maxQuestions,
      lead?.firstName ?? null
    );
  }

  const newAnswers = { ...stateBefore.answers, ...transition.answersUpdate };
  const newState: AutopilotStateJson = {
    node: transition.nextNode,
    answers: newAnswers,
    questionIndex: transition.newQuestionIndex,
  };

  const now = new Date();
  let newStatus = run.status;
  if (transition.terminal) {
    newStatus = AutopilotRunStatus.HANDED_OVER;
  }

  await tx.eventLog.create({
    data: {
      leadId,
      eventType: "autopilot_inbound",
      payload: {
        text,
        nodeBefore,
        scenarioId,
        mode,
        ...(transition.aiMeta ? { aiMeta: transition.aiMeta } : {}),
        ...(transition.fallbackUsed !== undefined ? { fallbackUsed: transition.fallbackUsed } : {}),
      } as unknown as Prisma.InputJsonValue,
      occurredAt: now,
    },
  });

  if (mode === AutopilotScenarioMode.AI) {
    const resolvedPrompt = buildScenarioPrompt({
      aiPrompt,
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

  const rawPhone = lead?.identity?.phone ?? lead?.phone ?? null;
  const toPhone = (rawPhone ?? "").trim();
  if (!toPhone) {
    const observedTrimmed = ((lead?.phone ?? "") as string).trim() || null;
    await tx.eventLog.create({
      data: {
        leadId,
        eventType: "message_blocked",
        payload: {
          reason: "missing_phone",
          channel: "whatsapp",
          scenarioId,
          nodeAfter: transition.nextNode,
          observedPhone: lead?.phone ?? null,
          observedTrimmedPhone: observedTrimmed,
        } as unknown as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });
    return {
      leadId,
      autopilot: {
        status: newStatus,
        node: transition.nextNode,
        answers: newAnswers,
      },
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
        payload: {
          scenarioId,
          handoverUserId,
        } as unknown as Prisma.InputJsonValue,
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
      } as unknown as Prisma.InputJsonValue,
      occurredAt: now,
    },
  });

  return {
    leadId,
    autopilot: {
      status: newStatus,
      node: transition.nextNode,
      answers: newAnswers,
    },
    queuedMessage: {
      id: outbound.id,
      text: outbound.text,
      toPhone,
    },
  };
}
