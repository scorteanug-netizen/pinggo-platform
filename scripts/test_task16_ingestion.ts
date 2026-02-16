import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
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

  const routeModule = (await import("../src/app/api/v1/leads/route")) as {
    POST?: PostRouteHandler;
  };
  if (typeof routeModule.POST !== "function") {
    throw new Error("Failed to load POST handler from src/app/api/v1/leads/route.ts");
  }

  return routeModule.POST;
}

function createPostRequest(body: unknown, idempotencyKey: string) {
  return new NextRequest("http://localhost/api/v1/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

type IngestionResponse = {
  leadId: string;
  sla: {
    startedAt: string;
    deadlineAt: string;
  };
  idempotency: {
    reused: boolean;
  };
};

async function main() {
  let workspaceId: string | null = null;

  try {
    const POST = await loadPostHandler();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: {
        name: `Task16 Test Workspace ${runId}`,
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const requestBody = {
      workspaceId,
      firstName: "Task16",
      lastName: "Ingestion",
      email: `task16+${runId}@example.com`,
      phone: "+40123456789",
      source: "test_task16",
      externalId: `task16-ext-${runId}`,
    };

    const firstResponse = await POST(createPostRequest(requestBody, "abc-123"));
    assert.equal(firstResponse.status, 201, "Expected first idempotent call to return 201.");

    const firstJson = (await firstResponse.json()) as IngestionResponse;
    assert.equal(typeof firstJson.leadId, "string", "Expected leadId to be present.");
    assert.equal(
      typeof firstJson.sla?.deadlineAt,
      "string",
      "Expected sla.deadlineAt to be present."
    );
    const firstLeadId = firstJson.leadId;

    const leadCountAfterFirst = await prisma.lead.count({
      where: {
        workspaceId,
        externalId: requestBody.externalId,
        sourceType: "API",
      },
    });
    assert.equal(leadCountAfterFirst, 1, "Expected exactly 1 Lead after first request.");

    const slaCountAfterFirst = await prisma.sLAState.count({
      where: {
        leadId: firstLeadId,
      },
    });
    assert.equal(slaCountAfterFirst, 1, "Expected exactly 1 SLAState after first request.");

    const eventLogCountAfterFirst = await prisma.eventLog.count({
      where: {
        leadId: firstLeadId,
      },
    });
    assert.equal(eventLogCountAfterFirst, 4, "Expected exactly 4 EventLog rows after first request.");

    const leadReceivedAfterFirst = await prisma.eventLog.count({
      where: {
        leadId: firstLeadId,
        eventType: "lead_received",
      },
    });
    const slaStartedAfterFirst = await prisma.eventLog.count({
      where: {
        leadId: firstLeadId,
        eventType: "sla_started",
      },
    });
    assert.equal(
      leadReceivedAfterFirst,
      1,
      "Expected exactly 1 lead_received EventLog row after first request."
    );
    assert.equal(
      slaStartedAfterFirst,
      1,
      "Expected exactly 1 sla_started EventLog row after first request."
    );

    const idempotencyAfterFirst = await prisma.idempotencyKey.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: "abc-123",
        },
      },
      select: {
        status: true,
        responseJson: true,
      },
    });
    assert.ok(idempotencyAfterFirst, "Expected IdempotencyKey row to exist after first request.");
    assert.equal(
      idempotencyAfterFirst?.status,
      "COMPLETED",
      "Expected IdempotencyKey status to be COMPLETED."
    );
    assert.ok(
      idempotencyAfterFirst?.responseJson,
      "Expected IdempotencyKey.responseJson to be present."
    );
    assert.deepEqual(
      idempotencyAfterFirst?.responseJson,
      firstJson,
      "Expected stored responseJson to match first response."
    );

    const secondResponse = await POST(createPostRequest(requestBody, "abc-123"));
    assert.equal(secondResponse.status, 200, "Expected second idempotent call to return 200.");

    const secondJson = (await secondResponse.json()) as IngestionResponse;
    assert.equal(secondJson.leadId, firstLeadId, "Expected second response to return same leadId.");
    const expectedReused = {
      ...firstJson,
      idempotency: { ...firstJson.idempotency, reused: true },
    };
    assert.deepEqual(
      secondJson,
      expectedReused,
      "Expected second idempotent response to match stored first response with reused=true."
    );

    const leadCountAfterSecond = await prisma.lead.count({
      where: {
        workspaceId,
        externalId: requestBody.externalId,
        sourceType: "API",
      },
    });
    assert.equal(
      leadCountAfterSecond,
      leadCountAfterFirst,
      "Expected Lead count to remain unchanged after idempotent replay."
    );

    const slaCountAfterSecond = await prisma.sLAState.count({
      where: {
        leadId: firstLeadId,
      },
    });
    assert.equal(
      slaCountAfterSecond,
      slaCountAfterFirst,
      "Expected SLAState count to remain unchanged after idempotent replay."
    );

    const eventLogCountAfterSecond = await prisma.eventLog.count({
      where: {
        leadId: firstLeadId,
      },
    });
    assert.equal(
      eventLogCountAfterSecond,
      eventLogCountAfterFirst,
      "Expected EventLog count to remain unchanged after idempotent replay."
    );

    const leadReceivedAfterSecond = await prisma.eventLog.count({
      where: {
        leadId: firstLeadId,
        eventType: "lead_received",
      },
    });
    const slaStartedAfterSecond = await prisma.eventLog.count({
      where: {
        leadId: firstLeadId,
        eventType: "sla_started",
      },
    });

    assert.equal(
      leadReceivedAfterSecond,
      leadReceivedAfterFirst,
      "Expected no duplicate lead_received logs on idempotent replay."
    );
    assert.equal(
      slaStartedAfterSecond,
      slaStartedAfterFirst,
      "Expected no duplicate sla_started logs on idempotent replay."
    );

    const idempotencyAfterSecond = await prisma.idempotencyKey.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: "abc-123",
        },
      },
      select: {
        status: true,
        responseJson: true,
      },
    });
    assert.equal(
      idempotencyAfterSecond?.status,
      "COMPLETED",
      "Expected IdempotencyKey status to remain COMPLETED."
    );
    assert.deepEqual(
      idempotencyAfterSecond?.responseJson,
      firstJson,
      "Expected stored responseJson to remain unchanged."
    );

    console.log("Task #16 test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #16 test FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (workspaceId) {
      await prisma.idempotencyKey
        .deleteMany({
          where: { workspaceId },
        })
        .catch(() => {});
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
