import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { LeadSourceType, OutboundMessageStatus, PrismaClient } from "@prisma/client";
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

type ReplyResponse = {
  leadId: string;
  autopilot: { status: string; node: string; answers: Record<string, string> };
  queuedMessage: { id: string; text: string; toPhone: string | null } | null;
  messageBlocked?: boolean;
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

async function loadReplyHandler(): Promise<PostRouteHandler> {
  installWorkspaceAliasResolver();
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };
  if (typeof replyRoute.POST !== "function") {
    throw new Error("Failed to load POST from autopilot/reply/route.ts");
  }
  return replyRoute.POST;
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
    const replyPost = await loadReplyHandler();
    const runId = Date.now();

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + lead WITHOUT phone
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task28 Missing Phone ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const scenario = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "Default",
        isDefault: true,
        maxQuestions: 2,
        scenarioType: "QUALIFY_ONLY",
        mode: "RULES",
      },
      select: { id: true },
    });

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        firstName: "NoPhone",
        lastName: "User",
        email: `task28+${runId}@example.com`,
        phone: null,
        source: "test_task28",
        sourceType: LeadSourceType.API,
        externalId: `task28-${runId}`,
      },
      select: { id: true, phone: true },
    });
    assert.strictEqual(lead.phone, null, "Lead must have phone=null for this test.");

    await prisma.autopilotRun.create({
      data: {
        leadId: lead.id,
        workspaceId: workspace.id,
        scenarioId: scenario.id,
        status: "ACTIVE",
        currentStep: "q1",
        stateJson: { node: "q1", answers: {}, questionIndex: 0 },
        lastOutboundAt: new Date(),
      },
    });

    console.log("  [OK] Step 0: Workspace, lead (no phone), scenario, AutopilotRun created");

    // -----------------------------------------------------------------------
    // Step 1: Trigger autopilot reply that would normally queue an outbound
    // -----------------------------------------------------------------------
    const replyRes = await replyPost(createReplyRequest({ leadId: lead.id, text: "pret" }));
    assert.equal(replyRes.status, 200, `Expected 200, got ${replyRes.status}`);

    const replyJson = (await replyRes.json()) as ReplyResponse;
    assert.strictEqual(replyJson.queuedMessage, null, "Expected no queued message when phone missing");
    assert.strictEqual(replyJson.messageBlocked, true, "Expected messageBlocked: true");

    console.log("  [OK] Step 1: Reply returned queuedMessage=null, messageBlocked=true");

    // -----------------------------------------------------------------------
    // Step 2: Assert no OutboundMessage QUEUED created for this lead
    // -----------------------------------------------------------------------
    const queuedCount = await prisma.outboundMessage.count({
      where: {
        leadId: lead.id,
        status: OutboundMessageStatus.QUEUED,
      },
    });
    assert.equal(queuedCount, 0, `Expected 0 QUEUED outbound messages, got ${queuedCount}`);

    console.log("  [OK] Step 2: No OutboundMessage QUEUED created");

    // -----------------------------------------------------------------------
    // Step 3: Assert EventLog message_blocked exists
    // -----------------------------------------------------------------------
    const blockedEvent = await prisma.eventLog.findFirst({
      where: { leadId: lead.id, eventType: "message_blocked" },
      select: { id: true, payload: true },
    });
    assert.ok(blockedEvent, "Expected EventLog with eventType='message_blocked'");

    const payload = blockedEvent.payload as Record<string, unknown>;
    assert.equal(payload?.reason, "missing_phone");
    assert.equal(payload?.channel, "whatsapp");
    assert.equal(payload?.scenarioId, scenario.id);

    console.log("  [OK] Step 3: EventLog message_blocked exists with correct payload");

    console.log("\n  PASSED: All Task 28 missing phone assertions passed.\n");
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
