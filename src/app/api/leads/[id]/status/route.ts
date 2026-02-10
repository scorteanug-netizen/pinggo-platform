import { LeadStatus, MembershipRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";

const updateLeadStatusSchema = z.object({
  status: z.enum(["QUALIFIED", "NOT_QUALIFIED"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId, membershipRole, userId } = context;

    const { id: leadId } = await params;
    const body = await request.json();
    const parsed = updateLeadStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingLead = await tx.lead.findFirst({
        where: {
          id: leadId,
          workspaceId,
          ...(membershipRole === MembershipRole.AGENT ? { ownerUserId: userId } : {}),
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!existingLead) {
        throw new Error("LEAD_NOT_FOUND");
      }

      const nextStatus = parsed.data.status as LeadStatus;
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: nextStatus,
        },
        select: {
          id: true,
          status: true,
        },
      });

      const event = await tx.leadEvent.create({
        data: {
          leadId,
          workspaceId,
          type: "status_changed",
          payload: {
            fromStatus: existingLead.status,
            toStatus: nextStatus,
            note: parsed.data.note ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        lead: updatedLead,
        event,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "LEAD_NOT_FOUND") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
