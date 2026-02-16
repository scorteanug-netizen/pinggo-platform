import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { LeadSourceType, ProofChannel, ProofType, PrismaClient } from "@prisma/client";
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

async function loadPostHandler(): Promise<PostRouteHandler> {
  installWorkspaceAliasResolver();

  const routeModule = (await import("../src/app/api/v1/proof/whatsapp/status/route")) as {
    POST?: PostRouteHandler;
  };

  if (typeof routeModule.POST !== "function") {
    throw new Error("Failed to load POST handler from src/app/api/v1/proof/whatsapp/status/route.ts");
  }

  return routeModule.POST;
}

function createPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/proof/whatsapp/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

type ProofStatusResponse = {
  proofEventId: string;
  leadId: string;
  status: "sent" | "delivered" | "read" | "replied";
  reused: boolean;
  slaStopped: boolean;
};

async function main() {
  let workspaceId: string | null = null;

  try {
    const POST = await loadPostHandler();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: {
        name: `Task18 Proof WhatsApp Workspace ${runId}`,
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        sourceType: LeadSourceType.MANUAL,
        externalId: `task18-${runId}`,
      },
      select: { id: true },
    });

    await prisma.sLAState.create({
      data: {
        leadId: lead.id,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const requestBody = {
      workspaceId,
      leadId: lead.id,
      provider: "twilio",
      providerMessageId: "msg-1",
      status: "delivered" as const,
    };

    const firstResponse = await POST(createPostRequest(requestBody));
    assert.equal(firstResponse.status, 201, "Expected first proof intake to return 201.");

    const firstJson = (await firstResponse.json()) as ProofStatusResponse;
    assert.equal(firstJson.leadId, lead.id, "Expected response leadId to match input lead.");
    assert.equal(firstJson.status, "delivered", "Expected delivered status in response.");
    assert.equal(firstJson.reused, false, "Expected first response reused=false.");
    assert.equal(firstJson.slaStopped, true, "Expected SLA to be stopped on delivered status.");
    assert.equal(typeof firstJson.proofEventId, "string", "Expected proofEventId in response.");

    const proofEventsAfterFirst = await prisma.proofEvent.count({
      where: {
        leadId: lead.id,
        channel: ProofChannel.WHATSAPP,
        type: ProofType.DELIVERED,
        providerMessageId: "msg-1",
      },
    });
    assert.equal(proofEventsAfterFirst, 1, "Expected one ProofEvent after first call.");

    const stateAfterFirst = await prisma.sLAState.findUnique({
      where: { leadId: lead.id },
      select: { stoppedAt: true, stopReason: true },
    });
    assert.ok(stateAfterFirst?.stoppedAt, "Expected SLAState.stoppedAt to be set.");
    assert.equal(stateAfterFirst?.stopReason, "proof_received", "Expected stopReason=proof_received.");

    const proofReceivedLogsAfterFirst = await prisma.eventLog.count({
      where: {
        leadId: lead.id,
        eventType: "proof_received",
      },
    });
    const slaStoppedLogsAfterFirst = await prisma.eventLog.count({
      where: {
        leadId: lead.id,
        eventType: "sla_stopped",
      },
    });
    assert.equal(
      proofReceivedLogsAfterFirst,
      1,
      "Expected one proof_received EventLog after first call."
    );
    assert.equal(slaStoppedLogsAfterFirst, 1, "Expected one sla_stopped EventLog after first call.");

    const secondResponse = await POST(createPostRequest(requestBody));
    assert.equal(secondResponse.status, 200, "Expected duplicate proof intake to return 200.");

    const secondJson = (await secondResponse.json()) as ProofStatusResponse;
    assert.equal(secondJson.reused, true, "Expected duplicate proof intake reused=true.");
    assert.equal(secondJson.proofEventId, firstJson.proofEventId, "Expected same proofEventId on retry.");

    const proofEventsAfterSecond = await prisma.proofEvent.count({
      where: {
        leadId: lead.id,
        channel: ProofChannel.WHATSAPP,
        type: ProofType.DELIVERED,
        providerMessageId: "msg-1",
      },
    });
    assert.equal(proofEventsAfterSecond, 1, "Expected no duplicate ProofEvent rows on retry.");

    const proofReceivedLogsAfterSecond = await prisma.eventLog.count({
      where: {
        leadId: lead.id,
        eventType: "proof_received",
      },
    });
    assert.equal(
      proofReceivedLogsAfterSecond,
      1,
      "Expected no duplicate proof_received logs on retry."
    );

    const stateAfterSecond = await prisma.sLAState.findUnique({
      where: { leadId: lead.id },
      select: { stoppedAt: true, stopReason: true },
    });
    assert.ok(stateAfterSecond?.stoppedAt, "Expected SLA to remain stopped after retry.");
    assert.equal(stateAfterSecond?.stopReason, "proof_received", "Expected stopReason unchanged.");

    console.log("Task #18 test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #18 test FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (workspaceId) {
      await prisma.workspace
        .delete({
          where: { id: workspaceId },
        })
        .catch(() => {});
    }

    await prisma.$disconnect();
  }
}

void main();
