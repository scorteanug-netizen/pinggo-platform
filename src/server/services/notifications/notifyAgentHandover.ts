import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { sendWhatsApp } from "@/server/services/messaging/sendWhatsApp";

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message ?? "";
    if (msg.includes("TWILIO") || msg.includes("sid") || /[A-Z]{2}[a-z0-9]{32}/.test(msg)) {
      return "provider_error";
    }
    return msg.slice(0, 200).replace(/\s+/g, " ").trim() || "provider_error";
  }
  return "provider_error";
}

export async function notifyAgentHandover(args: {
  leadId: string;
  scenarioId: string;
  handoverUserId: string;
  summary?: string | null;
}): Promise<void> {
  const { leadId, scenarioId, handoverUserId, summary } = args;

  const [agent, lead] = await Promise.all([
    prisma.user.findUnique({
      where: { id: handoverUserId },
      select: { id: true, name: true, phone: true, email: true },
    }),
    prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        workspaceId: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
      },
    }),
  ]);

  if (!agent) return;
  const agentPhone = (agent.phone ?? "").trim();
  if (!agentPhone) {
    await prisma.eventLog.create({
      data: {
        leadId,
        eventType: "handover_notification_blocked",
        payload: {
          reason: "missing_agent_phone",
          handoverUserId,
          scenarioId,
        } as Prisma.InputJsonValue,
      },
    });
    return;
  }

  if (!lead) return;

  const leadName =
    [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "-";
  const leadTel = (lead.phone ?? "").trim() || "-";
  const leadEmail = (lead.email ?? "").trim() || "-";
  const motiv = (summary ?? "").trim() || "Handover autopilot";
  const baseUrl = (process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const link = `${baseUrl}/app/leads/${leadId}`;

  const body = [
    "\uD83D\uDD14 Lead nou de preluat",
    "",
    `Nume: ${leadName}`,
    `Tel: ${leadTel}`,
    `Email: ${leadEmail}`,
    `Motiv: ${motiv}`,
    "",
    "Raspunde:",
    "1 \u2014 Am preluat",
    "2 \u2014 Nu pot acum",
    "",
    `Link: ${link}`,
  ].join("\n");

  try {
    await sendWhatsApp({
      workspaceId: lead.workspaceId,
      leadId,
      toPhone: agentPhone,
      text: body,
    });

    await prisma.eventLog.create({
      data: {
        leadId,
        eventType: "handover_notified",
        payload: {
          handoverUserId,
          channel: "whatsapp",
          toPhone: agentPhone,
          scenarioId,
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.pendingAgentReply.create({
      data: {
        leadId,
        workspaceId: lead.workspaceId,
        agentUserId: handoverUserId,
        agentPhone: agentPhone,
        type: "handover_confirmation",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });
  } catch (error) {
    const errorMessage = sanitizeErrorMessage(error);
    await prisma.eventLog.create({
      data: {
        leadId,
        eventType: "handover_notification_failed",
        payload: {
          handoverUserId,
          scenarioId,
          errorMessage,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
