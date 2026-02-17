import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserEmail, isCurrentUserSuperAdmin } from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const updateCompanyStatusSchema = z.object({
  action: z.enum(["disable", "enable"]),
});

type CompanyAction = z.infer<typeof updateCompanyStatusSchema>["action"];

async function ensureSuperAdmin() {
  const [currentUserEmail, superAdmin] = await Promise.all([
    getCurrentUserEmail(),
    isCurrentUserSuperAdmin(),
  ]);
  if (!currentUserEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!superAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

async function updateCompanyStatus(workspaceId: string, action: CompanyAction) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, disabledAt: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Compania nu exista." }, { status: 404 });
  }

  if (action === "disable") {
    if (!workspace.disabledAt) {
      const totalActiveWorkspaces = await prisma.workspace.count({
        where: { disabledAt: null },
      });
      if (totalActiveWorkspaces <= 1) {
        return NextResponse.json(
          { error: "Nu poti dezactiva ultima companie activa din platforma." },
          { status: 400 }
        );
      }
    }

    const updatedWorkspace = workspace.disabledAt
      ? workspace
      : await prisma.workspace.update({
          where: { id: workspace.id },
          data: { disabledAt: new Date() },
          select: { id: true, name: true, disabledAt: true },
        });

    return NextResponse.json({
      ok: true,
      action,
      workspace: {
        id: updatedWorkspace.id,
        name: updatedWorkspace.name,
        disabledAt: updatedWorkspace.disabledAt,
      },
    });
  }

  const updatedWorkspace = workspace.disabledAt
    ? await prisma.workspace.update({
        where: { id: workspace.id },
        data: { disabledAt: null },
        select: { id: true, name: true, disabledAt: true },
      })
    : workspace;

  return NextResponse.json({
    ok: true,
    action,
    workspace: {
      id: updatedWorkspace.id,
      name: updatedWorkspace.name,
      disabledAt: updatedWorkspace.disabledAt,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [authorizationError, { id: workspaceId }] = await Promise.all([ensureSuperAdmin(), params]);
    if (authorizationError) {
      return authorizationError;
    }

    const body = await request.json().catch(() => null);
    const parsed = updateCompanyStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    return updateCompanyStatus(workspaceId, parsed.data.action);
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [authorizationError, { id: workspaceId }] = await Promise.all([ensureSuperAdmin(), params]);
    if (authorizationError) {
      return authorizationError;
    }

    return updateCompanyStatus(workspaceId, "disable");
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
