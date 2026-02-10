"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type WebhookRotateTokenButtonProps = {
  canRotate: boolean;
};

export function WebhookRotateTokenButton({ canRotate }: WebhookRotateTokenButtonProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function onRotate() {
    setErrorMessage("");
    setSuccessMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/integrations/webhook/rotate-token", {
          method: "POST",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string"
              ? payload.error
              : "Nu am putut regenera tokenul.";
          setErrorMessage(message);
          return;
        }

        setSuccessMessage("Token regenerat. Endpointul a fost actualizat.");
        router.refresh();
      } catch {
        setErrorMessage("A aparut o eroare la regenerarea tokenului.");
      }
    });
  }

  if (!canRotate) {
    return <p className="text-xs text-slate-500">Regenerare token: doar SUPER_ADMIN.</p>;
  }

  return (
    <div className="space-y-2">
      <ConfirmDialog
        title="Regenerare token webhook"
        description="Tokenul vechi devine invalid imediat dupa confirmare."
        confirmationText="REGENEREAZA"
        triggerLabel={isPending ? "Se regenereaza..." : "Regenerare token"}
        confirmLabel="Regenerare"
        pending={isPending}
        onConfirm={onRotate}
      />
      {successMessage ? <p className="text-xs text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-xs text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}

