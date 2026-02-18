import { prisma } from "../db";

export type OnboardingStep = "workspace" | "team" | "whatsapp" | "autopilot" | "testLead";

export type OnboardingState = {
  steps: Record<OnboardingStep, boolean>;
  completedAt?: string;
};

const ALL_STEPS: OnboardingStep[] = ["workspace", "team", "whatsapp", "autopilot", "testLead"];

function defaultState(): OnboardingState {
  return {
    steps: {
      workspace: false,
      team: false,
      whatsapp: false,
      autopilot: false,
      testLead: false,
    },
  };
}

function parseState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== "object") return defaultState();
  const obj = raw as Record<string, unknown>;
  const steps = obj.steps as Record<string, unknown> | undefined;
  return {
    steps: {
      workspace: Boolean(steps?.workspace),
      team: Boolean(steps?.team),
      whatsapp: Boolean(steps?.whatsapp),
      autopilot: Boolean(steps?.autopilot),
      testLead: Boolean(steps?.testLead),
    },
    completedAt: typeof obj.completedAt === "string" ? obj.completedAt : undefined,
  };
}

export async function getOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
    select: { onboardingJson: true },
  });
  if (!settings) return defaultState();
  return parseState(settings.onboardingJson);
}

export async function markStepDone(workspaceId: string, step: OnboardingStep): Promise<OnboardingState> {
  const current = await getOnboardingState(workspaceId);
  current.steps[step] = true;

  const allDone = ALL_STEPS.every((s) => current.steps[s]);
  if (allDone && !current.completedAt) {
    current.completedAt = new Date().toISOString();
  }

  await prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      onboardingJson: current as unknown as Record<string, unknown>,
    },
    update: {
      onboardingJson: current as unknown as Record<string, unknown>,
    },
  });

  return current;
}

export async function isOnboardingComplete(workspaceId: string): Promise<boolean> {
  const state = await getOnboardingState(workspaceId);
  return Boolean(state.completedAt);
}

export async function autoDetectCompletedSteps(workspaceId: string): Promise<void> {
  const current = await getOnboardingState(workspaceId);
  let changed = false;

  // workspace: WorkspaceSettings existe
  if (!current.steps.workspace) {
    const settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
      select: { workspaceId: true },
    });
    if (settings) {
      current.steps.workspace = true;
      changed = true;
    }
  }

  // team: cel puțin 2 membri activi
  if (!current.steps.team) {
    const memberCount = await prisma.membership.count({
      where: { workspaceId, status: "ACTIVE" },
    });
    if (memberCount >= 2) {
      current.steps.team = true;
      changed = true;
    }
  }

  // whatsapp: Integration cu type WHATSAPP_PROVIDER și active: true
  if (!current.steps.whatsapp) {
    const whatsapp = await prisma.integration.findFirst({
      where: { workspaceId, type: "WHATSAPP_PROVIDER" },
      select: { config: true },
    });
    if (whatsapp && (whatsapp.config as Record<string, unknown>)?.active === true) {
      current.steps.whatsapp = true;
      changed = true;
    }
  }

  // autopilot: cel puțin un AutopilotScenario
  if (!current.steps.autopilot) {
    const scenarioCount = await prisma.autopilotScenario.count({
      where: { workspaceId },
    });
    if (scenarioCount >= 1) {
      current.steps.autopilot = true;
      changed = true;
    }
  }

  // testLead: cel puțin un Lead cu sourceType IN ["API", "MANUAL"]
  if (!current.steps.testLead) {
    const testLead = await prisma.lead.findFirst({
      where: { workspaceId, sourceType: { in: ["API", "MANUAL"] } },
      select: { id: true },
    });
    if (testLead) {
      current.steps.testLead = true;
      changed = true;
    }
  }

  if (!changed) return;

  const allDone = ALL_STEPS.every((s) => current.steps[s]);
  if (allDone && !current.completedAt) {
    current.completedAt = new Date().toISOString();
  }

  await prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      onboardingJson: current as unknown as Record<string, unknown>,
    },
    update: {
      onboardingJson: current as unknown as Record<string, unknown>,
    },
  });
}
