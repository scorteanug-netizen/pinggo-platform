import Link from "next/link";
import Image from "next/image";
import { Bell } from "lucide-react";
import { MembershipStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
import { getUnreadNotificationsCount } from "@/server/services/notificationService";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { AvailabilityToggle } from "./AvailabilityToggle";

type WorkspaceTopbarProps = {
  bypassed?: boolean;
};

export async function WorkspaceTopbar({ bypassed: _bypassed }: WorkspaceTopbarProps) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  const displayEmail = context?.email ?? "demo@pinggo.io";
  const workspaceId = context?.workspaceId ?? null;

  const [currentWorkspace, workspaceOptions] = workspaceId
    ? await Promise.all([
        prisma.workspace.findFirst({
          where: {
            id: workspaceId,
            disabledAt: null,
          },
          select: { id: true, name: true },
        }),
        context?.globalRole === "SUPER_ADMIN"
          ? prisma.workspace.findMany({
              where: {
                disabledAt: null,
              },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            })
          : prisma.membership.findMany({
              where: {
                userId: context!.userId,
                status: {
                  in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED],
                },
                workspace: {
                  disabledAt: null,
                },
              },
              select: {
                workspace: {
                  select: { id: true, name: true },
                },
              },
              orderBy: { createdAt: "asc" },
            }).then((memberships) => memberships.map((membership) => membership.workspace)),
      ])
    : [null, [] as Array<{ id: string; name: string }>];

  const canSwitchWorkspace = workspaceOptions.length > 1;
  const unreadCount =
    context?.email && context.workspaceId
      ? await getUnreadNotificationsCount({
          workspaceId: context.workspaceId,
          email: context.email,
        })
      : 0;

  const membershipAvailability =
    context?.userId && context.workspaceId
      ? await prisma.membership
          .findUnique({
            where: { userId_workspaceId: { userId: context.userId, workspaceId: context.workspaceId } },
            select: { isAvailable: true },
          })
          .then((m) => m?.isAvailable ?? true)
      : true;

  return (
    <header className="border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 md:gap-3">
        {workspaceId ? (
          canSwitchWorkspace ? (
            <WorkspaceSwitcher workspaces={workspaceOptions} currentWorkspaceId={workspaceId} />
          ) : (
            <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 md:inline-flex">
              Companie: {currentWorkspace?.name ?? "N/A"}
            </span>
          )
        ) : null}

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Link
            href="/notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-orange-100 hover:bg-orange-50 hover:text-orange-600"
            aria-label="Notificari"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-orange-500 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
          <AvailabilityToggle initial={membershipAvailability} />
          <span className="hidden text-sm font-medium text-slate-700 sm:inline">{displayEmail}</span>
          <span className="hidden rounded-full border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 px-2.5 py-1 text-xs font-extrabold text-orange-700 sm:inline">
            {context?.appRole ?? "Conectat"}
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-100 bg-white shadow-[0_4px_12px_rgba(255,86,33,0.16)]">
            <Image
              src="/PINGGO_LOGO.png?v=2"
              alt="Pinggo"
              width={26}
              height={26}
              className="h-6 w-6 object-contain"
            />
          </span>
          <form action="/auth/logout" method="POST">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-9 border-slate-200 px-3 text-slate-700 hover:border-orange-100 hover:bg-orange-50 hover:text-orange-700"
            >
              Deconectare
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
