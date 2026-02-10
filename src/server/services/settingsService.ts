import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  BusinessHoursSchedule,
  DEFAULT_BUSINESS_HOURS_TIMEZONE,
  createDefaultBusinessHoursSchedule,
  normalizeBusinessHoursConfig,
} from "./businessHours";

export type WorkspaceFlowOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type WorkspaceSettingsView = {
  workspaceId: string;
  workspaceName: string;
  businessHoursEnabled: boolean;
  timezone: string;
  schedule: BusinessHoursSchedule;
  defaultFlowId: string | null;
  flows: WorkspaceFlowOption[];
};

export type UpdateWorkspaceSettingsInput = {
  workspaceName: string;
  businessHoursEnabled: boolean;
  timezone: string;
  schedule: BusinessHoursSchedule;
  defaultFlowId: string | null;
};

async function ensureWorkspaceSettings(workspaceId: string) {
  return prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      businessHoursEnabled: true,
      timezone: DEFAULT_BUSINESS_HOURS_TIMEZONE,
      schedule: createDefaultBusinessHoursSchedule() as Prisma.InputJsonValue,
      defaultFlowId: null,
    },
    update: {},
  });
}

export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettingsView | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) return null;

  const [settings, flows] = await Promise.all([
    ensureWorkspaceSettings(workspaceId),
    prisma.flow.findMany({
      where: { workspaceId },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const normalized = normalizeBusinessHoursConfig({
    businessHoursEnabled: settings.businessHoursEnabled,
    timezone: settings.timezone,
    schedule: settings.schedule,
  });

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    businessHoursEnabled: normalized.businessHoursEnabled,
    timezone: normalized.timezone,
    schedule: normalized.schedule,
    defaultFlowId: settings.defaultFlowId ?? null,
    flows,
  };
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  input: UpdateWorkspaceSettingsInput
): Promise<WorkspaceSettingsView | null> {
  const normalized = normalizeBusinessHoursConfig({
    businessHoursEnabled: input.businessHoursEnabled,
    timezone: input.timezone,
    schedule: input.schedule,
  });

  if (input.defaultFlowId) {
    const defaultFlow = await prisma.flow.findFirst({
      where: { id: input.defaultFlowId, workspaceId },
      select: { id: true },
    });
    if (!defaultFlow) {
      throw new Error("INVALID_DEFAULT_FLOW");
    }
  }

  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: input.workspaceName.trim() },
    }),
    prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        businessHoursEnabled: normalized.businessHoursEnabled,
        timezone: normalized.timezone,
        schedule: normalized.schedule as Prisma.InputJsonValue,
        defaultFlowId: input.defaultFlowId,
      },
      update: {
        businessHoursEnabled: normalized.businessHoursEnabled,
        timezone: normalized.timezone,
        schedule: normalized.schedule as Prisma.InputJsonValue,
        defaultFlowId: input.defaultFlowId,
      },
    }),
  ]);

  return getWorkspaceSettings(workspaceId);
}
