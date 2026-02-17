"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EditLeadDialog } from "./EditLeadDialog";

type LeadData = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type EditLeadButtonProps = {
  leadId: string;
  lead: LeadData;
  onLeadUpdated?: (updated: LeadData) => void;
  variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
};

export function EditLeadButton({
  leadId,
  lead,
  onLeadUpdated,
  variant = "outline",
  size = "sm",
  className,
}: EditLeadButtonProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(t);
  }, [successMessage]);

  return (
    <div className="flex items-center gap-2">
      <Button variant={variant} size={size} onClick={() => setEditOpen(true)} className={className}>
        Editeaza
      </Button>
      {successMessage && (
        <span className="text-sm text-emerald-600">{successMessage}</span>
      )}
      <EditLeadDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        leadId={leadId}
        lead={lead}
        onSuccess={(updated) => {
          if (updated) onLeadUpdated?.(updated);
          setSuccessMessage("Lead actualizat");
        }}
      />
    </div>
  );
}
