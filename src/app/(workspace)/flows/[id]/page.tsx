import { MembershipRole, MembershipStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
import { readFlowWizardState } from "@/server/services/flowWizardService";
import { FlowWizardBuilder } from "./FlowWizardBuilder";

export default async function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewFlows) {
    redirect("/dashboard");
  }
  const workspaceId = context.workspaceId;

  const { id: flowId } = await params;
  const [payload, memberships] = await Promise.all([
    readFlowWizardState({ workspaceId, flowId }),
    prisma.membership.findMany({
      where: {
        workspaceId,
        status: MembershipStatus.ACTIVE,
        role: {
          in: [
            MembershipRole.AGENT,
            MembershipRole.MANAGER,
            MembershipRole.ADMIN,
            MembershipRole.OWNER,
          ],
        },
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!payload) {
    notFound();
  }

  const agents = memberships.map((membership) => ({
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    role: membership.role,
  }));

  return (
    <FlowWizardBuilder
      flowId={payload.flow.id}
      flowName={payload.flow.name}
      isActive={payload.flow.isActive}
      canEditFlow={context.permissions.canEditFlows}
      agents={agents}
      initialWizard={payload.wizard}
    />
  );
}
