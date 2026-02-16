"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type DeleteLeadButtonProps = {
  leadId: string;
};

export function DeleteLeadButton({ leadId }: DeleteLeadButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setMessage(null);
    if (!confirm("Sigur vrei sa stergi acest lead? Actiunea nu poate fi anulata.")) {
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(`/api/v1/leads/${leadId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (response.status === 409 && payload?.error === "LEAD_HAS_HISTORY") {
        setMessage(
          "Nu poti sterge leadul deoarece are istoric (SLA/mesaje/evenimente)."
        );
        return;
      }

      if (!response.ok) {
        setMessage(
          typeof payload?.error === "string"
            ? payload.error
            : "Nu am putut sterge leadul."
        );
        return;
      }

      router.push("/app/leads");
      router.refresh();
    } catch {
      setMessage("Nu am putut sterge leadul.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? "Se sterge..." : "Sterge lead"}
      </Button>
      {message && <p className="text-sm text-rose-600">{message}</p>}
    </div>
  );
}
