import { NextRequest, NextResponse } from "next/server";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { getReportsSummary, resolveReportDateRange } from "@/server/services/reportService";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requirePermission("canViewReports");

    const fromInput = request.nextUrl.searchParams.get("from");
    const toInput = request.nextUrl.searchParams.get("to");
    const { from, to } = resolveReportDateRange(fromInput, toInput);

    const summary = await getReportsSummary({
      workspaceId,
      from,
      to,
    });

    return NextResponse.json(summary);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
