import { MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserEmail, isCurrentUserSuperAdmin } from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export async function POST(request: NextRequest) {
  try {
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

    const currentUser = await prisma.user.findUnique({
      where: { email: currentUserEmail },
      select: { id: true },
    });
    if (!currentUser) {
      return NextResponse.json({ error: "Current user missing in local database." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        memberships: {
          create: {
            userId: currentUser.id,
            role: MembershipRole.OWNER,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json({ ok: true, workspace }, { status: 201 });
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
