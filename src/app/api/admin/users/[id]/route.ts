import { NextRequest, NextResponse } from "next/server";
import { MembershipStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUserEmail, isCurrentUserSuperAdmin } from "@/server/authMode";
import { prisma } from "@/server/db";
import {
  generateInviteLifecycleLink,
  generateResetPasswordLifecycleLink,
} from "@/server/services/userLifecycleService";

const updateUserLifecycleSchema = z.object({
  action: z.enum(["resend_invite", "disable", "enable", "reset_password"]),
  workspaceId: z.string().trim().min(1),
});

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

async function disableUserEverywhere(currentUserEmail: string, targetUserId: string) {
  const [currentUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { email: currentUserEmail },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true },
    }),
  ]);

  if (!currentUser) {
    return NextResponse.json({ error: "Current user missing in local database." }, { status: 400 });
  }
  if (!targetUser) {
    return NextResponse.json({ error: "Userul nu exista." }, { status: 404 });
  }
  if (currentUser.id === targetUser.id) {
    return NextResponse.json({ error: "Nu poti dezactiva userul curent." }, { status: 400 });
  }

  await prisma.membership.updateMany({
    where: { userId: targetUser.id },
    data: {
      status: MembershipStatus.DISABLED,
      disabledAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, userId: targetUser.id, email: targetUser.email });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [authorizationError, currentUserEmail, { id: targetUserId }] = await Promise.all([
      ensureSuperAdmin(),
      getCurrentUserEmail(),
      params,
    ]);
    if (authorizationError) {
      return authorizationError;
    }
    if (!currentUserEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateUserLifecycleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const [currentUser, targetUser] = await Promise.all([
      prisma.user.findUnique({
        where: { email: currentUserEmail },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, name: true, supabaseUserId: true },
      }),
    ]);

    if (!currentUser) {
      return NextResponse.json({ error: "Current user missing in local database." }, { status: 400 });
    }
    if (!targetUser) {
      return NextResponse.json({ error: "Userul nu exista." }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: targetUser.id,
          workspaceId: parsed.data.workspaceId,
        },
      },
      select: {
        userId: true,
        workspaceId: true,
        role: true,
        status: true,
        invitedAt: true,
        acceptedAt: true,
        disabledAt: true,
        workspace: {
          select: { id: true, name: true, disabledAt: true },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Membrul nu exista in compania selectata." }, { status: 404 });
    }

    if (parsed.data.action === "disable") {
      if (currentUser.id === targetUser.id) {
        return NextResponse.json({ error: "Nu poti dezactiva userul curent." }, { status: 400 });
      }

      const updated = await prisma.membership.update({
        where: {
          userId_workspaceId: {
            userId: membership.userId,
            workspaceId: membership.workspaceId,
          },
        },
        data: {
          status: MembershipStatus.DISABLED,
          disabledAt: new Date(),
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

      return NextResponse.json({ ok: true, action: parsed.data.action, membership: updated });
    }

    if (parsed.data.action === "enable") {
      const updated = await prisma.membership.update({
        where: {
          userId_workspaceId: {
            userId: membership.userId,
            workspaceId: membership.workspaceId,
          },
        },
        data: {
          status: MembershipStatus.ACTIVE,
          disabledAt: null,
          acceptedAt: membership.acceptedAt ?? new Date(),
          invitedAt: membership.invitedAt ?? new Date(),
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

      return NextResponse.json({ ok: true, action: parsed.data.action, membership: updated });
    }

    if (parsed.data.action === "resend_invite") {
      if (membership.status !== MembershipStatus.INVITED) {
        return NextResponse.json({ error: "Invitatia poate fi retrimisa doar pentru useri invitati." }, { status: 400 });
      }
      if (membership.workspace.disabledAt) {
        return NextResponse.json({ error: "Compania este dezactivata." }, { status: 400 });
      }

      const invitePayload = await generateInviteLifecycleLink({
        email: targetUser.email,
        name: targetUser.name,
        role: membership.role,
        workspaceId: membership.workspaceId,
        workspaceName: membership.workspace.name,
        requestUrl: request.url,
      });

      if (invitePayload.supabaseUserId && invitePayload.supabaseUserId !== targetUser.supabaseUserId) {
        await prisma.user.update({
          where: { id: targetUser.id },
          data: { supabaseUserId: invitePayload.supabaseUserId },
        });
      }

      const updated = await prisma.membership.update({
        where: {
          userId_workspaceId: {
            userId: membership.userId,
            workspaceId: membership.workspaceId,
          },
        },
        data: {
          status: MembershipStatus.INVITED,
          invitedAt: new Date(),
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
        action: parsed.data.action,
        membership: updated,
        invite: {
          delivery: invitePayload.delivery,
          inviteLink: invitePayload.link,
          token: invitePayload.hashedToken,
        },
      });
    }

    if (membership.status !== MembershipStatus.ACTIVE) {
      return NextResponse.json({ error: "Resetarea parolei este disponibila doar pentru useri activi." }, { status: 400 });
    }

    const resetPayload = await generateResetPasswordLifecycleLink({
      email: targetUser.email,
      name: targetUser.name,
      requestUrl: request.url,
    });

    return NextResponse.json({
      ok: true,
      action: parsed.data.action,
      reset: {
        delivery: resetPayload.delivery,
        resetLink: resetPayload.link,
        token: resetPayload.hashedToken,
      },
      membership: {
        userId: membership.userId,
        workspaceId: membership.workspaceId,
        role: membership.role,
        status: membership.status,
        invitedAt: membership.invitedAt,
        acceptedAt: membership.acceptedAt,
        disabledAt: membership.disabledAt,
      },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [authorizationError, currentUserEmail, { id: targetUserId }] = await Promise.all([
      ensureSuperAdmin(),
      getCurrentUserEmail(),
      params,
    ]);
    if (authorizationError) {
      return authorizationError;
    }
    if (!currentUserEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return disableUserEverywhere(currentUserEmail, targetUserId);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
