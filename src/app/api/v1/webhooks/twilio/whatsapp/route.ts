import { AutopilotRunStatus, LeadSourceType, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { prisma } from "@/server/db";
import { getDefaultScenario } from "@/server/services/autopilot/getDefaultScenario";
import { processAutopilotReply } from "@/server/services/autopilot/processReply";

function normalizePhoneFromTwilio(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const stripped = trimmed.startsWith("whatsapp:") ? trimmed.slice(9).trim() : trimmed;
  const digits = stripped.replace(/\D/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

function buildWebhookUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const actualHost = forwardedHost ?? host ?? "localhost";
  const protocol = forwardedProto ?? (actualHost.includes("localhost") ? "http" : "https");
  const path = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  return `${protocol}://${actualHost}${path}${search}`;
}

async function parseFormBody(request: NextRequest): Promise<Record<string, string>> {
  const text = await request.text();
  const params: Record<string, string> = {};
  if (!text) return params;
  const searchParams = new URLSearchParams(text);
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export async function POST(request: NextRequest) {
  try {
    const params = await parseFormBody(request);
    const from = params.From ?? "";
    const to = params.To ?? "";
    const body = params.Body ?? "";
    const messageSid = params.MessageSid ?? "";

    const normalizedFrom = normalizePhoneFromTwilio(from);
    if (!normalizedFrom) {
      return NextResponse.json({ error: "Invalid From" }, { status: 400 });
    }

    const bodyTrimmed = body.trim();
    if (!bodyTrimmed) {
      return NextResponse.json({ ok: true });
    }

    const authToken =
      process.env.TWILIO_WEBHOOK_SECRET?.trim() ?? process.env.TWILIO_AUTH_TOKEN?.trim();
    if (authToken) {
      const signature = request.headers.get("x-twilio-signature") ?? "";
      const url = buildWebhookUrl(request);
      const isValid = Twilio.validateRequest(authToken, signature, url, params);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn("[webhooks/twilio/whatsapp] TWILIO_WEBHOOK_SECRET and TWILIO_AUTH_TOKEN missing - skipping signature verification");
    }

    const workspaceId = process.env.TWILIO_DEFAULT_WORKSPACE_ID?.trim();
    if (!workspaceId) {
      console.error("[webhooks/twilio/whatsapp] TWILIO_DEFAULT_WORKSPACE_ID not set");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const phoneCandidates = normalizedFrom.startsWith("+")
      ? [normalizedFrom, normalizedFrom.slice(1)]
      : [normalizedFrom, `+${normalizedFrom}`];

    let lead = await prisma.lead.findFirst({
      where: {
        workspaceId,
        OR: [
          { phone: { in: phoneCandidates } },
          { identity: { phone: { in: phoneCandidates } } },
        ],
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!lead) {
      const externalId = messageSid ? `twilio:${messageSid}` : null;
      try {
        lead = await prisma.$transaction(async (tx) => {
          const created = await tx.lead.create({
            data: {
              workspaceId,
              phone: normalizedFrom,
              source: "WHATSAPP_WEBHOOK",
              sourceType: LeadSourceType.API,
              externalId,
              status: "NEW",
            },
            select: { id: true },
          });

          await tx.leadIdentity.upsert({
            where: { leadId: created.id },
            create: { leadId: created.id, phone: normalizedFrom },
            update: { phone: normalizedFrom },
          });

          const startedAt = new Date();
          const deadlineAt = new Date(startedAt.getTime() + 15 * 60 * 1000);
          await tx.sLAState.create({
            data: {
              leadId: created.id,
              startedAt,
              deadlineAt,
            },
          });

          await tx.eventLog.create({
            data: {
              leadId: created.id,
              eventType: "lead_received",
              payload: {
                source: "WHATSAPP_WEBHOOK",
                phone: normalizedFrom,
                externalId,
              } as Prisma.InputJsonValue,
            },
          });

          const scenario = await getDefaultScenario(tx, workspaceId);
          await tx.autopilotRun.create({
            data: {
              leadId: created.id,
              workspaceId,
              scenarioId: scenario.id,
              status: AutopilotRunStatus.ACTIVE,
              currentStep: "welcome",
              stateJson: { node: "q1", answers: {}, questionIndex: 0 } as Prisma.InputJsonValue,
              lastOutboundAt: new Date(),
            },
          });

          return created;
        });
      } catch (err) {
        if (err instanceof PrismaClientKnownRequestError && err.code === "P2002" && externalId) {
          const existing = await prisma.lead.findFirst({
            where: { workspaceId, sourceType: LeadSourceType.API, externalId },
            select: { id: true },
          });
          if (existing) lead = existing;
          else throw err;
        } else {
          throw err;
        }
      }
    }
    if (!lead) {
      return NextResponse.json({ error: "Could not find or create lead" }, { status: 500 });
    }

    {
      await prisma.$transaction(async (tx) => {
        let run = await tx.autopilotRun.findUnique({
          where: { leadId: lead!.id },
          select: { id: true },
        });
        if (!run) {
          const scenario = await getDefaultScenario(tx, workspaceId);
          await tx.autopilotRun.create({
            data: {
              leadId: lead!.id,
              workspaceId,
              scenarioId: scenario.id,
              status: AutopilotRunStatus.ACTIVE,
              currentStep: "welcome",
              stateJson: { node: "q1", answers: {}, questionIndex: 0 } as Prisma.InputJsonValue,
              lastOutboundAt: new Date(),
            },
          });
        }
      });
    }

    await prisma.eventLog.create({
      data: {
        leadId: lead.id,
        eventType: "whatsapp_inbound",
        payload: {
          from: normalizedFrom,
          to,
          messageSid,
        } as Prisma.InputJsonValue,
      },
    });

    const result = await prisma.$transaction((tx) =>
      processAutopilotReply(tx, { leadId: lead!.id, text: bodyTrimmed })
    );

    if (!result) {
      return NextResponse.json({ error: "AutopilotRun not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhooks/twilio/whatsapp]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
