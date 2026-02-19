import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

type RouteContext = {
  params: { scenarioId: string };
};

const RESET_STATE_JSON = { node: "q1", answers: {}, questionIndex: 0 };
const MIGRATE_EVENTLOG_LIMIT = 50;

// ---------------------------------------------------------------------------
// POST /api/v1/autopilot/scenarios/[scenarioId]/set-default
// ---------------------------------------------------------------------------

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.scenarioId?.trim();
    if (!id) {
      return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const scenario = await tx.autopilotScenario.findUnique({
        where: { id },
        select: { id: true, workspaceId: true, name: true },
      });

      if (!scenario) return null;

      // a) Clear all other defaults, set this one as default
      await tx.autopilotScenario.updateMany({
        where: {
          workspaceId: scenario.workspaceId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });

      await tx.autopilotScenario.update({
        where: { id },
        data: { isDefault: true },
      });

      // b) Migrate all AutopilotRuns to new scenario, reset state
      const runs = await tx.autopilotRun.findMany({
        where: { workspaceId: scenario.workspaceId },
        select: { leadId: true, scenarioId: true },
      });

      if (runs.length > 0) {
        await tx.autopilotRun.updateMany({
          where: { workspaceId: scenario.workspaceId },
          data: {
            scenarioId: scenario.id,
            currentStep: "q1",
            stateJson: RESET_STATE_JSON,
            status: "ACTIVE",
          },
        });

        // c) EventLog per updated run only if count <= 50
        if (runs.length <= MIGRATE_EVENTLOG_LIMIT) {
          await tx.eventLog.createMany({
            data: runs.map((run) => ({
              leadId: run.leadId,
              eventType: "autopilot_scenario_migrated",
              payload: {
                fromScenarioId: run.scenarioId,
                toScenarioId: scenario.id,
              } as unknown as import("@prisma/client").Prisma.InputJsonValue,
            })),
          });
        }
      }

      return { id: scenario.id, workspaceId: scenario.workspaceId, name: scenario.name, isDefault: true };
    });

    if (!result) {
      return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[autopilot/scenarios/set-default POST]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
