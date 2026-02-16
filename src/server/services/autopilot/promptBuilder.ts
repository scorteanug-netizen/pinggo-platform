/**
 * Replaces template variables in scenario.aiPrompt with actual values.
 * Missing values are replaced with empty string (not the placeholder).
 */

type PromptBuilderArgs = {
  aiPrompt: string;
  agentName?: string | null;
  companyName?: string | null;
  companyDescription?: string | null;
  offerSummary?: string | null;
  calendarLinkRaw?: string | null;
  maxQuestions: number;
  leadName?: string | null;
};

const VARIABLE_MAP: Record<string, keyof Omit<PromptBuilderArgs, "aiPrompt" | "maxQuestions">> = {
  "{agent_name}": "agentName",
  "{company_name}": "companyName",
  "{company_description}": "companyDescription",
  "{offer_summary}": "offerSummary",
  "{calendar_link_raw}": "calendarLinkRaw",
  "{lead_name}": "leadName",
};

export function buildScenarioPrompt(args: PromptBuilderArgs): string {
  let result = args.aiPrompt;

  for (const [placeholder, key] of Object.entries(VARIABLE_MAP)) {
    const value = (args[key] as string | null | undefined)?.trim() || "";
    result = result.split(placeholder).join(value);
  }

  // {maxQuestions} is a number, handle separately
  result = result.split("{maxQuestions}").join(String(args.maxQuestions));

  return result;
}

/** Returns the first `maxLen` characters of a resolved prompt for safe EventLog storage. */
export function promptPreview(resolvedPrompt: string, maxLen = 300): string {
  if (resolvedPrompt.length <= maxLen) return resolvedPrompt;
  return resolvedPrompt.slice(0, maxLen) + "...";
}
