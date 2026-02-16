"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3 } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";

export type RecentLeadItem = {
  id: string;
  name: string;
  source: string;
  statusLabel: string;
  statusVariant: NonNullable<BadgeProps["variant"]>;
  responseTime: string | null;
  assignedTo: string;
};

type RecentLeadsTableProps = {
  leads: RecentLeadItem[];
};

export function RecentLeadsTable({ leads }: RecentLeadsTableProps) {
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-fraunces font-bold text-slate-900">Leaduri Recente</h2>
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 transition-colors duration-200 hover:text-orange-700"
        >
          Vezi Toate
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="px-4 py-4 text-center text-sm text-slate-500">Niciun lead recent</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-600">
                <th className="px-4 py-2 font-semibold">Lead</th>
                <th className="px-4 py-2 font-semibold">Sursa</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Raspuns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer text-sm text-slate-700 transition-colors duration-200 hover:bg-orange-50"
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/leads/${lead.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Deschide lead ${lead.name}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{lead.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{lead.source}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant={lead.statusVariant}>{lead.statusLabel}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="inline-flex items-center gap-2 text-slate-600">
                      <Clock3 className="h-4 w-4 text-slate-400" />
                      <span>{lead.responseTime ?? "—"}</span>
                      <span className="text-slate-400">({lead.assignedTo})</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RecentLeadsTableSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-4 gap-4">
              <div className="h-4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
