/**
 * Task #25 Phase A test: AI planner stub.
 *
 * Flow:
 * 1. Create workspace
 * 2. Create scenario with mode=AI, aiPrompt containing company name, maxQuestions=3
 * 3. Set it as default for the workspace
 * 4. Ingest a lead (AutopilotRun gets scenarioId)
 * 5. Reply with "pret" → verify AI planner produces response containing company name
 * 6. Reply with "serviciu X" → verify follow-up still contains company name
 * 7. Reply with "da" → verify handover (questionIndex 3 >= maxQuestions 3)
 * 8. Verify event logs
 */

import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import {
  AutopilotScenarioMode,
  AutopilotScenarioType,
  OutboundMessageStatus,
  PrismaClient,
} from "@prisma/client";
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
  autopilot: {
    status: string;
    node: string;
    answers: Record<string, string>;
  };
  queuedMessage: {
    id: string;
    text: string;
    toPhone: string | null;
  };
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
    options?: unknown,
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
}> {
  installWorkspaceAliasResolver();

  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as {
    POST?: PostRouteHandler;
  };
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };

  if (typeof leadsRoute.POST !== "function") {
    throw new Error("Failed to load POST from leads/route.ts");
  }
  if (typeof replyRoute.POST !== "function") {
    throw new Error("Failed to load POST from autopilot/reply/route.ts");
  }

  return {
    ingestLeadPost: leadsRoute.POST,
    replyPost: replyRoute.POST,
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

const COMPANY_NAME = "AcmeDental";
const AI_PROMPT = `Esti asistent virtual pentru ${COMPANY_NAME}.
Tonul este prietenos si profesional.
Colecteaza: ce serviciu il intereseaza pe client, pentru cand ar dori programare.
Dupa ce ai colectat informatiile, transfera la agent.`;

async function main() {
  let workspaceId: string | null = null;

  try {
    const { ingestLeadPost, replyPost } = await loadHandlers();
    const runId = Date.now();

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + AI scenario (mode=AI, maxQuestions=3)
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task25 AI Test ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    // Create AI scenario and set as default
    const aiScenario = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "AI Qualification Test",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.AI,
        aiPrompt: AI_PROMPT,
        slaMinutes: 15,
        maxQuestions: 3,
        isDefault: true,
      },
    });

    console.log(`  [OK] Created workspace + AI scenario (maxQuestions=3, mode=AI)`);

    // -----------------------------------------------------------------------
    // Step 1: Ingest lead
    // -----------------------------------------------------------------------
    const ingestRes = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "Andrei",
        lastName: "Test",
        email: `task25+${runId}@example.com`,
        phone: "+40700000025",
        source: "test_task25",
        externalId: `task25-${runId}`,
      }),
    );
    assert.equal(ingestRes.status, 201, `Expected 201, got ${ingestRes.status}`);
    const ingestJson = (await ingestRes.json()) as IngestionResponse;
    const leadId = ingestJson.leadId;

    // Verify run has scenarioId pointing to AI scenario
    const runAfterIngest = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { scenarioId: true, stateJson: true },
    });
    assert.ok(runAfterIngest, "Expected AutopilotRun after ingestion.");
    assert.equal(runAfterIngest.scenarioId, aiScenario.id, "Run should use AI scenario.");

    const stateAfterIngest = runAfterIngest.stateJson as {
      node: string;
      questionIndex: number;
    };
    assert.equal(stateAfterIngest.node, "q1");
    assert.equal(stateAfterIngest.questionIndex, 0);

    console.log("  [OK] Ingested lead with AI scenario");

    // -----------------------------------------------------------------------
    // Step 2: Reply with "pret" → AI should detect pricing intent and
    //         response should contain company name from prompt
    // -----------------------------------------------------------------------
    const reply1Res = await replyPost(
      createReplyRequest({ leadId, text: "pret" }),
    );
    assert.equal(reply1Res.status, 200, `Expected 200 for reply 1, got ${reply1Res.status}`);
    const reply1Json = (await reply1Res.json()) as ReplyResponse;

    // The stub AI planner should include company name in response
    assert.ok(
      reply1Json.queuedMessage.text.toLowerCase().includes(COMPANY_NAME.toLowerCase()),
      `Expected response to contain company name "${COMPANY_NAME}", got: "${reply1Json.queuedMessage.text}"`,
    );
    assert.equal(reply1Json.autopilot.answers.intent, "pricing", "Expected intent=pricing.");
    assert.equal(reply1Json.autopilot.status, "ACTIVE", "Expected status still ACTIVE (q1 of 3).");

    // Verify state advanced
    const runAfterR1 = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { stateJson: true },
    });
    const stateR1 = runAfterR1!.stateJson as { questionIndex: number; node: string };
    assert.equal(stateR1.questionIndex, 1, "Expected questionIndex=1 after first reply.");

    console.log("  [OK] Reply 1 (pret): AI response contains company name, intent=pricing");

    // -----------------------------------------------------------------------
    // Step 3: Reply with "serviciu detartraj" → follow-up question
    //         still has company name
    // -----------------------------------------------------------------------
    const reply2Res = await replyPost(
      createReplyRequest({ leadId, text: "serviciu detartraj" }),
    );
    assert.equal(reply2Res.status, 200, `Expected 200 for reply 2, got ${reply2Res.status}`);
    const reply2Json = (await reply2Res.json()) as ReplyResponse;

    assert.ok(
      reply2Json.queuedMessage.text.toLowerCase().includes(COMPANY_NAME.toLowerCase()),
      `Expected follow-up to contain "${COMPANY_NAME}", got: "${reply2Json.queuedMessage.text}"`,
    );
    assert.equal(reply2Json.autopilot.status, "ACTIVE", "Expected status still ACTIVE (q2 of 3).");

    const runAfterR2 = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { stateJson: true },
    });
    const stateR2 = runAfterR2!.stateJson as { questionIndex: number };
    assert.equal(stateR2.questionIndex, 2, "Expected questionIndex=2 after second reply.");

    console.log("  [OK] Reply 2 (serviciu detartraj): follow-up contains company name");

    // -----------------------------------------------------------------------
    // Step 4: Reply with "da, multumesc" → should trigger handover
    //         (questionIndex goes from 2 to 3, which >= maxQuestions=3)
    // -----------------------------------------------------------------------
    const reply3Res = await replyPost(
      createReplyRequest({ leadId, text: "da, multumesc" }),
    );
    assert.equal(reply3Res.status, 200, `Expected 200 for reply 3, got ${reply3Res.status}`);
    const reply3Json = (await reply3Res.json()) as ReplyResponse;

    assert.equal(reply3Json.autopilot.status, "HANDED_OVER", "Expected HANDED_OVER after 3 questions.");
    assert.equal(reply3Json.autopilot.node, "handover", "Expected node=handover.");
    assert.ok(
      reply3Json.queuedMessage.text.toLowerCase().includes(COMPANY_NAME.toLowerCase()),
      `Expected handover message to reference "${COMPANY_NAME}", got: "${reply3Json.queuedMessage.text}"`,
    );

    // Verify DB state
    const runAfterR3 = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { status: true, stateJson: true, currentStep: true },
    });
    assert.ok(runAfterR3);
    assert.equal(runAfterR3.status, "HANDED_OVER");
    assert.equal(runAfterR3.currentStep, "handover");
    const stateR3 = runAfterR3.stateJson as { questionIndex: number };
    assert.equal(stateR3.questionIndex, 3, "Expected questionIndex=3 at handover.");

    console.log("  [OK] Reply 3 (da, multumesc): handover triggered at maxQuestions=3");

    // -----------------------------------------------------------------------
    // Step 5: Verify event logs
    // -----------------------------------------------------------------------
    const inboundCount = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_inbound" },
    });
    assert.equal(inboundCount, 3, `Expected 3 autopilot_inbound events, got ${inboundCount}.`);

    // Check that inbound events have mode=AI
    const inboundEvents = await prisma.eventLog.findMany({
      where: { leadId, eventType: "autopilot_inbound" },
      select: { payload: true },
      orderBy: { occurredAt: "asc" },
    });
    for (const evt of inboundEvents) {
      const payload = evt.payload as Record<string, unknown>;
      assert.equal(payload.mode, "AI", "Expected inbound event mode=AI.");
    }

    const handoverCount = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_handover" },
    });
    assert.equal(handoverCount, 1, `Expected 1 autopilot_handover event, got ${handoverCount}.`);

    const handoverEvt = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "autopilot_handover" },
      select: { payload: true },
    });
    const handoverPayload = handoverEvt!.payload as Record<string, unknown>;
    assert.equal(handoverPayload.scenarioId, aiScenario.id, "Handover event should reference AI scenario.");

    const queuedCount = await prisma.eventLog.count({
      where: { leadId, eventType: "message_queued" },
    });
    // 1 from ingestion + 3 from replies = 4
    assert.ok(queuedCount >= 4, `Expected >= 4 message_queued events, got ${queuedCount}.`);

    console.log("  [OK] Event logs verified (mode=AI in payloads)");

    // -----------------------------------------------------------------------
    // Step 6: Verify RULES mode still works (quick sanity check)
    // -----------------------------------------------------------------------
    // Create a RULES scenario and a new lead
    const rulesScenario = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "Rules Sanity Check",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.RULES,
        slaMinutes: 15,
        maxQuestions: 2,
        isDefault: false,
      },
    });

    // Set rules as default (unset AI)
    await prisma.autopilotScenario.update({
      where: { id: aiScenario.id },
      data: { isDefault: false },
    });
    await prisma.autopilotScenario.update({
      where: { id: rulesScenario.id },
      data: { isDefault: true },
    });

    const ingest2Res = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "Maria",
        lastName: "Rules",
        email: `task25-rules+${runId}@example.com`,
        phone: "+40700000026",
        source: "test_task25",
        externalId: `task25-rules-${runId}`,
      }),
    );
    assert.equal(ingest2Res.status, 201);
    const ingest2Json = (await ingest2Res.json()) as IngestionResponse;
    const leadId2 = ingest2Json.leadId;

    const rulesRun = await prisma.autopilotRun.findUnique({
      where: { leadId: leadId2 },
      select: { scenarioId: true },
    });
    assert.equal(rulesRun!.scenarioId, rulesScenario.id, "Rules lead should use rules scenario.");

    const rulesReply = await replyPost(
      createReplyRequest({ leadId: leadId2, text: "pret" }),
    );
    assert.equal(rulesReply.status, 200);
    const rulesReplyJson = (await rulesReply.json()) as ReplyResponse;

    // RULES mode should NOT contain company name from AI prompt
    assert.ok(
      rulesReplyJson.queuedMessage.text.includes("serviciu"),
      `Expected RULES follow-up with 'serviciu', got: ${rulesReplyJson.queuedMessage.text}`,
    );
    assert.equal(rulesReplyJson.autopilot.answers.intent, "pricing");

    console.log("  [OK] RULES mode sanity check passed");

    console.log("\nTask #25 Phase A test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("\nTask #25 Phase A test FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (workspaceId) {
      await prisma.workspace
        .delete({ where: { id: workspaceId } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  }
}

void main();
