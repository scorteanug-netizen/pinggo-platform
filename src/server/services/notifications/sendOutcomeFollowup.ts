import { prisma } from "@/server/db";
import { sendWhatsApp } from "@/server/services/messaging/sendWhatsApp";
import { logger } from "@/lib/logger";

const FOLLOWUP_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function sendPendingOutcomeFollowups(): Promise<{
  sent: number;
  errors: number;
}> {
  const cutoff = new Date(Date.now() - FOLLOWUP_DELAY_MS);

  // Find confirmed handovers that replied > 2h ago, without an existing outcome followup
  const confirmedReplies = await prisma.pendingAgentReply.findMany({
    where: {
      type: "handover_confirmation",
      status: "REPLIED",
      replyValue: "1", // only confirmed
      repliedAt: { lte: cutoff },
    },
    select: {
      leadId: true,
      workspaceId: true,
      agentUserId: true,
      agentPhone: true,
      lead: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  let sent = 0;
  let errors = 0;

  for (const reply of confirmedReplies) {
    // Check if outcome followup already exists for this lead
    const existingFollowup = await prisma.pendingAgentReply.findFirst({
      where: {
        leadId: reply.leadId,
        type: "outcome_followup",
      },
      select: { id: true },
    });

    if (existingFollowup) continue;

    const leadName =
      [reply.lead?.firstName, reply.lead?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "lead-ul";

    const body = [
      `Cum a mers cu ${leadName}?`,
      "",
      "1 \u2014 Vizita programata",
      "2 \u2014 Nu e interesat",
      "3 \u2014 Inca in discutii",
    ].join("\n");

    try {
      await sendWhatsApp({
        workspaceId: reply.workspaceId,
        leadId: reply.leadId,
        toPhone: reply.agentPhone,
        text: body,
      });

      await prisma.pendingAgentReply.create({
        data: {
          leadId: reply.leadId,
          workspaceId: reply.workspaceId,
          agentUserId: reply.agentUserId,
          agentPhone: reply.agentPhone,
          type: "outcome_followup",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });

      sent++;
    } catch (e) {
      logger.error("[sendOutcomeFollowup] failed", { leadId: reply.leadId, error: e });
      errors++;
    }
  }

  return { sent, errors };
}
