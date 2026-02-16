import { createHash } from "crypto";
import {
  AutopilotRunStatus,
  LeadSourceType,
  LeadStatus,
  OutboundChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getDefaultScenario } from "@/server/services/autopilot/getDefaultScenario";

const listLeadsQuerySchema = z.object({
  workspaceId: z.string().trim().min(1),
  q: z.string().trim().min(1).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  sla: z.enum(["running", "stopped", "breached"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["createdAt_desc"]).default("createdAt_desc"),
});

type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

const ingestLeadSchema = z.object({
  workspaceId: z.string().trim().min(1),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  externalId: z.string().trim().min(1).optional(),
});

type IngestLeadPayload = z.infer<typeof ingestLeadSchema>;

type LeadIngestResponse = {
  leadId: string;
  sla: {
    startedAt: string;
    deadlineAt: string;
  };
  idempotency: {
    reused: boolean;
  };
};

const IDEMPOTENCY_STATUS_IN_PROGRESS = "IN_PROGRESS";
const IDEMPOTENCY_STATUS_COMPLETED = "COMPLETED";
const WORKSPACE_NOT_FOUND_ERROR = "WORKSPACE_NOT_FOUND";
const AUTOPILOT_WELCOME_TEXT =
  "Salut! Sunt asistentul virtual Pinggo. Am primit solicitarea ta si revenim imediat cu urmatorii pasi.";

function buildListLeadsWhere(query: ListLeadsQuery): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    workspaceId: query.workspaceId,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.q) {
    where.OR = [
      { firstName: { contains: query.q, mode: "insensitive" } },
      { lastName: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
      { phone: { contains: query.q, mode: "insensitive" } },
      { externalId: { contains: query.q, mode: "insensitive" } },
    ];
  }

  if (query.sla === "running") {
    where.slaState = {
      is: {
        stoppedAt: null,
        breachedAt: null,
      },
    };
  } else if (query.sla === "stopped") {
    where.slaState = {
      is: {
        stoppedAt: { not: null },
      },
    };
  } else if (query.sla === "breached") {
    where.slaState = {
      is: {
        breachedAt: { not: null },
        stoppedAt: null,
      },
    };
  }

  return where;
}

function buildRequestHash(payload: IngestLeadPayload) {
  const hashPayload = {
    workspaceId: payload.workspaceId,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    source: payload.source ?? null,
    externalId: payload.externalId ?? null,
  };
  return createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex");
}

function readStoredResponse(responseJson: Prisma.JsonValue | null): LeadIngestResponse | null {
  if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
    return null;
  }

  const parsed = responseJson as Partial<LeadIngestResponse>;
  if (
    typeof parsed.leadId !== "string" ||
    typeof parsed.sla?.startedAt !== "string" ||
    typeof parsed.sla?.deadlineAt !== "string"
  ) {
    return null;
  }

  return {
    leadId: parsed.leadId,
    sla: {
      startedAt: parsed.sla.startedAt,
      deadlineAt: parsed.sla.deadlineAt,
    },
    idempotency: {
      reused: false,
    },
  };
}

function withReusedFlag(response: LeadIngestResponse) {
  return {
    ...response,
    idempotency: {
      ...response.idempotency,
      reused: true,
    },
  };
}

function isIdempotencyKeyConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  // Support both legacy engine (meta.target) and adapter-pg (meta.modelName)
  const meta = error.meta as Record<string, unknown> | undefined;
  if (!meta) return false;

  // adapter-pg: check modelName directly
  if (meta.modelName === "IdempotencyKey") {
    return true;
  }

  // legacy engine: check target array
  const target = meta.target;
  return Array.isArray(target) && target.includes("workspaceId") && target.includes("key");
}

async function createLeadWithSlaAndEvents(
  tx: Prisma.TransactionClient,
  payload: IngestLeadPayload
): Promise<LeadIngestResponse> {
  const workspace = await tx.workspace.findUnique({
    where: { id: payload.workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    throw new Error(WORKSPACE_NOT_FOUND_ERROR);
  }

  const lead = await tx.lead.create({
    data: {
      workspaceId: payload.workspaceId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      source: payload.source,
      externalId: payload.externalId,
      sourceType: LeadSourceType.API,
    },
    select: { id: true },
  });

  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + 15 * 60 * 1000);
  const startedAtIso = startedAt.toISOString();
  const deadlineAtIso = deadlineAt.toISOString();

  await tx.sLAState.create({
    data: {
      leadId: lead.id,
      startedAt,
      deadlineAt,
    },
  });

  // Fetch default scenario for workspace (creates one if needed)
  const scenario = await getDefaultScenario(tx, payload.workspaceId);

  const autopilotRun = await tx.autopilotRun.create({
    data: {
      leadId: lead.id,
      workspaceId: payload.workspaceId,
      scenarioId: scenario.id,
      status: AutopilotRunStatus.ACTIVE,
      currentStep: "welcome",
      stateJson: { node: "q1", answers: {}, questionIndex: 0 },
      lastOutboundAt: new Date(),
    },
    select: { id: true },
  });

  const outboundMessage = await tx.outboundMessage.create({
    data: {
      leadId: lead.id,
      workspaceId: payload.workspaceId,
      channel: OutboundChannel.WHATSAPP,
      toPhone: payload.phone ?? null,
      text: AUTOPILOT_WELCOME_TEXT,
      status: OutboundMessageStatus.QUEUED,
    },
    select: { id: true },
  });

  await tx.eventLog.createMany({
    data: [
      {
        leadId: lead.id,
        eventType: "lead_received",
        payload: {
          source: payload.source ?? null,
          externalId: payload.externalId ?? null,
          email: payload.email ?? null,
          phone: payload.phone ?? null,
        } as Prisma.InputJsonValue,
      },
      {
        leadId: lead.id,
        eventType: "sla_started",
        payload: {
          deadlineAt: deadlineAtIso,
        } as Prisma.InputJsonValue,
      },
      {
        leadId: lead.id,
        eventType: "autopilot_started",
        payload: {
          runId: autopilotRun.id,
          scenarioId: scenario.id,
        } as Prisma.InputJsonValue,
      },
      {
        leadId: lead.id,
        eventType: "message_queued",
        payload: {
          channel: "whatsapp",
          messageId: outboundMessage.id,
          scenarioId: scenario.id,
        } as Prisma.InputJsonValue,
      },
    ],
  });

  return {
    leadId: lead.id,
    sla: {
      startedAt: startedAtIso,
      deadlineAt: deadlineAtIso,
    },
    idempotency: {
      reused: false,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsedQuery = listLeadsQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      sla: searchParams.get("sla") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 });
    }

    const query = parsedQuery.data;
    const where = buildListLeadsWhere(query);
    const skip = (query.page - 1) * query.pageSize;

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          externalId: true,
          createdAt: true,
          status: true,
          slaState: {
            select: {
              startedAt: true,
              deadlineAt: true,
              stoppedAt: true,
              breachedAt: true,
            },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const leadIds = leads.map((lead) => lead.id);
    const lastEventAtByLeadId = new Map<string, string | null>();
    const lastProofAtByLeadId = new Map<string, string | null>();
    const autopilotByLeadId = new Map<string, { status: string; currentStep: string }>();
    const lastMessageByLeadId = new Map<string, {
      id: string;
      channel: string;
      status: string;
      toPhone: string | null;
      provider: string | null;
      providerMessageId: string | null;
      sentAt: string | null;
      createdAt: string;
    }>();

    if (leadIds.length > 0) {
      const [lastEventRows, lastProofRows, autopilotRows, lastMessageRows] = await Promise.all([
        prisma.eventLog.groupBy({
          by: ["leadId"],
          where: {
            leadId: { in: leadIds },
          },
          _max: {
            occurredAt: true,
          },
        }),
        prisma.proofEvent.groupBy({
          by: ["leadId"],
          where: {
            leadId: { in: leadIds },
          },
          _max: {
            occurredAt: true,
          },
        }),
        prisma.autopilotRun.findMany({
          where: { leadId: { in: leadIds } },
          select: {
            leadId: true,
            status: true,
            currentStep: true,
          },
        }),
        prisma.outboundMessage.findMany({
          where: { leadId: { in: leadIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["leadId"],
          select: {
            id: true,
            leadId: true,
            channel: true,
            status: true,
            toPhone: true,
            provider: true,
            providerMessageId: true,
            sentAt: true,
            createdAt: true,
          },
        }),
      ]);

      for (const row of lastEventRows) {
        lastEventAtByLeadId.set(
          row.leadId,
          row._max.occurredAt ? row._max.occurredAt.toISOString() : null
        );
      }

      for (const row of lastProofRows) {
        lastProofAtByLeadId.set(
          row.leadId,
          row._max.occurredAt ? row._max.occurredAt.toISOString() : null
        );
      }

      for (const row of autopilotRows) {
        autopilotByLeadId.set(row.leadId, {
          status: row.status,
          currentStep: row.currentStep,
        });
      }

      for (const row of lastMessageRows) {
        lastMessageByLeadId.set(row.leadId, {
          id: row.id,
          channel: row.channel,
          status: row.status,
          toPhone: row.toPhone,
          provider: row.provider,
          providerMessageId: row.providerMessageId,
          sentAt: row.sentAt ? row.sentAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }

    return NextResponse.json({
      items: leads.map((lead) => {
        const slaStatus = !lead.slaState
          ? "none"
          : lead.slaState.stoppedAt
            ? "stopped"
            : lead.slaState.breachedAt
              ? "breached"
              : "running";

        return {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          externalId: lead.externalId,
          createdAt: lead.createdAt.toISOString(),
          status: lead.status,
          slaStatus,
          sla: lead.slaState
            ? {
                startedAt: lead.slaState.startedAt.toISOString(),
                deadlineAt: lead.slaState.deadlineAt.toISOString(),
                stoppedAt: lead.slaState.stoppedAt ? lead.slaState.stoppedAt.toISOString() : null,
                breachedAt: lead.slaState.breachedAt ? lead.slaState.breachedAt.toISOString() : null,
              }
            : null,
          lastEventAt: lastEventAtByLeadId.get(lead.id) ?? null,
          lastProofAt: lastProofAtByLeadId.get(lead.id) ?? null,
          autopilot: autopilotByLeadId.get(lead.id) ?? null,
          lastMessage: lastMessageByLeadId.get(lead.id) ?? null,
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = ingestLeadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || null;

    if (!idempotencyKey) {
      const createdResponse = await prisma.$transaction((tx) =>
        createLeadWithSlaAndEvents(tx, payload)
      );
      return NextResponse.json(createdResponse, { status: 201 });
    }

    const requestHash = buildRequestHash(payload);
    const idempotencyWhere = {
      workspaceId_key: {
        workspaceId: payload.workspaceId,
        key: idempotencyKey,
      },
    } as const;

    try {
      const createdResponse = await prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            workspaceId: payload.workspaceId,
            key: idempotencyKey,
            requestHash,
            status: IDEMPOTENCY_STATUS_IN_PROGRESS,
          },
        });

        const response = await createLeadWithSlaAndEvents(tx, payload);

        await tx.idempotencyKey.update({
          where: idempotencyWhere,
          data: {
            status: IDEMPOTENCY_STATUS_COMPLETED,
            responseJson: response as Prisma.InputJsonValue,
          },
        });

        return response;
      });

      return NextResponse.json(createdResponse, { status: 201 });
    } catch (error) {
      if (isIdempotencyKeyConflict(error)) {
        const stored = await prisma.idempotencyKey.findUnique({
          where: idempotencyWhere,
          select: {
            requestHash: true,
            status: true,
            responseJson: true,
          },
        });

        if (stored && stored.requestHash !== requestHash) {
          return NextResponse.json(
            { error: "Idempotency key was already used with a different request payload." },
            { status: 409 }
          );
        }

        const storedResponse = readStoredResponse(stored?.responseJson ?? null);
        if (storedResponse) {
          return NextResponse.json(withReusedFlag(storedResponse), { status: 200 });
        }

        return NextResponse.json(
          {
            error:
              stored?.status === IDEMPOTENCY_STATUS_IN_PROGRESS
                ? "Idempotent request is still being processed. Retry shortly."
                : "Idempotent request has no stored response yet. Retry shortly.",
          },
          { status: 409 }
        );
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === WORKSPACE_NOT_FOUND_ERROR) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
