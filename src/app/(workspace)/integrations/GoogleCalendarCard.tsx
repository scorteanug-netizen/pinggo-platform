"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";

type Props = {
  connected: boolean;
  configured: boolean;
  accountEmail?: string | null;
};

export function GoogleCalendarCard({ connected, configured, accountEmail }: Props) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Sigur vrei sa deconectezi Google Calendar?")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/v1/integrations/google-calendar/disconnect", { method: "POST" });
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
      title="Google Calendar"
      description="Sincronizare booking-uri si link-uri de meeting."
      borderColor="orange"
      actions={statusBadge}
      contentClassName="space-y-3"
    >
      {connected ? (
        <>
          {accountEmail && (
            <p className="text-sm text-slate-700">
              Cont: <span className="font-medium">{accountEmail}</span>
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
          href="/api/v1/integrations/google-calendar/connect"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Conecteaza Google Calendar
        </a>
      ) : (
        <p className="text-sm text-slate-500">
          Variabilele GOOGLE_CLIENT_ID si GOOGLE_CLIENT_SECRET nu sunt configurate pe server.
        </p>
      )}
    </SectionCard>
  );
}
