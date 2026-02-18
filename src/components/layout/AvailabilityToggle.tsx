"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export function AvailabilityToggle({ initial }: { initial: boolean }) {
  const [isAvailable, setIsAvailable] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !isAvailable;
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/me/availability", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isAvailable: next }),
        });
        if (res.ok) setIsAvailable(next);
      } catch {
        // silent
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={isAvailable ? "Disponibil — click pentru a te seta indisponibil" : "Indisponibil — lead-urile nu ți se mai alocă"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
        isAvailable
          ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
          : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200",
        isPending && "opacity-60 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isAvailable ? "bg-green-500" : "bg-slate-400"
        )}
      />
      {isAvailable ? "Disponibil" : "Indisponibil"}
    </button>
  );
}
