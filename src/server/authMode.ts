import { cookies } from "next/headers";
import { MembershipRole, MembershipStatus, UserGlobalRole } from "@prisma/client";
import {
  getPermissionsForContext,
  hasPermission,
  type AppRole,
  type PermissionKey,
  type PermissionSet,
} from "@/lib/rbac";
import { isConfiguredSuperAdminEmail } from "@/lib/supabase/env.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "./db";

export const WORKSPACE_COOKIE_NAME = "pinggo_workspace_id";

export function isAuthBypassed() {
  return false;
}

type CurrentIdentity = {
  supabaseUserId: string;
  email: string;
  name: string | null;
};

async function getCurrentIdentity(): Promise<CurrentIdentity | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const email = data.user.email.trim().toLowerCase();
  const metadataName =
    typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name.trim() : "";

  return {
    supabaseUserId: data.user.id,
    email,
    name: metadataName || null,
  };
}

async function getCurrentLocalUser() {
  const identity = await getCurrentIdentity();
  if (!identity) return null;

  const shouldBeSuperAdmin = isConfiguredSuperAdminEmail(identity.email);

  return prisma.user.upsert({
    where: { email: identity.email },
    create: {
      email: identity.email,
      name: identity.name,
      supabaseUserId: identity.supabaseUserId,
      globalRole: shouldBeSuperAdmin ? UserGlobalRole.SUPER_ADMIN : UserGlobalRole.USER,
    },
    update: {
      name: identity.name ?? undefined,
      supabaseUserId: identity.supabaseUserId,
      ...(shouldBeSuperAdmin ? { globalRole: UserGlobalRole.SUPER_ADMIN } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      globalRole: true,
    },
  });
}

export type CurrentUserAndWorkspace = {
  userId: string;
  email: string;
  name: string | null;
  globalRole: UserGlobalRole;
  workspaceId: string;
  membershipRole: MembershipRole;
  membershipStatus: MembershipStatus;
  appRole: AppRole;
  permissions: PermissionSet;
};

type GetCurrentUserAndWorkspaceOptions = {
  requestedWorkspaceId?: string | null;
};

export class WorkspaceAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "WorkspaceAccessError";
  }
}

function normalizeWorkspaceId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getWorkspaceIdFromCookie() {
  try {
    return normalizeWorkspaceId(cookies().get(WORKSPACE_COOKIE_NAME)?.value ?? null);
  } catch {
    return null;
  }
}

async function getMembershipForUser(
  userId: string,
  globalRole: UserGlobalRole,
  requestedWorkspaceId: string | null
) {
  const activeStatuses: MembershipStatus[] = [MembershipStatus.ACTIVE, MembershipStatus.INVITED];

  if (globalRole === UserGlobalRole.SUPER_ADMIN) {
    if (requestedWorkspaceId) {
      const membership = await prisma.membership.findFirst({
        where: {
          userId,
          workspaceId: requestedWorkspaceId,
          status: {
            in: activeStatuses,
          },
          workspace: {
            disabledAt: null,
          },
        },
        select: {
          workspaceId: true,
          role: true,
          status: true,
        },
      });
      if (membership) {
        if (membership.status === MembershipStatus.INVITED) {
          await prisma.membership.update({
            where: {
              userId_workspaceId: {
                userId,
                workspaceId: membership.workspaceId,
              },
            },
            data: {
              status: MembershipStatus.ACTIVE,
              acceptedAt: new Date(),
              disabledAt: null,
            },
          });
          return {
            workspaceId: membership.workspaceId,
            role: membership.role,
            status: MembershipStatus.ACTIVE,
          };
        }
        return membership;
      }

      const workspace = await prisma.workspace.findFirst({
        where: {
          id: requestedWorkspaceId,
          disabledAt: null,
        },
        select: { id: true },
      });
      if (!workspace) {
        throw new WorkspaceAccessError("Workspace not found", 404);
      }
      return {
        workspaceId: workspace.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      };
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        status: {
          in: activeStatuses,
        },
        workspace: {
          disabledAt: null,
        },
      },
      select: { workspaceId: true, role: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      if (membership.status === MembershipStatus.INVITED) {
        await prisma.membership.update({
          where: {
            userId_workspaceId: {
              userId,
              workspaceId: membership.workspaceId,
            },
          },
          data: {
            status: MembershipStatus.ACTIVE,
            acceptedAt: new Date(),
            disabledAt: null,
          },
        });
        return {
          workspaceId: membership.workspaceId,
          role: membership.role,
          status: MembershipStatus.ACTIVE,
        };
      }
      return membership;
    }

    const firstWorkspace = await prisma.workspace.findFirst({
      where: {
        disabledAt: null,
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!firstWorkspace) {
      throw new WorkspaceAccessError("Forbidden", 403);
    }

    return {
      workspaceId: firstWorkspace.id,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    };
  }

  if (requestedWorkspaceId) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        workspaceId: requestedWorkspaceId,
        status: {
          in: activeStatuses,
        },
        workspace: {
          disabledAt: null,
        },
      },
      select: {
        workspaceId: true,
        role: true,
        status: true,
      },
    });

    if (!membership) {
      throw new WorkspaceAccessError("Forbidden", 403);
    }

    if (membership.status === MembershipStatus.INVITED) {
      await prisma.membership.update({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: membership.workspaceId,
          },
        },
        data: {
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date(),
          disabledAt: null,
        },
      });
      return {
        workspaceId: membership.workspaceId,
        role: membership.role,
        status: MembershipStatus.ACTIVE,
      };
    }

    return membership;
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: {
        in: activeStatuses,
      },
      workspace: {
        disabledAt: null,
      },
    },
    select: { workspaceId: true, role: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    throw new WorkspaceAccessError("Forbidden", 403);
  }

  if (membership.status === MembershipStatus.INVITED) {
    await prisma.membership.update({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: membership.workspaceId,
        },
      },
      data: {
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
        disabledAt: null,
      },
    });
    return {
      workspaceId: membership.workspaceId,
      role: membership.role,
      status: MembershipStatus.ACTIVE,
    };
  }

  return membership;
}

export async function getCurrentUserAndWorkspace(
  options: GetCurrentUserAndWorkspaceOptions = {}
): Promise<CurrentUserAndWorkspace> {
  const user = await getCurrentLocalUser();
  if (!user) {
    throw new WorkspaceAccessError("Unauthorized", 401);
  }

  const explicitWorkspaceId = normalizeWorkspaceId(options.requestedWorkspaceId);
  const cookieWorkspaceId = explicitWorkspaceId ? null : getWorkspaceIdFromCookie();

  let membership;
  try {
    membership = await getMembershipForUser(
      user.id,
      user.globalRole,
      explicitWorkspaceId ?? cookieWorkspaceId
    );
  } catch (error) {
    if (!explicitWorkspaceId && cookieWorkspaceId && isWorkspaceAccessError(error)) {
      membership = await getMembershipForUser(user.id, user.globalRole, null);
    } else {
      throw error;
    }
  }

  const { appRole, permissions } = getPermissionsForContext({
    globalRole: user.globalRole,
    membershipRole: membership.role,
  });

  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? null,
    globalRole: user.globalRole,
    workspaceId: membership.workspaceId,
    membershipRole: membership.role,
    membershipStatus: membership.status,
    appRole,
    permissions,
  };
}

export function isWorkspaceAccessError(error: unknown): error is WorkspaceAccessError {
  return error instanceof WorkspaceAccessError;
}

export async function requirePermission(
  permission: PermissionKey,
  options: GetCurrentUserAndWorkspaceOptions = {}
) {
  const context = await getCurrentUserAndWorkspace(options);
  if (!hasPermission(context.permissions, permission)) {
    throw new WorkspaceAccessError("Forbidden", 403);
  }
  return context;
}

export async function getCurrentUserEmail() {
  const user = await getCurrentLocalUser();
  return user?.email ?? null;
}

export async function getCurrentUserId() {
  const user = await getCurrentLocalUser();
  return user?.id ?? null;
}

export async function getCurrentUserGlobalRole() {
  const user = await getCurrentLocalUser();
  return user?.globalRole ?? null;
}

export async function isCurrentUserSuperAdmin() {
  const role = await getCurrentUserGlobalRole();
  return role === UserGlobalRole.SUPER_ADMIN;
}

export async function getCurrentOrgId() {
  try {
    const context = await getCurrentUserAndWorkspace();
    return context.workspaceId;
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getCurrentWorkspaceId() {
  return getCurrentOrgId();
}
