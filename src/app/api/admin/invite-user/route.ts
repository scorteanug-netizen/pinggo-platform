import { MembershipRole, MembershipStatus, UserGlobalRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWorkspaceAccessError, requirePermission } from "@/server/authMode";
import { prisma } from "@/server/db";
import { generateInviteLifecycleLink } from "@/server/services/userLifecycleService";
import { logger } from "@/lib/logger";

const inviteUserSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.nativeEnum(MembershipRole),
  workspaceId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = inviteUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const context = await requirePermission("canInviteUsers", {
      requestedWorkspaceId: parsed.data.workspaceId,
    });

    const email = parsed.data.email.toLowerCase();
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: context.workspaceId,
        disabledAt: null,
      },
      select: { id: true, name: true },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Compania este dezactivata sau invalida." }, { status: 400 });
    }

    let invitePayload;
    try {
      invitePayload = await generateInviteLifecycleLink({
        email,
        name: parsed.data.name ?? null,
        role: parsed.data.role,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        requestUrl: request.url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nu am putut genera invitatia.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: parsed.data.name ?? null,
        globalRole: UserGlobalRole.USER,
        supabaseUserId: invitePayload.supabaseUserId,
      },
      update: {
        name: parsed.data.name ?? undefined,
        supabaseUserId: invitePayload.supabaseUserId ?? undefined,
      },
      select: { id: true, email: true, name: true },
    });

    const now = new Date();
    const membership = await prisma.membership.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: workspace.id,
        },
      },
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        role: parsed.data.role,
        status: MembershipStatus.INVITED,
        invitedAt: now,
        acceptedAt: null,
        disabledAt: null,
      },
      update: {
        role: parsed.data.role,
        status: MembershipStatus.INVITED,
        invitedAt: now,
        acceptedAt: null,
        disabledAt: null,
      },
      select: {
        userId: true,
        workspaceId: true,
        role: true,
        status: true,
        invitedAt: true,
        acceptedAt: true,
        disabledAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      membership,
      invite: {
        delivery: invitePayload.delivery,
        inviteLink: invitePayload.link,
        token: invitePayload.hashedToken,
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
