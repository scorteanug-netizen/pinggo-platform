import { NextRequest, NextResponse } from "next/server";
import { getLeadDetailScoped } from "@/server/services/leadService";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { detectBreaches } from "@/server/services/slaService";
import { detectEscalations } from "@/server/services/escalationService";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requirePermission("canViewLeads");
    const { workspaceId, userId, membershipRole } = context;
    await detectEscalations({ workspaceId });
    await detectBreaches({ workspaceId });
    const { id: leadId } = await params;
    const lead = await getLeadDetailScoped(leadId, workspaceId, {
      userId,
      role: membershipRole,
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch (e) {
    if (isWorkspaceAccessError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
