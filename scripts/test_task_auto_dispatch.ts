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
  autopilot: { status: string; node: string; answers: Record<string, string> };
  queuedMessage: { id: string; text: string; toPhone: string | null };
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

async function main() {
  let workspaceId: string | null = null;
  try {
    const { ingestLeadPost, replyPost } = await loadHandlers();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: { name: `Task Auto-Dispatch ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const ingestRes = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "AutoDispatch",
        lastName: "User",
        email: `autodispatch+${runId}@example.com`,
        phone: "+40700009999",
        source: "test_auto_dispatch",
        externalId: `auto-dispatch-${runId}`,
      })
    );
    assert.equal(ingestRes.status, 201, `Expected 201, got ${ingestRes.status}`);
    const ingestJson = (await ingestRes.json()) as IngestionResponse;
    const leadId = ingestJson.leadId;

    const scenario = await prisma.autopilotScenario.findFirst({
      where: { workspaceId: workspace.id, isDefault: true },
      select: { id: true },
    });
    assert.ok(scenario, "Expected default AutopilotScenario.");

    console.log("  [OK] Workspace + lead with phone created");

    const replyRes = await replyPost(createReplyRequest({ leadId, text: "pret" }));
    assert.equal(replyRes.status, 200, `Expected 200, got ${replyRes.status}`);
    const replyJson = (await replyRes.json()) as ReplyResponse;

    assert.ok(replyJson.queuedMessage?.id, "Expected queued message id.");
    const queuedId = replyJson.queuedMessage.id;

    const msg = await prisma.outboundMessage.findUnique({
      where: { id: queuedId },
      select: { status: true, providerMessageId: true },
    });
    assert.ok(msg, "OutboundMessage should exist.");
    assert.equal(
      msg.status,
      OutboundMessageStatus.SENT,
      `Expected auto-dispatch to set status SENT, got ${msg.status}`
    );

    console.log("  [OK] OutboundMessage is SENT (auto-dispatch, no manual dispatch call)");

    const messageSentCount = await prisma.eventLog.count({
      where: { leadId, eventType: "message_sent" },
    });
    assert.ok(messageSentCount >= 1, "Expected at least one message_sent EventLog.");

    const autoAttempted = await prisma.eventLog.findFirst({
      where: { leadId, eventType: "auto_dispatch_attempted" },
      select: { payload: true },
    });
    assert.ok(autoAttempted, "Expected auto_dispatch_attempted EventLog.");
    const payload = autoAttempted.payload as Record<string, unknown>;
    assert.equal(payload.result, "sent", "Expected auto_dispatch_attempted result 'sent'.");

    console.log("  [OK] message_sent and auto_dispatch_attempted events present");
    console.log("\n  All assertions passed.");
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    if (workspaceId) {
      await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
    }
    await pool.end();
  }
}

main();
