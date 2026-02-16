import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { OutboundMessageStatus, PrismaClient } from "@prisma/client";
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

type DispatchResponse = {
  processed: number;
  sent: number;
  failed: number;
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
  dispatchPost: PostRouteHandler;
}> {
  installWorkspaceAliasResolver();

  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as {
    POST?: PostRouteHandler;
  };
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };
  const dispatchRoute = (await import("../src/app/api/v1/messages/dispatch/route")) as {
    POST?: PostRouteHandler;
  };

  if (typeof leadsRoute.POST !== "function") {
    throw new Error("Failed to load POST from leads/route.ts");
  }
  if (typeof replyRoute.POST !== "function") {
    throw new Error("Failed to load POST from autopilot/reply/route.ts");
  }
  if (typeof dispatchRoute.POST !== "function") {
    throw new Error("Failed to load POST from messages/dispatch/route.ts");
  }

  return {
    ingestLeadPost: leadsRoute.POST,
    replyPost: replyRoute.POST,
    dispatchPost: dispatchRoute.POST,
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

function createDispatchRequest() {
  return new NextRequest("http://localhost/api/v1/messages/dispatch", {
    method: "POST",
  });
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const { ingestLeadPost, replyPost, dispatchPost } = await loadHandlers();
    const runId = Date.now();

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + lead via ingestion (autopilot run created)
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task23 Reply Test ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const ingestRes = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "TestReply",
        lastName: "User",
        email: `task23+${runId}@example.com`,
        phone: "+40700000023",
        source: "test_task23",
        externalId: `task23-${runId}`,
      })
    );
    assert.equal(ingestRes.status, 201, `Expected 201, got ${ingestRes.status}`);
    const ingestJson = (await ingestRes.json()) as IngestionResponse;
    const leadId = ingestJson.leadId;

    // Verify autopilot run + stateJson initialized + scenarioId set
    const runBefore = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { status: true, stateJson: true, currentStep: true, scenarioId: true },
    });
    assert.ok(runBefore, "Expected AutopilotRun created by ingestion.");
    assert.equal(runBefore.status, "ACTIVE");
    assert.ok(runBefore.scenarioId, "Expected scenarioId set on AutopilotRun at ingestion.");

    const stateBefore = runBefore.stateJson as {
      node?: string;
      answers?: Record<string, string>;
      questionIndex?: number;
    } | null;
    assert.equal(stateBefore?.node, "q1", "Expected initial node q1.");
    assert.equal(stateBefore?.questionIndex, 0, "Expected initial questionIndex 0.");

    // Verify a default scenario was created for the workspace
    const scenario = await prisma.autopilotScenario.findFirst({
      where: { workspaceId: workspace.id, isDefault: true },
      select: { id: true, maxQuestions: true, name: true },
    });
    assert.ok(scenario, "Expected default AutopilotScenario created for workspace.");
    assert.equal(runBefore.scenarioId, scenario.id, "Run scenarioId should match default scenario.");
    assert.equal(scenario.maxQuestions, 2, "Default scenario maxQuestions should be 2.");

    // Verify autopilot_started event includes scenarioId
    const startedEvent = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "autopilot_started" },
      select: { payload: true },
    });
    assert.ok(startedEvent, "Expected autopilot_started event.");
    const startedPayload = startedEvent.payload as Record<string, unknown>;
    assert.equal(startedPayload.scenarioId, scenario.id, "autopilot_started payload should include scenarioId.");

    console.log("  [OK] Ingestion created lead + autopilot run with scenarioId + stateJson");

    // -----------------------------------------------------------------------
    // Step 1: Reply with "pret" -> should advance to q2_pricing
    // -----------------------------------------------------------------------
    const reply1Res = await replyPost(
      createReplyRequest({ leadId, text: "pret" })
    );
    assert.equal(reply1Res.status, 200, `Expected 200, got ${reply1Res.status}`);
    const reply1Json = (await reply1Res.json()) as ReplyResponse;

    assert.equal(reply1Json.autopilot.node, "q2_pricing", "Expected node q2_pricing after reply 'pret'.");
    assert.equal(reply1Json.autopilot.answers.intent, "pricing", "Expected intent=pricing.");
    assert.equal(reply1Json.autopilot.status, "ACTIVE", "Expected status still ACTIVE.");
    assert.ok(reply1Json.queuedMessage.id, "Expected queued message id.");
    assert.ok(
      reply1Json.queuedMessage.text.includes("serviciu") || reply1Json.queuedMessage.text.includes("pret"),
      `Expected pricing follow-up question, got: ${reply1Json.queuedMessage.text}`
    );

    // Verify DB state
    const runAfterReply1 = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { stateJson: true, currentStep: true, lastInboundAt: true, scenarioId: true },
    });
    assert.ok(runAfterReply1);
    const stateAfter1 = runAfterReply1.stateJson as {
      node: string;
      answers: Record<string, string>;
      questionIndex: number;
    };
    assert.equal(stateAfter1.node, "q2_pricing");
    assert.equal(stateAfter1.answers.intent, "pricing");
    assert.equal(stateAfter1.questionIndex, 1, "Expected questionIndex advanced to 1.");
    assert.ok(runAfterReply1.lastInboundAt, "Expected lastInboundAt set.");
    assert.equal(runAfterReply1.currentStep, "q2_pricing");
    assert.equal(runAfterReply1.scenarioId, scenario.id, "scenarioId should remain set.");

    // Verify OutboundMessage queued
    const queuedMsg1 = await prisma.outboundMessage.findUnique({
      where: { id: reply1Json.queuedMessage.id },
      select: { status: true, text: true, toPhone: true },
    });
    assert.ok(queuedMsg1, "Expected outbound message in DB.");
    assert.equal(queuedMsg1.status, OutboundMessageStatus.QUEUED);
    assert.equal(queuedMsg1.toPhone, "+40700000023");

    // Verify EventLog entries
    const inboundEvents1 = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_inbound" },
    });
    assert.ok(inboundEvents1 >= 1, "Expected autopilot_inbound event.");

    console.log("  [OK] Reply 1 ('pret') -> q2_pricing, outbound queued");

    // -----------------------------------------------------------------------
    // Step 2: Dispatch to mark it SENT
    // -----------------------------------------------------------------------
    // Backdate so dispatch picks it up quickly
    await prisma.outboundMessage.update({
      where: { id: reply1Json.queuedMessage.id },
      data: { createdAt: new Date(0) },
    });

    let dispatched = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dispRes = await dispatchPost(createDispatchRequest());
      assert.equal(dispRes.status, 200);
      const dispJson = (await dispRes.json()) as DispatchResponse;
      assert.equal(typeof dispJson.sent, "number");

      const msgAfter = await prisma.outboundMessage.findUnique({
        where: { id: reply1Json.queuedMessage.id },
        select: { status: true },
      });
      if (msgAfter?.status === OutboundMessageStatus.SENT) {
        dispatched = true;
        break;
      }
    }
    assert.ok(dispatched, "Expected q2_pricing outbound message dispatched to SENT.");

    console.log("  [OK] Dispatch marked message SENT");

    // -----------------------------------------------------------------------
    // Step 3: Reply with "Folie cerata" -> should advance to handover
    //         (maxQuestions=2, questionIndex goes from 1 to 2 which >= 2)
    // -----------------------------------------------------------------------
    const reply2Res = await replyPost(
      createReplyRequest({ leadId, text: "Folie cerata" })
    );
    assert.equal(reply2Res.status, 200, `Expected 200, got ${reply2Res.status}`);
    const reply2Json = (await reply2Res.json()) as ReplyResponse;

    assert.equal(reply2Json.autopilot.node, "handover", "Expected node handover after q2 reply.");
    assert.equal(reply2Json.autopilot.status, "HANDED_OVER", "Expected status HANDED_OVER.");
    assert.ok(
      reply2Json.queuedMessage.text.includes("agent"),
      `Expected handover confirmation message, got: ${reply2Json.queuedMessage.text}`
    );

    // Verify DB state
    const runAfterReply2 = await prisma.autopilotRun.findUnique({
      where: { leadId },
      select: { status: true, stateJson: true, currentStep: true, scenarioId: true },
    });
    assert.ok(runAfterReply2);
    assert.equal(runAfterReply2.status, "HANDED_OVER");
    assert.equal(runAfterReply2.currentStep, "handover");
    assert.equal(runAfterReply2.scenarioId, scenario.id, "scenarioId should remain set after handover.");
    const stateAfter2 = runAfterReply2.stateJson as {
      node: string;
      answers: Record<string, string>;
      questionIndex: number;
    };
    assert.equal(stateAfter2.node, "handover");
    assert.equal(stateAfter2.answers.intent, "pricing");
    assert.equal(stateAfter2.questionIndex, 2, "Expected questionIndex 2 at handover.");

    // Verify confirmation outbound message queued
    const queuedMsg2 = await prisma.outboundMessage.findUnique({
      where: { id: reply2Json.queuedMessage.id },
      select: { status: true, text: true },
    });
    assert.ok(queuedMsg2);
    assert.equal(queuedMsg2.status, OutboundMessageStatus.QUEUED);

    // Verify autopilot_handover event was created
    const handoverEvent = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "autopilot_handover" },
      select: { payload: true },
    });
    assert.ok(handoverEvent, "Expected autopilot_handover event.");
    const handoverPayload = handoverEvent.payload as Record<string, unknown>;
    assert.equal(handoverPayload.scenarioId, scenario.id, "autopilot_handover payload should include scenarioId.");

    console.log("  [OK] Reply 2 ('Folie cerata') -> handover, status HANDED_OVER, confirmation queued");

    // -----------------------------------------------------------------------
    // Final event counts
    // -----------------------------------------------------------------------
    const inboundCount = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_inbound" },
    });
    assert.equal(inboundCount, 2, `Expected 2 autopilot_inbound events, got ${inboundCount}.`);

    const messageQueuedCount = await prisma.eventLog.count({
      where: { leadId, eventType: "message_queued" },
    });
    // 1 from ingestion + 2 from replies = 3
    assert.ok(messageQueuedCount >= 3, `Expected >= 3 message_queued events, got ${messageQueuedCount}.`);

    const handoverCount = await prisma.eventLog.count({
      where: { leadId, eventType: "autopilot_handover" },
    });
    assert.equal(handoverCount, 1, `Expected 1 autopilot_handover event, got ${handoverCount}.`);

    console.log("  [OK] Event counts verified");
    console.log("\nTask #23 test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("\nTask #23 test FAILED");
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
