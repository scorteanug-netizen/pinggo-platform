"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Lead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  status: string;
  createdAt: string;
  sla: {
    startedAt: string;
    deadlineAt: string;
    stoppedAt: string | null;
    breachedAt: string | null;
  } | null;
  lastEventAt: string | null;
  lastProofAt: string | null;
  autopilot: { status: string; currentStep: string } | null;
  lastMessage: { id: string; status: string; channel: string; providerMessageId: string | null } | null;
};

type LeadsListResponse = {
  items: Lead[];
  page: number;
  pageSize: number;
  total: number;
};

type LeadsTableProps = {
  workspaceId: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ro-RO");
}

function getLeadDisplayName(lead: Lead) {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return fullName || lead.email || lead.phone || lead.externalId || lead.id;
}

function getSlaStatus(lead: Lead) {
  if (!lead.sla) return "-";
  if (lead.sla.stoppedAt) return "Stopped";
  if (lead.sla.breachedAt) return "Breached";
  return "Running";
}

const AUTOPILOT_BADGE_COLORS: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  HANDED_OVER: "bg-slate-100 text-slate-700",
  FAILED: "bg-red-100 text-red-700",
};

const MESSAGE_BADGE_COLORS: Record<string, string> = {
  QUEUED: "bg-yellow-100 text-yellow-700",
  SENT: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export function LeadsTable({ workspaceId }: LeadsTableProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sla, setSla] = useState("");

  useEffect(() => {
    const query = new URLSearchParams({
      workspaceId,
      page: `${page}`,
      pageSize: `${pageSize}`,
    });
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (sla) query.set("sla", sla);

    setLoading(true);
    setError(null);

    fetch(`/api/v1/leads?${query.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`request_failed_${r.status}`);
        }
        return (await r.json()) as LeadsListResponse;
      })
      .then((data) => {
        setLeads(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch(() => {
        setLeads([]);
        setTotal(0);
        setError("Nu am putut incarca leadurile.");
      })
      .finally(() => setLoading(false));
  }, [workspaceId, q, status, sla, page, pageSize]);

  if (loading) return <p className="text-muted-foreground">Se incarca...</p>;
  if (error) return <p className="text-muted-foreground">{error}</p>;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <form
        className="grid gap-2 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQ(qInput.trim());
        }}
      >
        <label className="md:col-span-2">
          <Input
            type="search"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="Cautare nume, email, telefon, externalId"
          />
        </label>
        <label>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
          >
            <option value="">Toate statusurile</option>
            <option value="NEW">NEW</option>
            <option value="OPEN">OPEN</option>
            <option value="WON">WON</option>
            <option value="LOST">LOST</option>
            <option value="QUALIFIED">QUALIFIED</option>
            <option value="NOT_QUALIFIED">NOT_QUALIFIED</option>
            <option value="SPAM">SPAM</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <label>
          <select
            value={sla}
            onChange={(event) => {
              setSla(event.target.value);
              setPage(1);
            }}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
          >
            <option value="">Toate SLA</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
            <option value="breached">Breached</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <select
            value={`${pageSize}`}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
          >
            <option value="10">10 / pagina</option>
            <option value="25">25 / pagina</option>
            <option value="50">50 / pagina</option>
            <option value="100">100 / pagina</option>
          </select>
          <Button type="submit">Cauta</Button>
        </div>
      </form>

      <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left font-medium">Nume</th>
            <th className="p-3 text-left font-medium">Email / Telefon</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">SLA</th>
            <th className="p-3 text-left font-medium">Autopilot</th>
            <th className="p-3 text-left font-medium">Ultimul mesaj</th>
            <th className="p-3 text-left font-medium">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-3 text-slate-500">
                Niciun lead. Adauga leaduri prin webhook sau API.
              </td>
            </tr>
          ) : (
            leads.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer border-b last:border-0 hover:bg-slate-50"
                onClick={() => router.push(`/app/leads/${lead.id}`)}
              >
                <td className="p-3">{getLeadDisplayName(lead)}</td>
                <td className="p-3">{lead.email ?? lead.phone ?? "-"}</td>
                <td className="p-3">{lead.status}</td>
                <td className="p-3">{getSlaStatus(lead)}</td>
                <td className="p-3">
                  {lead.autopilot ? (
                    <Badge
                      label={lead.autopilot.status}
                      className={AUTOPILOT_BADGE_COLORS[lead.autopilot.status] ?? "bg-slate-100 text-slate-700"}
                    />
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="p-3">
                  {lead.lastMessage ? (
                    <span className="flex items-center gap-1.5">
                      <Badge
                        label={lead.lastMessage.status}
                        className={MESSAGE_BADGE_COLORS[lead.lastMessage.status] ?? "bg-slate-100 text-slate-700"}
                      />
                      {lead.lastMessage.status === "SENT" && lead.lastMessage.providerMessageId ? (
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[80px]" title={lead.lastMessage.providerMessageId}>
                          {lead.lastMessage.providerMessageId.length > 12
                            ? `${lead.lastMessage.providerMessageId.slice(0, 12)}…`
                            : lead.lastMessage.providerMessageId}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="p-3">{formatDateTime(lead.sla?.deadlineAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Pagina {page} / {totalPages} • Total {total}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => (current < totalPages ? current + 1 : current))}
            disabled={page >= totalPages}
          >
            Urmator
          </Button>
        </div>
      </div>
    </div>
  );
}
