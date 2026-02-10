import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
import { FlowsManager } from "./FlowsManager";

export default async function FlowsPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewFlows) {
    redirect("/dashboard");
  }
  const workspaceId = context.workspaceId;

  const [flows, currentWorkspace, workspaceOptions] = await Promise.all([
    prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        publishedAt: true,
        updatedAt: true,
        lastEditedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        disabledAt: null,
      },
      select: { id: true, name: true },
    }),
    context.globalRole === "SUPER_ADMIN"
      ? prisma.workspace.findMany({
          where: {
            disabledAt: null,
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([{ id: workspaceId, name: "Compania ta" }]),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fluxuri"
        subtitle="Configureaza pasii de intrare, repartizare si SLA pentru compania activa."
        activeCompanyName={currentWorkspace?.name}
      />

      <SectionCard
        title="Lista fluxuri"
        description="Creeaza fluxuri noi, activeaza/dezactiveaza si intra in wizard-ul de configurare."
      >
        <FlowsManager
          isSuperAdmin={context.globalRole === "SUPER_ADMIN"}
          currentWorkspaceId={workspaceId}
          workspaceOptions={workspaceOptions}
          canEditFlows={context.permissions.canEditFlows}
          initialFlows={flows.map((flow) => ({
            id: flow.id,
            name: flow.name,
            isActive: flow.isActive,
            isDraft: flow.publishedAt === null,
            publishedAt: flow.publishedAt ? flow.publishedAt.toISOString() : null,
            updatedAt: flow.updatedAt.toISOString(),
            lastEditedByName: flow.lastEditedByUser?.name ?? null,
            lastEditedByEmail: flow.lastEditedByUser?.email ?? null,
          }))}
        />
      </SectionCard>
    </div>
  );
}
