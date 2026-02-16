import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";

type RouteContext = {
  params: { runId: string };
};

const bodySchema = z.object({
  scenarioId: z.string().trim().min(1),
});

const RESET_STATE_JSON = { node: "q1", answers: {}, questionIndex: 0 };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const runId = params.runId?.trim();
    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { scenarioId: toScenarioId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.autopilotRun.findUnique({
        where: { id: runId },
        select: { leadId: true, workspaceId: true, scenarioId: true },
      });

      if (!run) return null;

      const scenario = await tx.autopilotScenario.findUnique({
        where: { id: toScenarioId },
        select: { id: true, workspaceId: true, mode: true },
      });

      if (!scenario || scenario.workspaceId !== run.workspaceId) {
        return { error: "Scenario not found or belongs to different workspace" };
      }

      const fromScenarioId = run.scenarioId;

      await tx.autopilotRun.update({
        where: { id: runId },
        data: {
          scenarioId: toScenarioId,
          status: "ACTIVE",
          currentStep: "q1",
          stateJson: RESET_STATE_JSON,
        },
      });

      await tx.eventLog.create({
        data: {
          leadId: run.leadId,
          eventType: "autopilot_scenario_switched",
          payload: {
            fromScenarioId,
            toScenarioId,
            mode: scenario.mode,
          } as Record<string, unknown>,
        },
      });

      return { ok: true };
    });

    if (!result) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[autopilot/runs/switch-scenario POST]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
