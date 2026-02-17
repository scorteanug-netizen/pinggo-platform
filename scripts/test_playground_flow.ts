/**
 * Playground flow test: same autopilot logic as production, no Twilio.
 *
 * 1. Create workspace + user + membership + AI scenario (maxQuestions=2)
 * 2. Start playground: create playground lead, AutopilotRun, session -> get leadId
 * 3. Send "Salut" -> assert assistantText non-null, status ACTIVE
 * 4. Send another message -> conversation continues
 * 5. Send until handover (after maxQuestions) -> handoverTriggered
 */

import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import {
  AutopilotScenarioMode,
  AutopilotScenarioType,
  LeadSourceType,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UserGlobalRole,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

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
    _resolveFilename: (req: string, parent: NodeModule | null, isMain: boolean, opts?: unknown) => string;
  };
  const original = moduleWithPrivateResolver._resolveFilename;
  moduleWithPrivateResolver._resolveFilename = function (request: string, parent: NodeModule | null, isMain: boolean, options?: unknown) {
    if (typeof request === "string" && request.startsWith("@/")) {
      return original.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
    }
    return original.call(this, request, parent, isMain, options);
  };
}

async function main() {
  installWorkspaceAliasResolver();
  const { processAutopilotReply } = await import("../src/server/services/autopilot/processReply");

  let workspaceId: string | null = null;
  const runId = Date.now();

  try {
    const workspace = await prisma.workspace.create({
      data: { name: `Playground test ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const user = await prisma.user.create({
      data: {
        email: `playground-test-${runId}@example.com`,
        name: "Playground Tester",
        globalRole: UserGlobalRole.USER,
      },
      select: { id: true },
    });

    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const scenario = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "Playground AI",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.AI,
        maxQuestions: 2,
        isDefault: true,
        aiPrompt: "Esti un asistent. Intreaba despre pret si programare.",
        language: "ro",
      },
      select: { id: true, name: true, mode: true, maxQuestions: true },
    });

    const externalId = `playground:${scenario.id}:${user.id}`;
    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        sourceType: LeadSourceType.MANUAL,
        externalId,
        firstName: "Playground",
        source: "playground",
        phone: "+40000000000",
      },
      select: { id: true },
    });

    await prisma.autopilotRun.create({
      data: {
        leadId: lead.id,
        workspaceId: workspace.id,
        scenarioId: scenario.id,
        status: "ACTIVE",
        currentStep: "welcome",
        stateJson: { node: "q1", answers: {}, questionIndex: 0 },
        lastOutboundAt: new Date(),
      },
      select: { id: true },
    });

    console.log("  [OK] Workspace + AI scenario + playground lead + run created, leadId:", lead.id);

    const reply1 = await processAutopilotReply({ leadId: lead.id, text: "Salut" });
    assert.ok(reply1, "processAutopilotReply must return result");
    assert.ok(reply1!.autopilot.status === "ACTIVE" || reply1!.autopilot.status === "HANDED_OVER", "status should be ACTIVE or HANDED_OVER");
    const assistantText1 = reply1!.queuedMessage?.text ?? null;
    assert.ok(assistantText1 != null && assistantText1.length > 0, "Expected assistantText (queuedMessage.text) not null after Salut");
    if (reply1!.queuedMessage?.id) {
      await prisma.outboundMessage.delete({ where: { id: reply1!.queuedMessage.id } }).catch(() => {});
    }
    console.log("  [OK] Send 'Salut' -> assistantText non-null, status:", reply1!.autopilot.status);

    const reply2 = await processAutopilotReply({ leadId: lead.id, text: "Pret" });
    assert.ok(reply2, "second reply must return result");
    const assistantText2 = reply2!.queuedMessage?.text ?? null;
    assert.ok(assistantText2 != null && assistantText2.length > 0, "Expected assistantText on second message");
    if (reply2!.queuedMessage?.id) {
      await prisma.outboundMessage.delete({ where: { id: reply2!.queuedMessage.id } }).catch(() => {});
    }
    console.log("  [OK] Send 'Pret' -> conversation continues, assistantText:", assistantText2?.slice(0, 50) + "...");

    const reply3 = await processAutopilotReply({ leadId: lead.id, text: "Da" });
    assert.ok(reply3, "third reply must return result");
    const handoverTriggered = reply3!.autopilot.status === "HANDED_OVER";
    assert.ok(handoverTriggered, "After maxQuestions (2) + one more, handover should trigger. status=" + reply3!.autopilot.status);
    if (reply3!.queuedMessage?.id) {
      await prisma.outboundMessage.delete({ where: { id: reply3!.queuedMessage.id } }).catch(() => {});
    }
    console.log("  [OK] After maxQuestions -> handover triggered");

    console.log("\n  PASSED: Playground flow (same logic as production) OK.\n");
  } finally {
    if (workspaceId) {
      await prisma.autopilotRun.deleteMany({ where: { workspaceId } });
      await prisma.outboundMessage.deleteMany({ where: { workspaceId } });
      await prisma.lead.deleteMany({ where: { workspaceId } });
      await prisma.autopilotScenario.deleteMany({ where: { workspaceId } });
      await prisma.membership.deleteMany({ where: { workspaceId } });
      const userIds = (await prisma.user.findMany({
        where: { email: { contains: "playground-test-" } },
        select: { id: true },
      })).map((u) => u.id);
      if (userIds.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
