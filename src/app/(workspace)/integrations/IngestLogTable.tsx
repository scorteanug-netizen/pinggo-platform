"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

type IngestLogRow = {
  id: string;
  timestamp: string;
  eventType: string;
  source: string;
  status: string;
  leadId: string;
  identity: { name: string | null; email: string | null; phone: string | null } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  WEBHOOK: "Webhook",
  FORM: "Form",
  CRM: "CRM",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  API: "API",
  FACEBOOK: "Facebook",
  MANUAL: "Manual",
  IMPORT: "Import",
};

const STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "orange"> = {
  NEW: "green",
  OPEN: "green",
  QUALIFIED: "green",
  WON: "green",
  SPAM: "red",
  INCOMPLETE: "orange",
  LOST: "gray",
  ARCHIVED: "gray",
  NOT_QUALIFIED: "gray",
};

export function IngestLogTable() {
  const [rows, setRows] = useState<IngestLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/integrations/ingest-log?limit=10");
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLog();
    const interval = setInterval(fetchLog, 30_000);
    return () => clearInterval(interval);
  }, [fetchLog]);

  if (loading) {
    return <p className="text-sm text-slate-500">Se incarca...</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Niciun eveniment de ingestie.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
            <th className="pb-2 pr-4">Timp</th>
            <th className="pb-2 pr-4">Sursa</th>
            <th className="pb-2 pr-4">Identitate</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const identityText = row.identity
              ? [row.identity.name, row.identity.email, row.identity.phone].filter(Boolean).join(" · ") || "-"
              : "-";

            return (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-600">
                  {new Date(row.timestamp).toLocaleString("ro-RO", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-2 pr-4 font-medium text-slate-700">
                  {SOURCE_LABELS[row.source] ?? row.source}
                </td>
                <td className="py-2 pr-4 text-slate-600 max-w-[200px] truncate">{identityText}</td>
                <td className="py-2">
                  <Badge variant={STATUS_VARIANT[row.status] ?? "gray"}>{row.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
