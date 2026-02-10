export const FLOW_WIZARD_STEPS = [
  { key: "input", label: "Intrare lead" },
  { key: "routing", label: "Repartizare" },
  { key: "terms", label: "Termen de raspuns" },
  { key: "escalation", label: "Escaladare" },
  { key: "proof", label: "Dovada" },
  { key: "booking", label: "Programare (optional)" },
] as const;

export type FlowWizardStepKey = (typeof FLOW_WIZARD_STEPS)[number]["key"];

export const FLOW_INPUT_SOURCES = [
  "WEBFORM",
  "WHATSAPP",
  "EMAIL",
  "WEBHOOK",
  "API",
] as const;

export type FlowInputSource = (typeof FLOW_INPUT_SOURCES)[number];

export const FLOW_STAGE_TEMPLATES = [
  { key: "first_touch", name: "First touch", defaultTargetMinutes: 15 },
  { key: "handover", name: "Handover", defaultTargetMinutes: 30 },
  { key: "qualification", name: "Qualification", defaultTargetMinutes: 120 },
  { key: "next_step_scheduled", name: "Next step scheduled", defaultTargetMinutes: 240 },
  { key: "follow_up_closure", name: "Follow-up closure", defaultTargetMinutes: 1440 },
] as const;

export type FlowStageKey = (typeof FLOW_STAGE_TEMPLATES)[number]["key"];

export const FLOW_PROOF_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
  "manual_proof_note",
] as const;

export type FlowProofType = (typeof FLOW_PROOF_TYPES)[number];

export const FLOW_BOOKING_PROVIDERS = ["NONE", "GOOGLE_CALENDAR", "CALENDLY"] as const;
export type FlowBookingProvider = (typeof FLOW_BOOKING_PROVIDERS)[number];

export type FlowWizardRoutingConfig = {
  eligibleAgents: string[];
  fallbackOwnerUserId: string | null;
  roundRobinCursor: number;
};

export type FlowWizardTermConfig = {
  stage1TargetMinutes: number;
  perSourceOverrides: Record<FlowInputSource, number | null>;
};

export type FlowWizardEscalationRule = {
  stageKey: FlowStageKey;
  enabled: boolean;
  remindAtPct: number;
  reassignAtPct: number;
  managerAlertAtPct: number;
};

export type FlowWizardProofRule = {
  stageKey: FlowStageKey;
  stopOnProofTypes: FlowProofType[];
};

export type FlowWizardBookingConfig = {
  enabled: boolean;
  provider: FlowBookingProvider;
};

export type FlowWizardState = {
  input: {
    enabledSources: FlowInputSource[];
  };
  routing: FlowWizardRoutingConfig;
  responseTerms: FlowWizardTermConfig;
  escalation: {
    rules: FlowWizardEscalationRule[];
  };
  proof: {
    rules: FlowWizardProofRule[];
  };
  booking: FlowWizardBookingConfig;
};

export const DEFAULT_PER_SOURCE_OVERRIDES: Record<FlowInputSource, number | null> = {
  WEBFORM: null,
  WHATSAPP: null,
  EMAIL: null,
  WEBHOOK: null,
  API: null,
};

export const DEFAULT_PROOF_RULES_BY_STAGE: Record<FlowStageKey, FlowProofType[]> = {
  first_touch: [
    "message_sent",
    "reply_received",
    "meeting_created",
    "call_logged",
    "manual_proof_note",
  ],
  handover: ["manual_proof_note"],
  qualification: ["reply_received", "call_logged", "manual_proof_note"],
  next_step_scheduled: ["meeting_created", "manual_proof_note"],
  follow_up_closure: ["reply_received", "call_logged", "manual_proof_note"],
};

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeInt(value: unknown, fallback: number, min = 1, max = 100_000) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInputSources(value: unknown) {
  if (!Array.isArray(value)) return [] as FlowInputSource[];
  const allowed = new Set(FLOW_INPUT_SOURCES);
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry): entry is FlowInputSource => allowed.has(entry as FlowInputSource));
  return dedupeStrings(normalized) as FlowInputSource[];
}

function normalizeUserId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRouting(value: unknown): FlowWizardRoutingConfig {
  const record = isRecord(value) ? value : {};
  const eligibleAgents = Array.isArray(record.eligibleAgents)
    ? dedupeStrings(
        record.eligibleAgents
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      )
    : [];

  return {
    eligibleAgents,
    fallbackOwnerUserId: normalizeUserId(record.fallbackOwnerUserId),
    roundRobinCursor: normalizeInt(record.roundRobinCursor, 0, 0, 1_000_000),
  };
}

function normalizePerSourceOverrides(value: unknown) {
  const record = isRecord(value) ? value : {};
  const result: Record<FlowInputSource, number | null> = { ...DEFAULT_PER_SOURCE_OVERRIDES };
  for (const source of FLOW_INPUT_SOURCES) {
    const raw = record[source];
    if (raw === null || raw === undefined || raw === "") {
      result[source] = null;
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      result[source] = normalizeInt(raw, 1, 1, 100_000);
      continue;
    }
    result[source] = null;
  }
  return result;
}

function normalizeProofTypes(value: unknown) {
  if (!Array.isArray(value)) return [] as FlowProofType[];
  const allowed = new Set(FLOW_PROOF_TYPES);
  return dedupeStrings(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry): entry is FlowProofType => allowed.has(entry as FlowProofType))
  ) as FlowProofType[];
}

function normalizeEscalationRules(value: unknown) {
  const byStage = new Map<FlowStageKey, FlowWizardEscalationRule>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry) || typeof entry.stageKey !== "string") continue;
      const stageKey = entry.stageKey.trim() as FlowStageKey;
      if (!FLOW_STAGE_TEMPLATES.some((stage) => stage.key === stageKey)) continue;
      byStage.set(stageKey, {
        stageKey,
        enabled: Boolean(entry.enabled),
        remindAtPct: normalizeInt(entry.remindAtPct, 50, 1, 500),
        reassignAtPct: normalizeInt(entry.reassignAtPct, 75, 1, 500),
        managerAlertAtPct: normalizeInt(entry.managerAlertAtPct, 100, 1, 500),
      });
    }
  }

  return FLOW_STAGE_TEMPLATES.map((stage) => {
    const existing = byStage.get(stage.key);
    if (existing) {
      return {
        ...existing,
        reassignAtPct: Math.max(existing.reassignAtPct, existing.remindAtPct),
        managerAlertAtPct: Math.max(existing.managerAlertAtPct, existing.reassignAtPct),
      };
    }
    return {
      stageKey: stage.key,
      enabled: true,
      remindAtPct: 50,
      reassignAtPct: 75,
      managerAlertAtPct: 100,
    } satisfies FlowWizardEscalationRule;
  });
}

function normalizeProofRules(value: unknown) {
  const byStage = new Map<FlowStageKey, FlowProofType[]>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry) || typeof entry.stageKey !== "string") continue;
      const stageKey = entry.stageKey.trim() as FlowStageKey;
      if (!FLOW_STAGE_TEMPLATES.some((stage) => stage.key === stageKey)) continue;
      byStage.set(stageKey, normalizeProofTypes(entry.stopOnProofTypes));
    }
  }

  return FLOW_STAGE_TEMPLATES.map((stage) => ({
    stageKey: stage.key,
    stopOnProofTypes:
      byStage.get(stage.key) ?? [...DEFAULT_PROOF_RULES_BY_STAGE[stage.key]],
  }));
}

export function createDefaultFlowWizardState(): FlowWizardState {
  return {
    input: {
      enabledSources: ["WEBFORM", "WHATSAPP", "EMAIL", "WEBHOOK", "API"],
    },
    routing: {
      eligibleAgents: [],
      fallbackOwnerUserId: null,
      roundRobinCursor: 0,
    },
    responseTerms: {
      stage1TargetMinutes: 15,
      perSourceOverrides: { ...DEFAULT_PER_SOURCE_OVERRIDES },
    },
    escalation: {
      rules: normalizeEscalationRules([]),
    },
    proof: {
      rules: normalizeProofRules([]),
    },
    booking: {
      enabled: false,
      provider: "NONE",
    },
  };
}

export function normalizeFlowWizardState(value: unknown): FlowWizardState {
  const defaults = createDefaultFlowWizardState();
  const record = isRecord(value) ? value : {};

  const inputRecord = isRecord(record.input) ? record.input : {};
  const routingRecord = isRecord(record.routing) ? record.routing : {};
  const termsRecord = isRecord(record.responseTerms) ? record.responseTerms : {};
  const escalationRecord = isRecord(record.escalation) ? record.escalation : {};
  const proofRecord = isRecord(record.proof) ? record.proof : {};
  const bookingRecord = isRecord(record.booking) ? record.booking : {};

  const enabledSources = normalizeInputSources(inputRecord.enabledSources);
  const hasInputSources = Array.isArray(inputRecord.enabledSources);
  const routing = normalizeRouting(routingRecord);

  const stage1TargetMinutes = normalizeInt(
    termsRecord.stage1TargetMinutes,
    defaults.responseTerms.stage1TargetMinutes,
    1,
    100_000
  );
  const perSourceOverrides = normalizePerSourceOverrides(termsRecord.perSourceOverrides);

  const escalationRules = normalizeEscalationRules(escalationRecord.rules);
  const proofRules = normalizeProofRules(proofRecord.rules);

  const providerCandidate =
    typeof bookingRecord.provider === "string"
      ? bookingRecord.provider.trim().toUpperCase()
      : defaults.booking.provider;
  const provider = FLOW_BOOKING_PROVIDERS.includes(providerCandidate as FlowBookingProvider)
    ? (providerCandidate as FlowBookingProvider)
    : defaults.booking.provider;

  return {
    input: {
      enabledSources: hasInputSources ? enabledSources : defaults.input.enabledSources,
    },
    routing,
    responseTerms: {
      stage1TargetMinutes,
      perSourceOverrides,
    },
    escalation: {
      rules: escalationRules,
    },
    proof: {
      rules: proofRules,
    },
    booking: {
      enabled: Boolean(bookingRecord.enabled),
      provider,
    },
  };
}
