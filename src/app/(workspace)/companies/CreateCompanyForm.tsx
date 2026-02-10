"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateCompanyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ type: "idle", message: "" });

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string" ? payload.error : "Nu am putut crea compania.";
          setResult({ type: "error", message });
          return;
        }

        setResult({ type: "success", message: "Compania a fost creata." });
        setName("");
        router.refresh();
      } catch {
        setResult({ type: "error", message: "A aparut o eroare la creare companie." });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="space-y-1">
        <Label htmlFor="companyName">Nume companie</Label>
        <Input
          id="companyName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex: Pinggo Demo"
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} className="bg-orange-500 text-white hover:bg-orange-600">
          {isPending ? "Se creeaza..." : "Creeaza companie"}
        </Button>
        {result.type !== "idle" ? (
          <p className={result.type === "success" ? "text-sm text-emerald-600" : "text-sm text-rose-600"}>
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

