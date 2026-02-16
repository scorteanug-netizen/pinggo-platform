"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type SimulateReplyBoxProps = {
  leadId: string;
};

type ReplyApiResponse = {
  leadId: string;
  autopilot: {
    status: string;
    node: string;
    answers: Record<string, string>;
  };
  queuedMessage: {
    id: string;
    text: string;
    toPhone: string | null;
  };
};

export function SimulateReplyBox({ leadId }: SimulateReplyBoxProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/v1/autopilot/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, text: trimmed }),
      });

      const json = await response.json();

      if (!response.ok) {
        setResult(`Eroare: ${json.error ?? response.statusText}`);
        return;
      }

      const data = json as ReplyApiResponse;
      setResult(
        `Nod: ${data.autopilot.node} · Status: ${data.autopilot.status} · Mesaj: "${data.queuedMessage.text}"`
      );
      setText("");

      // Refetch page data so timeline + cards update
      router.refresh();
    } catch {
      setResult("Eroare de retea.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Simuleaza reply lead (ex: pret, programare...)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <Button type="submit" size="sm" disabled={loading || !text.trim()}>
          {loading ? "Se trimite..." : "Trimite reply"}
        </Button>
      </div>
      {result ? (
        <p className="text-xs text-slate-600">{result}</p>
      ) : null}
    </form>
  );
}
