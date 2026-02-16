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
  options?: unknown,
) => string;

type ProofStatusResponse = {
  proofEventId: string;
  leadId: string;
  status: "delivered" | "read";
  reused: boolean;
  slaStopped: boolean;
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

async function loadProofStatusHandler(): Promise<PostRouteHandler> {
  installWorkspaceAliasResolver();
  const route = (await import("../src/app/api/v1/proof/whatsapp/status/route")) as {
    POST?: PostRouteHandler;
  };
  if (typeof route.POST !== "function") {
    throw new Error("Failed to load POST from proof/whatsapp/status/route.ts");
  }
  return route.POST;
}

function createProofStatusRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/proof/whatsapp/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const proofStatusPost = await loadProofStatusHandler();
    const runId = Date.now();
    const providerMessageId = `stub-task27-${runId}`;

    // -----------------------------------------------------------------------
    // Step 0: Create workspace + lead + SLAState (running)
    // -----------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: `Task27 Proof Status Test ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        sourceType: LeadSourceType.MANUAL,
        externalId: `task27-${runId}`,
      },
      select: { id: true },
    });

    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + 15 * 60 * 1000);
    await prisma.sLAState.create({
      data: {
        leadId: lead.id,
        startedAt,
        deadlineAt,
      },
    });

    // Verify SLAState is running (stoppedAt null)
    const slaBefore = await prisma.sLAState.findFirst({
      where: { leadId: lead.id },
      select: { stoppedAt: true },
    });
    assert.equal(slaBefore?.stoppedAt, null, "SLAState should be running (stoppedAt null)");
    console.log("  [OK] Step 0: Workspace, lead, SLAState (running) created");

    // -----------------------------------------------------------------------
    // Step 1: Create outbound message SENT with providerMessageId
    // -----------------------------------------------------------------------
    await prisma.outboundMessage.create({
      data: {
        leadId: lead.id,
        workspaceId: workspace.id,
        toPhone: "+40700000027",
        text: "Test message",
        status: OutboundMessageStatus.SENT,
        provider: "stub",
        providerMessageId,
        sentAt: new Date(),
      },
    });
    console.log("  [OK] Step 1: OutboundMessage SENT with providerMessageId");

    // -----------------------------------------------------------------------
    // Step 2: First call - should return 201, reused:false, slaStopped:true
    // -----------------------------------------------------------------------
    const payload = {
      leadId: lead.id,
      provider: "stub" as const,
      providerMessageId,
      status: "delivered" as const,
    };

    const res1 = await proofStatusPost(createProofStatusRequest(payload));
    assert.equal(res1.status, 201, `First call expected 201, got ${res1.status}`);
    const json1 = (await res1.json()) as ProofStatusResponse;
    assert.equal(json1.reused, false, "First call should have reused:false");
    assert.equal(json1.slaStopped, true, "First call should have slaStopped:true");
    assert.equal(json1.status, "delivered");
    assert.ok(json1.proofEventId);
    assert.equal(json1.leadId, lead.id);
    console.log("  [OK] Step 2: First call → 201, reused:false, slaStopped:true");

    // -----------------------------------------------------------------------
    // Step 3: Second call (idempotency) - should return 200, reused:true, slaStopped:false
    // -----------------------------------------------------------------------
    const res2 = await proofStatusPost(createProofStatusRequest(payload));
    assert.equal(res2.status, 200, `Second call expected 200, got ${res2.status}`);
    const json2 = (await res2.json()) as ProofStatusResponse;
    assert.equal(json2.reused, true, "Second call should have reused:true");
    assert.equal(json2.slaStopped, false, "Second call should have slaStopped:false");
    assert.equal(json2.proofEventId, json1.proofEventId, "Should return same proofEventId");
    console.log("  [OK] Step 3: Second call → 200, reused:true, slaStopped:false");

    // -----------------------------------------------------------------------
    // Step 4: Assert SLAState has stoppedAt not null
    // -----------------------------------------------------------------------
    const slaAfter = await prisma.sLAState.findFirst({
      where: { leadId: lead.id },
      select: { stoppedAt: true, stopReason: true },
    });
    assert.ok(slaAfter?.stoppedAt, "SLAState should have stoppedAt set");
    assert.ok(slaAfter?.stopReason?.includes("Dovada: WhatsApp delivered"));
    console.log("  [OK] Step 4: SLAState stopped with correct reason");

    // -----------------------------------------------------------------------
    // Step 5: Assert ProofEvent delivered exists
    // -----------------------------------------------------------------------
    const proofEvent = await prisma.proofEvent.findFirst({
      where: {
        leadId: lead.id,
        channel: "WHATSAPP",
        type: "DELIVERED",
        providerMessageId,
      },
      select: { id: true },
    });
    assert.ok(proofEvent, "ProofEvent DELIVERED should exist");
    assert.equal(proofEvent.id, json1.proofEventId);
    console.log("  [OK] Step 5: ProofEvent delivered exists");

    // -----------------------------------------------------------------------
    // Step 6: Assert EventLog proof_whatsapp_status exists
    // -----------------------------------------------------------------------
    const eventLogs = await prisma.eventLog.findMany({
      where: { leadId: lead.id, eventType: "proof_whatsapp_status" },
      select: { payload: true },
    });
    assert.ok(eventLogs.length >= 1, "At least one proof_whatsapp_status EventLog should exist");
    const firstLogPayload = eventLogs[0].payload as Record<string, unknown>;
    assert.equal(firstLogPayload.provider, "stub");
    assert.equal(firstLogPayload.providerMessageId, providerMessageId);
    assert.equal(firstLogPayload.status, "delivered");
    console.log("  [OK] Step 6: EventLog proof_whatsapp_status exists");

    console.log("\n  PASSED: All Task 27 proof WhatsApp status assertions passed.\n");
  } finally {
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
