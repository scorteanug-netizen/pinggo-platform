import {
  AutopilotScenarioMode,
  AutopilotScenarioType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db";

type TxOrClient = Prisma.TransactionClient | typeof prisma;

/**
 * Ensures the workspace has at least one AutopilotScenario and exactly one
 * marked as `isDefault = true`.
 *
 * - If no scenarios exist → creates a default "Default Qualification" scenario.
 * - If scenarios exist but none is default → picks the earliest and marks it.
 *
 * Accepts an optional transaction client as first argument for use inside
 * prisma.$transaction blocks.
 *
 * Returns the default scenario.
 */
export async function ensureDefaultScenario(
  txOrWorkspaceId: TxOrClient | string,
  workspaceIdOrUndefined?: string,
) {
  // Support two call signatures:
  //   ensureDefaultScenario(workspaceId)
  //   ensureDefaultScenario(tx, workspaceId)
  let db: TxOrClient;
  let workspaceId: string;

  if (typeof txOrWorkspaceId === "string") {
    db = prisma;
    workspaceId = txOrWorkspaceId;
  } else {
    db = txOrWorkspaceId;
    workspaceId = workspaceIdOrUndefined!;
  }

  const existing = await db.autopilotScenario.findFirst({
    where: { workspaceId, isDefault: true },
  });

  if (existing) return existing;

  // Check if any scenario exists at all
  const earliest = await db.autopilotScenario.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });

  if (earliest) {
    // Mark it as default
    return db.autopilotScenario.update({
      where: { id: earliest.id },
      data: { isDefault: true },
    });
  }

  // No scenarios at all → create the seed default
  return db.autopilotScenario.create({
    data: {
      workspaceId,
      name: "Default Qualification",
      scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
      mode: AutopilotScenarioMode.RULES,
      slaMinutes: 15,
      maxQuestions: 2,
      isDefault: true,
    },
  });
}
