"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadHeaderActions } from "./LeadHeaderActions";
import { EditLeadButton } from "./EditLeadButton";

type LeadData = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  workspaceId: string;
  source: string | null;
  externalId: string | null;
  createdAt: string;
  status: string;
};

type LeadHeaderAndIdentityProps = {
  lead: LeadData;
  formatDateTime: (value: string | null | undefined) => string;
  slaCard: React.ReactNode;
};

export function LeadHeaderAndIdentity({ lead, formatDateTime, slaCard }: LeadHeaderAndIdentityProps) {
  const [displayLead, setDisplayLead] = useState(lead);

  const displayName =
    [displayLead.firstName, displayLead.lastName].filter(Boolean).join(" ").trim() ||
    displayLead.email ||
    displayLead.id.slice(0, 8);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Lead: {displayName}
          </h1>
          <p className="text-sm text-slate-600">
            {displayLead.email ?? "-"} · {displayLead.phone ?? "-"}
          </p>
        </div>
        <LeadHeaderActions leadId={displayLead.id} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl">Identitate</CardTitle>
            <EditLeadButton
              leadId={displayLead.id}
              lead={displayLead}
              onLeadUpdated={(updated) =>
                setDisplayLead((prev) => ({ ...prev, ...updated }))
              }
            />
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Nume: {displayName}</p>
            <p>Email: {displayLead.email ?? "-"}</p>
            <p>Telefon: {displayLead.phone ?? "-"}</p>
            <p>Workspace: {displayLead.workspaceId}</p>
            <p>Status: {displayLead.status}</p>
            <p>Sursa: {displayLead.source ?? "-"}</p>
            <p>External ID: {displayLead.externalId ?? "-"}</p>
            <p>Creat: {formatDateTime(displayLead.createdAt)}</p>
          </CardContent>
        </Card>

        {slaCard}
      </div>
    </>
  );
}
