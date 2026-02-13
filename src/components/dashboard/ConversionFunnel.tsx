import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConversionFunnelDropoff,
  ConversionFunnelStage,
  FunnelStageKey,
} from "@/server/services/conversionFunnelService";

const STAGE_COLOR_CLASSES: Record<FunnelStageKey, string> = {
  new: "bg-orange-500",
  contacted: "bg-orange-400",
  qualified: "bg-violet-500",
  booked: "bg-violet-400",
  closing: "bg-green-500",
};

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  new: "Leaduri Noi",
  contacted: "Contactate",
  qualified: "Calificate",
  booked: "Programate",
  closing: "Closing",
};

type ConversionFunnelProps = {
  stages: ConversionFunnelStage[];
  overallConversionPct: number;
  biggestDropoff: ConversionFunnelDropoff | null;
};

function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function ConversionFunnel({
  stages,
  overallConversionPct,
  biggestDropoff,
}: ConversionFunnelProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-fraunces font-bold text-slate-900">Funnel Conversie</h2>
          <p className="mt-1 text-sm text-slate-600">Luna curenta</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-green-600">{overallConversionPct}%</p>
          <p className="text-xs text-slate-600">Conversion rate</p>
        </div>
      </div>

      <div className="space-y-2">
        {stages.map((stage, index) => {
          const nextStage = stages[index + 1];
          const dropoffRate =
            nextStage && stage.count > 0
              ? roundTo(((stage.count - nextStage.count) / stage.count) * 100, 1)
              : 0;
          const barWidth = stage.count === 0 ? 12 : Math.max(stage.percentage, 22);

          return (
            <div key={stage.key}>
              <Link href={`/leads?stage=${stage.key}`} className="group block">
                <div className="mb-1 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "min-w-[9rem] rounded-lg p-4 text-white transition-all duration-200",
                        "group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
                        STAGE_COLOR_CLASSES[stage.key]
                      )}
                      style={{ width: `${barWidth}%` }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="truncate text-sm font-bold">{stage.label}</span>
                        <span className="text-lg font-extrabold">{stage.count}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-16 text-right">
                    <p className="text-sm font-bold text-slate-900">{stage.percentage}%</p>
                  </div>
                </div>
              </Link>

              {nextStage && dropoffRate > 0 ? (
                <div className="mb-2 ml-4 flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-xs text-red-600">-{dropoffRate}% drop-off</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {biggestDropoff ? (
            <p className="text-slate-600">
              Biggest drop-off: {STAGE_LABELS[biggestDropoff.from]} -&gt; {STAGE_LABELS[biggestDropoff.to]} (-
              {biggestDropoff.ratePct}%)
            </p>
          ) : (
            <p className="text-slate-600">Date insuficiente pentru drop-off in perioada selectata.</p>
          )}

          <Link
            href="/leads"
            className="inline-flex items-center gap-1 font-semibold text-orange-600 transition-colors duration-200 hover:text-orange-700"
          >
            Vezi Detalii
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ConversionFunnelSkeleton() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-6 flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-2 text-right">
          <div className="ml-auto h-7 w-16 animate-pulse rounded bg-slate-200" />
          <div className="ml-auto h-3 w-20 animate-pulse rounded bg-slate-200" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="h-14 flex-1 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </section>
  );
}
