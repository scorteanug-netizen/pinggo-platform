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
  /** Required slots from qualificationCriteria — when set, AI should collect these */
  requiredSlots?: string[];
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
  const intentOverride = !isLikelyFillingSlot(replyText) ? detectIntentFromKeywords(replyText) : null;

  const systemParts: string[] = [
    "You are an AI assistant in a WhatsApp chat. Reply with ONLY valid JSON — no markdown, no backticks.",
    "",
    "JSON schema:",
    '{ "nextText": "string (max 600 chars, Romanian)", "intent": "pricing"|"booking"|"other", "answers": {}, "shouldHandover": boolean, "handoverReason": null }',
    "",
    "Rules:",
    "- NEVER present numeric or list options (no '1) 2) 3)' or 'alege 1 sau 2'). Sound human.",
    "- One short message only (max 2-3 sentences). End with EXACTLY one question.",
    `- You have ${remainingQuestions} question(s) left before handover. If remainingQuestions <= 0, set shouldHandover=true.`,
    "- Language: Romanian. Friendly, natural tone.",
    input.requiredSlots?.length
      ? `- Collect these required fields: ${input.requiredSlots.join(", ")}. Store each in "answers". Set shouldHandover=true ONLY when ALL are collected.`
      : "- Do not invent company facts. Store name, phone, email, service, preferredTime in answers when the lead provides them.",
    intentOverride ? `- Lead intent (from keywords): ${intentOverride}. Use it; do not ask the lead to choose options.` : "",
    "",
    "Company context:",
    resolvedPrompt,
  ].filter(Boolean);

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
  userParts.push(`Collected so far (intent, name, phone, email, service, preferredTime): ${JSON.stringify(currentAnswers)}`);

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

function detectIntentFromKeywords(text: string): string {
  const lower = text.toLowerCase().trim();
  if (lower.includes("pret") || lower.includes("preț") || lower.includes("cost") || lower.includes("price") || lower.includes("tarif")) {
    return "pricing";
  }
  if (lower.includes("programare") || lower.includes("program") || lower.includes("booking") || lower.includes("calendar") || lower.includes("intalnire")) {
    return "booking";
  }
  if (lower.includes("contact") || lower.includes("agent") || lower.includes("vorbesc") || lower.includes("operator")) {
    return "contact";
  }
  return "other";
}

function isLikelyFillingSlot(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("@") && t.length <= 80) return true;
  if (/^[\d+\s\-()]{7,}$/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && words.every((w) => /^[A-Za-z\u0080-\u024F]+$/.test(w)) && t.length <= 40) return true;
  return false;
}

function detectIntent(text: string): string {
  return detectIntentFromKeywords(text);
}

const COLLECTED_KEYS = ["intent", "name", "phone", "email", "service", "preferredTime"] as const;
function getNextMissingSlot(answers: Record<string, string>): (typeof COLLECTED_KEYS)[number] | null {
  for (const key of COLLECTED_KEYS) {
    if (!answers[key]?.trim()) return key;
  }
  return null;
}

function rulesFallback(input: AiPlannerInput): AiPlannerOutput {
  const { aiPrompt, maxQuestions, questionIndex, replyText, firstName, currentAnswers } = input;

  const companyName = extractCompanyName(aiPrompt);
  const nextQIndex = questionIndex + 1;
  const answersUpdate: Record<string, string> = {};

  if (nextQIndex >= maxQuestions) {
    const intent = currentAnswers.intent ?? (isLikelyFillingSlot(replyText) ? "other" : detectIntentFromKeywords(replyText));
    if (!currentAnswers.intent) answersUpdate.intent = intent;
    const slot = getNextMissingSlot(currentAnswers);
    if (slot === "name") answersUpdate.name = replyText.trim();
    else if (slot === "phone") answersUpdate.phone = replyText.trim();
    else if (slot === "email") answersUpdate.email = replyText.trim();
    else if (slot === "service") answersUpdate.service = replyText.trim();
    else if (slot === "preferredTime") answersUpdate.preferredTime = replyText.trim();
    else answersUpdate[`q${questionIndex}_answer`] = replyText;
    return {
      nextMessage: `Multumesc! Te conectez cu un coleg de la ${companyName}.`,
      shouldHandover: true,
      intent,
      answersUpdate,
      fallbackUsed: true,
    };
  }

  if (questionIndex === 0) {
    if (!isLikelyFillingSlot(replyText)) answersUpdate.intent = detectIntentFromKeywords(replyText);
    else {
      answersUpdate.name = replyText.trim();
      if (!currentAnswers.intent) answersUpdate.intent = "other";
    }
    if (!answersUpdate.intent && !currentAnswers.intent) answersUpdate.intent = "other";
    return {
      nextMessage: "Salut! Cu ce te pot ajuta azi?",
      shouldHandover: false,
      intent: answersUpdate.intent || currentAnswers.intent || "other",
      answersUpdate,
      fallbackUsed: true,
    };
  }

  const slot = getNextMissingSlot(currentAnswers);
  if (slot === "intent") {
    if (!isLikelyFillingSlot(replyText)) answersUpdate.intent = detectIntentFromKeywords(replyText);
    else answersUpdate.name = replyText.trim();
    if (!answersUpdate.intent && !currentAnswers.intent) answersUpdate.intent = "other";
  } else if (slot === "name") answersUpdate.name = replyText.trim();
  else if (slot === "phone") answersUpdate.phone = replyText.trim();
  else if (slot === "email") answersUpdate.email = replyText.trim();
  else if (slot === "service") answersUpdate.service = replyText.trim();
  else if (slot === "preferredTime") answersUpdate.preferredTime = replyText.trim();
  else answersUpdate[`q${questionIndex}_answer`] = replyText;

  const merged = { ...currentAnswers, ...answersUpdate };
  const nextSlot = getNextMissingSlot(merged);
  const name = merged.name || firstName?.trim() || "";
  const greeting = name ? `${name}, ` : "";

  let nextMessage: string;
  if (nextSlot === "intent" || !nextSlot) nextMessage = "Cu ce te pot ajuta azi?";
  else if (nextSlot === "name") nextMessage = `${greeting}Cum te numesti?`;
  else if (nextSlot === "phone") nextMessage = `${greeting}Ce numar de telefon ai?`;
  else if (nextSlot === "email") nextMessage = `${greeting}Ce adresa de email?`;
  else if (nextSlot === "service") {
    const intent = merged.intent || "other";
    nextMessage = intent === "pricing"
      ? `${greeting}Pentru ce serviciu vrei informatii de pret?`
      : intent === "booking"
        ? `${greeting}Pentru ce serviciu vrei programarea?`
        : `${greeting}Spune-mi pe scurt ce ai nevoie.`;
  } else if (nextSlot === "preferredTime") nextMessage = `${greeting}Ce zi sau interval preferi?`;
  else nextMessage = "Mai ai ceva de adaugat?";

  return {
    nextMessage,
    shouldHandover: false,
    intent: merged.intent || null,
    answersUpdate,
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
