import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { LeadSourceType, OutboundChannel, PrismaClient } from "@prisma/client";
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
  queuedMessage: { id: string; text: string; toPhone: string } | null;
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
    const testPhone = "+40700000000";

    // -----------------------------------------------------------------------
    // Step 0: Create workspace, scenario, lead WITH phone, autopilotRun
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task28b Phone Present ${runId}` },
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
        firstName: "HasPhone",
        lastName: "User",
        email: `task28b+${runId}@example.com`,
        phone: testPhone,
        source: "test_task28b",
        sourceType: LeadSourceType.API,
        externalId: `task28b-${runId}`,
      },
      select: { id: true, phone: true },
    });
    assert.strictEqual(lead.phone, testPhone, "Lead must have phone for this test.");

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

    console.log("  [OK] Step 0: Workspace, lead (with phone), scenario, AutopilotRun created");

    // -----------------------------------------------------------------------
    // Step 1: Trigger autopilot reply
    // -----------------------------------------------------------------------
    const replyRes = await replyPost(createReplyRequest({ leadId: lead.id, text: "pret" }));
    assert.equal(replyRes.status, 200, `Expected 200, got ${replyRes.status}`);

    const replyJson = (await replyRes.json()) as ReplyResponse;
    assert.notStrictEqual(replyJson.messageBlocked, true, "Expected messageBlocked !== true");
    assert.ok(replyJson.queuedMessage, "Expected queuedMessage when phone present");
    assert.strictEqual(
      replyJson.queuedMessage!.toPhone,
      testPhone.trim(),
      "Expected toPhone to be trimmed lead phone"
    );

    console.log("  [OK] Step 1: Reply returned queuedMessage, messageBlocked !== true");

    // -----------------------------------------------------------------------
    // Step 2: Assert no EventLog message_blocked for this lead
    // -----------------------------------------------------------------------
    const blockedEvent = await prisma.eventLog.findFirst({
      where: { leadId: lead.id, eventType: "message_blocked" },
    });
    assert.strictEqual(blockedEvent, null, "Expected no message_blocked when phone present");

    console.log("  [OK] Step 2: No EventLog message_blocked");

    // -----------------------------------------------------------------------
    // Step 3: Assert OutboundMessage created with channel WHATSAPP, toPhone
    // -----------------------------------------------------------------------
    const outbound = await prisma.outboundMessage.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, channel: true, toPhone: true, status: true },
    });
    assert.ok(outbound, "Expected OutboundMessage created");
    assert.strictEqual(outbound.channel, OutboundChannel.WHATSAPP);
    assert.strictEqual(outbound.toPhone, testPhone.trim());

    console.log("  [OK] Step 3: OutboundMessage created with channel WHATSAPP, toPhone +40700000000");

    console.log("\n  PASSED: All Task 28b phone present not blocked assertions passed.\n");
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
