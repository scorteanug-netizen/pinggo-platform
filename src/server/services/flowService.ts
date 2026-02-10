import { prisma } from "../db";
import {
  createFlowWithDefaults,
  mergeWizardStateIntoFlowConfig,
  readFlowWizardState,
  sanitizeRoutingUsersForWorkspace,
  syncFlowRuntimeFromWizardState,
  validateWizardForPublish,
} from "./flowWizardService";

export async function createFlow(workspaceId: string, name: string, actorUserId?: string) {
  return createFlowWithDefaults(workspaceId, name, actorUserId);
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
