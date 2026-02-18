"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ArrowRight } from "lucide-react";
import type { OnboardingState, OnboardingStep } from "@/server/services/onboardingService";

type StepConfig = {
  key: OnboardingStep;
  label: string;
  cta: string;
};

const STEPS: StepConfig[] = [
  { key: "workspace", label: "Configurează workspace-ul", cta: "/settings" },
  { key: "team", label: "Invită echipa", cta: "/users" },
  { key: "whatsapp", label: "Conectează WhatsApp", cta: "/onboarding?step=whatsapp" },
  { key: "autopilot", label: "Configurează Autopilot", cta: "/autopilot" },
  { key: "testLead", label: "Trimite lead test", cta: "/onboarding?step=testLead" },
];

const DISMISS_KEY = "pinggo_onboarding_dismissed";

export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (state.completedAt || dismissed) return null;

  const doneCount = STEPS.filter((s) => state.steps[s.key]).length;
  const pct = Math.round((doneCount / STEPS.length) * 100);

  const firstIncomplete = STEPS.find((s) => !state.steps[s.key]);
  const continueHref = firstIncomplete ? `/onboarding?step=${firstIncomplete.key}` : "/onboarding";

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-orange-900">Setup workspace</p>
          <p className="text-xs text-orange-700 mt-0.5">
            {doneCount} / {STEPS.length} pași completați
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-orange-400 hover:text-orange-600 transition-colors p-0.5 rounded"
          aria-label="Ascunde"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-orange-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <ul className="space-y-1.5 mb-4">
        {STEPS.map((step) => {
          const done = state.steps[step.key];
          return (
            <li key={step.key} className="flex items-center gap-2.5">
              {done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-orange-300" />
              )}
              {done ? (
                <span className="text-xs text-slate-500 line-through">{step.label}</span>
              ) : (
                <Link
                  href={step.cta}
                  className="text-xs text-orange-700 hover:text-orange-900 hover:underline transition-colors"
                >
                  {step.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* CTA */}
      <Link
        href={continueHref}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-900 transition-colors"
      >
        Continuă setup
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
