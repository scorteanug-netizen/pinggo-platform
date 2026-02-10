import { Prisma, PrismaClient, SLAStageInstanceStatus } from "@prisma/client";

const prisma = new PrismaClient();

const PROOF_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
  "manual_proof_note",
];

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { id: "demo-workspace" },
    create: { id: "demo-workspace", name: "Demo" },
    update: { name: "Demo" },
  });

  const owner = await prisma.user.upsert({
    where: { email: "demo@pinggo.io" },
    create: { email: "demo@pinggo.io", name: "Demo Owner", globalRole: "SUPER_ADMIN" },
    update: { name: "Demo Owner", globalRole: "SUPER_ADMIN" },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@pinggo.io" },
    create: { email: "manager@pinggo.io", name: "Demo Manager", globalRole: "USER" },
    update: { name: "Demo Manager", globalRole: "USER" },
  });

  const agentOne = await prisma.user.upsert({
    where: { email: "agent1@pinggo.io" },
    create: { email: "agent1@pinggo.io", name: "Agent One", globalRole: "USER" },
    update: { name: "Agent One", globalRole: "USER" },
  });

  const agentTwo = await prisma.user.upsert({
    where: { email: "agent2@pinggo.io" },
    create: { email: "agent2@pinggo.io", name: "Agent Two", globalRole: "USER" },
    update: { name: "Agent Two", globalRole: "USER" },
  });

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: owner.id, workspaceId: workspace.id } },
    create: { userId: owner.id, workspaceId: workspace.id, role: "OWNER" },
    update: { role: "OWNER" },
  });

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: manager.id, workspaceId: workspace.id } },
    create: { userId: manager.id, workspaceId: workspace.id, role: "MANAGER" },
    update: { role: "MANAGER" },
  });

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: agentOne.id, workspaceId: workspace.id } },
    create: { userId: agentOne.id, workspaceId: workspace.id, role: "AGENT" },
    update: { role: "AGENT" },
  });

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: agentTwo.id, workspaceId: workspace.id } },
    create: { userId: agentTwo.id, workspaceId: workspace.id, role: "AGENT" },
    update: { role: "AGENT" },
  });

  await prisma.notification.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.booking.deleteMany({ where: { lead: { workspaceId: workspace.id } } });
  await prisma.sLAStageInstance.deleteMany({ where: { lead: { workspaceId: workspace.id } } });
  await prisma.leadEvent.deleteMany({ where: { lead: { workspaceId: workspace.id } } });
  await prisma.leadIdentity.deleteMany({ where: { lead: { workspaceId: workspace.id } } });
  await prisma.lead.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.escalationRule.deleteMany({ where: { flow: { workspaceId: workspace.id } } });
  await prisma.sLAStageDefinition.deleteMany({ where: { flow: { workspaceId: workspace.id } } });
  await prisma.flow.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.workspaceSettings.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.integration.deleteMany({ where: { workspaceId: workspace.id } });

  const flow = await prisma.flow.create({
    data: {
      workspaceId: workspace.id,
      name: "Standard",
      isActive: true,
      config: {
        version: "prd-v3-mvp",
        stages: [
          "first_touch",
          "handover",
          "qualification",
          "next_step_scheduled",
          "follow_up_closure",
        ],
      },
    },
  });

  await prisma.sLAStageDefinition.createMany({
    data: [
      {
        flowId: flow.id,
        key: "first_touch",
        name: "First touch",
        targetMinutes: 15,
        businessHoursEnabled: true,
        stopOnProofTypes: PROOF_TYPES,
      },
      {
        flowId: flow.id,
        key: "handover",
        name: "Handover",
        targetMinutes: 30,
        businessHoursEnabled: true,
        stopOnProofTypes: ["manual_proof_note"],
      },
      {
        flowId: flow.id,
        key: "qualification",
        name: "Qualification",
        targetMinutes: 120,
        businessHoursEnabled: true,
        stopOnProofTypes: ["reply_received", "call_logged", "manual_proof_note"],
      },
      {
        flowId: flow.id,
        key: "next_step_scheduled",
        name: "Next step scheduled",
        targetMinutes: 240,
        businessHoursEnabled: true,
        stopOnProofTypes: ["meeting_created", "manual_proof_note"],
      },
      {
        flowId: flow.id,
        key: "follow_up_closure",
        name: "Follow-up closure",
        targetMinutes: 1440,
        businessHoursEnabled: true,
        stopOnProofTypes: ["reply_received", "call_logged", "manual_proof_note"],
      },
    ],
  });

  await prisma.escalationRule.create({
    data: {
      flowId: flow.id,
      stageKey: "first_touch",
      remindAtPct: 60,
      reassignAtPct: 85,
      managerAlertAtPct: 100,
      enabled: true,
    },
  });

  await prisma.integration.create({
    data: {
      workspaceId: workspace.id,
      type: "WEBHOOK",
      config: {
        endpoint: "/api/intake/webhook",
        active: true,
      },
    },
  });

  await prisma.workspaceSettings.create({
    data: {
      workspaceId: workspace.id,
      businessHoursEnabled: true,
      timezone: "Europe/Bucharest",
      schedule: {
        mon: { enabled: true, start: "09:00", end: "18:00" },
        tue: { enabled: true, start: "09:00", end: "18:00" },
        wed: { enabled: true, start: "09:00", end: "18:00" },
        thu: { enabled: true, start: "09:00", end: "18:00" },
        fri: { enabled: true, start: "09:00", end: "18:00" },
        sat: { enabled: false, start: "09:00", end: "18:00" },
        sun: { enabled: false, start: "09:00", end: "18:00" },
      },
      defaultFlowId: flow.id,
    },
  });

  const now = new Date();
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);
  const minutesFromNow = (minutes: number) => new Date(now.getTime() + minutes * 60 * 1000);

  async function createLeadWithTimeline(input: {
    externalId: string;
    sourceType: "WEBHOOK" | "API" | "MANUAL" | "IMPORT" | "EMAIL";
    status: "NEW" | "OPEN" | "QUALIFIED" | "NOT_QUALIFIED" | "SPAM" | "ARCHIVED";
    ownerUserId?: string;
    identity: { name: string; email: string; phone: string; company: string };
    stageStatus: SLAStageInstanceStatus;
    stageStartedAt: Date;
    stageDueAt: Date;
    stageStoppedAt?: Date;
    stageBreachedAt?: Date;
    stopReason?: string;
    events: Array<{
      type: string;
      payload?: Record<string, unknown>;
      createdAt: Date;
      actorUserId?: string;
    }>;
  }) {
    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        sourceType: input.sourceType,
        externalId: input.externalId,
        status: input.status,
        ownerUserId: input.ownerUserId,
      },
    });

    await prisma.leadIdentity.create({
      data: {
        leadId: lead.id,
        name: input.identity.name,
        email: input.identity.email,
        phone: input.identity.phone,
        company: input.identity.company,
        meta: { seeded: true, persona: input.identity.company },
      },
    });

    let proofEventId: string | undefined;

    for (const event of input.events) {
      const created = await prisma.leadEvent.create({
        data: {
          leadId: lead.id,
          workspaceId: workspace.id,
          type: event.type,
          payload: (event.payload ?? {}) as Prisma.InputJsonValue,
          createdAt: event.createdAt,
          actorUserId: event.actorUserId,
        },
      });

      if (event.type.includes("PROOF")) {
        proofEventId = created.id;
      }
    }

    await prisma.sLAStageInstance.create({
      data: {
        workspaceId: workspace.id,
        leadId: lead.id,
        flowId: flow.id,
        stageKey: "first_touch",
        startedAt: input.stageStartedAt,
        dueAt: input.stageDueAt,
        stoppedAt: input.stageStoppedAt,
        breachedAt: input.stageBreachedAt,
        status: input.stageStatus,
        stopReason: input.stopReason,
        proofEventId,
      },
    });

    if (input.status === "QUALIFIED") {
      await prisma.booking.create({
        data: {
          leadId: lead.id,
          provider: "calendly",
          eventId: `book-${input.externalId}`,
          startAt: minutesFromNow(180),
          endAt: minutesFromNow(210),
          meetLink: "https://meet.google.com/demo-pinggo",
        },
      });
    }

    return lead;
  }

  await createLeadWithTimeline({
    externalId: "LEAD-001",
    sourceType: "WEBHOOK",
    status: "OPEN",
    ownerUserId: agentOne.id,
    identity: {
      name: "Andrei Ionescu",
      email: "andrei.ionescu@example.com",
      phone: "+40722000111",
      company: "North Sales",
    },
    stageStatus: "RUNNING",
    stageStartedAt: minutesAgo(25),
    stageDueAt: minutesFromNow(35),
    events: [
      { type: "LEAD_CREATED", createdAt: minutesAgo(25), actorUserId: owner.id },
      { type: "ROUTED_TO_AGENT", payload: { owner: "agent1@pinggo.io" }, createdAt: minutesAgo(24), actorUserId: owner.id },
    ],
  });

  await createLeadWithTimeline({
    externalId: "LEAD-002",
    sourceType: "API",
    status: "QUALIFIED",
    ownerUserId: agentTwo.id,
    identity: {
      name: "Ioana Pop",
      email: "ioana.pop@example.com",
      phone: "+40722000222",
      company: "Blue Growth",
    },
    stageStatus: "STOPPED",
    stageStartedAt: minutesAgo(70),
    stageDueAt: minutesAgo(10),
    stageStoppedAt: minutesAgo(20),
    stopReason: "proof:reply_received",
    events: [
      { type: "LEAD_CREATED", createdAt: minutesAgo(70), actorUserId: owner.id },
      {
        type: "reply_received",
        payload: { proofType: "reply_received" },
        createdAt: minutesAgo(20),
        actorUserId: agentTwo.id,
      },
      { type: "QUALIFIED", createdAt: minutesAgo(15), actorUserId: agentTwo.id },
    ],
  });

  await createLeadWithTimeline({
    externalId: "LEAD-003",
    sourceType: "MANUAL",
    status: "OPEN",
    ownerUserId: agentOne.id,
    identity: {
      name: "Mihai Dumitru",
      email: "mihai.dumitru@example.com",
      phone: "+40722000333",
      company: "Edge Logistics",
    },
    stageStatus: "BREACHED",
    stageStartedAt: minutesAgo(210),
    stageDueAt: minutesAgo(90),
    stageBreachedAt: minutesAgo(88),
    events: [
      { type: "LEAD_CREATED", createdAt: minutesAgo(210), actorUserId: manager.id },
      { type: "ESCALATION_REMINDER", payload: { pct: 60 }, createdAt: minutesAgo(130), actorUserId: manager.id },
      { type: "ESCALATION_MANAGER_ALERT", payload: { pct: 100 }, createdAt: minutesAgo(88), actorUserId: manager.id },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: manager.id,
        type: "SLA_BREACH",
        title: "Lead cu breach SLA",
        body: "Lead LEAD-003 a depasit termenul de raspuns.",
      },
      {
        workspaceId: workspace.id,
        userId: owner.id,
        type: "DAILY_SUMMARY",
        title: "Rezumat zilnic",
        body: "3 leaduri demo pregatite pentru MVP.",
      },
    ],
  });

  console.log("Seed complet: workspace Demo, 4 users, flow Standard, 3 leaduri cu timeline.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
