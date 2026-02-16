"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LeadStatus } from "@prisma/client";

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "NEW", label: "Nou" },
  { value: "OPEN", label: "Deschis" },
  { value: "WON", label: "Castigat" },
  { value: "LOST", label: "Pierdut" },
  { value: "QUALIFIED", label: "Calificat" },
  { value: "NOT_QUALIFIED", label: "Neeligibil" },
  { value: "SPAM", label: "Spam" },
  { value: "ARCHIVED", label: "Arhivat" },
];

type LeadData = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

type EditLeadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  lead: LeadData;
};

export function EditLeadDialog({ open, onOpenChange, leadId, lead }: EditLeadDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<LeadStatus>(lead.status as LeadStatus);

  useEffect(() => {
    if (open) {
      setFirstName(lead.firstName ?? "");
      setLastName(lead.lastName ?? "");
      setEmail(lead.email ?? "");
      setPhone(lead.phone ?? "");
      setStatus((lead.status as LeadStatus) ?? "NEW");
      setMessage(null);
    }
  }, [open, lead.firstName, lead.lastName, lead.email, lead.phone, lead.status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const payload: Record<string, string> = {};
      if (firstName !== (lead.firstName ?? "")) payload.firstName = firstName.trim() || "";
      if (lastName !== (lead.lastName ?? "")) payload.lastName = lastName.trim() || "";
      if (email !== (lead.email ?? "")) payload.email = email.trim() || "";
      if (phone !== (lead.phone ?? "")) payload.phone = phone.trim() || "";
      if (status !== lead.status) payload.status = status;

      if (Object.keys(payload).length === 0) {
        onOpenChange(false);
        return;
      }

      const res = await fetch(`/api/v1/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(typeof data?.error === "string" ? data.error : "Eroare la actualizare.");
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      setMessage("Eroare la actualizare.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editeaza lead</DialogTitle>
          <DialogDescription>
            Modifica datele leadului. Doar campurile schimbate vor fi actualizate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">Prenume</Label>
              <Input
                id="edit-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prenume"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Nume</Label>
              <Input
                id="edit-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nume"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplu.ro"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Telefon</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+40721234567"
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {message && (
            <p className="text-sm text-rose-600">{message}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuleaza
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Se salveaza..." : "Salveaza"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
