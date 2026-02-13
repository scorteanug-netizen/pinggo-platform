import Link from "next/link";
import { MembershipRole } from "@prisma/client";
import { Bot, Calendar, ExternalLink, TrendingUp } from "lucide-react";

import { prisma } from "@/server/db";

type AutopilotStatusCardProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

type ScenarioMetrics = {
  id: string;
  name: string;
  leadsToday: number;
  bookingRate: number;
};

function getTodayUtcRange() {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);

  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

function computeScenarioMetrics(params: {
  flowIds: string[];
  leadIdsByFlow: Map<string, Set<string>>;
  bookedLeadIds: Set<string>;
  flowNameById: Map<string, string>;
}): ScenarioMetrics[] {
  return params.flowIds.map((flowId) => {
    const leadIds = params.leadIdsByFlow.get(flowId) ?? new Set<string>();
    const leadsToday = leadIds.size;
    let bookedCount = 0;

    for (const leadId of leadIds) {
      if (params.bookedLeadIds.has(leadId)) {
        bookedCount += 1;
      }
    }

    const bookingRate =
      leadsToday > 0 ? Math.max(0, Math.min(100, Math.round((bookedCount / leadsToday) * 100))) : 0;

    return {
      id: flowId,
      name: params.flowNameById.get(flowId) ?? "Scenariu fara nume",
      leadsToday,
      bookingRate,
    };
  });
}

export async function AutopilotStatusCard({
  workspaceId,
  viewerRole,
  viewerUserId,
}: AutopilotStatusCardProps) {
  const activeFlows = await prisma.flow.findMany({
    where: {
      workspaceId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 5,
  });

  const activeFlowCount = activeFlows.length;
  if (activeFlowCount === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-50 p-2">
              <Bot className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-fraunces font-bold text-slate-900">Autopilot</h2>
              <p className="text-xs text-slate-600">0 scenarii active</p>
            </div>
          </div>
          <Link
            href="/autopilot"
            className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600 transition-colors duration-200 hover:text-violet-700"
          >
            Configureaza
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        <div className="py-6 text-center">
          <Bot className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="mb-3 text-sm text-slate-500">Niciun scenariu autopilot activ</p>
          <Link
            href="/autopilot"
            className="text-sm font-semibold text-violet-600 transition-colors duration-200 hover:text-violet-700"
          >
            Configureaza Autopilot
          </Link>
        </div>
      </section>
    );
  }

  const flowIds = activeFlows.map((flow) => flow.id);
  const flowNameById = new Map(activeFlows.map((flow) => [flow.id, flow.name]));
  const { from, to } = getTodayUtcRange();

  const stageInstances = await prisma.sLAStageInstance.findMany({
    where: {
      workspaceId,
      flowId: { in: flowIds },
      startedAt: { gte: from, lte: to },
      ...(viewerRole === MembershipRole.AGENT
        ? {
            lead: {
              ownerUserId: viewerUserId,
            },
          }
        : {}),
    },
    select: {
      flowId: true,
      leadId: true,
    },
  });

  const leadIdsByFlow = new Map<string, Set<string>>();
  const leadIdsSet = new Set<string>();

  for (const instance of stageInstances) {
    if (!leadIdsByFlow.has(instance.flowId)) {
      leadIdsByFlow.set(instance.flowId, new Set<string>());
    }
    leadIdsByFlow.get(instance.flowId)?.add(instance.leadId);
    leadIdsSet.add(instance.leadId);
  }

  const allLeadIds = [...leadIdsSet];
  let bookedLeadIds = new Set<string>();

  if (allLeadIds.length > 0) {
    const bookedEvents = await prisma.leadEvent.findMany({
      where: {
        workspaceId,
        type: "meeting_created",
        leadId: { in: allLeadIds },
        createdAt: { gte: from, lte: to },
      },
      select: {
        leadId: true,
      },
      distinct: ["leadId"],
    });

    bookedLeadIds = new Set(bookedEvents.map((event) => event.leadId));
  }

  const scenarios = computeScenarioMetrics({
    flowIds,
    leadIdsByFlow,
    bookedLeadIds,
    flowNameById,
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-50 p-2">
            <Bot className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-lg font-fraunces font-bold text-slate-900">Autopilot</h2>
            <p className="text-xs text-slate-600">{activeFlowCount} scenarii active</p>
          </div>
        </div>
        <Link
          href="/autopilot"
          className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600 transition-colors duration-200 hover:text-violet-700"
        >
          Configureaza
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        {scenarios.map((scenario) => (
          <Link
            key={scenario.id}
            href={`/autopilot/${scenario.id}`}
            className="block rounded-lg border border-slate-100 p-3 transition-all duration-200 hover:border-violet-300 hover:bg-violet-50"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-slate-900">{scenario.name}</p>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-semibold text-green-600">Live</span>
              </span>
            </div>

            <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {scenario.leadsToday} leaduri azi
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {scenario.bookingRate}% booking
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-violet-500 transition-all duration-300"
                style={{ width: `${scenario.bookingRate}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function AutopilotStatusCardSkeleton() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
          <div className="space-y-2">
            <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-100 p-3">
            <div className="space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
