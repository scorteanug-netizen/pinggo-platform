import { MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { listLeadsQuerySchema } from "@/lib/validations/leads";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { buildLeadOrderBy, buildLeadWhereInput } from "@/server/services/leadService";
import { logger } from "@/lib/logger";

const FIRST_TOUCH_PROOF_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
] as const;

const MAX_EXPORT_ROWS = 50_000;

function parseDateFilter(value: string | undefined, mode: "from" | "to") {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return mode === "from"
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(`${value}T23:59:59.999Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildCsvContent(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

function formatDateIso(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

function computeFirstTouchTimeMinutes(events: Array<{ type: string; createdAt: Date }>) {
  const leadReceived = events.find((event) => event.type === "lead_received");
  if (!leadReceived) return "";

  const firstTouchProof = events.find(
    (event) =>
      FIRST_TOUCH_PROOF_TYPES.includes(event.type as (typeof FIRST_TOUCH_PROOF_TYPES)[number]) &&
      event.createdAt.getTime() >= leadReceived.createdAt.getTime()
  );
  if (!firstTouchProof) return "";

  const diffMinutes =
    (firstTouchProof.createdAt.getTime() - leadReceived.createdAt.getTime()) / (60 * 1000);
  if (diffMinutes < 0) return "";
  return diffMinutes.toFixed(1);
}

function pickCurrentStage(
  stages: Array<{ stageKey: string; status: string; dueAt: Date; startedAt: Date }>
) {
  const running = stages.find((stage) => stage.status === "RUNNING");
  if (running) return running;
  const breached = stages.find((stage) => stage.status === "BREACHED");
  if (breached) return breached;
  return stages[0] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePermission("canViewLeads");
    const { workspaceId, membershipRole, userId } = context;

    const searchParams = request.nextUrl.searchParams;
    const parsed = listLeadsQuerySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      dir: searchParams.get("dir") ?? undefined,
      stage: searchParams.get("stage") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      breach: searchParams.get("breach") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      ownerUserId: searchParams.get("ownerUserId") ?? undefined,
      sourceType: searchParams.get("sourceType") ?? undefined,
      breached: searchParams.get("breached") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const query = parsed.data;

    if (
      membershipRole === MembershipRole.AGENT &&
      query.ownerId &&
      query.ownerId !== userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const where = buildLeadWhereInput({
      workspaceId,
      viewerRole: membershipRole,
      viewerUserId: userId,
      q: query.q,
      stage: query.stage,
      status: query.status,
      ownerId: query.ownerId,
      source: query.source,
      breach: query.breach === "true" ? true : query.breach === "false" ? false : undefined,
      dateFrom: parseDateFilter(query.dateFrom, "from"),
      dateTo: parseDateFilter(query.dateTo, "to"),
    });

    const totalCount = await prisma.lead.count({ where });
    if (totalCount > MAX_EXPORT_ROWS) {
      return NextResponse.json(
        {
          error: `Prea multe rezultate pentru export (${totalCount}). Limita este ${MAX_EXPORT_ROWS}. Ajusteaza filtrele.`,
        },
        { status: 400 }
      );
    }

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        externalId: true,
        sourceType: true,
        status: true,
        createdAt: true,
        identity: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true,
          },
        },
        ownerUser: {
          select: {
            name: true,
            email: true,
          },
        },
        slaStageInstances: {
          select: {
            stageKey: true,
            status: true,
            dueAt: true,
            startedAt: true,
          },
          orderBy: {
            startedAt: "desc",
          },
        },
        events: {
          where: {
            type: {
              in: ["lead_received", ...FIRST_TOUCH_PROOF_TYPES],
            },
          },
          select: {
            type: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: buildLeadOrderBy(query.sort, query.dir),
      take: MAX_EXPORT_ROWS,
    });

    const headers = [
      "leadId",
      "externalId",
      "name",
      "email",
      "phone",
      "company",
      "source",
      "owner",
      "status",
      "createdAt",
      "currentStage",
      "dueAt",
      "breached",
      "firstTouchTimeMinutes",
    ];

    const rows = leads.map((lead) => {
      const currentStage = pickCurrentStage(lead.slaStageInstances);
      const breachedFlag = lead.slaStageInstances.some((stage) => stage.status === "BREACHED");
      const ownerLabel = lead.ownerUser?.name || lead.ownerUser?.email || "";
      const firstTouchTimeMinutes = computeFirstTouchTimeMinutes(lead.events);

      return [
        lead.id,
        lead.externalId ?? "",
        lead.identity?.name ?? "",
        lead.identity?.email ?? "",
        lead.identity?.phone ?? "",
        lead.identity?.company ?? "",
        lead.sourceType,
        ownerLabel,
        lead.status,
        formatDateIso(lead.createdAt),
        currentStage?.stageKey ?? "",
        formatDateIso(currentStage?.dueAt),
        breachedFlag ? "true" : "false",
        firstTouchTimeMinutes,
      ];
    });

    const csvContent = buildCsvContent(headers, rows);
    const now = new Date();
    const filename = `leads-export-${now.toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
