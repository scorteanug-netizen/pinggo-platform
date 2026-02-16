import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import {
  LeadSourceType,
  OutboundMessageStatus,
  ProofChannel,
  ProofType,
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

type InboundResponse = {
  leadId: string | null;
  processed: boolean;
  reused: boolean;
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

async function loadInboundHandler(): Promise<PostRouteHandler> {
  installWorkspaceAliasResolver();
  const route = (await import("../src/app/api/v1/whatsapp/webhook/inbound/route")) as {
    POST?: PostRouteHandler;
  };
  if (typeof route.POST !== "function") {
    throw new Error("Failed to load POST from whatsapp/webhook/inbound/route.ts");
  }
  return route.POST;
}

function createInboundRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/whatsapp/webhook/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const inboundPost = await loadInboundHandler();
    const runId = Date.now();
    const fromPhone = "+40700000029";

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + lead with phone, scenario, AutopilotRun
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task29 Inbound ${runId}` },
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
        firstName: "Inbound",
        lastName: "Test",
        email: `task29+${runId}@example.com`,
        phone: fromPhone,
        source: "test_task29",
        sourceType: LeadSourceType.API,
        externalId: `task29-${runId}`,
      },
      select: { id: true },
    });

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

    console.log("  [OK] Step 0: Workspace, lead, scenario, AutopilotRun created");

    // -----------------------------------------------------------------------
    // Step 1: First call - expect processed true, 201
    // -----------------------------------------------------------------------
    const providerMessageId = `task29-msg-${runId}`;
    const res1 = await inboundPost(
      createInboundRequest({
        workspaceId: workspace.id,
        fromPhone,
        text: "pret",
        provider: "stub",
        providerMessageId,
      })
    );
    assert.equal(res1.status, 201, `Expected 201, got ${res1.status}`);

    const json1 = (await res1.json()) as InboundResponse;
    assert.strictEqual(json1.leadId, lead.id);
    assert.strictEqual(json1.processed, true);
    assert.strictEqual(json1.reused, false);

    console.log("  [OK] Step 1: First call → 201, processed:true, reused:false");

    // -----------------------------------------------------------------------
    // Step 2: Second call with same providerMessageId - expect reused true, 200
    // -----------------------------------------------------------------------
    const res2 = await inboundPost(
      createInboundRequest({
        workspaceId: workspace.id,
        fromPhone,
        text: "pret",
        provider: "stub",
        providerMessageId,
      })
    );
    assert.equal(res2.status, 200, `Expected 200, got ${res2.status}`);

    const json2 = (await res2.json()) as InboundResponse;
    assert.strictEqual(json2.leadId, lead.id);
    assert.strictEqual(json2.reused, true);

    console.log("  [OK] Step 2: Second call → 200, reused:true");

    // -----------------------------------------------------------------------
    // Step 3: Verify EventLog whatsapp_inbound exists once
    // -----------------------------------------------------------------------
    const whatsappInboundCount = await prisma.eventLog.count({
      where: { leadId: lead.id, eventType: "whatsapp_inbound" },
    });
    assert.equal(whatsappInboundCount, 1, `Expected 1 whatsapp_inbound event, got ${whatsappInboundCount}`);

    console.log("  [OK] Step 3: EventLog whatsapp_inbound exists once");

    // -----------------------------------------------------------------------
    // Step 4: Verify ProofEvent INBOUND exists once
    // -----------------------------------------------------------------------
    const proofInbound = await prisma.proofEvent.findMany({
      where: {
        leadId: lead.id,
        channel: ProofChannel.WHATSAPP,
        type: ProofType.INBOUND,
        providerMessageId,
      },
      select: { id: true },
    });
    assert.equal(proofInbound.length, 1, `Expected 1 ProofEvent INBOUND, got ${proofInbound.length}`);

    console.log("  [OK] Step 4: ProofEvent INBOUND exists once");

    // -----------------------------------------------------------------------
    // Step 5: Verify NO extra autopilot events / outbound on duplicate
    //        (autopilot_inbound + message_queued should each appear once)
    // -----------------------------------------------------------------------
    const autopilotInboundCount = await prisma.eventLog.count({
      where: { leadId: lead.id, eventType: "autopilot_inbound" },
    });
    assert.equal(autopilotInboundCount, 1, `Expected 1 autopilot_inbound, got ${autopilotInboundCount}`);

    const queuedCount = await prisma.outboundMessage.count({
      where: { leadId: lead.id, status: OutboundMessageStatus.QUEUED },
    });
    assert.equal(queuedCount, 1, `Expected 1 QUEUED outbound (from first call), got ${queuedCount}`);

    console.log("  [OK] Step 5: No extra autopilot events or outbound on duplicate");

    console.log("\n  PASSED: All Task 29 WhatsApp inbound webhook assertions passed.\n");
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
