import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { LeadSourceType, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { NextRequest } from "next/server";

type GetRouteHandler = (request: NextRequest) => Promise<Response>;

type AliasResolver = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean,
  options?: unknown
) => string;

type LeadListItem = {
  id: string;
};

type LeadListResponse = {
  items: LeadListItem[];
  page: number;
  pageSize: number;
  total: number;
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

  const routeModule = (await import("../src/app/api/v1/leads/route")) as {
    GET?: GetRouteHandler;
  };

  if (typeof routeModule.GET !== "function") {
    throw new Error("Failed to load GET handler from src/app/api/v1/leads/route.ts");
  }

  return routeModule.GET;
}

async function callListHandler(
  GET: GetRouteHandler,
  query: Record<string, string | number | undefined>
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }

  const request = new NextRequest(`http://localhost/api/v1/leads?${params.toString()}`, {
    method: "GET",
  });
  const response = await GET(request);
  const payload = (await response.json()) as LeadListResponse;

  return { response, payload };
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const GET = await loadGetHandler();
    const runId = Date.now();

    const workspace = await prisma.workspace.create({
      data: {
        name: `Task20 Leads List API Workspace ${runId}`,
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const runningLead = await prisma.lead.create({
      data: {
        workspaceId,
        sourceType: LeadSourceType.MANUAL,
        firstName: "Running",
        externalId: `task20-running-${runId}`,
      },
      select: { id: true },
    });

    const stoppedLead = await prisma.lead.create({
      data: {
        workspaceId,
        sourceType: LeadSourceType.MANUAL,
        firstName: "Stopped",
        externalId: `task20-stopped-${runId}`,
      },
      select: { id: true },
    });

    const breachedLead = await prisma.lead.create({
      data: {
        workspaceId,
        sourceType: LeadSourceType.MANUAL,
        firstName: "Breached",
        externalId: `task20-breached-${runId}`,
      },
      select: { id: true },
    });

    const now = new Date();

    await prisma.sLAState.create({
      data: {
        leadId: runningLead.id,
        startedAt: new Date(now.getTime() - 5 * 60 * 1000),
        deadlineAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });

    await prisma.sLAState.create({
      data: {
        leadId: stoppedLead.id,
        startedAt: new Date(now.getTime() - 10 * 60 * 1000),
        deadlineAt: new Date(now.getTime() + 5 * 60 * 1000),
        stoppedAt: new Date(now.getTime() - 2 * 60 * 1000),
      },
    });

    await prisma.sLAState.create({
      data: {
        leadId: breachedLead.id,
        startedAt: new Date(now.getTime() - 30 * 60 * 1000),
        deadlineAt: new Date(now.getTime() - 5 * 60 * 1000),
        breachedAt: new Date(now.getTime() - 1 * 60 * 1000),
      },
    });

    const runningResult = await callListHandler(GET, { workspaceId, sla: "running" });
    assert.equal(runningResult.response.status, 200, "Expected running filter to return 200.");
    assert.equal(runningResult.payload.total, 1, "Expected exactly one running lead.");

    const stoppedResult = await callListHandler(GET, { workspaceId, sla: "stopped" });
    assert.equal(stoppedResult.response.status, 200, "Expected stopped filter to return 200.");
    assert.equal(stoppedResult.payload.total, 1, "Expected exactly one stopped lead.");

    const breachedResult = await callListHandler(GET, { workspaceId, sla: "breached" });
    assert.equal(breachedResult.response.status, 200, "Expected breached filter to return 200.");
    assert.equal(breachedResult.payload.total, 1, "Expected exactly one breached lead.");

    const firstPage = await callListHandler(GET, { workspaceId, page: 1, pageSize: 2 });
    assert.equal(firstPage.response.status, 200, "Expected first page to return 200.");
    assert.equal(firstPage.payload.total, 3, "Expected total leads to be 3.");
    assert.equal(firstPage.payload.items.length, 2, "Expected first page to contain 2 leads.");
    assert.equal(firstPage.payload.page, 1, "Expected page to be 1.");
    assert.equal(firstPage.payload.pageSize, 2, "Expected pageSize to be 2.");

    const secondPage = await callListHandler(GET, { workspaceId, page: 2, pageSize: 2 });
    assert.equal(secondPage.response.status, 200, "Expected second page to return 200.");
    assert.equal(secondPage.payload.total, 3, "Expected total leads to remain 3.");
    assert.equal(secondPage.payload.items.length, 1, "Expected second page to contain 1 lead.");
    assert.equal(secondPage.payload.page, 2, "Expected page to be 2.");
    assert.equal(secondPage.payload.pageSize, 2, "Expected pageSize to be 2.");

    console.log("Task #20 leads list API PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #20 leads list API FAILED");
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
