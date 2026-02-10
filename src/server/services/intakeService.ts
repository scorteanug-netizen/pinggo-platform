import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assignLeadFromFlowRouting } from "./routingService";
import { startStage } from "./slaService";

type WebhookPayload = {
  externalId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  meta?: Record<string, unknown>;
};

function normalizeText(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickInitialStageKey(stageKeys: string[]) {
  const preferred = [
    "first_touch",
    "handover",
    "qualification",
    "next_step_scheduled",
    "follow_up_closure",
  ];
  for (const key of preferred) {
    if (stageKeys.includes(key)) return key;
  }
  return stageKeys.sort((left, right) => left.localeCompare(right))[0] ?? null;
}

export async function createLeadFromWebhook(workspaceId: string, flowId: string, payload: WebhookPayload) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        workspaceId,
        externalId: normalizeText(payload.externalId) ?? null,
        sourceType: "WEBHOOK",
        status: "NEW",
      },
      select: { id: true },
    });

    const hasIdentity = Boolean(payload.name || payload.email || payload.phone || payload.company || payload.meta);
    if (hasIdentity) {
      await tx.leadIdentity.create({
        data: {
          leadId: lead.id,
          name: normalizeText(payload.name),
          email: normalizeText(payload.email)?.toLowerCase(),
          phone: normalizeText(payload.phone),
          company: normalizeText(payload.company),
          meta: (payload.meta ?? {}) as Prisma.InputJsonValue,
        },
      });
    }

    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        workspaceId,
        type: "lead_received",
        payload: {
          sourceType: "WEBHOOK",
          message: null,
          metadata: payload.meta ?? {},
        } as Prisma.InputJsonValue,
      },
    });

    await assignLeadFromFlowRouting({
      tx,
      workspaceId,
      flowId,
      leadId: lead.id,
    });

    const stageDefinitions = await tx.sLAStageDefinition.findMany({
      where: { flowId },
      select: { key: true },
    });
    const initialStageKey = pickInitialStageKey(stageDefinitions.map((stage) => stage.key));
    if (initialStageKey) {
      await startStage(lead.id, flowId, initialStageKey, { tx });
    }

    return lead;
  });
}
