import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { addProofEvent } from "@/server/services/leadService";
import { sendWhatsApp } from "@/server/services/messaging/sendWhatsApp";
import { logger } from "@/lib/logger";
import { LeadEventType } from "@/lib/eventTypes";

type PendingReply = {
  id: string;
  leadId: string;
  workspaceId: string;
  agentUserId: string;
  agentPhone: string;
  type: string;
  status: string;
};

export type AgentReplyResult = {
  ok: boolean;
  action: string;
  leadId?: string;
};

const HANDOVER_OPTIONS: Record<string, string> = {
  "1": "confirmed",
  "2": "declined",
};

const OUTCOME_OPTIONS: Record<string, string> = {
  "1": "meeting_scheduled",
  "2": "not_interested",
  "3": "still_talking",
};

export async function processAgentReply(
  pending: PendingReply,
  text: string
): Promise<AgentReplyResult> {
  const normalized = text.trim();

  if (pending.type === "handover_confirmation") {
    return processHandoverConfirmation(pending, normalized);
  }

  if (pending.type === "outcome_followup") {
    return processOutcomeFollowup(pending, normalized);
  }

  return { ok: false, action: "unknown_type" };
}

async function processHandoverConfirmation(
  pending: PendingReply,
  text: string
): Promise<AgentReplyResult> {
  const action = HANDOVER_OPTIONS[text];

  if (!action) {
    // Invalid reply — send help text, don't create a lead
    try {
      await sendWhatsApp({
        workspaceId: pending.workspaceId,
        leadId: pending.leadId,
        toPhone: pending.agentPhone,
        text: "Raspunde cu 1 sau 2:\n1 — Am preluat\n2 — Nu pot acum",
      });
    } catch (e) {
      logger.error("[processAgentReply] failed to send help text", e);
    }
    return { ok: true, action: "help_sent", leadId: pending.leadId };
  }

  // Mark pending as replied
  await prisma.pendingAgentReply.update({
    where: { id: pending.id },
    data: {
      status: "REPLIED",
      replyValue: text,
      repliedAt: new Date(),
    },
  });

  if (action === "confirmed") {
    // Log confirmation event
    await prisma.eventLog.create({
      data: {
        leadId: pending.leadId,
        actorUserId: pending.agentUserId,
        eventType: LeadEventType.AGENT_CONFIRMED_HANDOVER,
        payload: {
          agentUserId: pending.agentUserId,
          agentPhone: pending.agentPhone,
          channel: "whatsapp",
        } as Prisma.InputJsonValue,
      },
    });

    // Create proof event + stop SLA
    try {
      await addProofEvent(pending.leadId, "manual_proof_note", {
        note: "Agent a confirmat preluarea via WhatsApp",
        agentUserId: pending.agentUserId,
      });
    } catch (e) {
      logger.error("[processAgentReply] addProofEvent failed", e);
    }

    // Set lead owner if not already set
    await prisma.lead.updateMany({
      where: {
        id: pending.leadId,
        ownerUserId: null,
      },
      data: {
        ownerUserId: pending.agentUserId,
      },
    });

    return { ok: true, action: "agent_confirmed", leadId: pending.leadId };
  }

  // action === "declined"
  await prisma.eventLog.create({
    data: {
      leadId: pending.leadId,
      actorUserId: pending.agentUserId,
      eventType: LeadEventType.AGENT_DECLINED_HANDOVER,
      payload: {
        agentUserId: pending.agentUserId,
        agentPhone: pending.agentPhone,
        channel: "whatsapp",
      } as Prisma.InputJsonValue,
    },
  });

  // Notify manager via in-app notification
  try {
    const agent = await prisma.user.findUnique({
      where: { id: pending.agentUserId },
      select: { name: true, email: true },
    });
    const agentLabel = agent?.name?.trim() || agent?.email || "Agent";

    const lead = await prisma.lead.findUnique({
      where: { id: pending.leadId },
      select: { firstName: true, lastName: true },
    });
    const leadName =
      [lead?.firstName, lead?.lastName].filter(Boolean).join(" ").trim() || "Lead";

    // Find managers/admins in the workspace to notify
    const managers = await prisma.membership.findMany({
      where: {
        workspaceId: pending.workspaceId,
        role: { in: ["OWNER", "ADMIN", "MANAGER"] },
        status: "ACTIVE",
      },
      select: { userId: true },
    });

    if (managers.length > 0) {
      await prisma.notification.createMany({
        data: managers.map((m) => ({
          workspaceId: pending.workspaceId,
          userId: m.userId,
          type: "agent_declined_handover",
          title: "Agent nu poate prelua lead-ul",
          body: `${agentLabel} nu poate prelua lead-ul ${leadName}. Lead-ul necesita realocare.`,
        })),
      });
    }
  } catch (e) {
    logger.error("[processAgentReply] manager notification failed", e);
  }

  return { ok: true, action: "agent_declined", leadId: pending.leadId };
}

async function processOutcomeFollowup(
  pending: PendingReply,
  text: string
): Promise<AgentReplyResult> {
  const outcome = OUTCOME_OPTIONS[text];

  if (!outcome) {
    try {
      await sendWhatsApp({
        workspaceId: pending.workspaceId,
        leadId: pending.leadId,
        toPhone: pending.agentPhone,
        text: "Raspunde cu 1, 2 sau 3:\n1 — Vizita programata\n2 — Nu e interesat\n3 — Inca in discutii",
      });
    } catch (e) {
      logger.error("[processAgentReply] failed to send outcome help text", e);
    }
    return { ok: true, action: "help_sent", leadId: pending.leadId };
  }

  await prisma.pendingAgentReply.update({
    where: { id: pending.id },
    data: {
      status: "REPLIED",
      replyValue: text,
      repliedAt: new Date(),
    },
  });

  const OUTCOME_LABELS: Record<string, string> = {
    meeting_scheduled: "Vizita programata",
    not_interested: "Nu e interesat",
    still_talking: "Inca in discutii",
  };

  await prisma.eventLog.create({
    data: {
      leadId: pending.leadId,
      actorUserId: pending.agentUserId,
      eventType: LeadEventType.AGENT_OUTCOME_REPORTED,
      payload: {
        agentUserId: pending.agentUserId,
        outcome,
        outcomeLabel: OUTCOME_LABELS[outcome] ?? outcome,
        channel: "whatsapp",
      } as Prisma.InputJsonValue,
    },
  });

  return { ok: true, action: `outcome_${outcome}`, leadId: pending.leadId };
}
