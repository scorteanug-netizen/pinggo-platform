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
  sla: {
    startedAt: string;
    deadlineAt: string;
  };
  idempotency: {
    reused: boolean;
  };
};

type DispatchResponse = {
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
  dispatchPost: PostRouteHandler;
}> {
  installWorkspaceAliasResolver();

  const leadsRoute = (await import("../src/app/api/v1/leads/route")) as {
    POST?: PostRouteHandler;
  };
  const dispatchRoute = (await import("../src/app/api/v1/messages/dispatch/route")) as {
    POST?: PostRouteHandler;
  };

  if (typeof leadsRoute.POST !== "function") {
    throw new Error("Failed to load POST handler from src/app/api/v1/leads/route.ts");
  }
  if (typeof dispatchRoute.POST !== "function") {
    throw new Error("Failed to load POST handler from src/app/api/v1/messages/dispatch/route.ts");
  }

  return {
    ingestLeadPost: leadsRoute.POST,
    dispatchPost: dispatchRoute.POST,
  };
}

function createIngestionRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createDispatchRequest() {
  return new NextRequest("http://localhost/api/v1/messages/dispatch", {
    method: "POST",
  });
}

async function main() {
  let workspaceId: string | null = null;
  let leadId: string | null = null;

  try {
    const { ingestLeadPost, dispatchPost } = await loadHandlers();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: {
        name: `Task21 Autopilot Workspace ${runId}`,
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const ingestResponse = await ingestLeadPost(
      createIngestionRequest({
        workspaceId: workspace.id,
        firstName: "Task21",
        lastName: "Autopilot",
        email: `task21+${runId}@example.com`,
        source: "test_task21",
        externalId: `task21-${runId}`,
      })
    );
    assert.equal(ingestResponse.status, 201, "Expected ingestion POST to return 201.");

    const ingestJson = (await ingestResponse.json()) as IngestionResponse;
    assert.equal(typeof ingestJson.leadId, "string", "Expected leadId in ingestion response.");
    leadId = ingestJson.leadId;

    const autopilotRun = await prisma.autopilotRun.findUnique({
      where: {
        leadId,
      },
      select: {
        id: true,
        status: true,
      },
    });
    assert.ok(autopilotRun, "Expected AutopilotRun to be created.");
    assert.equal(autopilotRun?.status, "ACTIVE", "Expected AutopilotRun status ACTIVE.");

    const outboundMessageBeforeDispatch = await prisma.outboundMessage.findFirst({
      where: {
        leadId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        status: true,
        providerMessageId: true,
        sentAt: true,
      },
    });
    assert.ok(outboundMessageBeforeDispatch, "Expected OutboundMessage to be queued.");
    assert.equal(
      outboundMessageBeforeDispatch?.status,
      OutboundMessageStatus.QUEUED,
      "Expected OutboundMessage status QUEUED before dispatch."
    );

    // Make sure this queued message is picked quickly if the environment has other queued rows.
    await prisma.outboundMessage.update({
      where: { id: outboundMessageBeforeDispatch.id },
      data: { createdAt: new Date(0) },
    });

    let sentForLead = false;
    let lastDispatchJson: DispatchResponse | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dispatchResponse = await dispatchPost(createDispatchRequest());
      assert.equal(dispatchResponse.status, 200, "Expected dispatch POST to return 200.");

      lastDispatchJson = (await dispatchResponse.json()) as DispatchResponse;
      assert.equal(typeof lastDispatchJson.processed, "number");
      assert.equal(typeof lastDispatchJson.sent, "number");
      assert.equal(typeof lastDispatchJson.failed, "number");

      const outboundAfterDispatch = await prisma.outboundMessage.findUnique({
        where: {
          id: outboundMessageBeforeDispatch.id,
        },
        select: {
          status: true,
          provider: true,
          providerMessageId: true,
          sentAt: true,
        },
      });

      if (
        outboundAfterDispatch?.status === OutboundMessageStatus.SENT &&
        outboundAfterDispatch.provider === "stub" &&
        typeof outboundAfterDispatch.providerMessageId === "string" &&
        outboundAfterDispatch.providerMessageId.startsWith("stub_") &&
        outboundAfterDispatch.sentAt
      ) {
        sentForLead = true;
        break;
      }
    }

    assert.ok(sentForLead, "Expected queued outbound message to be marked SENT.");
    assert.ok(lastDispatchJson, "Expected dispatch response payload.");

    const eventTypes = ["autopilot_started", "message_queued", "message_sent"] as const;
    for (const eventType of eventTypes) {
      const count = await prisma.eventLog.count({
        where: {
          leadId,
          eventType,
        },
      });
      assert.ok(count >= 1, `Expected EventLog to contain ${eventType}.`);
    }

    console.log("Task #21 test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #21 test FAILED");
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
