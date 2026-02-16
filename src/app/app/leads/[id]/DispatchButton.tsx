"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DispatchButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleDispatch() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/v1/messages/dispatch", {
        method: "POST",
      });

      const json = await response.json();

      if (!response.ok) {
        setResult(`Eroare: ${json.error ?? response.statusText}`);
        return;
      }

      setResult(`Procesate: ${json.processed}, Trimise: ${json.sent}, Esuate: ${json.failed}`);
    } catch {
      setResult("Eroare de retea.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleDispatch}
        disabled={loading}
      >
        {loading ? "Se trimite..." : "Dispatch mesaje"}
      </Button>
      {result ? (
        <p className="text-xs text-slate-600">{result}</p>
      ) : null}
    </div>
  );
}
