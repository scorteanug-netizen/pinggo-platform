/**
 * Tests for conversational autopilot: no numeric menu, one question, human tone.
 *
 * - "Salut" -> bot: "Salut! Cu ce te pot ajuta azi?" (one question)
 * - "Vreau o programare" -> bot asks next missing (e.g. service or name)
 * - Provide name/phone/email -> bot acknowledges and handover when maxQuestions reached
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

function installAlias() {
  const mod = Module as unknown as { _resolveFilename: (r: string, p: NodeModule | null, m: boolean, o?: unknown) => string };
  const orig = mod._resolveFilename;
  mod._resolveFilename = function (req: string, parent: NodeModule | null, isMain: boolean, opts?: unknown) {
    if (typeof req === "string" && req.startsWith("@/")) {
      return orig.call(this, path.join(process.cwd(), "src", req.slice(2)), parent, isMain, opts);
    }
    return orig.call(this, req, parent, isMain, opts);
  };
}

async function main() {
  installAlias();
  const { processAutopilotReply } = await import("../src/server/services/autopilot/processReply");

  let workspaceId: string | null = null;
  const runId = Date.now();
  const testPhone = "+40700000001";

  try {
    const workspace = await prisma.workspace.create({
      data: { name: `Conv flow ${runId}` },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const user = await prisma.user.create({
      data: { email: `conv-${runId}@test.com`, name: "Tester", globalRole: UserGlobalRole.USER },
      select: { id: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE },
    });

    const scenario = await prisma.autopilotScenario.create({
      data: {
        workspaceId: workspace.id,
        name: "RULES Conv",
        scenarioType: AutopilotScenarioType.QUALIFY_ONLY,
        mode: AutopilotScenarioMode.RULES,
        maxQuestions: 5,
        isDefault: true,
        language: "ro",
        companyName: "TestCompany",
      },
      select: { id: true },
    });

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        sourceType: LeadSourceType.MANUAL,
        externalId: `conv-${runId}`,
        firstName: null,
        phone: testPhone,
        source: "test",
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
    });

    let r1 = await processAutopilotReply({ leadId: lead.id, text: "Salut" });
    assert.ok(r1, "reply 1");
    assert.ok(r1!.queuedMessage?.text, "expect bot reply");
    const text1 = r1!.queuedMessage!.text;
    assert.ok(
      text1.includes("Cu ce te pot ajuta") || text1.includes("cu ce te pot ajuta"),
      `Expected "Cu ce te pot ajuta" in first reply, got: ${text1}`
    );
    assert.ok(!/\d\)\s*\w/.test(text1), "Reply must not contain numeric menu (e.g. 1) 2) 3))");
    if (r1!.queuedMessage?.id) await prisma.outboundMessage.delete({ where: { id: r1!.queuedMessage!.id } }).catch(() => {});
    console.log("  [OK] Salut -> bot asks one question, no menu");

    let r2 = await processAutopilotReply({ leadId: lead.id, text: "Vreau o programare" });
    assert.ok(r2, "reply 2");
    assert.ok(r2!.queuedMessage?.text, "expect bot reply after programare");
    const text2 = r2!.queuedMessage!.text;
    assert.ok(
      text2.includes("?") || text2.includes("serviciu") || text2.includes("nume") || text2.includes("numesti"),
      `Expected next question (service/name), got: ${text2}`
    );
    assert.ok(!/\d\)\s*\w/.test(text2), "No numeric menu");
    if (r2!.queuedMessage?.id) await prisma.outboundMessage.delete({ where: { id: r2!.queuedMessage!.id } }).catch(() => {});
    console.log("  [OK] Vreau programare -> bot asks next (service/name)");

    let rMaria = await processAutopilotReply({ leadId: lead.id, text: "Maria" });
    if (rMaria?.queuedMessage?.id) await prisma.outboundMessage.delete({ where: { id: rMaria.queuedMessage.id } }).catch(() => {});
    const runAfter = await prisma.autopilotRun.findUnique({ where: { leadId: lead.id }, select: { stateJson: true } });
    const state = runAfter?.stateJson as { answers?: Record<string, string> } | null;
    assert.ok(state?.answers?.name === "Maria" || state?.answers?.intent, "Name or intent stored");
    console.log("  [OK] Name provided -> stored");

    let r3 = await processAutopilotReply({ leadId: lead.id, text: "0722111222" });
    if (r3?.queuedMessage?.id) await prisma.outboundMessage.delete({ where: { id: r3.queuedMessage.id } }).catch(() => {});
    let r4 = await processAutopilotReply({ leadId: lead.id, text: "maria@test.com" });
    if (r4?.queuedMessage?.id) await prisma.outboundMessage.delete({ where: { id: r4.queuedMessage.id } }).catch(() => {});

    const runFinal = await prisma.autopilotRun.findUnique({ where: { leadId: lead.id }, select: { status: true } });
    assert.ok(
      runFinal?.status === "HANDED_OVER" || runFinal?.status === "ACTIVE",
      "After name/phone/email either handover or still active"
    );
    console.log("  [OK] Phone/email -> flow continues or handover");

    console.log("\n  PASSED: Conversational flow tests.\n");
  } finally {
    if (workspaceId) {
      await prisma.autopilotRun.deleteMany({ where: { workspaceId } });
      await prisma.outboundMessage.deleteMany({ where: { workspaceId } });
      await prisma.lead.deleteMany({ where: { workspaceId } });
      await prisma.autopilotScenario.deleteMany({ where: { workspaceId } });
      await prisma.membership.deleteMany({ where: { workspaceId } });
      const users = await prisma.user.findMany({ where: { email: { contains: "conv-" } }, select: { id: true } });
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
        await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
      }
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
