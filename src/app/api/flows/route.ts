import { NextRequest, NextResponse } from "next/server";
import { createFlowSchema } from "@/lib/validations/flows";
import { createFlow } from "@/server/services/flowService";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const { workspaceId } = await requirePermission("canViewFlows");

    const flows = await prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        publishedAt: true,
        lastEditedByUserId: true,
        updatedAt: true,
        lastEditedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({
      flows: flows.map((flow) => ({
        ...flow,
        isDraft: flow.publishedAt === null,
        lastEditedAt: flow.updatedAt,
      })),
    });
  } catch (e) {
    if (isWorkspaceAccessError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createFlowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { workspaceId, userId } = await requirePermission("canEditFlows", {
      requestedWorkspaceId: parsed.data.workspaceId ?? null,
    });

    const flow = await createFlow(workspaceId, parsed.data.name, userId);
    return NextResponse.json(
      {
        ...flow,
        workspaceId,
        isDraft: flow.publishedAt === null,
        lastEditedAt: flow.updatedAt,
      },
      { status: 201 }
    );
  } catch (e) {
    if (isWorkspaceAccessError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
