import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { LeadSourceType, ProofChannel, ProofType, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { NextRequest } from "next/server";

type GetRouteHandler = (
  request: NextRequest,
  context: {
    params: {
      leadId: string;
    };
  }
) => Promise<Response>;

type AliasResolver = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean,
  options?: unknown
) => string;

type LeadDetailResponse = {
  lead: {
    id: string;
  };
  sla: {
    startedAt: string;
    deadlineAt: string;
    stoppedAt: string | null;
    stopReason: string | null;
    breachedAt: string | null;
  } | null;
  timeline: Array<{
    id: string;
    eventType: string;
    payload: unknown;
    occurredAt: string;
  }>;
  proof: Array<{
    id: string;
    channel: string;
    type: string;
    provider: string;
    providerMessageId: string | null;
    occurredAt: string;
  }>;
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

async function loadGetHandler(): Promise<GetRouteHandler> {
  installWorkspaceAliasResolver();

  const routeModule = (await import("../src/app/api/v1/leads/[leadId]/route")) as {
    GET?: GetRouteHandler;
  };

  if (typeof routeModule.GET !== "function") {
    throw new Error("Failed to load GET handler from src/app/api/v1/leads/[leadId]/route.ts");
  }

  return routeModule.GET;
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const GET = await loadGetHandler();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: {
        name: `Task19 Lead Detail API Workspace ${runId}`,
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        sourceType: LeadSourceType.MANUAL,
        firstName: "Task19",
        lastName: "Lead",
        email: `task19+${runId}@example.com`,
        externalId: `task19-${runId}`,
      },
      select: { id: true },
    });

    await prisma.sLAState.create({
      data: {
        leadId: lead.id,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await prisma.eventLog.create({
      data: {
        leadId: lead.id,
        eventType: "lead_received",
        payload: {
          source: "test_task19",
        },
      },
    });

    await prisma.proofEvent.create({
      data: {
        leadId: lead.id,
        channel: ProofChannel.WHATSAPP,
        provider: "twilio",
        providerMessageId: `task19-msg-${runId}`,
        type: ProofType.DELIVERED,
        occurredAt: new Date(),
        isManual: false,
      },
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/v1/leads/${lead.id}`, { method: "GET" }),
      { params: { leadId: lead.id } }
    );
    assert.equal(response.status, 200, "Expected GET /api/v1/leads/[leadId] to return 200.");

    const payload = (await response.json()) as LeadDetailResponse;

    assert.equal(payload.lead.id, lead.id, "Expected response lead.id to match created lead.");
    assert.ok(payload.sla, "Expected response.sla to be present.");
    assert.ok(
      Array.isArray(payload.timeline) && payload.timeline.length >= 1,
      "Expected timeline length >= 1."
    );
    assert.ok(
      Array.isArray(payload.proof) && payload.proof.length >= 1,
      "Expected proof length >= 1."
    );

    console.log("Task #19 API smoke PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #19 API smoke FAILED");
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
