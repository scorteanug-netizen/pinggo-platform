"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type SetDefaultScenarioButtonProps = {
  scenarioId: string;
  isDefault: boolean;
};

export function SetDefaultScenarioButton({
  scenarioId,
  isDefault,
}: SetDefaultScenarioButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/v1/autopilot/scenarios/${scenarioId}/set-default`,
          { method: "POST" }
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setMessage(
            typeof payload?.error === "string"
              ? payload.error
              : "Nu am putut seta scenariul ca default."
          );
          return;
        }
        setMessage("Scenariu setat ca default.");
        router.refresh();
      } catch {
        setMessage("Nu am putut seta scenariul ca default.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending || isDefault}
        onClick={handleClick}
      >
        Seteaza ca default
      </Button>
      {message && (
        <span className={`text-sm ${message.startsWith("Scenariu") ? "text-emerald-600" : "text-rose-600"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
