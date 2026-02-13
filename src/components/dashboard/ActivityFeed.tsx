"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ro } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityEvent = {
  id: string;
  type: "lead_new" | "autopilot_response" | "booking_confirmed" | "breach" | "handover";
  leadId: string;
  leadName: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
};

type ActivityApiResponse = {
  events: ActivityEvent[];
  hasMore: boolean;
};

type ActivityFeedProps = {
  initialEvents: ActivityEvent[];
  initialHasMore: boolean;
  pageSize?: number;
};

const EVENT_CONFIG: Record<
  ActivityEvent["type"],
  { icon: LucideIcon; iconColor: string; bgColor: string }
> = {
  lead_new: {
    icon: UserPlus,
    iconColor: "text-orange-500",
    bgColor: "bg-orange-50",
  },
  autopilot_response: {
    icon: Bot,
    iconColor: "text-violet-500",
    bgColor: "bg-violet-50",
  },
  booking_confirmed: {
    icon: Calendar,
    iconColor: "text-green-500",
    bgColor: "bg-green-50",
  },
  breach: {
    icon: AlertTriangle,
    iconColor: "text-red-500",
    bgColor: "bg-red-50",
  },
  handover: {
    icon: ArrowRight,
    iconColor: "text-violet-500",
    bgColor: "bg-violet-50",
  },
};

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "acum";
  }
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: ro,
  });
}

async function fetchActivityPage(offset: number, limit: number) {
  const response = await fetch(`/api/activity?offset=${offset}&limit=${limit}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("activity_feed_fetch_failed");
  }
  return (await response.json()) as ActivityApiResponse;
}

function mergeLatestEvents(incoming: ActivityEvent[], existing: ActivityEvent[]) {
  const incomingIds = new Set(incoming.map((event) => event.id));
  return [...incoming, ...existing.filter((event) => !incomingIds.has(event.id))];
}

export function ActivityFeed({
  initialEvents,
  initialHasMore,
  pageSize = 20,
}: ActivityFeedProps) {
  const router = useRouter();

  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setEvents(initialEvents);
    setHasMore(initialHasMore);
  }, [initialEvents, initialHasMore]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const result = await fetchActivityPage(events.length, pageSize);
      setEvents((previous) => [...previous, ...result.events]);
      setHasMore(result.hasMore);
    } catch {
      // Ignore transient polling errors and keep previous feed data.
    } finally {
      setIsLoadingMore(false);
    }
  }, [events.length, hasMore, isLoadingMore, pageSize]);

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const latest = await fetchActivityPage(0, pageSize);
        setEvents((previous) => mergeLatestEvents(latest.events, previous));
        setHasMore((previous) => previous || latest.hasMore);
      } catch {
        // Ignore transient polling errors and keep previous feed data.
      }
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pageSize]);

  const content = useMemo(() => {
    if (events.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-slate-500">Nicio activitate recenta</p>
        </div>
      );
    }

    return (
      <div
        className="flex-1 overflow-y-auto p-4"
        onScroll={(event) => {
          const target = event.currentTarget;
          const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 80;
          if (nearBottom) {
            void loadMore();
          }
        }}
      >
        <div className="space-y-3">
          {events.map((eventItem) => {
            const config = EVENT_CONFIG[eventItem.type];
            const Icon = config.icon;

            return (
              <div
                key={eventItem.id}
                onClick={() => router.push(`/leads/${eventItem.leadId}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/leads/${eventItem.leadId}`);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Deschide activitate pentru ${eventItem.leadName}`}
                className="cursor-pointer rounded-lg border border-slate-100 p-3 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex gap-3">
                  <div className={cn("flex-shrink-0 rounded-lg p-2", config.bgColor)}>
                    <Icon className={cn("h-4 w-4", config.iconColor)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-sm font-semibold text-slate-900">{eventItem.leadName}</p>
                    <p className="mb-2 text-xs text-slate-600">{eventItem.message}</p>
                    <p className="text-xs text-slate-400">{formatRelativeDate(eventItem.timestamp)}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isLoadingMore}
              className="w-full py-2 text-sm font-semibold text-orange-600 transition-colors duration-200 hover:text-orange-700 disabled:opacity-70"
            >
              {isLoadingMore ? "Se incarca..." : "Incarca mai multe"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }, [events, hasMore, isLoadingMore, loadMore, router]);

  return (
    <section className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] lg:h-[680px]">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-fraunces font-bold text-slate-900">Activitate Recenta</h2>
        <p className="mt-1 text-sm text-slate-600">Live updates din sistem</p>
      </div>
      {content}
    </section>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <section className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] lg:h-[680px]">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-100 p-3">
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
