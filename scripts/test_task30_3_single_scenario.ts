/**
 * Task 30.3: Single scenario per workspace - set-default migrates runs.
 *
 * Flow:
 * 1. Create workspace, scenarioA RULES default, ingest lead => run.scenarioId = A
 * 2. Create scenarioB AI, call set-default => run.scenarioId = B, status ACTIVE, questionIndex reset
 * 3. Send reply => assert autopilot_ai_planned exists (AI mode used)
 */

import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { AutopilotScenarioMode, AutopilotScenarioType, PrismaClient } from "@prisma/client";
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

type IngestionResponse = {
  leadId: string;
  sla: { startedAt: string; deadlineAt: string };
  idempotency: { reused: boolean };
};

type ReplyResponse = {
  leadId: string;
  autopilot: { status: string; node: string; answers: Record<string, string> };
  queuedMessage: { id: string; text: string; toPhone: string | null } | null;
};

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
  ingestLeadPost: PostRouteHandler;
  replyPost: PostRouteHandler;
  setDefaultPost: (scenarioId: string) => Promise<Response>;
}> {
  installWorkspaceAliasResolver();

  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as {
    POST?: PostRouteHandler;
  };
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };
  const setDefaultRoute = (await import("../src/app/api/v1/autopilot/scenarios/[scenarioId]/set-default/route")) as {
    POST?: PostRouteHandler;
  };

  if (typeof leadsRoute.POST !== "function") throw new Error("Missing leads POST");
  if (typeof replyRoute.POST !== "function") throw new Error("Missing reply POST");
  if (typeof setDefaultRoute.POST !== "function") throw new Error("Missing set-default POST");

  return {
    ingestLeadPost: leadsRoute.POST,
    replyPost: replyRoute.POST,
    setDefaultPost: (scenarioId: string) =>
      setDefaultRoute.POST!(
        new NextRequest(`http://localhost/api/v1/autopilot/scenarios/${scenarioId}/set-default`, {
          method: "POST",
        }),
        { params: { scenarioId } }
      ),
  };
}

function createIngestionRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createReplyRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/autopilot/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const { ingestLeadPost, replyPost, setDefaultPost } = await loadHandlers();
    const runId = Date.now();

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + scenarioA (RULES, default)
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task30.3 Single Scenario ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const scenarioA = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "Scenario A RULES",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.RULES,
        maxQuestions: 2,
        isDefault: true,
      },
      select: { id: true },
    });

    console.log("  [OK] Step 0: Workspace, scenarioA RULES default created");

    // -----------------------------------------------------------------------
    // Step 1: Ingest lead => run.scenarioId = A
    // -----------------------------------------------------------------------
    const ingestRes = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "Single",
        lastName: "Scenario",
        email: `task30_3+${runId}@example.com`,
        phone: "+40700000030",
        source: "test_task30_3",
        externalId: `task30_3-${runId}`,
      })
    );
    assert.equal(ingestRes.status, 201, `Expected 201, got ${ingestRes.status}`);
    const ingestJson = (await ingestRes.json()) as IngestionResponse;
    const leadId = ingestJson.leadId;

    const runAfterIngest = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { scenarioId: true, status: true, stateJson: true },
    });
    assert.ok(runAfterIngest);
    assert.equal(runAfterIngest.scenarioId, scenarioA.id, "Run should use scenarioA");
    assert.equal(runAfterIngest.status, "ACTIVE");

    console.log("  [OK] Step 1: Lead ingested, run.scenarioId = A");

    // -----------------------------------------------------------------------
    // Step 2: Create scenarioB AI, call set-default
    // -----------------------------------------------------------------------
    const scenarioB = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "Scenario B AI",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.AI,
        maxQuestions: 2,
        aiPrompt: "Esti asistent. Colecteaza intentul. Transfera la agent.",
        isDefault: false,
      },
      select: { id: true },
    });

    const setDefaultRes = await setDefaultPost(scenarioB.id);
    assert.equal(setDefaultRes.status, 200, `Expected 200, got ${setDefaultRes.status}`);

    const runAfterSetDefault = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { scenarioId: true, status: true, currentStep: true, stateJson: true },
    });
    assert.ok(runAfterSetDefault);
    assert.equal(runAfterSetDefault.scenarioId, scenarioB.id, "Run should now use scenarioB");
    assert.equal(runAfterSetDefault.status, "ACTIVE");
    assert.equal(runAfterSetDefault.currentStep, "q1");

    const state = runAfterSetDefault.stateJson as { questionIndex?: number; node?: string } | null;
    assert.equal(state?.questionIndex, 0, "questionIndex should be reset");
    assert.equal(state?.node, "q1", "stateJson should be reset");

    console.log("  [OK] Step 2: set-default migrated run to scenarioB, status ACTIVE, questionIndex reset");

    // -----------------------------------------------------------------------
    // Step 3: Send reply => assert autopilot_ai_planned exists (AI mode)
    // -----------------------------------------------------------------------
    const replyRes = await replyPost(createReplyRequest({ leadId, text: "pret" }));
    assert.equal(replyRes.status, 200, `Expected 200, got ${replyRes.status}`);

    const aiPlannedCount = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_ai_planned" },
    });
    assert.equal(aiPlannedCount, 1, `Expected 1 autopilot_ai_planned event (AI mode), got ${aiPlannedCount}`);

    console.log("  [OK] Step 3: Reply used AI mode (autopilot_ai_planned exists)");

    console.log("\n  PASSED: All Task 30.3 single scenario assertions passed.\n");
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
