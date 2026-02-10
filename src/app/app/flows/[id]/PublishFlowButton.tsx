"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PublishFlowButton({ flowId }: { flowId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePublish() {
    setLoading(true);
    try {
      const res = await fetch(`/api/flows/${flowId}/publish`, { method: "POST" });
      if (res.ok) router.refresh();
      else alert((await res.json()).error ?? "Eroare");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handlePublish} disabled={loading}>
      {loading ? "Se publica..." : "Publica flux"}
    </Button>
  );
}
