import { notFound, redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { prisma } from "@/server/db";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsForm } from "./SettingsForm";
import { CompanyMembersCard } from "./CompanyMembersCard";
import { getWorkspaceSettings } from "@/server/services/settingsService";

export default async function SettingsPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewSettings) {
    redirect("/dashboard");
  }
  const workspaceId = context.workspaceId;

  const settings = await getWorkspaceSettings(workspaceId);
  if (!settings) {
    notFound();
  }

  const members = context.permissions.canViewMembers
    ? await prisma.membership.findMany({
        where: { workspaceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setari"
        subtitle="Configureaza workspace-ul, programul de lucru si fluxul implicit pentru leaduri noi."
        icon={Settings}
        activeCompanyName={settings.workspaceName}
      />
      <SettingsForm initialData={settings} />
      {context.permissions.canViewMembers ? (
        <CompanyMembersCard
          workspaceId={workspaceId}
          canInvite={false}
          members={members.map((member) => ({
            userId: member.user.id,
            email: member.user.email,
            name: member.user.name,
            role: member.role,
            createdAt: member.createdAt.toISOString(),
          }))}
        />
      ) : null}
    </div>
  );
}
