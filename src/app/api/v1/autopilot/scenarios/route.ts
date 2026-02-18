import {
  AutopilotScenarioMode,
  AutopilotScenarioType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  workspaceId: z.string().trim().min(1),
});

const createSchema = z.object({
  workspaceId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  scenarioType: z.nativeEnum(AutopilotScenarioType).default(AutopilotScenarioType.QUALIFY_ONLY),
  mode: z.nativeEnum(AutopilotScenarioMode).default(AutopilotScenarioMode.RULES),
  aiPrompt: z.string().trim().min(1).optional(),
  slaMinutes: z.number().int().min(1).default(15),
  maxQuestions: z.number().int().min(1).default(2),
  handoverUserId: z.string().trim().min(1).optional(),
  bookingConfigJson: z.record(z.unknown()).optional(),
  isDefault: z.boolean().default(false),
  qualificationCriteria: z
    .object({ requiredSlots: z.array(z.string()) })
    .nullable()
    .optional(),
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
  qualificationCriteria: unknown;
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
    qualificationCriteria: scenario.qualificationCriteria ?? null,
    createdAt: scenario.createdAt.toISOString(),
    updatedAt: scenario.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/autopilot/scenarios?workspaceId=...
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listQuerySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const scenarios = await prisma.autopilotScenario.findMany({
      where: { workspaceId: parsed.data.workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ items: scenarios.map(serialize) });
  } catch (error) {
    logger.error("[autopilot/scenarios GET]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/autopilot/scenarios
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    const scenario = await prisma.$transaction(async (tx) => {
      // If isDefault, clear other defaults in same workspace
      if (data.isDefault) {
        await tx.autopilotScenario.updateMany({
          where: { workspaceId: data.workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.autopilotScenario.create({
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          scenarioType: data.scenarioType,
          mode: data.mode,
          aiPrompt: data.aiPrompt ?? null,
          slaMinutes: data.slaMinutes,
          maxQuestions: data.maxQuestions,
          handoverUserId: data.handoverUserId ?? null,
          bookingConfigJson: data.bookingConfigJson ?? undefined,
          isDefault: data.isDefault,
          qualificationCriteria: data.qualificationCriteria ?? undefined,
        },
      });
    });

    return NextResponse.json(serialize(scenario), { status: 201 });
  } catch (error) {
    logger.error("[autopilot/scenarios POST]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
