"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

  function runAction(
    request: () => Promise<Response>,
    successMessage: string,
    errorMessage: string
  ) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await request();
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = typeof payload?.error === "string" ? payload.error : errorMessage;
          setResult({ type: "error", message });
          return;
        }
        setResult({ type: "success", message: successMessage });
        router.refresh();
      } catch {
        setResult({ type: "error", message: errorMessage });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={isPending}
          className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
          onClick={() =>
            runAction(
              () =>
                fetch(`/api/leads/${leadId}/proof`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "message_sent",
                    payload: { source: "ui_action" },
                  }),
                }),
              "A fost adaugat proof event: message_sent.",
              "Nu am putut trimite mesajul simulat."
            )
          }
        >
          Trimite mesaj (simulat)
        </Button>

        <Button
          type="button"
          disabled={isPending}
          variant="outline"
          onClick={() =>
            runAction(
              () =>
                fetch(`/api/leads/${leadId}/proof`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "reply_received",
                    payload: { source: "ui_action" },
                  }),
                }),
              "A fost adaugat proof event: reply_received.",
              "Nu am putut marca raspunsul primit."
            )
          }
        >
          Marcheaza raspuns primit
        </Button>

        <Button
          type="button"
          disabled={isPending}
          variant="outline"
          onClick={() =>
            runAction(
              () =>
                fetch(`/api/leads/${leadId}/proof`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "manual_proof_note",
                    payload: { note: "Dovada adaugata manual din UI" },
                  }),
                }),
              "A fost adaugata dovada manuala.",
              "Nu am putut adauga dovada manuala."
            )
          }
        >
          Adauga dovada manuala
        </Button>

        <Button
          type="button"
          disabled={isPending}
          variant="outline"
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() =>
            runAction(
              () =>
                fetch(`/api/leads/${leadId}/status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "QUALIFIED",
                    note: "Actualizare status din UI",
                  }),
                }),
              "Status actualizat la Calificat.",
              "Nu am putut actualiza statusul la Calificat."
            )
          }
        >
          Calificat
        </Button>

        <Button
          type="button"
          disabled={isPending}
          variant="outline"
          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          onClick={() =>
            runAction(
              () =>
                fetch(`/api/leads/${leadId}/status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "NOT_QUALIFIED",
                    note: "Actualizare status din UI",
                  }),
                }),
              "Status actualizat la Neeligibil.",
              "Nu am putut actualiza statusul la Neeligibil."
            )
          }
        >
          Neeligibil
        </Button>
      </div>

      {result.type === "success" ? <p className="text-sm text-emerald-600">{result.message}</p> : null}
      {result.type === "error" ? <p className="text-sm text-rose-600">{result.message}</p> : null}
    </div>
  );
}
