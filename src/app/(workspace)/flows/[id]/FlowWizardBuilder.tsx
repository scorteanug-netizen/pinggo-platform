"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FLOW_BOOKING_PROVIDERS,
  FLOW_INPUT_SOURCES,
  FLOW_PROOF_TYPES,
  FLOW_STAGE_TEMPLATES,
  FLOW_WIZARD_STEPS,
  FlowInputSource,
  FlowProofType,
  FlowStageKey,
  FlowWizardState,
  FlowWizardStepKey,
} from "@/lib/flows/wizard";

type AgentOption = {
  userId: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT";
};

type FlowWizardBuilderProps = {
  flowId: string;
  flowName: string;
  isActive: boolean;
  canEditFlow: boolean;
  agents: AgentOption[];
  initialWizard: FlowWizardState;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type FlowPublishValidationIssue = {
  path: string;
  message: string;
};

const ROLE_LABEL: Record<AgentOption["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
};

const SOURCE_LABEL: Record<FlowInputSource, string> = {
  WEBFORM: "Webform",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  WEBHOOK: "Webhook",
  API: "API",
};

const PROOF_LABEL: Record<FlowProofType, string> = {
  message_sent: "Mesaj trimis",
  reply_received: "Raspuns primit",
  meeting_created: "Meeting creat",
  call_logged: "Apel logat",
  manual_proof_note: "Nota manuala",
};

const BOOKING_PROVIDER_LABEL: Record<(typeof FLOW_BOOKING_PROVIDERS)[number], string> = {
  NONE: "Niciun provider",
  GOOGLE_CALENDAR: "Google Calendar",
  CALENDLY: "Calendly",
};

function toSafeInt(value: number, fallback: number, min = 1, max = 100_000) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function getAgentDisplay(agent: AgentOption) {
  return agent.name?.trim() || agent.email;
}

function getStageName(stageKey: FlowStageKey) {
  return FLOW_STAGE_TEMPLATES.find((stage) => stage.key === stageKey)?.name ?? stageKey;
}

function validateWizardBeforePublish(wizard: FlowWizardState): FlowPublishValidationIssue[] {
  const errors: FlowPublishValidationIssue[] = [];

  if (wizard.input.enabledSources.length === 0) {
    errors.push({
      path: "input.enabledSources",
      message: "Selecteaza cel putin o sursa de intrare.",
    });
  }

  if (wizard.routing.eligibleAgents.length === 0 && !wizard.routing.fallbackOwnerUserId) {
    errors.push({
      path: "routing.eligibleAgents",
      message: "Configureaza repartizarea: agenti eligibili sau fallback.",
    });
  }

  if (wizard.responseTerms.stage1TargetMinutes <= 0) {
    errors.push({
      path: "responseTerms.stage1TargetMinutes",
      message: "TargetMinutes pentru etapa First touch trebuie sa fie > 0.",
    });
  }

  for (const source of FLOW_INPUT_SOURCES) {
    const value = wizard.responseTerms.perSourceOverrides[source];
    if (value !== null && value <= 0) {
      errors.push({
        path: `responseTerms.perSourceOverrides.${source}`,
        message: `Override-ul SLA pentru sursa ${SOURCE_LABEL[source]} trebuie sa fie > 0.`,
      });
    }
  }

  for (const rule of wizard.escalation.rules) {
    if (!rule.enabled) continue;

    const inRange =
      rule.remindAtPct >= 0 &&
      rule.remindAtPct <= 100 &&
      rule.reassignAtPct >= 0 &&
      rule.reassignAtPct <= 100 &&
      rule.managerAlertAtPct >= 0 &&
      rule.managerAlertAtPct <= 100;

    if (!inRange) {
      errors.push({
        path: `escalation.rules.${rule.stageKey}`,
        message: `Escaladare invalida pentru etapa ${getStageName(rule.stageKey)}: pragurile trebuie sa fie intre 0 si 100.`,
      });
      continue;
    }

    if (!(rule.remindAtPct < rule.reassignAtPct && rule.reassignAtPct < rule.managerAlertAtPct)) {
      errors.push({
        path: `escalation.rules.${rule.stageKey}`,
        message: `Escaladare invalida pentru etapa ${getStageName(rule.stageKey)}: pragurile trebuie sa fie crescatoare (reminder < reasignare < manager alert).`,
      });
    }
  }

  const firstTouchProof = wizard.proof.rules.find((rule) => rule.stageKey === "first_touch");
  if (!firstTouchProof || firstTouchProof.stopOnProofTypes.length === 0) {
    errors.push({
      path: "proof.rules.first_touch.stopOnProofTypes",
      message: "Configureaza cel putin un tip de dovada pentru etapa First touch.",
    });
  }

  if (wizard.booking.enabled && wizard.booking.provider === "NONE") {
    errors.push({
      path: "booking.provider",
      message: "Alege un provider de programare daca Programare este activ.",
    });
  }

  return errors;
}

function formatSavedAgo(lastSavedAtMs: number, nowMs: number) {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - lastSavedAtMs) / 1000));
  if (elapsedSeconds < 2) {
    return "Salvat acum";
  }
  if (elapsedSeconds < 60) {
    return `Salvat acum ${elapsedSeconds} sec`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  return `Salvat acum ${elapsedMinutes} min`;
}

function parseValidationErrors(payload: unknown): FlowPublishValidationIssue[] {
  if (!payload || typeof payload !== "object") return [];
  const details = (payload as { details?: unknown }).details;
  if (!Array.isArray(details)) return [];

  const result: FlowPublishValidationIssue[] = [];
  for (const entry of details) {
    if (typeof entry === "string") {
      result.push({ path: "general", message: entry });
      continue;
    }
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const path = (entry as { path?: unknown }).path;
    const message = (entry as { message?: unknown }).message;
    if (typeof message !== "string") {
      continue;
    }
    result.push({
      path: typeof path === "string" && path.trim().length > 0 ? path : "general",
      message,
    });
  }
  return result;
}

function formatErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const validationErrors = parseValidationErrors(payload);
  if (validationErrors.length > 0) {
    return validationErrors.map((entry) => entry.message).join(" ");
  }
  if ("details" in payload && Array.isArray((payload as { details?: unknown }).details)) {
    const details = (payload as { details: unknown[] }).details
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ");
    if (details) return details;
  }
  if ("error" in payload && typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error;
  }
  return fallback;
}

export function FlowWizardBuilder({
  flowId,
  flowName,
  isActive,
  canEditFlow,
  agents,
  initialWizard,
}: FlowWizardBuilderProps) {
  const [selectedStep, setSelectedStep] = useState<FlowWizardStepKey>("input");
  const [wizard, setWizard] = useState<FlowWizardState>(initialWizard);
  const [flowIsActive, setFlowIsActive] = useState(isActive);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [toast, setToast] = useState<ToastState>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishErrors, setPublishErrors] = useState<FlowPublishValidationIssue[]>([]);
  const [lastSavedAtMs, setLastSavedAtMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isPublishing, startPublishTransition] = useTransition();
  const saveSeqRef = useRef(0);
  const lastSavedSerializedRef = useRef(JSON.stringify(initialWizard));
  const isReadOnly = !canEditFlow;

  const selectedStepLabel = useMemo(
    () => FLOW_WIZARD_STEPS.find((step) => step.key === selectedStep)?.label ?? "",
    [selectedStep]
  );
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.userId, agent])),
    [agents]
  );
  const localPublishValidationErrors = useMemo(() => {
    const errors = validateWizardBeforePublish(wizard);

    const invalidEligibleAgents = wizard.routing.eligibleAgents.filter(
      (userId) => !agentById.has(userId)
    );
    if (invalidEligibleAgents.length > 0) {
      errors.push({
        path: "routing.eligibleAgents",
        message: "Lista de agenti eligibili contine utilizatori invalidi pentru workspace.",
      });
    }

    if (
      wizard.routing.fallbackOwnerUserId &&
      !agentById.has(wizard.routing.fallbackOwnerUserId)
    ) {
      errors.push({
        path: "routing.fallbackOwnerUserId",
        message: "Fallback owner selectat este invalid pentru workspace.",
      });
    }

    return errors;
  }, [agentById, wizard]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!publishModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPublishing) {
        setPublishModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPublishing, publishModalOpen]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!publishModalOpen) return;
    setPublishErrors(localPublishValidationErrors);
  }, [localPublishValidationErrors, publishModalOpen]);

  useEffect(() => {
    if (isReadOnly) {
      return;
    }
    const serialized = JSON.stringify(wizard);
    if (serialized === lastSavedSerializedRef.current) {
      return;
    }

    setSaveStatus("saving");
    const timeout = window.setTimeout(async () => {
      const saveSeq = ++saveSeqRef.current;
      try {
        const response = await fetch(`/api/flows/${flowId}/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wizard }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setSaveStatus("error");
          setToast({
            type: "error",
            message: formatErrorMessage(payload, "Nu am putut salva configuratia fluxului."),
          });
          return;
        }
        if (saveSeq !== saveSeqRef.current) {
          return;
        }
        if (payload?.wizard) {
          setWizard(payload.wizard as FlowWizardState);
          lastSavedSerializedRef.current = JSON.stringify(payload.wizard);
        } else {
          lastSavedSerializedRef.current = serialized;
        }
        setSaveStatus("saved");
        setLastSavedAtMs(Date.now());
      } catch {
        setSaveStatus("error");
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [flowId, isReadOnly, wizard]);

  function mutateWizard(updater: (current: FlowWizardState) => FlowWizardState) {
    if (isReadOnly) return;
    setWizard(updater);
  }

  function updateInputSources(source: FlowInputSource, checked: boolean) {
    mutateWizard((current) => {
      const nextSources = checked
        ? [...new Set([...current.input.enabledSources, source])]
        : current.input.enabledSources.filter((entry) => entry !== source);
      return {
        ...current,
        input: {
          ...current.input,
          enabledSources: nextSources,
        },
      };
    });
  }

  function toggleRoutingAgent(userId: string) {
    mutateWizard((current) => {
      const exists = current.routing.eligibleAgents.includes(userId);
      const eligibleAgents = exists
        ? current.routing.eligibleAgents.filter((entry) => entry !== userId)
        : [...current.routing.eligibleAgents, userId];
      return {
        ...current,
        routing: {
          ...current.routing,
          eligibleAgents,
        },
      };
    });
  }

  function updateEscalationRule(stageKey: FlowStageKey, patch: Partial<FlowWizardState["escalation"]["rules"][number]>) {
    mutateWizard((current) => ({
      ...current,
      escalation: {
        ...current.escalation,
        rules: current.escalation.rules.map((rule) =>
          rule.stageKey === stageKey
            ? {
                ...rule,
                ...patch,
              }
            : rule
        ),
      },
    }));
  }

  function toggleProofType(stageKey: FlowStageKey, proofType: FlowProofType, checked: boolean) {
    mutateWizard((current) => ({
      ...current,
      proof: {
        ...current.proof,
        rules: current.proof.rules.map((rule) => {
          if (rule.stageKey !== stageKey) return rule;
          const stopOnProofTypes = checked
            ? [...new Set([...rule.stopOnProofTypes, proofType])]
            : rule.stopOnProofTypes.filter((entry) => entry !== proofType);
          return {
            ...rule,
            stopOnProofTypes,
          };
        }),
      },
    }));
  }

  function openPublishSummary() {
    if (isReadOnly) return;
    setPublishErrors(localPublishValidationErrors);
    setPublishModalOpen(true);
  }

  function handleConfirmPublish() {
    if (isReadOnly) return;
    if (localPublishValidationErrors.length > 0) {
      setPublishErrors(localPublishValidationErrors);
      return;
    }

    startPublishTransition(async () => {
      try {
        const response = await fetch(`/api/flows/${flowId}/publish`, {
          method: "POST",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const validationErrors = parseValidationErrors(payload);
          if (validationErrors.length > 0) {
            setPublishErrors(validationErrors);
            setToast({
              type: "error",
              message: "Corecteaza erorile din configuratie inainte de publicare.",
            });
            return;
          }
          setToast({
            type: "error",
            message: formatErrorMessage(payload, "Nu am putut publica fluxul."),
          });
          return;
        }
        setFlowIsActive(true);
        setPublishModalOpen(false);
        setPublishErrors([]);
        setToast({
          type: "success",
          message:
            typeof payload?.message === "string"
              ? payload.message
              : "Flux publicat cu succes.",
        });
      } catch {
        setToast({
          type: "error",
          message: "A aparut o eroare la publicare.",
        });
      }
    });
  }

  const eligibleAgentsSummary = wizard.routing.eligibleAgents
    .map((userId) => agentById.get(userId) ?? null)
    .filter((agent): agent is AgentOption => Boolean(agent));
  const fallbackOwnerSummary = wizard.routing.fallbackOwnerUserId
    ? agentById.get(wizard.routing.fallbackOwnerUserId) ?? null
    : null;
  const savedIndicatorLabel = formatSavedAgo(lastSavedAtMs, nowMs);

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={
            toast.type === "success"
              ? "fixed right-4 top-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-lg"
              : "fixed right-4 top-4 z-50 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg"
          }
        >
          {toast.message}
        </div>
      ) : null}

      {publishModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isPublishing) {
              setPublishModalOpen(false);
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.2)]">
            <div className="space-y-1 border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Rezumat publicare</h2>
              <p className="text-sm text-slate-600">
                Verifica configuratia inainte de publicare.
              </p>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              {publishErrors.length > 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                  <p className="font-medium">Publicarea este blocata pana corectezi urmatoarele:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {publishErrors.map((error, index) => (
                      <li key={`${error.path}-${index}`}>
                        <span className="font-mono text-xs">{error.path}</span>: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Configuratia trece validarile de publicare.
                </div>
              )}

              <section className="rounded-xl border border-slate-200 px-3 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Surse intrare selectate</h3>
                {wizard.input.enabledSources.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {wizard.input.enabledSources.map((source) => (
                      <li key={source}>{SOURCE_LABEL[source]}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-rose-600">Nicio sursa selectata.</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 px-3 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Agenti eligibili si fallback owner</h3>
                {eligibleAgentsSummary.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {eligibleAgentsSummary.map((agent) => (
                      <li key={agent.userId}>
                        {getAgentDisplay(agent)} ({ROLE_LABEL[agent.role]})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">Niciun agent eligibil selectat.</p>
                )}
                <p className="mt-2 text-sm text-slate-700">
                  Fallback owner:{" "}
                  <span className="font-medium">
                    {fallbackOwnerSummary
                      ? `${getAgentDisplay(fallbackOwnerSummary)} (${ROLE_LABEL[fallbackOwnerSummary.role]})`
                      : "Niciun fallback"}
                  </span>
                </p>
              </section>

              <section className="rounded-xl border border-slate-200 px-3 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Termene SLA (default + overrides)</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {FLOW_STAGE_TEMPLATES.map((stage) => {
                    const targetMinutes =
                      stage.key === "first_touch"
                        ? wizard.responseTerms.stage1TargetMinutes
                        : stage.defaultTargetMinutes;
                    return (
                      <li key={stage.key}>
                        {stage.name}:{" "}
                        <span className="font-medium">
                          {targetMinutes} min
                        </span>{" "}
                        <span className="text-slate-500">
                          (default {stage.defaultTargetMinutes} min)
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {FLOW_INPUT_SOURCES.map((source) => {
                    const overrideValue = wizard.responseTerms.perSourceOverrides[source];
                    return (
                      <p key={source} className="text-sm text-slate-700">
                        {SOURCE_LABEL[source]}:{" "}
                        <span className="font-medium">
                          {overrideValue === null ? "implicit" : `${overrideValue} min`}
                        </span>
                      </p>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 px-3 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Escaladari (%) per etapa</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {FLOW_STAGE_TEMPLATES.map((stage) => {
                    const rule = wizard.escalation.rules.find(
                      (entry) => entry.stageKey === stage.key
                    );
                    if (!rule) return null;
                    return (
                      <li key={stage.key}>
                        {stage.name}:{" "}
                        <span className="font-medium">
                          {rule.enabled
                            ? `${rule.remindAtPct}% / ${rule.reassignAtPct}% / ${rule.managerAlertAtPct}%`
                            : "Dezactivata"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-xl border border-slate-200 px-3 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Dovezi care opresc SLA per etapa</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {FLOW_STAGE_TEMPLATES.map((stage) => {
                    const rule = wizard.proof.rules.find(
                      (entry) => entry.stageKey === stage.key
                    );
                    const labels = (rule?.stopOnProofTypes ?? []).map((proofType) => PROOF_LABEL[proofType]);
                    return (
                      <li key={stage.key}>
                        {stage.name}:{" "}
                        <span className="font-medium">
                          {labels.length > 0 ? labels.join(", ") : "Nicio dovada setata"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPublishModalOpen(false)}
                disabled={isPublishing}
              >
                Inchide
              </Button>
              <Button
                type="button"
                onClick={handleConfirmPublish}
                disabled={isPublishing || saveStatus === "saving" || publishErrors.length > 0}
                className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
              >
                {isPublishing
                  ? "Se publica..."
                  : saveStatus === "saving"
                    ? "Asteapta salvarea..."
                    : "Publica"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{flowName}</h1>
          <p className="text-sm text-slate-600">
            Wizard builder fara drag-drop. Pas curent: {selectedStepLabel}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              flowIsActive
                ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700"
                : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
            }
          >
            {flowIsActive ? "Activ" : "Inactiv"}
          </span>
          <span
            className={
              saveStatus === "saving"
                ? "inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-extrabold text-orange-700"
                : saveStatus === "error"
                  ? "inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
                  : "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
            }
          >
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Se salveaza...
              </>
            ) : saveStatus === "error" ? (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                Eroare salvare
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savedIndicatorLabel}
              </>
            )}
          </span>
          <Button variant="outline" asChild>
            <Link href="/flows">Inapoi</Link>
          </Button>
          {canEditFlow ? (
            <Button
              type="button"
              disabled={isPublishing || saveStatus === "saving"}
              onClick={openPublishSummary}
              className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
            >
              {isPublishing ? "Se publica..." : "Publica"}
            </Button>
          ) : null}
        </div>
      </div>

      {isReadOnly ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Rolul tau are acces doar de vizualizare pentru acest flux.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pasi flux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {FLOW_WIZARD_STEPS.map((step, index) => {
              const active = selectedStep === step.key;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setSelectedStep(step.key)}
                  className={
                    active
                      ? "flex w-full items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-left text-sm font-extrabold text-orange-700"
                      : "flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                    {index + 1}
                  </span>
                  <span>{step.label}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{selectedStepLabel}</CardTitle>
            <CardDescription className="text-slate-600">
              Modificarile se salveaza automat in Flow.config.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedStep === "input" ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">Selecteaza sursele acceptate pentru intrare lead.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FLOW_INPUT_SOURCES.map((source) => {
                    const checked = wizard.input.enabledSources.includes(source);
                    return (
                      <label
                        key={source}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            updateInputSources(source, event.target.checked)
                          }
                          disabled={isReadOnly}
                          className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        {SOURCE_LABEL[source]}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {selectedStep === "routing" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Agenti eligibili</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {agents.map((agent) => {
                      const checked = wizard.routing.eligibleAgents.includes(agent.userId);
                      return (
                        <label
                          key={agent.userId}
                          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRoutingAgent(agent.userId)}
                            disabled={isReadOnly}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900">
                              {agent.name?.trim() || agent.email}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {agent.email} · {ROLE_LABEL[agent.role]}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <label className="space-y-1 text-xs text-slate-600">
                  <span>Fallback owner</span>
                  <select
                    value={wizard.routing.fallbackOwnerUserId ?? ""}
                    onChange={(event) =>
                      mutateWizard((current) => ({
                        ...current,
                        routing: {
                          ...current.routing,
                          fallbackOwnerUserId: event.target.value || null,
                        },
                      }))
                    }
                    disabled={isReadOnly}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                  >
                    <option value="">Niciun fallback</option>
                    {agents.map((agent) => (
                      <option key={agent.userId} value={agent.userId}>
                        {(agent.name?.trim() || agent.email) + ` (${ROLE_LABEL[agent.role]})`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {selectedStep === "terms" ? (
              <div className="space-y-4">
                <label className="space-y-1 text-xs text-slate-600">
                  <span>TargetMinutes etapa 1 (First touch)</span>
                  <input
                    type="number"
                    min={1}
                    value={wizard.responseTerms.stage1TargetMinutes}
                    onChange={(event) =>
                      mutateWizard((current) => ({
                        ...current,
                        responseTerms: {
                          ...current.responseTerms,
                          stage1TargetMinutes: toSafeInt(
                            Number.parseInt(event.target.value, 10),
                            current.responseTerms.stage1TargetMinutes
                          ),
                        },
                      }))
                    }
                    disabled={isReadOnly}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Override pe sursa (simplu)</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FLOW_INPUT_SOURCES.map((source) => {
                      const value = wizard.responseTerms.perSourceOverrides[source];
                      return (
                        <label key={source} className="space-y-1 text-xs text-slate-600">
                          <span>{SOURCE_LABEL[source]}</span>
                          <input
                            type="number"
                            min={1}
                            value={value ?? ""}
                            placeholder="Foloseste valoarea implicita"
                            onChange={(event) => {
                              const raw = event.target.value.trim();
                              mutateWizard((current) => ({
                                ...current,
                                responseTerms: {
                                  ...current.responseTerms,
                                  perSourceOverrides: {
                                    ...current.responseTerms.perSourceOverrides,
                                    [source]:
                                      raw === ""
                                        ? null
                                        : toSafeInt(Number.parseInt(raw, 10), 1),
                                  },
                                },
                              }));
                            }}
                            disabled={isReadOnly}
                            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedStep === "escalation" ? (
              <ul className="space-y-2">
                {FLOW_STAGE_TEMPLATES.map((stage) => {
                  const rule = wizard.escalation.rules.find(
                    (entry) => entry.stageKey === stage.key
                  );
                  if (!rule) return null;

                  return (
                    <li key={stage.key} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{stage.name}</p>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) =>
                              updateEscalationRule(stage.key, { enabled: event.target.checked })
                            }
                            disabled={isReadOnly}
                            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          Activ
                        </label>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <label className="space-y-1 text-xs text-slate-600">
                          <span>Reminder %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.remindAtPct}
                            onChange={(event) =>
                              updateEscalationRule(stage.key, {
                                remindAtPct: toSafeInt(
                                  Number.parseInt(event.target.value, 10),
                                  rule.remindAtPct,
                                  0,
                                  100
                                ),
                              })
                            }
                            disabled={isReadOnly}
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-slate-600">
                          <span>Reasignare %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.reassignAtPct}
                            onChange={(event) =>
                              updateEscalationRule(stage.key, {
                                reassignAtPct: toSafeInt(
                                  Number.parseInt(event.target.value, 10),
                                  rule.reassignAtPct,
                                  0,
                                  100
                                ),
                              })
                            }
                            disabled={isReadOnly}
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-slate-600">
                          <span>Manager alert %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.managerAlertAtPct}
                            onChange={(event) =>
                              updateEscalationRule(stage.key, {
                                managerAlertAtPct: toSafeInt(
                                  Number.parseInt(event.target.value, 10),
                                  rule.managerAlertAtPct,
                                  0,
                                  100
                                ),
                              })
                            }
                            disabled={isReadOnly}
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                          />
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {selectedStep === "proof" ? (
              <ul className="space-y-2">
                {FLOW_STAGE_TEMPLATES.map((stage) => {
                  const rule = wizard.proof.rules.find(
                    (entry) => entry.stageKey === stage.key
                  );
                  if (!rule) return null;

                  return (
                    <li key={stage.key} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-sm font-medium text-slate-900">{stage.name}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {FLOW_PROOF_TYPES.map((proofType) => {
                          const checked = rule.stopOnProofTypes.includes(proofType);
                          return (
                            <label
                              key={`${stage.key}-${proofType}`}
                              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  toggleProofType(
                                    stage.key,
                                    proofType,
                                    event.target.checked
                                  )
                                }
                                disabled={isReadOnly}
                                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                              />
                              {PROOF_LABEL[proofType]}
                            </label>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {selectedStep === "booking" ? (
              <div className="space-y-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={wizard.booking.enabled}
                    onChange={(event) =>
                      mutateWizard((current) => ({
                        ...current,
                        booking: {
                          ...current.booking,
                          enabled: event.target.checked,
                        },
                      }))
                    }
                    disabled={isReadOnly}
                    className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  Programare activa
                </label>

                <label className="space-y-1 text-xs text-slate-600">
                  <span>Provider</span>
                  <select
                    value={wizard.booking.provider}
                    onChange={(event) =>
                      mutateWizard((current) => ({
                        ...current,
                        booking: {
                          ...current.booking,
                          provider: event.target.value as FlowWizardState["booking"]["provider"],
                        },
                      }))
                    }
                    disabled={isReadOnly}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                  >
                    {FLOW_BOOKING_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {BOOKING_PROVIDER_LABEL[provider]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
