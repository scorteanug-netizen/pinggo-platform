import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserAndWorkspace, isWorkspaceAccessError } from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const context = await getCurrentUserAndWorkspace();
    const { userId, workspaceId } = context;

    const body = await request.json();
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await prisma.membership.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { isAvailable: parsed.data.isAvailable },
    });

    return NextResponse.json({ ok: true, isAvailable: parsed.data.isAvailable });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const context = await getCurrentUserAndWorkspace();
    const { userId, workspaceId } = context;

    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { isAvailable: true },
    });

    return NextResponse.json({ isAvailable: membership?.isAvailable ?? true });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
