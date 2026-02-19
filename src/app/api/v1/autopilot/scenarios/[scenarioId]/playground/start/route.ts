import { AutopilotRunStatus, LeadSourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const startSchema = z.object({
  leadSeed: z
    .object({
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
      email: z.string().trim().optional(),
      phone: z.string().trim().optional(),
      source: z.string().trim().optional(),
    })
    .optional(),
  reset: z.boolean().optional(),
});

type RouteContext = { params: { scenarioId: string } };

function json500(detail: string) {
  return NextResponse.json(
    { error: "Server misconfiguration", detail },
    { status: 500 }
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await requirePermission("canManageLeadActions");
    const { workspaceId, userId } = context;

    if (!workspaceId) {
      return json500("Missing workspaceId");
    }

    const scenarioId = params.scenarioId?.trim();
    if (!scenarioId) {
      return NextResponse.json(
        { error: "Bad request", detail: "Missing scenarioId" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { leadSeed, reset } = parsed.data;

    const scenario = await prisma.autopilotScenario.findFirst({
      where: { id: scenarioId, workspaceId },
      select: { id: true, name: true, mode: true },
    });
    if (!scenario) {
      return json500("Scenario not found");
    }

    const playgroundPhone = "+40000000000";
    const result = await prisma.$transaction(async (tx) => {
      let lead: { id: string };
      if (reset) {
        const externalId = `playground:${scenarioId}:${userId}:${Date.now()}`;
        lead = await tx.lead.create({
          data: {
            workspaceId,
            sourceType: LeadSourceType.MANUAL,
            externalId,
            firstName: leadSeed?.firstName ?? "Playground",
            lastName: leadSeed?.lastName ?? null,
            email: leadSeed?.email ?? null,
            phone: leadSeed?.phone ?? playgroundPhone,
            source: leadSeed?.source ?? "playground",
          },
          select: { id: true },
        });
      } else {
        const externalId = `playground:${scenarioId}:${userId}`;
        const existing = await tx.lead.findFirst({
          where: {
            workspaceId,
            sourceType: LeadSourceType.MANUAL,
            externalId,
          },
          select: { id: true, phone: true },
        });
        if (!existing) {
          lead = await tx.lead.create({
            data: {
              workspaceId,
              sourceType: LeadSourceType.MANUAL,
              externalId,
              firstName: leadSeed?.firstName ?? "Playground",
              lastName: leadSeed?.lastName ?? null,
              email: leadSeed?.email ?? null,
              phone: leadSeed?.phone ?? playgroundPhone,
              source: leadSeed?.source ?? "playground",
            },
            select: { id: true },
          });
        } else {
          lead = { id: existing.id };
          if (!existing.phone?.trim()) {
            await tx.lead.update({
              where: { id: existing.id },
              data: { phone: playgroundPhone },
            });
          }
        }
      }

      let run = await tx.autopilotRun.findUnique({
        where: { leadId: lead.id },
        select: { id: true, status: true },
      });

      const initialRunData = {
        status: AutopilotRunStatus.ACTIVE,
        scenarioId: scenario.id,
        currentStep: "welcome",
        stateJson: { node: "q1", answers: {}, questionIndex: 0 },
        lastOutboundAt: new Date(),
      };

      if (reset || !run || run.status !== AutopilotRunStatus.ACTIVE) {
        await tx.outboundMessage.deleteMany({
          where: { leadId: lead.id, status: "QUEUED" },
        });
        if (run) {
          run = await tx.autopilotRun.update({
            where: { id: run.id },
            data: initialRunData,
            select: { id: true, status: true },
          });
        } else {
          run = await tx.autopilotRun.create({
            data: {
              leadId: lead.id,
              workspaceId,
              ...initialRunData,
            },
            select: { id: true, status: true },
          });
        }
      }

      return { leadId: lead.id, runId: run.id };
    });

    return NextResponse.json({
      leadId: result.leadId,
      runId: result.runId,
      scenarioId: scenario.id,
      scenarioMode: scenario.mode,
    });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as { status?: number }).status ?? 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("[playground/start]", message);
    const sanitized = message.replace(/[\s\n\r]+/g, " ").slice(0, 200);
    return json500(`Prisma error: ${sanitized}`);
  }
}
