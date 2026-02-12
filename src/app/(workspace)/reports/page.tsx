import { redirect } from "next/navigation";
import { BarChart3, Clock, Target, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import {
  getDefaultReportRangeInputValues,
  getReportsStages,
  getReportsSummary,
  resolveReportDateRange,
} from "@/server/services/reportService";

type SearchParams = {
  from?: string;
  to?: string;
};

function formatMinutes(value: number | null) {
  if (value === null) return "-";
  return `${value.toFixed(1)} min`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewReports) {
    redirect("/dashboard");
  }
  const workspaceId = context.workspaceId;

  const params = await searchParams;
  const { from, to } = resolveReportDateRange(params.from, params.to);
  const [summary, stages] = await Promise.all([
    getReportsSummary({
      workspaceId,
      from,
      to,
    }),
    getReportsStages({
      workspaceId,
      from,
      to,
    }),
  ]);

  const rangeInput = getDefaultReportRangeInputValues(from, to);

  return (
    <div className="space-y-6">
      {/* Header cu icon */}
      <PageHeader
        title="Rapoarte"
        subtitle="KPI operationale pentru intervalul selectat."
        icon={BarChart3}
      />

      <SectionCard
        title="Filtru interval"
        description="Selecteaza perioada pentru calcul TTFT, breach rate si booking rate."
        borderColor="orange"
      >
        <form className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs text-slate-600">
            <span>De la</span>
            <input
              type="date"
              name="from"
              defaultValue={rangeInput.from}
              className="flex h-10 w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            <span>Pana la</span>
            <input
              type="date"
              name="to"
              defaultValue={rangeInput.to}
              className="flex h-10 w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            />
          </label>
          <Button type="submit" className="bg-orange-500 text-white hover:bg-orange-600">
            Aplica
          </Button>
        </form>
      </SectionCard>

      {/* Stat Cards - REAL DATA */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Clock}
          label="TTFT mediu"
          value={formatMinutes(summary.ttftAvgMinutes)}
          helper={`Leaduri atinse: ${summary.touchedLeads} / ${summary.totalLeads}`}
        />
        <StatCard
          icon={Target}
          label="TTFT median"
          value={formatMinutes(summary.ttftMedianMinutes)}
          helper="Baza: lead_received la primul proof valid"
        />
        <StatCard
          icon={Calendar}
          label="Booking rate"
          value={formatPercent(summary.bookingRatePct)}
          helper={`Meeting created: ${summary.bookingLeads} / ${summary.totalLeads}`}
        />
        <StatCard
          icon={TrendingUp}
          label="Handover rate"
          value={formatPercent(summary.handoverRatePct)}
          helper={`Handover events: ${summary.handoverEvents}`}
        />
      </div>

      <SectionCard
        title="Breach rate pe etapa"
        description="Tabel simplu cu total instante si procent depasit pe fiecare etapa SLA."
        borderColor="orange"
      >
        {stages.rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            Nu exista date pentru intervalul selectat.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Breached</th>
                  <th className="px-3 py-2 font-medium">Rata breach</th>
                </tr>
              </thead>
              <tbody>
                {stages.rows.map((row) => (
                  <tr key={row.stageKey} className="border-b border-slate-100 text-sm text-slate-700">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{row.stageName}</p>
                      <p className="text-xs text-slate-500">{row.stageKey}</p>
                    </td>
                    <td className="px-3 py-3">{row.total}</td>
                    <td className="px-3 py-3">{row.breached}</td>
                    <td className="px-3 py-3">{formatPercent(row.breachRatePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
