"use client";

import { useRouter } from "next/navigation";

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

function statusBadgeClass(status: string, breached: boolean) {
  if (breached) return "bg-rose-100 text-rose-700";
  if (status === "Calificat") return "bg-emerald-100 text-emerald-700";
  if (status === "Neeligibil") return "bg-slate-200 text-slate-700";
  if (status === "Spam") return "bg-rose-100 text-rose-700";
  if (status === "Arhivat") return "bg-slate-100 text-slate-600";
  return "bg-orange-100 text-orange-700";
}

export function LeadsTable({ rows }: LeadsTableProps) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
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
              className="cursor-pointer border-b border-slate-100 text-sm text-slate-700 transition-colors hover:bg-slate-50"
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
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(row.status, row.breached)}`}>
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
