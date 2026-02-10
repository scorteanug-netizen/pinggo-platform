"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type WebhookTestButtonProps = {
  endpoint: string;
  token: string;
};

type TestResult = {
  type: "idle" | "success" | "error";
  message: string;
  leadUrl?: string;
};

export function WebhookTestButton({ endpoint, token }: WebhookTestButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestResult>({
    type: "idle",
    message: "",
  });

  async function handleSendTest() {
    try {
      setIsLoading(true);
      setResult({ type: "idle", message: "" });

      const externalId = `TEST-${Date.now()}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pinggo-token": token,
        },
        body: JSON.stringify({
          source: "WEBHOOK",
          externalId,
          identity: {
            name: "Lead Test Pinggo",
            email: `lead+${Date.now()}@pinggo.test`,
            phone: "+40700000000",
            company: "Demo Workspace",
          },
          message: "Mesaj test webhook din pagina Integrari.",
          metadata: {
            source: "integrations_test_button",
          },
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { leadId?: string; created?: boolean; error?: string }
        | null;

      if (!response.ok) {
        setResult({
          type: "error",
          message: data?.error || "Testul a esuat.",
        });
        return;
      }

      const leadUrl = data?.leadId ? `/leads/${data.leadId}` : undefined;
      setResult({
        type: "success",
        message:
          data?.created === false
            ? "Test trimis cu succes. Payload-ul a fost tratat ca update/spam."
            : "Test trimis cu succes. Lead creat.",
        leadUrl,
      });
      router.refresh();
    } catch {
      setResult({
        type: "error",
        message: "Nu am putut trimite testul.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={handleSendTest}
        disabled={isLoading}
        className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
      >
        {isLoading ? "Se trimite..." : "Trimite test"}
      </Button>

      {result.type === "success" ? (
        <div className="text-sm text-emerald-600">
          <div>{result.message}</div>
          {result.leadUrl ? (
            <Link href={result.leadUrl} className="font-medium underline underline-offset-4">
              Deschide lead creat
            </Link>
          ) : null}
        </div>
      ) : null}

      {result.type === "error" ? <p className="text-sm text-rose-600">{result.message}</p> : null}
    </div>
  );
}
