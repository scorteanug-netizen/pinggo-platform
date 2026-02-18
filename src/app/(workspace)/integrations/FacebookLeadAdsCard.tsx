"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";

type Props = {
  connected: boolean;
  configured: boolean;
  pageName?: string | null;
  lastLeadgenAt?: string | null;
};

export function FacebookLeadAdsCard({ connected, configured, pageName, lastLeadgenAt }: Props) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Sigur vrei sa deconectezi Facebook Lead Ads?")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/v1/integrations/facebook/disconnect", { method: "POST" });
      window.location.reload();
    } catch {
      setDisconnecting(false);
    }
  }

  const statusBadge = connected ? (
    <Badge variant="green">Conectat</Badge>
  ) : configured ? (
    <Badge variant="gray">Neconectat</Badge>
  ) : (
    <Badge variant="orange">Nu este configurat</Badge>
  );

  return (
    <SectionCard
      title="Facebook Lead Ads"
      description="Primeste lead-uri automat din campaniile Facebook."
      borderColor="violet"
      actions={statusBadge}
      contentClassName="space-y-3"
    >
      {connected ? (
        <>
          {pageName && (
            <p className="text-sm text-slate-700">
              Pagina: <span className="font-medium">{pageName}</span>
            </p>
          )}
          {lastLeadgenAt && (
            <p className="text-sm text-slate-600">
              Ultimul lead: {new Date(lastLeadgenAt).toLocaleString("ro-RO")}
            </p>
          )}
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
          >
            {disconnecting ? "Se deconecteaza..." : "Deconecteaza"}
          </button>
        </>
      ) : configured ? (
        <a
          href="/api/v1/integrations/facebook/connect"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Conecteaza Facebook
        </a>
      ) : (
        <p className="text-sm text-slate-500">
          Variabilele META_APP_ID si META_APP_SECRET nu sunt configurate pe server.
        </p>
      )}
    </SectionCard>
  );
}
