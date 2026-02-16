/**
 * Test: Autopilot mode derived from Scenario (run.scenarioId).
 * - EventLog autopilot_inbound payload.mode === scenario.mode
 * - AI scenario => autopilot_ai_planned exists
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

  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as { POST?: PostRouteHandler };
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as { POST?: PostRouteHandler };
  const setDefaultRoute = (await import("../src/app/api/v1/autopilot/scenarios/[scenarioId]/set-default/route")) as {
    POST?: PostRouteHandler;
  };

  if (!leadsRoute.POST || !replyRoute.POST || !setDefaultRoute.POST) {
    throw new Error("Missing route handlers");
  }

  return {
    ingestLeadPost: leadsRoute.POST,
    replyPost: replyRoute.POST,
    setDefaultPost: (scenarioId: string) =>
      setDefaultRoute.POST!(
        new NextRequest(`http://localhost/api/v1/autopilot/scenarios/${scenarioId}/set-default`, { method: "POST" }),
        { params: { scenarioId } }
      ),
  };
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const { ingestLeadPost, replyPost, setDefaultPost } = await loadHandlers();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: { name: `Task Mode From Scenario ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const aiScenario = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "AI Scenario",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.AI,
        maxQuestions: 2,
        aiPrompt: "Esti asistent. Colecteaza intentul.",
        isDefault: true,
      },
      select: { id: true },
    });

    const ingestRes = await ingestLeadPost(
      new NextRequest("http://localhost/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          firstName: "Mode",
          lastName: "Test",
          email: `task_mode+${runId}@example.com`,
          phone: "+40700000099",
          source: "test_task_mode",
          externalId: `task_mode-${runId}`,
        }),
      })
    );
    assert.equal(ingestRes.status, 201);
    const ingestJson = (await ingestRes.json()) as { leadId: string };
    const leadId = ingestJson.leadId;

    const replyRes = await replyPost(
      new NextRequest("http://localhost/api/v1/autopilot/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, text: "pret" }),
      })
    );
    assert.equal(replyRes.status, 200);

    const inboundEvent = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "autopilot_inbound" },
      select: { payload: true },
    });
    assert.ok(inboundEvent, "Expected autopilot_inbound event");
    const payload = inboundEvent.payload as Record<string, unknown>;
    assert.equal(payload.mode, "AI", `Expected autopilot_inbound payload.mode === "AI", got ${payload.mode}`);

    const aiPlannedCount = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_ai_planned" },
    });
    assert.equal(aiPlannedCount, 1, `Expected 1 autopilot_ai_planned event, got ${aiPlannedCount}`);

    console.log("  [OK] EventLog autopilot_inbound payload.mode === AI");
    console.log("  [OK] EventLog autopilot_ai_planned exists");
    console.log("\n  PASSED: Mode from scenario assertions passed.\n");
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
