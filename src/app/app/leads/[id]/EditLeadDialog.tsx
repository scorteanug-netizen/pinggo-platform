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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const PHONE_E164_REGEX = /^\+\d+$/;
const PHONE_MIN_LENGTH = 10;

type LeadData = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type EditLeadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  lead: LeadData;
  onSuccess?: (updatedLead?: LeadData) => void;
};

function validateForm(values: {
  email: string;
  phone: string;
}): string | null {
  const emailTrimmed = values.email.trim();
  if (emailTrimmed && !emailTrimmed.includes("@")) {
    return "Email invalid (trebuie sa contina @)";
  }
  const phoneTrimmed = values.phone.trim();
  if (phoneTrimmed) {
    if (!PHONE_E164_REGEX.test(phoneTrimmed)) {
      return "Telefon invalid: trebuie format E.164 (incepe cu +, apoi doar cifre)";
    }
    if (phoneTrimmed.length < PHONE_MIN_LENGTH) {
      return "Telefon trebuie sa aiba minim 10 caractere";
    }
  }
  return null;
}

export function EditLeadDialog({ open, onOpenChange, leadId, lead, onSuccess }: EditLeadDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open) {
      setFirstName(lead.firstName ?? "");
      setLastName(lead.lastName ?? "");
      setEmail(lead.email ?? "");
      setPhone(lead.phone ?? "");
      setMessage(null);
    }
  }, [open, lead.firstName, lead.lastName, lead.email, lead.phone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validationError = validateForm({ email, phone });
    if (validationError) {
      setMessage(validationError);
      return;
    }

    const payload: Record<string, string | null> = {};
    const firstNameVal = firstName.trim();
    const lastNameVal = lastName.trim();
    const emailVal = email.trim();
    const phoneVal = phone.trim();

    if (firstNameVal !== (lead.firstName ?? "")) payload.firstName = firstNameVal || "";
    if (lastNameVal !== (lead.lastName ?? "")) payload.lastName = lastNameVal || "";
    if (emailVal !== (lead.email ?? "")) payload.email = emailVal || "";
    if (phoneVal !== (lead.phone ?? "")) payload.phone = phoneVal ? phoneVal : null;

    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.error?.message === "string"
              ? data.error.message
              : "Eroare la salvare";
        setMessage(errMsg);
        return;
      }
      onOpenChange(false);
      router.refresh();
      const updatedLead =
        data &&
        typeof data === "object" &&
        "firstName" in data &&
        "lastName" in data &&
        "email" in data &&
        "phone" in data
          ? {
              firstName: data.firstName as string | null,
              lastName: data.lastName as string | null,
              email: data.email as string | null,
              phone: data.phone as string | null,
            }
          : undefined;
      onSuccess?.(updatedLead);
    } catch {
      setMessage("Eroare la salvare");
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
            <p className="text-xs text-slate-500">
              Optional. Daca completat: format E.164 (+ si cifre), min 10 caractere.
            </p>
          </div>

          {message && <p className="text-sm text-rose-600">{message}</p>}

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
