import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { AutopilotScenariosList } from "@/components/autopilot/AutopilotScenariosList";

export default async function AutopilotPage() {
  let context;
  try {
    context = await getCurrentUserAndWorkspace();
  } catch {
    redirect("/login");
  }

  const scenarios = await prisma.autopilotScenario.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      scenarioType: true,
      mode: true,
      isDefault: true,
      maxQuestions: true,
      createdAt: true,
      _count: {
        select: {
          autopilotRuns: true,
        },
      },
    },
  });

  return (
    <AutopilotScenariosList
      workspaceId={context.workspaceId}
      scenarios={scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        scenarioType: s.scenarioType,
        mode: s.mode,
        isDefault: s.isDefault,
        maxQuestions: s.maxQuestions,
        createdAt: s.createdAt.toISOString(),
        runsCount: s._count.autopilotRuns,
      }))}
    />
  );
}
