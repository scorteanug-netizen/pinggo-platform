"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScenarioData = {
  id: string;
  name: string;
  mode: string;
  isDefault: boolean;
} | null;

type AutopilotRunData = {
  id: string;
  status: string;
  currentStep: string | null;
  stateJson: unknown;
  scenarioId: string | null;
  scenarioMode: string | null;
  scenario: ScenarioData;
} | null;

type ScenarioOption = {
  id: string;
  name: string;
  mode: string;
};

type EventLogItem = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: string;
};

type AutopilotSectionProps = {
  leadId: string;
  autopilotRun: AutopilotRunData;
  eventLogTimeline: EventLogItem[];
  scenarios: ScenarioOption[];
};

type ResultState = {
  type: "idle" | "success" | "error";
  message: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activ",
  HANDED_OVER: "Handover",
  COMPLETED: "Finalizat",
  CANCELLED: "Anulat",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  autopilot_started: "Autopilot pornit",
  autopilot_inbound: "Mesaj primit",
  autopilot_ai_planned: "AI planner",
  message_queued: "Mesaj in coada",
  message_sent: "Mesaj trimis",
  message_blocked: "Mesaj blocat: lipseste numar",
  autopilot_handover: "Handover",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function statusBadgeClass(status: string | undefined) {
  switch (status) {
    case "ACTIVE":
      return "bg-orange-100 text-orange-700 font-extrabold";
    case "HANDED_OVER":
      return "bg-rose-100 text-rose-700";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutopilotSection({
  leadId,
  autopilotRun,
  eventLogTimeline,
  scenarios,
}: AutopilotSectionProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ResultState>({ type: "idle", message: "" });
  const [isPending, startTransition] = useTransition();
  const [pendingStartSuccess, setPendingStartSuccess] = useState(false);

  const hasRun = autopilotRun !== null;

  // Only show "Autopilot pornit." after refresh when we actually have a run
  useEffect(() => {
    if (pendingStartSuccess && hasRun) {
      setResult({ type: "success", message: "Autopilot pornit." });
      setPendingStartSuccess(false);
    } else if (pendingStartSuccess && !hasRun) {
      setPendingStartSuccess(false);
    }
  }, [pendingStartSuccess, hasRun]);
  const runStatus = autopilotRun?.status ?? "NO_RUN";
  const stateJson = autopilotRun?.stateJson as Record<string, unknown> | null;
  const currentNode = stateJson?.node as string | undefined;
  const questionIndex = (stateJson?.questionIndex as number) ?? 0;
  const scenarioMode = autopilotRun?.scenarioMode ?? "-";

  function runAction(
    request: () => Promise<Response>,
    successMessage: string,
    fallbackErrorMessage: string,
  ) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await request();
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const errorRecord =
            payload && typeof payload === "object"
              ? (payload as Record<string, unknown>)
              : null;
          const errorMessage =
            errorRecord && typeof errorRecord.error === "string"
              ? errorRecord.error
              : fallbackErrorMessage;
          setResult({ type: "error", message: errorMessage });
          return;
        }
        setResult({ type: "success", message: successMessage });
        router.refresh();
      } catch {
        setResult({ type: "error", message: fallbackErrorMessage });
      }
    });
  }

  function runStartAction(request: () => Promise<Response>) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await request();
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const errorRecord =
            payload && typeof payload === "object"
              ? (payload as Record<string, unknown>)
              : null;
          const errorMessage =
            errorRecord && typeof errorRecord.error === "string"
              ? errorRecord.error
              : "Nu am putut porni autopilot.";
          setResult({ type: "error", message: errorMessage });
          return;
        }
        setPendingStartSuccess(true);
        router.refresh();
      } catch {
        setResult({ type: "error", message: "Nu am putut porni autopilot." });
      }
    });
  }

  function runDispatchAction() {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/messaging/run-dispatch", {
          method: "POST",
        });
        const payload = (await response.json().catch(() => null)) as
          | { processed?: number; sent?: number; failed?: number; error?: string }
          | null;
        if (!response.ok) {
          setResult({
            type: "error",
            message: typeof payload?.error === "string" ? payload.error : "Nu am putut trimite mesajele.",
          });
          return;
        }
        const sent = payload?.sent ?? 0;
        const failed = payload?.failed ?? 0;
        setResult({
          type: "success",
          message: `Trimise: ${sent}, Esuate: ${failed}`,
        });
        router.refresh();
      } catch {
        setResult({ type: "error", message: "Nu am putut trimite mesajele." });
      }
    });
  }

  function sendReply(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setResult({ type: "error", message: "Mesajul este gol." });
      return;
    }

    runAction(
      () =>
        fetch("/api/v1/autopilot/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, text: trimmed }),
        }),
      "Mesaj procesat de autopilot.",
      "Nu am putut procesa mesajul. Verifica daca exista un AutopilotRun activ.",
    );
  }

  return (
    <div className="space-y-3">
      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(runStatus)}`}>
          {hasRun ? (RUN_STATUS_LABEL[runStatus] ?? runStatus) : "Fara run"}
        </span>
        {hasRun && (
          <>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Nod: {currentNode ?? "-"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Intrebari: {questionIndex}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              scenarioMode === "AI" ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700"
            }`}>
              {scenarioMode === "AI" ? "AI" : scenarioMode === "RULES" ? "Reguli" : scenarioMode}
            </span>
          </>
        )}
      </div>

      {/* Scenario info row */}
      {hasRun && autopilotRun?.scenario && (
        <div className="text-sm text-slate-600">
          Scenariu: {autopilotRun.scenario.name} ({autopilotRun.scenario.mode})
          {autopilotRun.scenarioId ? (
            <span className="ml-1 font-mono text-xs text-slate-500">
              {autopilotRun.scenarioId.slice(0, 8)}…
            </span>
          ) : null}
        </div>
      )}

      {/* Scenario switch dropdown */}
      {hasRun && autopilotRun && scenarios.length > 0 && (
        <div className="space-y-1">
          <label
            htmlFor="scenario-switch"
            className="block text-xs font-medium text-slate-600"
          >
            Scenariu pentru acest lead
          </label>
          <select
            id="scenario-switch"
            value={autopilotRun.scenarioId ?? ""}
            disabled={isPending}
            onChange={(e) => {
              const newScenarioId = e.target.value;
              if (!newScenarioId || newScenarioId === (autopilotRun.scenarioId ?? "")) return;
              setResult({ type: "idle", message: "" });
              startTransition(async () => {
                try {
                  const response = await fetch(
                    `/api/v1/autopilot/runs/${autopilotRun.id}/switch-scenario`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ scenarioId: newScenarioId }),
                    }
                  );
                  const payload = await response.json().catch(() => null);
                  if (!response.ok) {
                    setResult({
                      type: "error",
                      message:
                        typeof payload?.error === "string"
                          ? payload.error
                          : "Nu am putut schimba scenariul.",
                    });
                    return;
                  }
                  setResult({ type: "success", message: "Scenariu schimbat." });
                  router.refresh();
                } catch {
                  setResult({ type: "error", message: "Nu am putut schimba scenariul." });
                }
              });
            }}
            className="block w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60"
          >
            {!autopilotRun.scenarioId ? (
              <option value="">-- Selecteaza scenariu --</option>
            ) : null}
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.mode === "AI" ? "AI" : "Reguli"})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={isPending || hasRun}
          className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
          onClick={() =>
            runStartAction(() =>
              fetch("/api/v1/autopilot/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadId }),
              }),
            )
          }
        >
          Porneste autopilot
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isPending || !hasRun || runStatus === "HANDED_OVER"}
          onClick={() => sendReply("Vreau mai multe detalii despre oferta.")}
        >
          Simuleaza mesaj client
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isPending || !hasRun || runStatus === "HANDED_OVER"}
          onClick={() => sendReply("Nu inteleg, vreau un operator uman.")}
        >
          Simuleaza handover
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => runDispatchAction()}
        >
          Trimite mesajele queued
        </Button>

        {autopilotRun?.scenario && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending || autopilotRun.scenario.isDefault}
            onClick={() =>
              runAction(
                () =>
                  fetch(
                    `/api/v1/autopilot/scenarios/${autopilotRun.scenario!.id}/set-default`,
                    { method: "POST" }
                  ),
                "Scenariu setat ca default.",
                "Nu am putut seta scenariul ca default."
              )
            }
          >
            Seteaza ca default
          </Button>
        )}
      </div>

      {/* Manual message input */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[260px] flex-1 space-y-1 text-xs text-slate-600">
          <span>Mesaj manual</span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendReply(message);
                setMessage("");
              }
            }}
            placeholder="Scrie un mesaj pentru autopilot..."
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            disabled={!hasRun || runStatus === "HANDED_OVER"}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !hasRun || runStatus === "HANDED_OVER"}
          onClick={() => {
            sendReply(message);
            setMessage("");
          }}
        >
          Trimite mesaj
        </Button>
      </div>

      {result.type === "success" && <p className="text-sm text-emerald-600">{result.message}</p>}
      {result.type === "error" && <p className="text-sm text-rose-600">{result.message}</p>}

      {/* EventLog Timeline */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Timeline autopilot</p>
        {eventLogTimeline.length === 0 ? (
          <p className="text-sm text-slate-600">Nu exista evenimente autopilot.</p>
        ) : (
          <ul className="space-y-2">
            {eventLogTimeline.map((event) => (
              <li key={event.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(event.occurredAt)}</p>
                </div>
                {event.payload ? (
                  <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
