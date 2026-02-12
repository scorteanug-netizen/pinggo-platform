import { MembershipStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { UserCog, Shield, Users, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
import { InviteUserForm } from "./InviteUserForm";
import { UserLifecycleActions } from "./DeleteUserButton";

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("ro-RO");
}

type UserRow = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  workspaceId: string | null;
  company: string | null;
  role: string;
  status: MembershipStatus | null;
  createdAt: Date;
};

const STATUS_LABEL: Record<MembershipStatus, string> = {
  INVITED: "Invitat",
  ACTIVE: "Activ",
  DISABLED: "Dezactivat",
};

export default async function UsersPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewUsers) {
    redirect("/dashboard");
  }

  const [workspaces, users] = await Promise.all([
    prisma.workspace.findMany({
      where: {
        disabledAt: null,
      },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        globalRole: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            status: true,
            workspace: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: UserRow[] = users.flatMap<UserRow>((user) => {
    if (user.memberships.length === 0) {
      return [
        {
          id: `${user.id}-none`,
          userId: user.id,
          name: user.name,
          email: user.email,
          workspaceId: null,
          company: null,
          role: user.globalRole,
          status: null,
          createdAt: user.createdAt,
        },
      ];
    }

    return user.memberships.map((membership) => ({
      id: `${user.id}-${membership.workspace.id}-${membership.role}`,
      userId: user.id,
      name: user.name,
      email: user.email,
      workspaceId: membership.workspace.id,
      company: membership.workspace.name,
      role: user.globalRole === "SUPER_ADMIN" ? `SUPER_ADMIN / ${membership.role}` : membership.role,
      status: membership.status,
      createdAt: user.createdAt,
    }));
  });

  // Calculate stats from real data - count unique users and roles
  const uniqueUserIds = new Set(users.map((user) => user.id));
  const allMemberships = users.flatMap((user) => user.memberships);
  const stats = {
    totalUsers: uniqueUserIds.size,
    admins: allMemberships.filter((m) => m.role === "ADMIN").length,
    managers: allMemberships.filter((m) => m.role === "MANAGER").length,
    agents: allMemberships.filter((m) => m.role === "AGENT").length,
  };

  return (
    <div className="space-y-6">
      {/* Header cu icon */}
      <PageHeader
        title="Useri"
        subtitle="Creeaza compania prima data, apoi invita userul si alege compania lui."
        icon={UserCog}
      />

      {/* Stat Cards - REAL DATA */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Useri"
          value={stats.totalUsers}
        />

        <StatCard
          icon={Shield}
          label="Admini"
          value={stats.admins}
        />

        <StatCard
          icon={UserCog}
          label="Manageri"
          value={stats.managers}
        />

        <StatCard
          icon={UserCheck}
          label="Agenți"
          value={stats.agents}
        />
      </div>

      <SectionCard
        title="Invita user"
        description="Email, rol si companie sunt obligatorii pentru alocarea corecta."
        borderColor="orange"
      >
        <InviteUserForm workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))} />
      </SectionCard>

      <SectionCard
        title="Lista useri"
        description="Toate conturile si compania din care fac parte."
        borderColor="orange"
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Nume</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Companie</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Creat</th>
                <th className="px-3 py-2">Actiuni</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-sm text-slate-500">
                    Nu exista useri.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-800">{row.name || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.email}</td>
                    <td className="px-3 py-2 text-slate-700">{row.company || "-"}</td>
                    <td className="px-3 py-2">
                      {row.role.includes("OWNER") ? (
                        <Badge variant="orange">OWNER</Badge>
                      ) : row.role.includes("ADMIN") ? (
                        <Badge variant="gray">ADMIN</Badge>
                      ) : row.role.includes("MANAGER") ? (
                        <Badge variant="gray">MANAGER</Badge>
                      ) : row.role.includes("AGENT") ? (
                        <Badge variant="gray">AGENT</Badge>
                      ) : (
                        <span className="text-xs text-slate-700">{row.role}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.status ? (
                        <Badge
                          variant={
                            row.status === "ACTIVE"
                              ? "green"
                              : row.status === "INVITED"
                                ? "orange"
                                : "gray"
                          }
                        >
                          {STATUS_LABEL[row.status]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      {row.workspaceId && row.status ? (
                        <UserLifecycleActions
                          userId={row.userId}
                          workspaceId={row.workspaceId}
                          email={row.email}
                          status={row.status}
                          isCurrentUser={row.userId === context.userId}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
