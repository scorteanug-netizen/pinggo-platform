import process from "node:process";

import { loadEnvConfig } from "@next/env";
import {
  LeadSourceType,
  LeadStatus,
  Prisma,
  PrismaClient,
  ProofChannel,
  ProofType,
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

async function runTask15DbTest() {
  const runId = Date.now();
  const workspace = await prisma.workspace.create({
    data: {
      name: `Task15 Test Workspace ${runId}`,
    },
  });

  const lead = await prisma.lead.create({
    data: {
      workspaceId: workspace.id,
      firstName: "Task",
      lastName: "Fifteen",
      email: `task15+${runId}@example.com`,
      phone: "+40123456789",
      source: "test_script",
      sourceType: LeadSourceType.MANUAL,
      status: LeadStatus.NEW,
      ownerId: null,
    },
  });

  await prisma.sLAState.create({
    data: {
      leadId: lead.id,
      startedAt: new Date(),
      deadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      stoppedAt: null,
      stopReason: null,
      breachedAt: null,
    },
  });

  let uniqueConstraintValidated = false;
  try {
    await prisma.sLAState.create({
      data: {
        leadId: lead.id,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      uniqueConstraintValidated = true;
    } else {
      throw error;
    }
  }

  if (!uniqueConstraintValidated) {
    throw new Error("Expected second SLAState insert to fail with unique constraint on leadId.");
  }

  await prisma.proofEvent.createMany({
    data: [
      {
        leadId: lead.id,
        channel: ProofChannel.WHATSAPP,
        provider: "twilio",
        providerMessageId: `wa_sent_${runId}`,
        type: ProofType.SENT,
        occurredAt: new Date(),
        isManual: false,
      },
      {
        leadId: lead.id,
        channel: ProofChannel.WHATSAPP,
        provider: "twilio",
        providerMessageId: `wa_delivered_${runId}`,
        type: ProofType.DELIVERED,
        occurredAt: new Date(),
        isManual: false,
      },
    ],
  });

  await prisma.eventLog.createMany({
    data: [
      {
        leadId: lead.id,
        actorUserId: null,
        eventType: "lead_created",
        payload: {
          source: "test_script",
          phase: "init",
        },
      },
      {
        leadId: lead.id,
        actorUserId: null,
        eventType: "proof_sent",
        payload: {
          channel: "whatsapp",
          provider: "twilio",
          status: "sent",
        },
      },
      {
        leadId: lead.id,
        actorUserId: null,
        eventType: "proof_delivered",
        payload: {
          channel: "whatsapp",
          providerMessageId: `wa_delivered_${runId}`,
          status: "delivered",
        },
      },
    ],
  });

  const proofEventsCount = await prisma.proofEvent.count({
    where: { leadId: lead.id },
  });
  const eventLogsCount = await prisma.eventLog.count({
    where: { leadId: lead.id },
  });

  if (proofEventsCount !== 2) {
    throw new Error(`Expected 2 proof events, found ${proofEventsCount}.`);
  }

  if (eventLogsCount !== 3) {
    throw new Error(`Expected 3 event logs, found ${eventLogsCount}.`);
  }

  console.log(`leadId: ${lead.id}`);
  console.log(`numar proof events: ${proofEventsCount}`);
  console.log(`numar event logs: ${eventLogsCount}`);
  console.log("Task #15 DB test PASSED");
}

async function main() {
  try {
    await runTask15DbTest();
    process.exitCode = 0;
  } catch (error) {
    console.error("Task #15 DB test FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
