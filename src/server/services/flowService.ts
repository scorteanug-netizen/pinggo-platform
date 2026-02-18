import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  createFlowWithDefaults,
  mergeWizardStateIntoFlowConfig,
  readFlowWizardState,
  sanitizeRoutingUsersForWorkspace,
  syncFlowRuntimeFromWizardState,
  validateWizardForPublish,
} from "./flowWizardService";
import { createDefaultFlowWizardState } from "@/lib/flows/wizard";

export async function createFlow(workspaceId: string, name: string, actorUserId?: string) {
  return createFlowWithDefaults(workspaceId, name, actorUserId);
}

/**
 * Creează un flow implicit activ pentru un workspace nou.
 * Îl marchează isActive=true și setează defaultFlowId în WorkspaceSettings.
 * first_touch: 15 min SLA, handover: 60 min SLA.
 */
export async function setupDefaultFlowForWorkspace(
  workspaceId: string,
  ownerUserId?: string
) {
  return prisma.$transaction(async (tx) => {
    const wizard = createDefaultFlowWizardState();
    // Override SLA-uri: first_touch 15 min, handover 60 min
    wizard.responseTerms.stage1TargetMinutes = 15;

    const flow = await tx.flow.create({
      data: {
        workspaceId,
        name: "Flow implicit",
        isActive: true,
        publishedAt: new Date(),
        lastEditedByUserId: ownerUserId ?? null,
        config: mergeWizardStateIntoFlowConfig(null, wizard),
      },
      select: { id: true },
    });

    // Creează stage definitions: first_touch (15 min) + handover (60 min)
    await tx.sLAStageDefinition.createMany({
      data: [
        {
          flowId: flow.id,
          key: "first_touch",
          name: "Primul contact",
          targetMinutes: 15,
          businessHoursEnabled: true,
          stopOnProofTypes: ["message_sent", "call_logged"] as Prisma.InputJsonValue,
        },
        {
          flowId: flow.id,
          key: "handover",
          name: "Transfer operator",
          targetMinutes: 60,
          businessHoursEnabled: true,
          stopOnProofTypes: ["manual_proof_note", "meeting_created"] as Prisma.InputJsonValue,
        },
      ],
    });

    // Creează escalation rules pentru fiecare stage
    await tx.escalationRule.createMany({
      data: [
        {
          flowId: flow.id,
          stageKey: "first_touch",
          enabled: true,
          remindAtPct: 50,
          reassignAtPct: 75,
          managerAlertAtPct: 100,
        },
        {
          flowId: flow.id,
          stageKey: "handover",
          enabled: true,
          remindAtPct: 50,
          reassignAtPct: 75,
          managerAlertAtPct: 100,
        },
      ],
    });

    // Upsert WorkspaceSettings cu defaultFlowId
    await tx.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, defaultFlowId: flow.id },
      update: { defaultFlowId: flow.id },
    });

    return flow;
  });
}

export async function publishFlow(flowId: string, workspaceId: string, actorUserId?: string) {
  return prisma.$transaction(async (tx) => {
    const payload = await readFlowWizardState({ workspaceId, flowId, tx });
    if (!payload) return null;

    const sanitizedWizard = await sanitizeRoutingUsersForWorkspace(
      tx,
      workspaceId,
      payload.wizard
    );
    const validation = validateWizardForPublish(sanitizedWizard);
    if (!validation.valid) {
      throw new Error(
        validation.errors
          .map((error) => `${error.path}: ${error.message}`)
          .join(" ")
      );
    }

    await syncFlowRuntimeFromWizardState(tx, flowId, sanitizedWizard);

    await tx.flow.updateMany({
      where: { workspaceId },
      data: { isActive: false },
    });

    return tx.flow.update({
      where: { id: flowId },
      data: {
        isActive: true,
        publishedAt: new Date(),
        lastEditedByUserId: actorUserId ?? undefined,
        config: mergeWizardStateIntoFlowConfig(payload.flow.config, sanitizedWizard),
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
  });
}
