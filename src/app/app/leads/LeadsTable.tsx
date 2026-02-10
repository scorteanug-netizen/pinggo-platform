"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Lead = {
  id: string;
  status: string;
  sourceType: string;
  createdAt: string;
  identity: { name: string | null; email: string | null; company: string | null } | null;
  slaClocks: { status: string; deadlineAt: string }[];
};

export function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => {
        setLeads(Array.isArray(data) ? data : []);
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Se incarca...</p>;

  if (leads.length === 0) {
    return <p className="text-muted-foreground">Niciun lead. Adauga leaduri prin webhook sau API.</p>;
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left font-medium">Contact</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">Sursa</th>
            <th className="p-3 text-left font-medium">Data</th>
            <th className="p-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b last:border-0">
              <td className="p-3">
                {lead.identity?.name ?? lead.identity?.email ?? lead.identity?.company ?? "-"}
              </td>
              <td className="p-3">{lead.status}</td>
              <td className="p-3">{lead.sourceType}</td>
              <td className="p-3">{new Date(lead.createdAt).toLocaleDateString("ro-RO")}</td>
              <td className="p-3 text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/app/leads/${lead.id}`}>Detalii</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
