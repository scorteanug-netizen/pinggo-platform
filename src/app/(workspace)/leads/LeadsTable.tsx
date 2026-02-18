"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export type LeadsTableRow = {
  id: string;
  lead: string;
  company: string;
  sourceType: string;
  owner: string;
  currentStage: string;
  nextDueAt: string;
  status: string;
  breached: boolean;
};

type LeadsTableProps = {
  rows: LeadsTableRow[];
};

function getStatusBadgeVariant(status: string, breached: boolean): "gray" | "orange" | "violet" | "green" | "red" {
  if (breached) return "red";
  if (status === "Calificat") return "green";
  if (status === "Neeligibil") return "gray";
  if (status === "Spam") return "red";
  if (status === "Arhivat") return "gray";
  if (status === "Deschis") return "violet";
  return "orange"; // Default for "Nou" and others
}

export function LeadsTable({ rows }: LeadsTableProps) {
  const router = useRouter();

  return (
    <>
      {/* Mobile: card list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-slate-50 active:bg-slate-100"
            onClick={() => router.push(`/leads/${row.id}`)}
            aria-label={`Deschide lead ${row.lead}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 leading-snug">{row.lead}</span>
              <Badge variant={getStatusBadgeVariant(row.status, row.breached)} className="shrink-0">
                {row.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
              {row.company !== "-" && <span>{row.company}</span>}
              <span>Owner: {row.owner}</span>
              {row.currentStage !== "-" && <span>Stadiu: {row.currentStage}</span>}
              {row.nextDueAt !== "-" && (
                <span className={row.breached ? "font-semibold text-rose-600" : ""}>
                  Termen: {row.nextDueAt}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Companie</th>
              <th className="px-3 py-2 font-medium">Sursa</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Stadiu curent</th>
              <th className="px-3 py-2 font-medium">Urmatorul termen</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-slate-100 text-sm text-slate-700 transition-colors duration-200 hover:bg-gray-50"
                onClick={() => router.push(`/leads/${row.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/leads/${row.id}`);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Deschide lead ${row.lead}`}
              >
                <td className="px-3 py-3 font-medium text-slate-900">{row.lead}</td>
                <td className="px-3 py-3">{row.company}</td>
                <td className="px-3 py-3">{row.sourceType}</td>
                <td className="px-3 py-3">{row.owner}</td>
                <td className="px-3 py-3">{row.currentStage}</td>
                <td className="px-3 py-3">{row.nextDueAt}</td>
                <td className="px-3 py-3">
                  <Badge variant={getStatusBadgeVariant(row.status, row.breached)}>
                    {row.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
