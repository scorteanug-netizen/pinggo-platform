"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ro } from "date-fns/locale";
import { AlertTriangle, Clock, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

type NearBreachStage = {
  id: string;
  leadId: string;
  leadName: string;
  stageKey: string;
  dueAt: string;
  isOverdue: boolean;
};

type UnavailableAgent = {
  userId: string;
  name: string;
};

type ApiResponse = {
  nearBreachStages: NearBreachStage[];
  unavailableAgents: UnavailableAgent[];
  activeLeadsForUnavailable: number;
};

const STAGE_LABEL: Record<string, string> = {
  first_touch: "Primul contact",
  handover: "Transfer operator",
};

export function CriticalLeadsWidget() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/dashboard/critical-alerts");
      if (!res.ok) return;
      const json: ApiResponse = await res.json();
      setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <CriticalLeadsWidgetSkeleton />;

  const hasAlerts =
    (data?.nearBreachStages.length ?? 0) > 0 || (data?.unavailableAgents.length ?? 0) > 0;

  if (!hasAlerts) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Alerte critice</h3>
        <p className="mt-2 text-sm text-slate-500">Nicio alertă activă. Totul e sub control.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Alerte critice</h3>

      {/* SLA-uri aproape de breach */}
      {data && data.nearBreachStages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            SLA-uri aproape de termen
          </p>
          <ul className="space-y-1.5">
            {data.nearBreachStages.slice(0, 5).map((stage) => (
              <li
                key={stage.id}
                className="group flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => router.push(`/leads/${stage.leadId}`)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      stage.isOverdue ? "text-rose-500" : "text-amber-500"
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{stage.leadName}</p>
                    <p className="text-xs text-slate-500">
                      {STAGE_LABEL[stage.stageKey] ?? stage.stageKey}
                      {" · "}
                      {stage.isOverdue ? (
                        <span className="text-rose-600 font-medium">
                          Depășit cu{" "}
                          {formatDistanceToNow(new Date(stage.dueAt), { locale: ro })}
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          Expiră în{" "}
                          {formatDistanceToNow(new Date(stage.dueAt), { locale: ro })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Agenți indisponibili cu lead-uri active */}
      {data && data.unavailableAgents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Agenți indisponibili
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <UserX className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <span className="font-semibold">
                {data.unavailableAgents.map((a) => a.name).join(", ")}
              </span>
              {" "}sunt indisponibili.
              {data.activeLeadsForUnavailable > 0 && (
                <span className="ml-1">
                  {data.activeLeadsForUnavailable} lead-uri alocate lor nu vor primi răspuns automat.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CriticalLeadsWidgetSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200 mb-3" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 mb-2" />
      ))}
    </div>
  );
}
