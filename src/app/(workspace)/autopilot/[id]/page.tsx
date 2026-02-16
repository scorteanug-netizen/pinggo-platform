import { MembershipStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { ScenarioEditor } from "@/components/autopilot/ScenarioEditor";

export default async function AutopilotScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let context;
  try {
    context = await getCurrentUserAndWorkspace();
  } catch {
    redirect("/login");
  }

  const [scenario, memberships] = await Promise.all([
    prisma.autopilotScenario.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        scenarioType: true,
        mode: true,
        aiPrompt: true,
        slaMinutes: true,
        maxQuestions: true,
        handoverUserId: true,
        bookingConfigJson: true,
        isDefault: true,
        agentName: true,
        companyName: true,
        companyDescription: true,
        offerSummary: true,
        calendarLinkRaw: true,
        language: true,
        tone: true,
        knowledgeBaseJson: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.membership.findMany({
      where: {
        workspaceId: context.workspaceId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!scenario || scenario.workspaceId !== context.workspaceId) {
    redirect("/autopilot");
  }

  const members = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
  }));

  return (
    <ScenarioEditor
      scenario={{
        id: scenario.id,
        workspaceId: scenario.workspaceId,
        name: scenario.name,
        scenarioType: scenario.scenarioType,
        mode: scenario.mode,
        aiPrompt: scenario.aiPrompt,
        slaMinutes: scenario.slaMinutes,
        maxQuestions: scenario.maxQuestions,
        handoverUserId: scenario.handoverUserId,
        bookingConfigJson: scenario.bookingConfigJson as Record<string, unknown> | null,
        isDefault: scenario.isDefault,
        agentName: scenario.agentName,
        companyName: scenario.companyName,
        companyDescription: scenario.companyDescription,
        offerSummary: scenario.offerSummary,
        calendarLinkRaw: scenario.calendarLinkRaw,
        language: scenario.language,
        tone: scenario.tone,
        knowledgeBaseJson: scenario.knowledgeBaseJson as Record<string, unknown> | null,
        createdAt: scenario.createdAt.toISOString(),
        updatedAt: scenario.updatedAt.toISOString(),
      }}
      members={members}
    />
  );
}
