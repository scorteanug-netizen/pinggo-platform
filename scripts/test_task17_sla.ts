import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { LeadSourceType, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type AliasResolver = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean,
  options?: unknown
) => string;

type StopSlaClockResult =
  | {
      alreadyStopped: true;
    }
  | {
      alreadyStopped: false;
      stoppedAt: Date;
    };

type BreachResult = {
  processed: number;
  breached: number;
};

type SlaEngineModule = {
  breachOverdueSlas: (now?: Date) => Promise<BreachResult>;
  stopSlaClock: (leadId: string, reason: string, proofEventId?: string) => Promise<StopSlaClockResult>;
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

async function loadSlaEngine(): Promise<SlaEngineModule> {
  installWorkspaceAliasResolver();

  const module = (await import("../src/server/services/slaEngine")) as Partial<SlaEngineModule>;
  if (typeof module.breachOverdueSlas !== "function" || typeof module.stopSlaClock !== "function") {
    throw new Error("Failed to load SLA engine helpers from src/server/services/slaEngine.ts");
  }

  return module as SlaEngineModule;
}

function assertDatesClose(actual: Date, expected: Date, toleranceMs = 1000) {
  const delta = Math.abs(actual.getTime() - expected.getTime());
  assert.ok(
    delta <= toleranceMs,
    `Expected dates to be within ${toleranceMs}ms, got delta ${delta}ms. actual=${actual.toISOString()} expected=${expected.toISOString()}`
  );
}

async function main() {
  let workspaceId: string | null = null;

  try {
    const { breachOverdueSlas, stopSlaClock } = await loadSlaEngine();
    const runId = Date.now();
    const fixedNow = new Date();

    const workspace = await prisma.workspace.create({
      data: {
        name: `Task17 SLA Workspace ${runId}`,
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        sourceType: LeadSourceType.MANUAL,
        externalId: `task17-${runId}`,
      },
      select: { id: true },
    });

    await prisma.sLAState.create({
      data: {
        leadId: lead.id,
        startedAt: new Date(fixedNow.getTime() - 5 * 60 * 1000),
        deadlineAt: new Date(fixedNow.getTime() - 60 * 1000),
      },
    });

    const breachResult = await breachOverdueSlas(fixedNow);
    assert.ok(
      Number.isInteger(breachResult.breached) && breachResult.breached >= 1,
      `Expected breachOverdueSlas to breach at least one record, got ${JSON.stringify(breachResult)}.`
    );

    const stateAfterBreach = await prisma.sLAState.findUnique({
      where: { leadId: lead.id },
      select: { breachedAt: true },
    });
    assert.ok(stateAfterBreach?.breachedAt, "Expected SLAState.breachedAt to be set.");
    assertDatesClose(stateAfterBreach.breachedAt, fixedNow);

    const breachedLogsAfterFirstRun = await prisma.eventLog.count({
      where: {
        leadId: lead.id,
        eventType: "sla_breached",
      },
    });
    assert.equal(
      breachedLogsAfterFirstRun,
      1,
      "Expected exactly one sla_breached log after first breach run."
    );

    await breachOverdueSlas(fixedNow);

    const breachedLogsAfterSecondRun = await prisma.eventLog.count({
      where: {
        leadId: lead.id,
        eventType: "sla_breached",
      },
    });
    assert.equal(
      breachedLogsAfterSecondRun,
      1,
      "Expected still one sla_breached log after second breach run."
    );

    const stopResult = await stopSlaClock(lead.id, "proof_received", "proofEventId123");
    assert.equal(stopResult.alreadyStopped, false, "Expected stopSlaClock to stop the SLA clock.");

    const stateAfterStop = await prisma.sLAState.findUnique({
      where: { leadId: lead.id },
      select: { stoppedAt: true, stopReason: true },
    });
    assert.ok(stateAfterStop?.stoppedAt, "Expected SLAState.stoppedAt to be set.");
    assert.equal(stateAfterStop?.stopReason, "proof_received", "Expected SLAState.stopReason to match.");

    const stoppedLogs = await prisma.eventLog.count({
      where: {
        leadId: lead.id,
        eventType: "sla_stopped",
      },
    });
    assert.equal(stoppedLogs, 1, "Expected exactly one sla_stopped log.");

    console.log("Task #17 SLA test PASSED");
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #17 SLA test FAILED");
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
