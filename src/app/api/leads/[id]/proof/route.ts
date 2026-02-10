import { NextRequest, NextResponse } from "next/server";
import { proofEventSchema } from "@/lib/validations/leads";
import { addProofEvent } from "@/server/services/leadService";
import { prisma } from "@/server/db";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import type { ProofEventType } from "@/server/services/slaService";
import { detectBreaches } from "@/server/services/slaService";
import { detectEscalations } from "@/server/services/escalationService";
import { MembershipRole } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId, membershipRole, userId } = context;

    const { id: leadId } = await params;
    const body = await request.json();
    const parsed = proofEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        workspaceId,
        ...(membershipRole === MembershipRole.AGENT ? { ownerUserId: userId } : {}),
      },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const event = await addProofEvent(leadId, parsed.data.type as ProofEventType, parsed.data.payload);
    await detectEscalations({ workspaceId });
    await detectBreaches({ workspaceId });
    return NextResponse.json(event);
  } catch (e) {
    if (isWorkspaceAccessError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error && e.message === "LEAD_NOT_FOUND") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
