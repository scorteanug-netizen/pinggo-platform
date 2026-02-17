import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  WORKSPACE_COOKIE_NAME,
  getCurrentUserAndWorkspace,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const selectWorkspaceSchema = z.object({
  workspaceId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = selectWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const context = await getCurrentUserAndWorkspace({
      requestedWorkspaceId: parsed.data.workspaceId,
    });

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: context.workspaceId,
        disabledAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Companie inexistenta." }, { status: 404 });
    }

    const response = NextResponse.json({
      ok: true,
      workspace,
    });

    response.cookies.set({
      name: WORKSPACE_COOKIE_NAME,
      value: workspace.id,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
