import { redirect } from "next/navigation";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { autoDetectCompletedSteps, getOnboardingState } from "@/server/services/onboardingService";
import { OnboardingWizard } from "./OnboardingWizard";

type Props = {
  searchParams: Promise<{ step?: string }>;
};

export default async function OnboardingPage({ searchParams }: Props) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }

  const params = await searchParams;
  const { workspaceId, name } = context;

  await autoDetectCompletedSteps(workspaceId);
  const state = await getOnboardingState(workspaceId);

  return (
    <OnboardingWizard
      initialState={state}
      initialStep={params.step}
      workspaceId={workspaceId}
      userName={name ?? undefined}
    />
  );
}
