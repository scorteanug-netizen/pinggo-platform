import { MembershipRole, MembershipStatus } from "@prisma/client";
import { Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { prisma } from "@/server/db";

const FIRST_TOUCH_EVENT_TYPES = [
  "message_sent",
  "reply_received",
  "meeting_created",
  "call_logged",
] as const;

const AUTOPILOT_EVENT_TYPES = [
  "autopilot_started",
  "autopilot_ack",
  "autopilot_question_asked",
  "autopilot_message_received",
] as const;

const TARGET_RESPONSE_MINUTES = 15;

type TeamPerformanceSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

type PerformanceAccumulator = {
  id: string;
  name: string;
  leadsHandled: number;
  responseMinutesTotal: number;
  responseSamples: number;
  slaHits: number;
  isAutopilot?: boolean;
};

type TeamPerformanceRow = {
  id: string;
  name: string;
  initials: string;
  leadsHandled: number;
  avgResponseTime: string;
  slaCompliance: number;
  isAutopilot?: boolean;
};

function dayBoundsUtc() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

function formatResponseMinutes(minutes: number | null) {
  if (minutes === null || Number.isNaN(minutes)) return "—";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

function getInitials(name: string, isAutopilot?: boolean) {
  if (isAutopilot) return "AI";

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "--";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function getSlaTone(slaCompliance: number) {
  if (slaCompliance >= 80) {
    return {
      progress: "bg-green-500",
      badgeBg: "bg-green-50",
      badgeText: "text-green-700",
    };
  }

  if (slaCompliance >= 60) {
    return {
      progress: "bg-amber-500",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-700",
    };
  }

  return {
    progress: "bg-red-500",
    badgeBg: "bg-red-50",
    badgeText: "text-red-700",
  };
}

function toRoundedPercent(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toRow(accumulator: PerformanceAccumulator): TeamPerformanceRow {
  const avgMinutes =
    accumulator.responseSamples > 0
      ? accumulator.responseMinutesTotal / accumulator.responseSamples
      : null;

  const slaCompliance =
    accumulator.leadsHandled > 0
      ? toRoundedPercent((accumulator.slaHits / accumulator.leadsHandled) * 100)
      : 0;

  return {
    id: accumulator.id,
    name: accumulator.name,
    initials: getInitials(accumulator.name, accumulator.isAutopilot),
    leadsHandled: accumulator.leadsHandled,
    avgResponseTime: formatResponseMinutes(avgMinutes),
    slaCompliance,
    isAutopilot: accumulator.isAutopilot,
  };
}

function rankRows(left: TeamPerformanceRow, right: TeamPerformanceRow) {
  if (left.leadsHandled !== right.leadsHandled) {
    return right.leadsHandled - left.leadsHandled;
  }

  if (left.slaCompliance !== right.slaCompliance) {
    return right.slaCompliance - left.slaCompliance;
  }

  return left.name.localeCompare(right.name, "ro");
}

export async function TeamPerformanceSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: TeamPerformanceSectionProps) {
  const { start, end } = dayBoundsUtc();

  const members = await prisma.membership.findMany({
    where: {
      workspaceId,
      status: MembershipStatus.ACTIVE,
      role: MembershipRole.AGENT,
      ...(viewerRole === MembershipRole.AGENT ? { userId: viewerUserId } : {}),
    },
    select: {
      userId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const [touchEvents, autopilotEvents] = await Promise.all([
    prisma.leadEvent.findMany({
      where: {
        workspaceId,
        type: {
          in: [...FIRST_TOUCH_EVENT_TYPES],
        },
        createdAt: {
          gte: start,
          lte: end,
        },
        ...(viewerRole === MembershipRole.AGENT
          ? {
              OR: [
                { actorUserId: viewerUserId },
                { lead: { ownerUserId: viewerUserId } },
              ],
            }
          : {}),
      },
      select: {
        leadId: true,
        actorUserId: true,
        createdAt: true,
        lead: {
          select: {
            createdAt: true,
            ownerUserId: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.leadEvent.findMany({
      where: {
        workspaceId,
        type: {
          in: [...AUTOPILOT_EVENT_TYPES],
        },
        createdAt: {
          gte: start,
          lte: end,
        },
        ...(viewerRole === MembershipRole.AGENT
          ? {
              lead: {
                ownerUserId: viewerUserId,
              },
            }
          : {}),
      },
      select: {
        leadId: true,
        createdAt: true,
        lead: {
          select: {
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const byMemberId = new Map<string, PerformanceAccumulator>(
    members.map((member) => [
      member.userId,
      {
        id: member.userId,
        name: member.user.name?.trim() || member.user.email,
        leadsHandled: 0,
        responseMinutesTotal: 0,
        responseSamples: 0,
        slaHits: 0,
      },
    ])
  );

  const firstTouchByMemberLead = new Map<string, { eventAt: Date; leadCreatedAt: Date }>();
  for (const event of touchEvents) {
    const responsibleUserId = event.actorUserId ?? event.lead.ownerUserId;
    if (!responsibleUserId || !byMemberId.has(responsibleUserId)) {
      continue;
    }

    const key = `${responsibleUserId}:${event.leadId}`;
    if (!firstTouchByMemberLead.has(key)) {
      firstTouchByMemberLead.set(key, {
        eventAt: event.createdAt,
        leadCreatedAt: event.lead.createdAt,
      });
    }
  }

  for (const [key, entry] of firstTouchByMemberLead) {
    const separatorIndex = key.indexOf(":");
    const memberId = separatorIndex > -1 ? key.slice(0, separatorIndex) : key;
    const stats = byMemberId.get(memberId);
    if (!stats) {
      continue;
    }

    const diffMinutes = (entry.eventAt.getTime() - entry.leadCreatedAt.getTime()) / 60000;
    const safeDiff = Number.isFinite(diffMinutes) && diffMinutes >= 0 ? diffMinutes : null;

    stats.leadsHandled += 1;
    if (safeDiff !== null) {
      stats.responseMinutesTotal += safeDiff;
      stats.responseSamples += 1;
      if (safeDiff <= TARGET_RESPONSE_MINUTES) {
        stats.slaHits += 1;
      }
    }
  }

  const autopilotFirstTouchByLead = new Map<string, { eventAt: Date; leadCreatedAt: Date }>();
  for (const event of autopilotEvents) {
    if (!autopilotFirstTouchByLead.has(event.leadId)) {
      autopilotFirstTouchByLead.set(event.leadId, {
        eventAt: event.createdAt,
        leadCreatedAt: event.lead.createdAt,
      });
    }
  }

  const autopilotAccumulator: PerformanceAccumulator = {
    id: "autopilot",
    name: "Autopilot",
    leadsHandled: 0,
    responseMinutesTotal: 0,
    responseSamples: 0,
    slaHits: 0,
    isAutopilot: true,
  };

  for (const entry of autopilotFirstTouchByLead.values()) {
    const diffMinutes = (entry.eventAt.getTime() - entry.leadCreatedAt.getTime()) / 60000;
    const safeDiff = Number.isFinite(diffMinutes) && diffMinutes >= 0 ? diffMinutes : null;

    autopilotAccumulator.leadsHandled += 1;
    if (safeDiff !== null) {
      autopilotAccumulator.responseMinutesTotal += safeDiff;
      autopilotAccumulator.responseSamples += 1;
      if (safeDiff <= TARGET_RESPONSE_MINUTES) {
        autopilotAccumulator.slaHits += 1;
      }
    }
  }

  const rankedRows = [...byMemberId.values()].map(toRow).sort(rankRows);
  const withActivity = rankedRows.filter((row) => row.leadsHandled > 0);
  const withoutActivity = rankedRows.filter((row) => row.leadsHandled === 0);

  const rows = [...withActivity, ...withoutActivity].slice(0, viewerRole === MembershipRole.AGENT ? 1 : 5);

  if (autopilotAccumulator.leadsHandled > 0 && viewerRole !== MembershipRole.AGENT) {
    rows.push(toRow(autopilotAccumulator));
  }

  const finalRows = rows.sort(rankRows).slice(0, 5);
  const totalLeads = finalRows.reduce((sum, row) => sum + row.leadsHandled, 0);
  const activeAgents = finalRows.filter((row) => row.leadsHandled > 0);
  const avgSla =
    activeAgents.length > 0
      ? Math.round(
          activeAgents.reduce((sum, row) => sum + row.slaCompliance, 0) /
            activeAgents.length
        )
      : 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Users className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-fraunces font-bold text-slate-900">Performanta Echipa</h2>
        <span className="text-sm text-slate-600">(Astazi)</span>
      </div>

      {finalRows.length === 0 ? (
        <div className="rounded-lg border border-slate-100 px-4 py-4 text-center text-sm text-slate-500">
          Nu exista activitate de echipa astazi.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {finalRows.map((agent) => {
              const tone = getSlaTone(agent.slaCompliance);

              return (
                <article
                  key={agent.id}
                  className="rounded-lg border border-slate-100 p-4 transition-all duration-200 hover:border-slate-300"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                          agent.isAutopilot
                            ? "bg-gradient-to-br from-violet-500 to-orange-500"
                            : "bg-gradient-to-br from-orange-400 to-violet-500"
                        )}
                        aria-hidden="true"
                      >
                        {agent.initials}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{agent.name}</p>
                        <p className="text-xs text-slate-600">
                          {agent.leadsHandled} leaduri - Avg {agent.avgResponseTime}
                        </p>
                      </div>
                    </div>

                    <div className={cn("rounded-md px-2 py-1", tone.badgeBg)}>
                      <p className={cn("text-xs font-bold", tone.badgeText)}>{agent.slaCompliance}%</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div
                        className={cn("h-2 rounded-full transition-all duration-300", tone.progress)}
                        style={{ width: `${agent.slaCompliance}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">SLA</span>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-200 pt-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalLeads}</p>
              <p className="text-xs text-slate-600">Total Leaduri</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{avgSla}%</p>
              <p className="text-xs text-slate-600">Avg SLA</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeAgents.length}</p>
              <p className="text-xs text-slate-600">Agenti Activi</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function TeamPerformanceSectionSkeleton() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
              <div className="h-6 w-11 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="h-2 w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-200 pt-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2 text-center">
            <div className="mx-auto h-7 w-10 animate-pulse rounded bg-slate-200" />
            <div className="mx-auto h-3 w-16 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </section>
  );
}
