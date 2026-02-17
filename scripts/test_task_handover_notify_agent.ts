import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { AutopilotScenarioMode, PrismaClient } from "@prisma/client";
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

type IngestionResponse = { leadId: string };
type ReplyResponse = {
  leadId: string;
  autopilot: { status: string; node: string };
  queuedMessage: { id: string; text: string };
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
}> {
  installWorkspaceAliasResolver();
  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as { POST?: PostRouteHandler };
  const replyRoute = (await import("../src/app/api/v1/autopilot/reply/route")) as {
    POST?: PostRouteHandler;
  };
  if (typeof leadsRoute.POST !== "function") throw new Error("Failed to load POST from leads/route");
  if (typeof replyRoute.POST !== "function")
    throw new Error("Failed to load POST from autopilot/reply/route");
  return { ingestLeadPost: leadsRoute.POST, replyPost: replyRoute.POST };
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
  let userId: string | null = null;

  try {
    const { ingestLeadPost, replyPost } = await loadHandlers();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: { name: `Handover Notify Test ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const user = await prisma.user.create({
      data: {
        email: `handover-agent-${runId}@example.com`,
        name: "Agent Test",
        phone: "+40700008888",
      },
      select: { id: true },
    });
    userId = user.id;

    await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "Handover Scenario",
        mode: AutopilotScenarioMode.RULES,
        maxQuestions: 2,
        isDefault: true,
        handoverUserId: user.id,
      },
      select: { id: true },
    });

    const ingestRes = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "Lead",
        lastName: "Test",
        phone: "+40700007777",
        email: `handover-lead-${runId}@example.com`,
        source: "test_handover_notify",
        externalId: `handover-${runId}`,
      })
    );
    assert.equal(ingestRes.status, 201, `Expected 201, got ${ingestRes.status}`);
    const ingestJson = (await ingestRes.json()) as IngestionResponse;
    const leadId = ingestJson.leadId;

    const reply1 = await replyPost(createReplyRequest({ leadId, text: "pret" }));
    assert.equal(reply1.status, 200);
    const reply1Json = (await reply1.json()) as ReplyResponse;
    assert.equal(reply1Json.autopilot.status, "ACTIVE");

    const reply2 = await replyPost(createReplyRequest({ leadId, text: "Folie cerata" }));
    assert.equal(reply2.status, 200);
    const reply2Json = (await reply2.json()) as ReplyResponse;
    assert.equal(reply2Json.autopilot.status, "HANDED_OVER", "Expected HANDED_OVER after second reply.");

    const notified = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "handover_notified" },
      select: { id: true, payload: true },
    });
    const blocked = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "handover_notification_blocked" },
      select: { id: true },
    });
    const failed = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "handover_notification_failed" },
      select: { id: true },
    });

    assert.ok(
      notified ?? blocked ?? failed,
      "Expected one of handover_notified, handover_notification_blocked, or handover_notification_failed."
    );
    assert.ok(notified, "Expected handover_notified EventLog (agent with phone; stub or Twilio may send).");

    const payload = notified!.payload as Record<string, unknown>;
    assert.equal(payload.handoverUserId, user.id);
    assert.equal(payload.channel, "whatsapp");

    console.log("  [OK] handover_notified event present");
    console.log("\n  Task handover notify agent test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("\n  Task handover notify agent test FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (workspaceId) {
      await prisma.lead.deleteMany({ where: { workspaceId } }).catch(() => {});
      await prisma.autopilotScenario.deleteMany({ where: { workspaceId } }).catch(() => {});
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await pool.end();
  }
}

main();
