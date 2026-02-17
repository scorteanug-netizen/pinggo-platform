import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processAutopilotReply } from "@/server/services/autopilot/processReply";
import { dispatchOneOutboundMessage } from "@/server/services/messaging/dispatchOneOutbound";
import { notifyAgentHandover } from "@/server/services/notifications/notifyAgentHandover";
import { logger } from "@/lib/logger";

const replySchema = z.object({
  leadId: z.string().trim().min(1),
  text: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { leadId, text } = parsed.data;

    const result = await processAutopilotReply({ leadId, text });

    if (!result) {
      return NextResponse.json({ error: "AutopilotRun not found" }, { status: 404 });
    }

    if (result.queuedMessage?.id) {
      await dispatchOneOutboundMessage(result.queuedMessage.id);
    }

    if (
      result.autopilot.status === "HANDED_OVER" &&
      result.handoverUserId &&
      result.scenarioId
    ) {
      try {
        await notifyAgentHandover({
          leadId: result.leadId,
          scenarioId: result.scenarioId,
          handoverUserId: result.handoverUserId,
          summary: result.lastInboundText ?? undefined,
        });
      } catch (e) {
        logger.error("[autopilot/reply] notifyAgentHandover", e);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[autopilot/reply]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
