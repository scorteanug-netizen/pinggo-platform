"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EditLeadDialog } from "./EditLeadDialog";
import { DeleteLeadButton } from "./DeleteLeadButton";

type LeadHeaderActionsProps = {
  leadId: string;
  lead: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
  };
};

export function LeadHeaderActions({ leadId, lead }: LeadHeaderActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        Editeaza lead
      </Button>
      <DeleteLeadButton leadId={leadId} />
      <Button variant="outline" asChild>
        <Link href="/app/leads">Inapoi la lista</Link>
      </Button>
      <EditLeadDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        leadId={leadId}
        lead={lead}
      />
    </div>
  );
}
