import { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  FLOW_PROOF_TYPES,
  FLOW_STAGE_TEMPLATES,
  FlowProofType,
  FlowWizardState,
  createDefaultFlowWizardState,
  normalizeFlowWizardState,
} from "@/lib/flows/wizard";

type TxOrClient = Prisma.TransactionClient | typeof prisma;

type StageDefinitionLike = {
  key: string;
  targetMinutes: number;
  stopOnProofTypes: Prisma.JsonValue | null;
};

type EscalationRuleLike = {
  stageKey: string;
  remindAtPct: number;
  reassignAtPct: number;
  managerAlertAtPct: number;
  enabled: boolean;
};

export type FlowWizardValidationError = {
  path: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProofTypesFromJson(value: Prisma.JsonValue | null | undefined): FlowProofType[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(FLOW_PROOF_TYPES);
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry): entry is FlowProofType => allowed.has(entry as FlowProofType))
  )];
}

function getStageRule<T extends { stageKey: string }>(rules: T[], stageKey: string) {
  return rules.find((rule) => rule.stageKey === stageKey) ?? null;
}

export function extractWizardStateFromFlow(params: {
  config: Prisma.JsonValue | null | undefined;
  stageDefinitions: StageDefinitionLike[];
  escalationRules: EscalationRuleLike[];
}) {
  const configRecord = isRecord(params.config) ? params.config : {};
  const wizardPayload = isRecord(configRecord.wizard) ? configRecord.wizard : {};
  const base = normalizeFlowWizardState({
    ...wizardPayload,
    routing: configRecord.routing,
  });

  const definitionsByKey = new Map(params.stageDefinitions.map((definition) => [definition.key, definition]));
  const escalationByKey = new Map(params.escalationRules.map((rule) => [rule.stageKey, rule]));

  const stage1Definition = definitionsByKey.get("first_touch");
  if (stage1Definition) {
    base.responseTerms.stage1TargetMinutes = Math.max(1, Math.floor(stage1Definition.targetMinutes));
  }

  base.proof.rules = FLOW_STAGE_TEMPLATES.map((stage) => {
    const fromDb = definitionsByKey.get(stage.key);
    if (!fromDb) {
      return (
        base.proof.rules.find((rule) => rule.stageKey === stage.key) ?? {
          stageKey: stage.key,
          stopOnProofTypes: [],
        }
      );
    }
    const proofTypes = normalizeProofTypesFromJson(fromDb.stopOnProofTypes);
    return {
      stageKey: stage.key,
      stopOnProofTypes: proofTypes,
    };
  });

  base.escalation.rules = FLOW_STAGE_TEMPLATES.map((stage) => {
    const fromDb = escalationByKey.get(stage.key);
    if (!fromDb) {
      return (
        base.escalation.rules.find((rule) => rule.stageKey === stage.key) ?? {
          stageKey: stage.key,
          enabled: true,
          remindAtPct: 50,
          reassignAtPct: 75,
          managerAlertAtPct: 100,
        }
      );
    }
    const remindAtPct = Math.max(1, Math.floor(fromDb.remindAtPct));
    const reassignAtPct = Math.max(remindAtPct, Math.floor(fromDb.reassignAtPct));
    const managerAlertAtPct = Math.max(reassignAtPct, Math.floor(fromDb.managerAlertAtPct));
    return {
      stageKey: stage.key,
      enabled: fromDb.enabled,
      remindAtPct,
      reassignAtPct,
      managerAlertAtPct,
    };
  });

  return normalizeFlowWizardState(base);
}

export function mergeWizardStateIntoFlowConfig(
  existingConfig: Prisma.JsonValue | null | undefined,
  wizard: FlowWizardState
): Prisma.InputJsonValue {
  const baseConfig = isRecord(existingConfig) ? { ...existingConfig } : {};
  return {
    ...baseConfig,
    version: "wizard-v1",
    wizard: {
      input: wizard.input,
      responseTerms: wizard.responseTerms,
      escalation: wizard.escalation,
      proof: wizard.proof,
      booking: wizard.booking,
    },
    routing: wizard.routing,
  } as Prisma.InputJsonValue;
}

export async function sanitizeRoutingUsersForWorkspace(
  tx: TxOrClient,
  workspaceId: string,
  wizard: FlowWizardState
) {
  const memberships = await tx.membership.findMany({
    where: {
      workspaceId,
      status: MembershipStatus.ACTIVE,
      role: {
        in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.AGENT],
      },
    },
    select: { userId: true },
  });
  const allowedUserIds = new Set(memberships.map((membership) => membership.userId));
  wizard.routing.eligibleAgents = wizard.routing.eligibleAgents.filter((userId) =>
    allowedUserIds.has(userId)
  );
  if (wizard.routing.fallbackOwnerUserId && !allowedUserIds.has(wizard.routing.fallbackOwnerUserId)) {
    wizard.routing.fallbackOwnerUserId = null;
  }
  return wizard;
}

export async function syncFlowRuntimeFromWizardState(
  tx: TxOrClient,
  flowId: string,
  wizard: FlowWizardState
) {
  const existingDefinitions = await tx.sLAStageDefinition.findMany({
    where: { flowId },
    select: {
      key: true,
      targetMinutes: true,
      businessHoursEnabled: true,
    },
  });
  const existingDefinitionMap = new Map(
    existingDefinitions.map((definition) => [definition.key, definition])
  );

  for (const stage of FLOW_STAGE_TEMPLATES) {
    const existing = existingDefinitionMap.get(stage.key);
    const proofRule = getStageRule(wizard.proof.rules, stage.key);
    const stopOnProofTypes = proofRule?.stopOnProofTypes ?? [];
    const targetMinutes =
      stage.key === "first_touch"
        ? Math.max(1, wizard.responseTerms.stage1TargetMinutes)
        : existing?.targetMinutes ?? stage.defaultTargetMinutes;

    await tx.sLAStageDefinition.upsert({
      where: {
        flowId_key: {
          flowId,
          key: stage.key,
        },
      },
      create: {
        flowId,
        key: stage.key,
        name: stage.name,
        targetMinutes,
        businessHoursEnabled: existing?.businessHoursEnabled ?? true,
        stopOnProofTypes: stopOnProofTypes as Prisma.InputJsonValue,
      },
      update: {
        targetMinutes,
        stopOnProofTypes: stopOnProofTypes as Prisma.InputJsonValue,
      },
    });
  }

  for (const rule of wizard.escalation.rules) {
    const remindAtPct = Math.max(1, Math.floor(rule.remindAtPct));
    const reassignAtPct = Math.max(remindAtPct, Math.floor(rule.reassignAtPct));
    const managerAlertAtPct = Math.max(reassignAtPct, Math.floor(rule.managerAlertAtPct));

    await tx.escalationRule.upsert({
      where: {
        flowId_stageKey: {
          flowId,
          stageKey: rule.stageKey,
        },
      },
      create: {
        flowId,
        stageKey: rule.stageKey,
        enabled: rule.enabled,
        remindAtPct,
        reassignAtPct,
        managerAlertAtPct,
      },
      update: {
        enabled: rule.enabled,
        remindAtPct,
        reassignAtPct,
        managerAlertAtPct,
      },
    });
  }
}

export async function createFlowWithDefaults(
  workspaceId: string,
  name: string,
  actorUserId?: string
) {
  return prisma.$transaction(async (tx) => {
    const wizard = createDefaultFlowWizardState();
    const flow = await tx.flow.create({
      data: {
        workspaceId,
        name: name.trim(),
        isActive: false,
        publishedAt: null,
        lastEditedByUserId: actorUserId ?? null,
        config: mergeWizardStateIntoFlowConfig(null, wizard),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        publishedAt: true,
        lastEditedByUserId: true,
        updatedAt: true,
      },
    });

    await syncFlowRuntimeFromWizardState(tx, flow.id, wizard);

    return flow;
  });
}

export async function setFlowActiveState(params: {
  workspaceId: string;
  flowId: string;
  isActive: boolean;
  actorUserId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const flow = await tx.flow.findFirst({
      where: {
        id: params.flowId,
        workspaceId: params.workspaceId,
      },
      select: { id: true },
    });

    if (!flow) return null;

    if (params.isActive) {
      await tx.flow.updateMany({
        where: { workspaceId: params.workspaceId },
        data: { isActive: false },
      });
    }

    return tx.flow.update({
      where: { id: params.flowId },
      data: {
        isActive: params.isActive,
        publishedAt: params.isActive ? new Date() : undefined,
        lastEditedByUserId: params.actorUserId ?? undefined,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        publishedAt: true,
        lastEditedByUserId: true,
        updatedAt: true,
        lastEditedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export function validateWizardForPublish(wizard: FlowWizardState) {
  const errors: FlowWizardValidationError[] = [];

  if (wizard.input.enabledSources.length === 0) {
    errors.push({
      path: "input.enabledSources",
      message: "Selecteaza cel putin o sursa de intrare.",
    });
  }
  if (
    wizard.routing.eligibleAgents.length === 0 &&
    !wizard.routing.fallbackOwnerUserId
  ) {
    errors.push({
      path: "routing.eligibleAgents",
      message: "Configureaza repartizarea: agenti eligibili sau fallback.",
    });
  }
  if (wizard.responseTerms.stage1TargetMinutes <= 0) {
    errors.push({
      path: "responseTerms.stage1TargetMinutes",
      message: "TargetMinutes pentru etapa First touch trebuie sa fie > 0.",
    });
  }

  for (const [source, value] of Object.entries(wizard.responseTerms.perSourceOverrides)) {
    if (value !== null && value <= 0) {
      errors.push({
        path: `responseTerms.perSourceOverrides.${source}`,
        message: `Override-ul SLA pentru sursa ${source} trebuie sa fie > 0.`,
      });
    }
  }

  for (const rule of wizard.escalation.rules) {
    if (!rule.enabled) continue;

    const stageName =
      FLOW_STAGE_TEMPLATES.find((stage) => stage.key === rule.stageKey)?.name ?? rule.stageKey;

    const inRange =
      rule.remindAtPct >= 0 &&
      rule.remindAtPct <= 100 &&
      rule.reassignAtPct >= 0 &&
      rule.reassignAtPct <= 100 &&
      rule.managerAlertAtPct >= 0 &&
      rule.managerAlertAtPct <= 100;
    if (!inRange) {
      errors.push({
        path: `escalation.rules.${rule.stageKey}`,
        message: `Escaladare invalida pentru etapa ${stageName}: pragurile trebuie sa fie intre 0 si 100.`,
      });
      continue;
    }
    if (!(rule.remindAtPct < rule.reassignAtPct && rule.reassignAtPct < rule.managerAlertAtPct)) {
      errors.push({
        path: `escalation.rules.${rule.stageKey}`,
        message: `Escaladare invalida pentru etapa ${stageName}: pragurile trebuie sa fie crescatoare (reminder < reasignare < manager alert).`,
      });
    }
  }

  const firstTouchProof = wizard.proof.rules.find((rule) => rule.stageKey === "first_touch");
  if (!firstTouchProof || firstTouchProof.stopOnProofTypes.length === 0) {
    errors.push({
      path: "proof.rules.first_touch.stopOnProofTypes",
      message: "Configureaza cel putin un tip de dovada pentru etapa First touch.",
    });
  }

  if (wizard.booking.enabled && wizard.booking.provider === "NONE") {
    errors.push({
      path: "booking.provider",
      message: "Alege un provider de programare daca Programare este activ.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function readFlowWizardState(params: {
  workspaceId: string;
  flowId: string;
  tx?: TxOrClient;
}) {
  const tx = params.tx ?? prisma;
  const flow = await tx.flow.findFirst({
    where: { id: params.flowId, workspaceId: params.workspaceId },
    select: {
      id: true,
      name: true,
      isActive: true,
      publishedAt: true,
      updatedAt: true,
      config: true,
      slaStageDefinitions: {
        select: {
          key: true,
          targetMinutes: true,
          stopOnProofTypes: true,
        },
      },
      escalationRules: {
        select: {
          stageKey: true,
          remindAtPct: true,
          reassignAtPct: true,
          managerAlertAtPct: true,
          enabled: true,
        },
      },
    },
  });

  if (!flow) return null;

  return {
    flow,
    wizard: extractWizardStateFromFlow({
      config: flow.config,
      stageDefinitions: flow.slaStageDefinitions,
      escalationRules: flow.escalationRules,
    }),
  };
}

function buildDuplicateFlowName(sourceName: string) {
  const trimmed = sourceName.trim();
  return trimmed.length > 0 ? `${trimmed} (copie)` : "Flux nou (copie)";
}

export async function duplicateFlowAsDraft(params: {
  workspaceId: string;
  sourceFlowId: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const payload = await readFlowWizardState({
      workspaceId: params.workspaceId,
      flowId: params.sourceFlowId,
      tx,
    });
    if (!payload) return null;

    const sanitizedWizard = await sanitizeRoutingUsersForWorkspace(
      tx,
      params.workspaceId,
      payload.wizard
    );

    const duplicated = await tx.flow.create({
      data: {
        workspaceId: params.workspaceId,
        name: buildDuplicateFlowName(payload.flow.name),
        isActive: false,
        publishedAt: null,
        lastEditedByUserId: params.actorUserId,
        config: mergeWizardStateIntoFlowConfig(payload.flow.config, sanitizedWizard),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        publishedAt: true,
        lastEditedByUserId: true,
        updatedAt: true,
        lastEditedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await syncFlowRuntimeFromWizardState(tx, duplicated.id, sanitizedWizard);

    return duplicated;
  });
}
