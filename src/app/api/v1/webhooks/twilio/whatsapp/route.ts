import { AutopilotRunStatus, LeadSourceType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { prisma } from "@/server/db";
import { getDefaultScenario } from "@/server/services/autopilot/getDefaultScenario";
import { processAutopilotReply } from "@/server/services/autopilot/processReply";
import { dispatchOneOutboundMessage } from "@/server/services/messaging/dispatchOneOutbound";
import { notifyAgentHandover } from "@/server/services/notifications/notifyAgentHandover";
import { logger } from "@/lib/logger";

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

    if (!body.trim()) {
      return NextResponse.json({ ok: true, skipped: "empty_body" });
    }

    const normalizedFrom = normalizePhoneFromTwilio(from);
    if (!normalizedFrom) {
      return NextResponse.json({ error: "Invalid From" }, { status: 400 });
    }

    const bodyTrimmed = body.trim();

    const skipSignatureCheck = process.env.TWILIO_SKIP_SIGNATURE_CHECK === "true";
    if (!skipSignatureCheck) {
      const authToken =
        process.env.TWILIO_WEBHOOK_SECRET?.trim() ?? process.env.TWILIO_AUTH_TOKEN?.trim();
      if (authToken) {
        const signature = request.headers.get("x-twilio-signature") ?? "";
        const url = buildWebhookUrl(request);
        const isValid = Twilio.validateRequest(authToken, signature, url, params);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
      }
    }

    const workspaceId = process.env.TWILIO_DEFAULT_WORKSPACE_ID?.trim();
    if (!workspaceId) {
      throw new Error("Missing TWILIO_DEFAULT_WORKSPACE_ID");
    }

    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error("Database not reachable");
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new Error("Database not reachable");
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
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && externalId) {
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

    await prisma.$transaction(async (tx) => {
      const existingSla = await tx.sLAState.findUnique({
        where: { leadId: lead!.id },
        select: { id: true, stoppedAt: true },
      });
      if (!existingSla) {
        const startedAt = new Date();
        const deadlineAt = new Date(startedAt.getTime() + 15 * 60 * 1000);
        await tx.sLAState.create({
          data: { leadId: lead!.id, startedAt, deadlineAt },
        });
      } else if (existingSla.stoppedAt !== null) {
        const startedAt = new Date();
        const deadlineAt = new Date(startedAt.getTime() + 15 * 60 * 1000);
        await tx.sLAState.update({
          where: { leadId: lead!.id },
          data: { startedAt, deadlineAt, stoppedAt: null, stopReason: null, breachedAt: null },
        });
      }

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

    await prisma.eventLog.create({
      data: {
        leadId: lead.id,
        eventType: "whatsapp_inbound",
        payload: {
          from: normalizedFrom,
          to,
          messageSid,
          text: body,
        } as Prisma.InputJsonValue,
      },
    });

    const leadId = lead.id;
    const result = await processAutopilotReply({ leadId, text: bodyTrimmed });

    if (!result) {
      return NextResponse.json({ error: "AutopilotRun not found" }, { status: 404 });
    }

    await prisma.eventLog.create({
      data: {
        leadId,
        eventType: "whatsapp_inbound_processed",
        payload: {
          leadId,
          text: body,
          result: {
            status: result.autopilot.status,
            nodeAfter: result.autopilot.node,
            queuedMessageId: result.queuedMessage?.id ?? null,
            messageBlocked: result.messageBlocked ?? false,
            handoverTriggered: result.autopilot.status === "HANDED_OVER",
          },
        } as Prisma.InputJsonValue,
      },
    });

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
        logger.error("[webhooks/twilio/whatsapp] notifyAgentHandover", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : "Internal error";
    logger.error("[webhooks/twilio/whatsapp]", safeMessage);
    return NextResponse.json(
      { error: "Server misconfiguration", detail: safeMessage },
      { status: 500 }
    );
  }
}
