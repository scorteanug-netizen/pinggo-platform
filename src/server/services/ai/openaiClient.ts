/**
 * Minimal OpenAI Chat Completions client using global fetch (Node 20+).
 * No external dependencies beyond what's already in the project.
 *
 * Reads OPENAI_API_KEY and OPENAI_MODEL from process.env.
 * Enforces a 10-second timeout via AbortController.
 */

const OPENAI_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";
const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIChoice = {
  message?: { content?: string };
};

type OpenAIResponse = {
  choices?: OpenAIChoice[];
  model?: string;
  error?: { message?: string };
};

export type CallOpenAIResult = {
  rawText: string;
  model: string;
  latencyMs: number;
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calls OpenAI Chat Completions with the given messages.
 *
 * @throws Error if OPENAI_API_KEY is missing, on network failure, or on timeout.
 */
export async function callOpenAIChat(messages: ChatMessage[]): Promise<CallOpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "YOUR_KEY_HERE") {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = Date.now();

  try {
    const res = await fetch(OPENAI_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`OpenAI API ${res.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as OpenAIResponse;

    if (data.error?.message) {
      throw new Error(`OpenAI error: ${data.error.message}`);
    }

    const rawText = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!rawText) {
      throw new Error("OpenAI returned empty content.");
    }

    return {
      rawText,
      model: data.model ?? model,
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}
