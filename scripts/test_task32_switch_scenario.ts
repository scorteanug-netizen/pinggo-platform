/**
 * Task 32: Switch Autopilot scenario for current lead (testing tool).
 *
 * Flow:
 * 1. Create workspace, scenario RULES default, scenario AI (not default)
 * 2. Create lead + start autopilot => run.scenarioId = RULES
 * 3. Call switch-scenario endpoint to AI
 * 4. Send reply => assert autopilot_ai_planned exists
 */

import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { AutopilotScenarioMode, AutopilotScenarioType, LeadSourceType, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { NextRequest } from "next/server";

type PostRouteHandler = (request: NextRequest) => Promise<Response>;

type AliasResolver = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean,
  options?: unknown
) => string;

loadEnvConfig(process.cwd(), false);

const rawUrl = process.env.DATABASE_URL!;
const url = new URL(rawUrl);
const hadSsl = url.searchParams.has("sslmode");
url.searchParams.delete("sslmode");

const pool = new Pool({
  connectionString: url.toString(),
  ...(hadSsl && { ssl: { rejectUnauthorized: false } }),
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function installWorkspaceAliasResolver() {
  const moduleWithPrivateResolver = Module as unknown as {
    _resolveFilename: AliasResolver;
  };
  const originalResolveFilename = moduleWithPrivateResolver._resolveFilename;
  moduleWithPrivateResolver._resolveFilename = function resolveWithAlias(
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
    options?: unknown
  ) {
    if (typeof request === "string" && request.startsWith("@/")) {
      const mappedRequest = path.join(process.cwd(), "src", request.slice(2));
      return originalResolveFilename.call(this, mappedRequest, parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

async function loadHandlers(): Promise<{
  replyPost: PostRouteHandler;
  switchScenarioPost: (runId: string, scenarioId: string) => Promise<Response>;
}> {
  installWorkspaceAliasResolver();

  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };
  const switchRoute = (await import("../src/app/api/v1/autopilot/runs/[runId]/switch-scenario/route")) as {
    POST?: PostRouteHandler;
  };

  if (!replyRoute.POST || !switchRoute.POST) throw new Error("Missing route handlers");

  return {
    replyPost: replyRoute.POST,
    switchScenarioPost: (runId: string, scenarioId: string) =>
      switchRoute.POST!(
        new NextRequest(`http://localhost/api/v1/autopilot/runs/${runId}/switch-scenario`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId }),
        }),
        { params: { runId } }
      ),
  };
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const { replyPost, switchScenarioPost } = await loadHandlers();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: { name: `Task32 Switch Scenario ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const scenarioRULES = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "RULES default",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.RULES,
        maxQuestions: 2,
        isDefault: true,
      },
      select: { id: true },
    });

    const scenarioAI = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "AI scenario",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.AI,
        maxQuestions: 2,
        aiPrompt: "Esti asistent. Colecteaza intentul.",
        isDefault: false,
      },
      select: { id: true },
    });

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        firstName: "Switch",
        lastName: "Test",
        email: `task32+${runId}@example.com`,
        phone: "+40700000032",
        source: "test_task32",
        sourceType: LeadSourceType.API,
        externalId: `task32-${runId}`,
      },
      select: { id: true },
    });

    const autopilotRun = await prisma.autopilotRun.create({
      data: {
        leadId: lead.id,
        workspaceId: workspace.id,
        scenarioId: scenarioRULES.id,
        status: "ACTIVE",
        currentStep: "q1",
        stateJson: { node: "q1", answers: {}, questionIndex: 0 },
        lastOutboundAt: new Date(),
      },
      select: { id: true, scenarioId: true },
    });

    assert.equal(autopilotRun.scenarioId, scenarioRULES.id, "Run should use RULES scenario");

    console.log("  [OK] Workspace, scenarios RULES+AI, lead, run (RULES) created");

    const switchRes = await switchScenarioPost(autopilotRun.id, scenarioAI.id);
    assert.equal(switchRes.status, 200, `Expected 200, got ${switchRes.status}`);

    const runAfterSwitch = await prisma.autopilotRun.findUnique({
      where: { id: autopilotRun.id },
      select: { scenarioId: true, status: true, currentStep: true, stateJson: true },
    });
    assert.equal(runAfterSwitch?.scenarioId, scenarioAI.id);
    assert.equal(runAfterSwitch?.status, "ACTIVE");
    assert.equal(runAfterSwitch?.currentStep, "q1");
    const state = runAfterSwitch?.stateJson as { questionIndex?: number } | null;
    assert.equal(state?.questionIndex, 0);

    console.log("  [OK] switch-scenario migrated run to AI");

    const replyRes = await replyPost(
      new NextRequest("http://localhost/api/v1/autopilot/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, text: "pret" }),
      })
    );
    assert.equal(replyRes.status, 200);

    const aiPlannedCount = await prisma.eventLog.count({
      where: { leadId: lead.id, eventType: "autopilot_ai_planned" },
    });
    assert.equal(aiPlannedCount, 1, `Expected 1 autopilot_ai_planned, got ${aiPlannedCount}`);

    const switchedEvent = await prisma.eventLog.findFirst({
      where: { leadId: lead.id, eventType: "autopilot_scenario_switched" },
      select: { payload: true },
    });
    assert.ok(switchedEvent);
    const payload = switchedEvent.payload as Record<string, unknown>;
    assert.equal(payload.fromScenarioId, scenarioRULES.id);
    assert.equal(payload.toScenarioId, scenarioAI.id);
    assert.equal(payload.mode, "AI");

    console.log("  [OK] Reply used AI mode (autopilot_ai_planned exists)");
    console.log("\n  PASSED: All Task 32 switch scenario assertions passed.\n");
  } finally {
    if (workspaceId) {
      await prisma.lead.deleteMany({ where: { workspaceId } });
      await prisma.autopilotScenario.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
