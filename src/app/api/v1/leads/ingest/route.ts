import { LeadSourceType, Prisma, SLAStageDefinition } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  markWorkspaceWebhookReceived,
  resolveWorkspaceByWebhookToken,
} from "@/server/services/integrationService";
import { assignLeadFromFlowRouting } from "@/server/services/routingService";
import { startStage } from "@/server/services/slaService";
import { logger } from "@/lib/logger";

const ingestPayloadSchema = z.object({
  source: z.enum(["WEBHOOK", "FORM", "CRM", "EMAIL", "WHATSAPP", "API"]),
  externalId: z.string().trim().min(1).max(191).optional(),
  identity: z
    .object({
      name: z.string().trim().min(1).max(160).optional(),
      email: z.string().trim().email().optional(),
      phone: z.string().trim().min(3).max(50).optional(),
      company: z.string().trim().min(1).max(160).optional(),
    })
    .optional(),
  message: z.string().trim().max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

type IngestPayload = z.infer<typeof ingestPayloadSchema>;

type NormalizedIdentity = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

const SOURCE_TYPE_MAP: Record<IngestPayload["source"], LeadSourceType> = {
  WEBHOOK: "WEBHOOK",
  FORM: "FORM",
  CRM: "CRM",
  EMAIL: "EMAIL",
  WHATSAPP: "WHATSAPP",
  API: "API",
};

const FIRST_STAGE_KEY_CANDIDATES = new Set([
  "first_touch",
  "first-touch",
  "firsttouch",
  "prima_atingere",
  "intrare_lead",
]);

function normalizeEmail(email: string | undefined) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(phone: string | undefined) {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  return digits;
}

function normalizeText(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeIdentity(identity: IngestPayload["identity"]): NormalizedIdentity {
  return {
    name: normalizeText(identity?.name),
    email: normalizeEmail(identity?.email),
    phone: normalizePhone(identity?.phone),
    company: normalizeText(identity?.company),
  };
}

function hasAnyIdentity(identity: NormalizedIdentity) {
  return Boolean(identity.name || identity.email || identity.phone || identity.company);
}

function getPhoneCandidates(phone: string | null) {
  if (!phone) return [] as string[];
  if (phone.startsWith("+")) return [phone, phone.slice(1)];
  return [phone, `+${phone}`];
}

function pickInitialStageDefinition(definitions: SLAStageDefinition[]) {
  const byKey = definitions.find((definition) =>
    FIRST_STAGE_KEY_CANDIDATES.has(definition.key.toLowerCase())
  );
  if (byKey) return byKey;

  const byName = definitions.find((definition) => {
    const name = definition.name.toLowerCase();
    return name.includes("first touch") || name.includes("prima") || name.includes("intrare");
  });
  if (byName) return byName;

  return [...definitions].sort((left, right) => left.key.localeCompare(right.key))[0] ?? null;
}

function isLeadSourceTypeEnumMismatch(error: unknown) {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message: string }).message ?? "")
      : String(error ?? "");

  return /invalid input value for enum\s+\\?"LeadSourceType\\?"/.test(message);
}

async function getDefaultFlowId(tx: Prisma.TransactionClient, workspaceId: string) {
  const settings = await tx.workspaceSettings.findUnique({
    where: { workspaceId },
    select: {
      defaultFlowId: true,
    },
  });

  let flowId = settings?.defaultFlowId ?? null;
  if (flowId) {
    const exists = await tx.flow.findFirst({
      where: { id: flowId, workspaceId },
      select: { id: true },
    });
    if (!exists) {
      flowId = null;
    }
  }

  if (!flowId) {
    flowId =
      (
        await tx.flow.findFirst({
          where: { workspaceId, isActive: true },
          select: { id: true },
          orderBy: { updatedAt: "desc" },
        })
      )?.id ?? null;
  }

  if (!flowId) {
    flowId =
      (
        await tx.flow.findFirst({
          where: { workspaceId },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      )?.id ?? null;
  }

  return { flowId };
}

async function upsertLeadIdentity(params: {
  tx: Prisma.TransactionClient;
  leadId: string;
  identity: NormalizedIdentity;
  metadata: IngestPayload["metadata"];
}) {
  const { tx, leadId, identity, metadata } = params;
  if (!hasAnyIdentity(identity)) {
    return;
  }

  await tx.leadIdentity.upsert({
    where: { leadId },
    create: {
      leadId,
      name: identity.name ?? undefined,
      email: identity.email ?? undefined,
      phone: identity.phone ?? undefined,
      company: identity.company ?? undefined,
      meta: metadata as Prisma.InputJsonValue | undefined,
    },
    update: {
      name: identity.name ?? undefined,
      email: identity.email ?? undefined,
      phone: identity.phone ?? undefined,
      company: identity.company ?? undefined,
      meta: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

async function appendLeadEvent(params: {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  leadId: string;
  type: string;
  rawPayload: Prisma.InputJsonValue;
}) {
  const { tx, workspaceId, leadId, type, rawPayload } = params;
  await tx.leadEvent.create({
    data: {
      leadId,
      workspaceId,
      type,
      payload: rawPayload,
    },
  });
}

async function maybeAssignAndStartFirstStage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  leadId: string
) {
  const { flowId } = await getDefaultFlowId(tx, workspaceId);
  if (!flowId) {
    return;
  }

  await assignLeadFromFlowRouting({
    tx,
    workspaceId,
    flowId,
    leadId,
  });

  const stageDefinitions = await tx.sLAStageDefinition.findMany({
    where: { flowId },
    select: {
      id: true,
      flowId: true,
      key: true,
      name: true,
      targetMinutes: true,
      businessHoursEnabled: true,
      stopOnProofTypes: true,
    },
  });

  const initialStage = pickInitialStageDefinition(stageDefinitions);
  if (!initialStage) {
    return;
  }

  await startStage(leadId, flowId, initialStage.key, { tx });
}

async function createSpamLead(params: {
  workspaceId: string;
  sourceType: LeadSourceType;
  identity: NormalizedIdentity;
  metadata: IngestPayload["metadata"];
  rawPayload: Prisma.InputJsonValue;
}) {
  const { workspaceId, sourceType, identity, metadata, rawPayload } = params;

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        workspaceId,
        sourceType,
        status: "SPAM",
      },
      select: { id: true },
    });

    await upsertLeadIdentity({
      tx,
      leadId: lead.id,
      identity,
      metadata,
    });

    await appendLeadEvent({
      tx,
      workspaceId,
      leadId: lead.id,
      type: "lead_spam",
      rawPayload,
    });

    return lead.id;
  });
}

async function updateExistingLead(params: {
  workspaceId: string;
  leadId: string;
  identity: NormalizedIdentity;
  metadata: IngestPayload["metadata"];
  rawPayload: Prisma.InputJsonValue;
}) {
  const { workspaceId, leadId, identity, metadata, rawPayload } = params;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    await upsertLeadIdentity({
      tx,
      leadId,
      identity,
      metadata,
    });

    await appendLeadEvent({
      tx,
      workspaceId,
      leadId,
      type: "lead_updated",
      rawPayload,
    });
  });
}

async function createNewLead(params: {
  workspaceId: string;
  sourceType: LeadSourceType;
  externalId: string | null;
  identity: NormalizedIdentity;
  metadata: IngestPayload["metadata"];
  rawPayload: Prisma.InputJsonValue;
}) {
  const { workspaceId, sourceType, externalId, identity, metadata, rawPayload } = params;

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        workspaceId,
        sourceType,
        externalId,
        status: "NEW",
      },
      select: { id: true },
    });

    await upsertLeadIdentity({
      tx,
      leadId: lead.id,
      identity,
      metadata,
    });

    await appendLeadEvent({
      tx,
      workspaceId,
      leadId: lead.id,
      type: "lead_received",
      rawPayload,
    });

    await maybeAssignAndStartFirstStage(tx, workspaceId, lead.id);

    return lead.id;
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-pinggo-token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "Missing x-pinggo-token header." }, { status: 401 });
    }

    const resolvedWorkspace = await resolveWorkspaceByWebhookToken(token);
    if (!resolvedWorkspace) {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    const workspaceId = resolvedWorkspace.workspaceId;

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: "Payload JSON invalid." }, { status: 400 });
    }

    const parsed = ingestPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    const sourceType = SOURCE_TYPE_MAP[payload.source];
    const identity = normalizeIdentity(payload.identity);
    const externalId = normalizeText(payload.externalId);
    const rawPayload = rawBody as Prisma.InputJsonValue;

    const hasContact = Boolean(identity.email || identity.phone);
    if (!hasContact && !externalId) {
      const spamLeadId = await createSpamLead({
        workspaceId,
        sourceType,
        identity,
        metadata: payload.metadata,
        rawPayload,
      });

      await markWorkspaceWebhookReceived(workspaceId, {
        source: payload.source,
        leadId: spamLeadId,
      });

      return NextResponse.json({ ok: true, leadId: spamLeadId, created: false });
    }

    if (externalId) {
      const existingLeadByExternalId = await prisma.lead.findFirst({
        where: {
          workspaceId,
          sourceType,
          externalId,
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });

      if (existingLeadByExternalId) {
        await updateExistingLead({
          workspaceId,
          leadId: existingLeadByExternalId.id,
          identity,
          metadata: payload.metadata,
          rawPayload,
        });

        await markWorkspaceWebhookReceived(workspaceId, {
          source: payload.source,
          leadId: existingLeadByExternalId.id,
        });

        return NextResponse.json({ ok: true, leadId: existingLeadByExternalId.id, created: false });
      }

      try {
        const leadId = await createNewLead({
          workspaceId,
          sourceType,
          externalId,
          identity,
          metadata: payload.metadata,
          rawPayload,
        });

        await markWorkspaceWebhookReceived(workspaceId, {
          source: payload.source,
          leadId,
        });

        return NextResponse.json({ ok: true, leadId, created: true });
      } catch (error) {
        const isDuplicateExternalId =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

        if (!isDuplicateExternalId) {
          throw error;
        }

        const existingLead = await prisma.lead.findFirst({
          where: {
            workspaceId,
            sourceType,
            externalId,
          },
          select: { id: true },
          orderBy: { updatedAt: "desc" },
        });

        if (!existingLead) {
          throw error;
        }

        await updateExistingLead({
          workspaceId,
          leadId: existingLead.id,
          identity,
          metadata: payload.metadata,
          rawPayload,
        });

        await markWorkspaceWebhookReceived(workspaceId, {
          source: payload.source,
          leadId: existingLead.id,
        });

        return NextResponse.json({ ok: true, leadId: existingLead.id, created: false });
      }
    }

    const phoneCandidates = getPhoneCandidates(identity.phone);
    const dedupeIdentityClauses: Prisma.LeadIdentityWhereInput[] = [];

    if (identity.email) {
      dedupeIdentityClauses.push({
        email: { equals: identity.email, mode: "insensitive" },
      });
    }
    if (phoneCandidates.length > 0) {
      dedupeIdentityClauses.push({
        phone: { in: phoneCandidates },
      });
    }

    if (dedupeIdentityClauses.length > 0) {
      const existingLead = await prisma.lead.findFirst({
        where: {
          workspaceId,
          identity: {
            is: {
              OR: dedupeIdentityClauses,
            },
          },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });

      if (existingLead) {
        await updateExistingLead({
          workspaceId,
          leadId: existingLead.id,
          identity,
          metadata: payload.metadata,
          rawPayload,
        });

        await markWorkspaceWebhookReceived(workspaceId, {
          source: payload.source,
          leadId: existingLead.id,
        });

        return NextResponse.json({ ok: true, leadId: existingLead.id, created: false });
      }
    }

    const leadId = await createNewLead({
      workspaceId,
      sourceType,
      externalId: null,
      identity,
      metadata: payload.metadata,
      rawPayload,
    });

    await markWorkspaceWebhookReceived(workspaceId, {
      source: payload.source,
      leadId,
    });

    return NextResponse.json({ ok: true, leadId, created: true });
  } catch (error) {
    if (isLeadSourceTypeEnumMismatch(error)) {
      return NextResponse.json(
        {
          error:
            "Schema bazei de date nu include toate valorile LeadSourceType. Ruleaza sincronizarea Prisma (db push/migrate).",
        },
        { status: 503 }
      );
    }

    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
