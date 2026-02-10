import { NextRequest, NextResponse } from "next/server";
import { MembershipRole } from "@prisma/client";
import { listLeadsQuerySchema } from "@/lib/validations/leads";
import { queryLeads } from "@/server/services/leadService";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { detectBreaches } from "@/server/services/slaService";
import { detectEscalations } from "@/server/services/escalationService";

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

export async function GET(request: NextRequest) {
  try {
    const context = await requirePermission("canViewLeads");
    const { workspaceId, membershipRole, userId } = context;

    await detectEscalations({ workspaceId });
    await detectBreaches({ workspaceId });

    const searchParams = request.nextUrl.searchParams;
    const parsed = listLeadsQuerySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      dir: searchParams.get("dir") ?? undefined,
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

    const leads = await queryLeads({
      workspaceId,
      viewerUserId: userId,
      viewerRole: membershipRole,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      dir: query.dir,
      status: query.status,
      ownerId: query.ownerId,
      source: query.source,
      breach: query.breach === "true" ? true : query.breach === "false" ? false : undefined,
      dateFrom: parseDateFilter(query.dateFrom, "from"),
      dateTo: parseDateFilter(query.dateTo, "to"),
    });
    return NextResponse.json(leads);
  } catch (e) {
    if (isWorkspaceAccessError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
