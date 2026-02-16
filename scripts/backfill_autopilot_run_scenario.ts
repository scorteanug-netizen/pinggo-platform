/**
 * Backfill script: sets scenarioId on AutopilotRun rows where it is null.
 *
 * For each workspace that has at least one AutopilotRun with null scenarioId:
 *   1. Ensure a default AutopilotScenario exists (creates one if needed).
 *   2. Update all null-scenarioId runs in that workspace to point to the default.
 *
 * Usage:
 *   npm run --prefix apps/platform backfill:autopilot-scenarios
 */
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import {
  AutopilotScenarioMode,
  AutopilotScenarioType,
  PrismaClient,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

type AliasResolver = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean,
  options?: unknown
) => string;

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

installWorkspaceAliasResolver();
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

// ---------------------------------------------------------------------------
// Inline ensureDefaultScenario (avoids import issues in ts-node context)
// ---------------------------------------------------------------------------

async function ensureDefaultScenarioForWorkspace(workspaceId: string) {
  const existing = await prisma.autopilotScenario.findFirst({
    where: { workspaceId, isDefault: true },
  });
  if (existing) return existing;

  const earliest = await prisma.autopilotScenario.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });

  if (earliest) {
    return prisma.autopilotScenario.update({
      where: { id: earliest.id },
      data: { isDefault: true },
    });
  }

  return prisma.autopilotScenario.create({
    data: {
      workspaceId,
      name: "Default Qualification",
      scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
      mode: AutopilotScenarioMode.RULES,
      slaMinutes: 15,
      maxQuestions: 2,
      isDefault: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Backfill: AutopilotRun.scenarioId");

  // Find distinct workspace IDs that have runs without a scenarioId
  const orphanedRuns = await prisma.autopilotRun.findMany({
    where: { scenarioId: null },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
  });

  if (orphanedRuns.length === 0) {
    console.log("  No orphaned AutopilotRun rows found. Nothing to do.");
    return;
  }

  console.log(`  Found ${orphanedRuns.length} workspace(s) with null scenarioId runs.`);

  let totalUpdated = 0;

  for (const { workspaceId } of orphanedRuns) {
    const defaultScenario = await ensureDefaultScenarioForWorkspace(workspaceId);

    const result = await prisma.autopilotRun.updateMany({
      where: { workspaceId, scenarioId: null },
      data: { scenarioId: defaultScenario.id },
    });

    console.log(
      `  Workspace ${workspaceId}: assigned scenario "${defaultScenario.name}" (${defaultScenario.id}) to ${result.count} run(s).`,
    );
    totalUpdated += result.count;
  }

  console.log(`\nBackfill complete. Updated ${totalUpdated} AutopilotRun row(s).`);
}

main()
  .catch((error) => {
    console.error("Backfill FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
