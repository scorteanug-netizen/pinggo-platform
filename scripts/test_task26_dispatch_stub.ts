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

type DispatchSummary = {
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
  dispatchPost: PostRouteHandler;
}> {
  installWorkspaceAliasResolver();

  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as {
    POST?: PostRouteHandler;
  };
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };
  const dispatchRoute = (await import("../src/app/api/v1/messaging/run-dispatch/route")) as {
    POST?: PostRouteHandler;
  };

  if (typeof leadsRoute.POST !== "function") {
    throw new Error("Failed to load POST from leads/route.ts");
  }
  if (typeof replyRoute.POST !== "function") {
    throw new Error("Failed to load POST from autopilot/reply/route.ts");
  }
  if (typeof dispatchRoute.POST !== "function") {
    throw new Error("Failed to load POST from messaging/run-dispatch/route.ts");
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
  return new NextRequest("http://localhost/api/v1/messaging/run-dispatch", {
    method: "POST",
  });
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const { ingestLeadPost, replyPost, dispatchPost } = await loadHandlers();
    const runId = Date.now();

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + lead via ingestion
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task26 Dispatch Test ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const ingestRes = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "DispatchTest",
        lastName: "User",
        email: `task26+${runId}@example.com`,
        phone: "+40700000026",
        source: "test_task26",
        externalId: `task26-${runId}`,
      }),
    );
    assert.equal(ingestRes.status, 201, `Ingestion expected 201, got ${ingestRes.status}`);
    const ingestJson = (await ingestRes.json()) as IngestionResponse;
    const leadId = ingestJson.leadId;
    console.log("  [OK] Step 0: Lead ingested, leadId =", leadId);

    // -----------------------------------------------------------------------
    // Step 1: Reply to generate a QUEUED outbound message
    // -----------------------------------------------------------------------
    const reply1Res = await replyPost(
      createReplyRequest({ leadId, text: "pret" }),
    );
    assert.equal(reply1Res.status, 200, `Reply expected 200, got ${reply1Res.status}`);
    const reply1Json = (await reply1Res.json()) as ReplyResponse;
    assert.ok(reply1Json.queuedMessage.id, "Expected queued message id from reply.");

    // Verify QUEUED messages exist
    const queuedBefore = await prisma.outboundMessage.findMany({
      where: { leadId, status: OutboundMessageStatus.QUEUED },
      select: { id: true, toPhone: true, text: true },
    });
    assert.ok(queuedBefore.length > 0, "Expected at least 1 QUEUED outbound message.");
    console.log("  [OK] Step 1: Reply queued", queuedBefore.length, "message(s)");

    // -----------------------------------------------------------------------
    // Step 2: Call dispatch endpoint
    // -----------------------------------------------------------------------
    const dispatchRes = await dispatchPost(createDispatchRequest());
    assert.equal(dispatchRes.status, 200, `Dispatch expected 200, got ${dispatchRes.status}`);
    const dispatchJson = (await dispatchRes.json()) as DispatchSummary;

    assert.ok(dispatchJson.processed > 0, "Expected processed > 0");
    assert.ok(dispatchJson.sent > 0, "Expected sent > 0");
    assert.equal(dispatchJson.failed, 0, "Expected 0 failures");
    console.log("  [OK] Step 2: Dispatch summary:", JSON.stringify(dispatchJson));

    // -----------------------------------------------------------------------
    // Step 3: Verify OutboundMessage updated to SENT
    // -----------------------------------------------------------------------
    const sentMessages = await prisma.outboundMessage.findMany({
      where: { leadId, status: OutboundMessageStatus.SENT },
      select: { id: true, provider: true, providerMessageId: true, sentAt: true },
    });
    assert.ok(sentMessages.length > 0, "Expected at least 1 SENT outbound message.");
    for (const msg of sentMessages) {
      assert.equal(msg.provider, "stub", "Expected provider='stub'.");
      assert.ok(msg.providerMessageId?.startsWith("stub-"), "Expected providerMessageId starts with 'stub-'.");
      assert.ok(msg.sentAt, "Expected sentAt set.");
    }
    console.log("  [OK] Step 3:", sentMessages.length, "message(s) marked SENT with providerMessageId");

    // -----------------------------------------------------------------------
    // Step 4: Verify ProofEvent created (channel=WHATSAPP, type=SENT)
    // -----------------------------------------------------------------------
    const proofEvents = await prisma.proofEvent.findMany({
      where: { leadId, channel: "WHATSAPP", type: "SENT" },
      select: { provider: true, providerMessageId: true, occurredAt: true },
    });
    assert.ok(proofEvents.length > 0, "Expected at least 1 ProofEvent (WHATSAPP, SENT).");
    for (const pe of proofEvents) {
      assert.equal(pe.provider, "stub");
      assert.ok(pe.providerMessageId?.startsWith("stub-"));
    }
    console.log("  [OK] Step 4:", proofEvents.length, "ProofEvent(s) created");

    // -----------------------------------------------------------------------
    // Step 5: Verify EventLog has "message_sent"
    // -----------------------------------------------------------------------
    const sentEvents = await prisma.eventLog.findMany({
      where: { leadId, eventType: "message_sent" },
      select: { payload: true },
    });
    assert.ok(sentEvents.length > 0, "Expected at least 1 EventLog with eventType='message_sent'.");
    const sentPayload = sentEvents[0].payload as Record<string, unknown>;
    assert.ok(sentPayload.outboundMessageId, "Expected outboundMessageId in payload.");
    assert.equal(sentPayload.provider, "stub");
    assert.ok(sentPayload.providerMessageId);
    assert.equal(sentPayload.toPhone, "+40700000026");
    console.log("  [OK] Step 5: EventLog 'message_sent' verified");

    // -----------------------------------------------------------------------
    // Step 6: Verify SLA is NOT stopped by sending
    // -----------------------------------------------------------------------
    const slaState = await prisma.sLAState.findFirst({
      where: { leadId },
      select: { stoppedAt: true, breachedAt: true },
    });
    assert.ok(slaState, "Expected SLAState to exist for lead.");
    assert.equal(slaState.stoppedAt, null, "SLA should NOT be stopped by sending (stop occurs on delivered/read).");
    console.log("  [OK] Step 6: SLA not stopped after dispatch");

    // -----------------------------------------------------------------------
    // Step 7: Second dispatch should be a no-op (no more QUEUED)
    // -----------------------------------------------------------------------
    const dispatch2Res = await dispatchPost(createDispatchRequest());
    assert.equal(dispatch2Res.status, 200);
    const dispatch2Json = (await dispatch2Res.json()) as DispatchSummary;
    assert.equal(dispatch2Json.processed, 0, "Second dispatch should find 0 queued messages.");
    console.log("  [OK] Step 7: Second dispatch is no-op");

    console.log("\n  PASSED: All Task 26 dispatch assertions passed.\n");
  } finally {
    // Cleanup
    if (workspaceId) {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n  FAILED:", err.message ?? err, "\n");
  process.exit(1);
});
