/**
 * AI Planner — generates the next autopilot message via OpenAI.
 *
 * When mode=AI, builds a structured prompt from the scenario config and
 * conversation state, calls OpenAI, parses the strict JSON response with
 * zod, and falls back to deterministic RULES templates if anything fails.
 */

import { z } from "zod";
import { callOpenAIChat } from "@/server/services/ai/openaiClient";
import { buildScenarioPrompt } from "@/server/services/autopilot/promptBuilder";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type AiPlannerInput = {
  aiPrompt: string;
  maxQuestions: number;
  questionIndex: number;
  replyText: string;
  firstName: string | null;
  currentAnswers: Record<string, string>;
  /** Scenario context fields for variable replacement */
  scenarioContext?: {
    agentName?: string | null;
    companyName?: string | null;
    companyDescription?: string | null;
    offerSummary?: string | null;
    calendarLinkRaw?: string | null;
  };
  /** Optional enrichment for better AI context */
  leadContext?: {
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    externalId?: string | null;
  };
  /** Last N timeline entries (eventType + text excerpt) */
  recentEvents?: Array<{ eventType: string; text?: string; at?: string }>;
  /** Last N outbound message texts */
  recentOutboundTexts?: string[];
};

export type AiPlannerOutput = {
  /** Message to send back to the lead */
  nextMessage: string;
  /** Whether autopilot should hand over after this reply */
  shouldHandover: boolean;
  /** Extracted intent label */
  intent: string | null;
  /** Key-value pairs to merge into answers */
  answersUpdate: Record<string, string>;
  /** True when OpenAI call failed and RULES templates were used instead */
  fallbackUsed: boolean;
  /** Metadata from the OpenAI call (absent when fallback) */
  aiMeta?: {
    model: string;
    latencyMs: number;
    jsonValid: boolean;
  };
};

// ---------------------------------------------------------------------------
// Zod schema for the expected JSON from OpenAI
// ---------------------------------------------------------------------------

const aiResponseSchema = z.object({
  nextText: z.string().min(1).max(600),
  intent: z.enum(["pricing", "booking", "other"]),
  answers: z.record(z.string()).default({}),
  shouldHandover: z.boolean(),
  handoverReason: z.string().nullable().default(null),
});

type AiResponseParsed = z.infer<typeof aiResponseSchema>;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildMessages(input: AiPlannerInput) {
  const {
    aiPrompt,
    maxQuestions,
    questionIndex,
    replyText,
    firstName,
    currentAnswers,
    scenarioContext,
    leadContext,
    recentEvents,
    recentOutboundTexts,
  } = input;

  // Replace variables in the AI prompt with actual scenario/lead values
  const resolvedPrompt = buildScenarioPrompt({
    aiPrompt,
    agentName: scenarioContext?.agentName,
    companyName: scenarioContext?.companyName,
    companyDescription: scenarioContext?.companyDescription,
    offerSummary: scenarioContext?.offerSummary,
    calendarLinkRaw: scenarioContext?.calendarLinkRaw,
    maxQuestions,
    leadName: firstName,
  });

  const remainingQuestions = maxQuestions - questionIndex - 1;

  // System message: strict instructions
  const systemParts: string[] = [
    "You are an AI assistant embedded in a WhatsApp autopilot.",
    "You MUST respond with ONLY valid JSON — no markdown, no backticks, no extra text.",
    "",
    "JSON schema you MUST follow:",
    '{',
    '  "nextText": "string (1-600 chars, Romanian language, WhatsApp-friendly)",',
    '  "intent": "pricing" | "booking" | "other",',
    '  "answers": { "key": "value" },',
    '  "shouldHandover": boolean,',
    '  "handoverReason": "string or null"',
    '}',
    "",
    "Rules:",
    `- You have ${remainingQuestions} question(s) remaining before mandatory handover.`,
    `- If remainingQuestions <= 0, set shouldHandover=true.`,
    "- Keep messages short (1-3 sentences), friendly, professional.",
    "- Language: Romanian.",
    "- Never invent facts about the company or its services.",
    "- If the lead's intent is unclear or you are uncertain, set shouldHandover=true.",
    "- Extract intent from the lead's reply: pricing, booking, or other.",
    "- Store any useful information the lead provided in the answers object.",
    "",
    "Company script (provided by the business owner):",
    resolvedPrompt,
  ];

  // User message: conversation context
  const userParts: string[] = [];

  if (firstName || leadContext) {
    userParts.push("Lead info:");
    if (firstName) userParts.push(`  Name: ${firstName}`);
    if (leadContext?.phone) userParts.push(`  Phone: ${leadContext.phone}`);
    if (leadContext?.email) userParts.push(`  Email: ${leadContext.email}`);
    if (leadContext?.source) userParts.push(`  Source: ${leadContext.source}`);
    userParts.push("");
  }

  userParts.push(`Conversation state: questionIndex=${questionIndex}, maxQuestions=${maxQuestions}`);

  if (Object.keys(currentAnswers).length > 0) {
    userParts.push(`Collected answers so far: ${JSON.stringify(currentAnswers)}`);
  }

  if (recentOutboundTexts && recentOutboundTexts.length > 0) {
    userParts.push("");
    userParts.push("Recent outbound messages (our side):");
    for (const txt of recentOutboundTexts.slice(-5)) {
      userParts.push(`  > ${txt}`);
    }
  }

  if (recentEvents && recentEvents.length > 0) {
    userParts.push("");
    userParts.push("Recent timeline:");
    for (const evt of recentEvents.slice(-10)) {
      const line = evt.text ? `[${evt.eventType}] ${evt.text}` : `[${evt.eventType}]`;
      userParts.push(`  ${line}`);
    }
  }

  userParts.push("");
  userParts.push(`Lead just replied: "${replyText}"`);
  userParts.push("");
  userParts.push("Respond with ONLY JSON, no other text.");

  return [
    { role: "system" as const, content: systemParts.join("\n") },
    { role: "user" as const, content: userParts.join("\n") },
  ];
}

// ---------------------------------------------------------------------------
// JSON extraction helpers
// ---------------------------------------------------------------------------

/** Try JSON.parse directly, then attempt to extract first {...} block. */
function extractJson(raw: string): unknown | null {
  // Direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // ignore
  }

  // Extract first JSON object from potentially wrapped text
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      // ignore
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// RULES fallback (same deterministic logic as Phase A)
// ---------------------------------------------------------------------------

function extractCompanyName(prompt: string): string {
  const patterns = [
    /(?:pentru|for)\s+["']?([A-Z][A-Za-z0-9 &.]+)/i,
    /(?:companie|company|brand)\s*[:=]\s*["']?([A-Za-z0-9 &.]+)/i,
    /company_name\s*=\s*["']?([A-Za-z0-9 &.]+)/i,
  ];
  for (const p of patterns) {
    const m = prompt.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return "echipa noastra";
}

function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("pret") || lower.includes("preț") || lower.includes("cost") || lower.includes("price")) {
    return "pricing";
  }
  if (lower.includes("program") || lower.includes("booking") || lower.includes("calendar")) {
    return "booking";
  }
  return "other";
}

function rulesFallback(input: AiPlannerInput): AiPlannerOutput {
  const { aiPrompt, maxQuestions, questionIndex, replyText, firstName, currentAnswers } = input;

  const companyName = extractCompanyName(aiPrompt);
  const name = firstName?.trim() || "";
  const greeting = name ? `${name}, ` : "";
  const nextQIndex = questionIndex + 1;

  if (nextQIndex >= maxQuestions) {
    const intent = currentAnswers.intent ?? detectIntent(replyText);
    return {
      nextMessage: `${greeting}multumesc pentru detalii! Te conectez cu un specialist de la ${companyName}.`,
      shouldHandover: true,
      intent,
      answersUpdate: {
        [`q${questionIndex}_answer`]: replyText,
        ...(currentAnswers.intent ? {} : { intent }),
      },
      fallbackUsed: true,
    };
  }

  if (questionIndex === 0) {
    const intent = detectIntent(replyText);
    let followUp: string;
    switch (intent) {
      case "pricing":
        followUp = `${greeting}super! La ${companyName} avem mai multe optiuni. Pentru ce serviciu/produs vrei informatii de pret?`;
        break;
      case "booking":
        followUp = `${greeting}perfect! La ${companyName} te putem programa rapid. Ce zi preferi?`;
        break;
      default:
        followUp = `${greeting}multumesc! La ${companyName} suntem aici sa te ajutam. Spune-mi mai multe detalii despre ce te intereseaza.`;
        break;
    }
    return {
      nextMessage: followUp,
      shouldHandover: false,
      intent,
      answersUpdate: { intent },
      fallbackUsed: true,
    };
  }

  return {
    nextMessage: `${greeting}am inteles. Mai ai alte intrebari pentru ${companyName}?`,
    shouldHandover: false,
    intent: null,
    answersUpdate: { [`q${questionIndex}_answer`]: replyText },
    fallbackUsed: true,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calls OpenAI to generate the next autopilot message.
 * Falls back to deterministic RULES templates on any failure.
 */
export async function aiPlanner(input: AiPlannerInput): Promise<AiPlannerOutput> {
  const messages = buildMessages(input);

  let rawText: string;
  let model: string;
  let latencyMs: number;

  try {
    const result = await callOpenAIChat(messages);
    rawText = result.rawText;
    model = result.model;
    latencyMs = result.latencyMs;
  } catch {
    // OpenAI call failed entirely → RULES fallback
    return rulesFallback(input);
  }

  // Parse and validate the JSON response
  const parsed = extractJson(rawText);
  if (!parsed) {
    return {
      ...rulesFallback(input),
      aiMeta: { model, latencyMs, jsonValid: false },
    };
  }

  const validated = aiResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ...rulesFallback(input),
      aiMeta: { model, latencyMs, jsonValid: false },
    };
  }

  const ai: AiResponseParsed = validated.data;

  // Enforce maxQuestions constraint server-side regardless of what AI says
  const nextQIndex = input.questionIndex + 1;
  const mustHandover = nextQIndex >= input.maxQuestions;
  const shouldHandover = ai.shouldHandover || mustHandover;

  return {
    nextMessage: ai.nextText,
    shouldHandover,
    intent: ai.intent,
    answersUpdate: {
      ...ai.answers,
      ...(ai.handoverReason ? { handoverReason: ai.handoverReason } : {}),
    },
    fallbackUsed: false,
    aiMeta: { model, latencyMs, jsonValid: true },
  };
}
