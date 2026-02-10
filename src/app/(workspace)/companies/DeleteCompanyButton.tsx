"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type CompanyStatusButtonProps = {
  workspaceId: string;
  workspaceName: string;
  isDisabled: boolean;
  canManage: boolean;
};

export function CompanyStatusButton({
  workspaceId,
  workspaceName,
  isDisabled,
  canManage,
}: CompanyStatusButtonProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateStatus(action: "disable" | "enable") {
    setErrorMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/companies/${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string"
              ? payload.error
              : action === "disable"
                ? "Nu am putut dezactiva compania."
                : "Nu am putut reactiva compania.";
          setErrorMessage(message);
          return;
        }
        router.refresh();
      } catch {
        setErrorMessage(
          action === "disable"
            ? "A aparut o eroare la dezactivarea companiei."
            : "A aparut o eroare la reactivarea companiei."
        );
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {!canManage ? (
        <span className="text-xs text-slate-500">Doar SUPER_ADMIN</span>
      ) : isDisabled ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
          disabled={isPending}
          onClick={() => updateStatus("enable")}
        >
          {isPending ? "Se reactiveaza..." : "Reactiveaza"}
        </Button>
      ) : (
        <ConfirmDialog
          title={`Dezactiveaza compania "${workspaceName}"`}
          description="Compania nu va mai aparea in selectiile implicite pana la reactivare."
          confirmationText="DEZACTIVEAZA"
          triggerLabel={isPending ? "Se dezactiveaza..." : "Dezactiveaza"}
          confirmLabel="Dezactiveaza"
          pending={isPending}
          onConfirm={() => updateStatus("disable")}
        />
      )}
      {errorMessage ? <span className="text-xs text-rose-600">{errorMessage}</span> : null}
    </div>
  );
}
