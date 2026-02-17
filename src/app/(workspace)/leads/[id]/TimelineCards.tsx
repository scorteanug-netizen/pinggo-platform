"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";

export type TimelineCardItem = {
  id: string;
  createdAtLabel: string;
  title: string;
  subtitle?: string;
  details: Array<{ label: string; value: string }>;
  summary: string;
  toneClasses: { dotClass: string; chipClass: string };
  payloadForJson: unknown;
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

type Props = {
  items: TimelineCardItem[];
};

export function TimelineCards({ items }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copyJson = useCallback((payloadForJson: unknown) => {
    const str = safeJsonStringify(payloadForJson);
    void navigator.clipboard.writeText(str);
  }, []);

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedIds.has(item.id);
        return (
          <li
            key={item.id}
            className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`mt-0.5 h-2.5 w-2.5 rounded-full ${item.toneClasses.dotClass}`}
                  />
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                </div>
                {item.subtitle ? (
                  <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">{item.createdAtLabel}</p>
            </div>

            <p className="mt-2 text-sm text-slate-700">{item.summary}</p>

            {item.details.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.details.map((detail, index) => (
                  <span
                    key={`${item.id}-${detail.label}-${index}`}
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${item.toneClasses.chipClass}`}
                  >
                    {detail.label}: {detail.value}
                  </span>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              Detalii tehnice
            </button>

            {isExpanded ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => copyJson(item.payloadForJson)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Copy className="h-3 w-3" />
                    Copiaza
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-md bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                  {safeJsonStringify(item.payloadForJson)}
                </pre>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
