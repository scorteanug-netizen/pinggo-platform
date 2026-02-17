import {
  AutopilotScenarioMode,
  AutopilotScenarioType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = {
  params: { scenarioId: string };
};

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  scenarioType: z.nativeEnum(AutopilotScenarioType).optional(),
  mode: z.nativeEnum(AutopilotScenarioMode).optional(),
  aiPrompt: z.string().trim().min(1).nullable().optional(),
  slaMinutes: z.number().int().min(1).optional(),
  maxQuestions: z.number().int().min(1).optional(),
  handoverUserId: z.string().trim().min(1).nullable().optional(),
  bookingConfigJson: z.record(z.unknown()).nullable().optional(),
  isDefault: z.boolean().optional(),
  // Company & agent context fields
  agentName: z.string().trim().min(1).nullable().optional(),
  companyName: z.string().trim().min(1).nullable().optional(),
  companyDescription: z.string().trim().min(1).nullable().optional(),
  offerSummary: z.string().trim().min(1).nullable().optional(),
  calendarLinkRaw: z.string().trim().min(1).nullable().optional(),
  language: z.string().trim().min(1).optional(),
  tone: z.string().trim().min(1).nullable().optional(),
  knowledgeBaseJson: z.record(z.unknown()).nullable().optional(),
  handoverKeywordsJson: z.array(z.string()).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serialize(scenario: {
  id: string;
  workspaceId: string;
  name: string;
  scenarioType: AutopilotScenarioType;
  mode: AutopilotScenarioMode;
  aiPrompt: string | null;
  slaMinutes: number;
  maxQuestions: number;
  handoverUserId: string | null;
  bookingConfigJson: unknown;
  isDefault: boolean;
  agentName: string | null;
  companyName: string | null;
  companyDescription: string | null;
  offerSummary: string | null;
  calendarLinkRaw: string | null;
  language: string;
  tone: string | null;
  knowledgeBaseJson: unknown;
  handoverKeywordsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: scenario.id,
    workspaceId: scenario.workspaceId,
    name: scenario.name,
    scenarioType: scenario.scenarioType,
    mode: scenario.mode,
    aiPrompt: scenario.aiPrompt,
    slaMinutes: scenario.slaMinutes,
    maxQuestions: scenario.maxQuestions,
    handoverUserId: scenario.handoverUserId,
    bookingConfigJson: scenario.bookingConfigJson,
    isDefault: scenario.isDefault,
    agentName: scenario.agentName,
    companyName: scenario.companyName,
    companyDescription: scenario.companyDescription,
    offerSummary: scenario.offerSummary,
    calendarLinkRaw: scenario.calendarLinkRaw,
    language: scenario.language,
    tone: scenario.tone,
    knowledgeBaseJson: scenario.knowledgeBaseJson,
    handoverKeywordsJson: scenario.handoverKeywordsJson,
    createdAt: scenario.createdAt.toISOString(),
    updatedAt: scenario.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/autopilot/scenarios/[scenarioId]
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const scenarioId = params.scenarioId?.trim();
    if (!scenarioId) {
      return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const scenario = await prisma.$transaction(async (tx) => {
      const existing = await tx.autopilotScenario.findUnique({
        where: { id: scenarioId },
        select: { id: true, workspaceId: true },
      });

      if (!existing) return null;

      // If setting isDefault to true, clear other defaults
      if (updates.isDefault === true) {
        await tx.autopilotScenario.updateMany({
          where: {
            workspaceId: existing.workspaceId,
            isDefault: true,
            id: { not: scenarioId },
          },
          data: { isDefault: false },
        });
      }

      return tx.autopilotScenario.update({
        where: { id: scenarioId },
        data: {
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.scenarioType !== undefined && { scenarioType: updates.scenarioType }),
          ...(updates.mode !== undefined && { mode: updates.mode }),
          ...(updates.aiPrompt !== undefined && { aiPrompt: updates.aiPrompt }),
          ...(updates.slaMinutes !== undefined && { slaMinutes: updates.slaMinutes }),
          ...(updates.maxQuestions !== undefined && { maxQuestions: updates.maxQuestions }),
          ...(updates.handoverUserId !== undefined && { handoverUserId: updates.handoverUserId }),
          ...(updates.bookingConfigJson !== undefined && { bookingConfigJson: updates.bookingConfigJson ?? undefined }),
          ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
          ...(updates.agentName !== undefined && { agentName: updates.agentName }),
          ...(updates.companyName !== undefined && { companyName: updates.companyName }),
          ...(updates.companyDescription !== undefined && { companyDescription: updates.companyDescription }),
          ...(updates.offerSummary !== undefined && { offerSummary: updates.offerSummary }),
          ...(updates.calendarLinkRaw !== undefined && { calendarLinkRaw: updates.calendarLinkRaw }),
          ...(updates.language !== undefined && { language: updates.language }),
          ...(updates.tone !== undefined && { tone: updates.tone }),
          ...(updates.knowledgeBaseJson !== undefined && { knowledgeBaseJson: updates.knowledgeBaseJson ?? undefined }),
          ...(updates.handoverKeywordsJson !== undefined && { handoverKeywordsJson: updates.handoverKeywordsJson ?? undefined }),
        },
      });
    });

    if (!scenario) {
      return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
    }

    return NextResponse.json(serialize(scenario));
  } catch (error) {
    logger.error("[autopilot/scenarios PATCH]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/autopilot/scenarios/[scenarioId]
// ---------------------------------------------------------------------------

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const scenarioId = params.scenarioId?.trim();
    if (!scenarioId) {
      return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const scenario = await tx.autopilotScenario.findUnique({
        where: { id: scenarioId },
        select: { id: true, workspaceId: true, isDefault: true },
      });

      if (!scenario) {
        throw { code: "NOT_FOUND" as const };
      }

      const scenarioCount = await tx.autopilotScenario.count({
        where: { workspaceId: scenario.workspaceId },
      });
      if (scenarioCount <= 1) {
        throw { code: "WORKSPACE_MUST_HAVE_ONE_SCENARIO" as const };
      }

      const runsUsingScenario = await tx.autopilotRun.count({
        where: { scenarioId },
      });
      if (runsUsingScenario > 0) {
        throw { code: "SCENARIO_IN_USE" as const };
      }

      if (scenario.isDefault) {
        const another = await tx.autopilotScenario.findFirst({
          where: {
            workspaceId: scenario.workspaceId,
            id: { not: scenarioId },
          },
          select: { id: true },
        });
        if (another) {
          await tx.autopilotScenario.update({
            where: { id: another.id },
            data: { isDefault: true },
          });
        }
      }

      await tx.autopilotScenario.delete({
        where: { id: scenarioId },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const known = err as { code?: string };
    if (known.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
    }
    if (known.code === "WORKSPACE_MUST_HAVE_ONE_SCENARIO") {
      return NextResponse.json(
        { error: "WORKSPACE_MUST_HAVE_ONE_SCENARIO" },
        { status: 409 }
      );
    }
    if (known.code === "SCENARIO_IN_USE") {
      return NextResponse.json({ error: "SCENARIO_IN_USE" }, { status: 409 });
    }
    logger.error("[autopilot/scenarios DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
