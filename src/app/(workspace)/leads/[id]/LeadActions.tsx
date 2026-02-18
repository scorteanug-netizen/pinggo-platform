"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Mail, CalendarCheck, StickyNote, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type LeadActionsProps = {
  leadId: string;
};

type ActionResult = {
  type: "idle" | "success" | "error";
  message: string;
};

export function LeadActions({ leadId }: LeadActionsProps) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>({ type: "idle", message: "" });
  const [isPending, startTransition] = useTransition();

  function runProofAction(proofType: string, successMsg: string) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: proofType, payload: { source: "ui_action" } }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setResult({ type: "error", message: data?.error ?? "Eroare la înregistrare." });
          return;
        }
        setResult({ type: "success", message: successMsg });
        router.refresh();
      } catch {
        setResult({ type: "error", message: "Eroare de rețea." });
      }
    });
  }

  function runStatusAction(status: string, successMsg: string) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, note: "Actualizare status din UI" }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setResult({ type: "error", message: data?.error ?? "Eroare la actualizare status." });
          return;
        }
        setResult({ type: "success", message: successMsg });
        router.refresh();
      } catch {
        setResult({ type: "error", message: "Eroare de rețea." });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Acțiuni de contact */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Am contactat lead-ul
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="gap-1.5"
            onClick={() => runProofAction("call_logged", "Apel înregistrat.")}
          >
            <Phone className="h-3.5 w-3.5" />
            Am sunat
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="gap-1.5"
            onClick={() => runProofAction("message_sent", "Mesaj înregistrat.")}
          >
            <Mail className="h-3.5 w-3.5" />
            Am trimis email / mesaj
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="gap-1.5"
            onClick={() => runProofAction("meeting_created", "Vizită programată înregistrată.")}
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            Am programat vizită
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="gap-1.5"
            onClick={() => runProofAction("manual_proof_note", "Notă adăugată.")}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notă manuală
          </Button>
        </div>
      </div>

      {/* Schimbare status */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Status lead
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => runStatusAction("QUALIFIED", "Status actualizat: Calificat.")}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Calificat
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={() => runStatusAction("NOT_QUALIFIED", "Status actualizat: Neeligibil.")}
          >
            <XCircle className="h-3.5 w-3.5" />
            Neeligibil
          </Button>
        </div>
      </div>

      {result.type === "success" && (
        <p className="text-sm text-emerald-600">{result.message}</p>
      )}
      {result.type === "error" && (
        <p className="text-sm text-rose-600">{result.message}</p>
      )}
    </div>
  );
}
