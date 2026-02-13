"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, X } from "lucide-react";

const STORAGE_KEY = "pinggo-dashboard-breach-alert-dismissed";
const DISMISS_TTL_MS = 4 * 60 * 60 * 1000;

export type CriticalBreach = {
  id: string;
  name: string;
  source: string;
  breachDuration: string;
};

type BreachAlertsBannerProps = {
  breachCount: number;
  criticalBreach: CriticalBreach | null;
};

export function BreachAlertsBanner({
  breachCount,
  criticalBreach,
}: BreachAlertsBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  const bannerSignature = useMemo(
    () =>
      `${breachCount}:${criticalBreach?.id ?? "none"}:${criticalBreach?.breachDuration ?? "none"}`,
    [breachCount, criticalBreach?.id, criticalBreach?.breachDuration]
  );

  useEffect(() => {
    if (breachCount === 0) {
      setDismissed(false);
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        setDismissed(false);
        return;
      }

      const parsed = JSON.parse(rawValue) as {
        signature?: string;
        dismissedAt?: number;
      };

      if (!parsed.signature || !parsed.dismissedAt || parsed.signature !== bannerSignature) {
        window.localStorage.removeItem(STORAGE_KEY);
        setDismissed(false);
        return;
      }

      if (Date.now() - parsed.dismissedAt < DISMISS_TTL_MS) {
        setDismissed(true);
        return;
      }

      window.localStorage.removeItem(STORAGE_KEY);
      setDismissed(false);
    } catch {
      setDismissed(false);
    }
  }, [bannerSignature, breachCount]);

  if (breachCount === 0 || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          signature: bannerSignature,
          dismissedAt: Date.now(),
        })
      );
    } catch {
      // No-op: localStorage may be unavailable in private mode.
    }
  };

  return (
    <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>

        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-red-900">
              {breachCount} Lead{breachCount > 1 ? "uri" : ""} Cu Breach SLA
            </h3>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-red-600 transition-colors duration-200 hover:text-red-800"
              aria-label="Închide alerta de breach"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {criticalBreach ? (
            <p className="mb-3 text-sm text-red-800">
              <span className="font-semibold">{criticalBreach.name}</span>
              <span> • </span>
              <span className="font-bold">{criticalBreach.breachDuration}</span>
              <span> peste target (</span>
              <span>{criticalBreach.source}</span>
              <span>)</span>
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => router.push("/leads?breach=true&filter=breach")}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-700"
          >
            Vezi Toate Breach-urile
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
