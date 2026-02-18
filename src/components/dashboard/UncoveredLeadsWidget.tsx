"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ro } from "date-fns/locale";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type UncoveredLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  waitingMinutes: number;
  handoverAt: string;
  slaDeadlineAt: string | null;
};

type ApiResponse = {
  leads: UncoveredLead[];
  count: number;
};

export function UncoveredLeadsWidget() {
  const router = useRouter();
  const [leads, setLeads] = useState<UncoveredLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/dashboard/uncovered-leads");
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setLeads(data.leads);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchLeads]);

  if (loading) {
    return <UncoveredLeadsSkeleton />;
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Lead-uri fara agent</h3>
        <p className="mt-2 text-sm text-slate-500">
          Toate lead-urile au fost preluate.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Lead-uri fara agent</h3>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            leads.length > 3
              ? "bg-rose-100 text-rose-700"
              : "bg-amber-100 text-amber-700"
          )}
        >
          {leads.length}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {leads.slice(0, 5).map((lead) => (
          <li
            key={lead.id}
            className="group flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="truncate text-sm font-medium text-slate-900">
                  {lead.name}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Asteapta de{" "}
                {formatDistanceToNow(new Date(lead.handoverAt), {
                  locale: ro,
                  addSuffix: false,
                })}
                {lead.slaDeadlineAt && new Date(lead.slaDeadlineAt) < new Date() && (
                  <span className="ml-1 text-rose-600 font-medium">
                    &middot; SLA depasit
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => router.push(`/leads/${lead.id}`)}
              className="ml-2 shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-slate-700"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {leads.length > 5 && (
        <p className="mt-2 text-center text-xs text-slate-500">
          + {leads.length - 5} lead-uri in asteptare
        </p>
      )}
    </div>
  );
}

function UncoveredLeadsSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
