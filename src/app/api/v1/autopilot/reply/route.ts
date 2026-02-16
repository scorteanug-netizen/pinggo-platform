import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { processAutopilotReply } from "@/server/services/autopilot/processReply";

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

    const result = await prisma.$transaction((tx) => processAutopilotReply(tx, { leadId, text }));

    if (!result) {
      return NextResponse.json({ error: "AutopilotRun not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[autopilot/reply]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
