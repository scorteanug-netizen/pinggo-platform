"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DeleteLeadButton } from "./DeleteLeadButton";

type LeadHeaderActionsProps = {
  leadId: string;
};

export function LeadHeaderActions({ leadId }: LeadHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DeleteLeadButton leadId={leadId} />
      <Button variant="outline" asChild>
        <Link href="/app/leads">Inapoi la lista</Link>
      </Button>
    </div>
  );
}
