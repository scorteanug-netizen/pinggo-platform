"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
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

type OutboundMessageItem = {
  id: string;
  text: string;
  status: string;
  createdAt: string;
  providerMessageId: string | null;
  toPhone: string | null;
};

type ChatItem =
  | {
      kind: "inbound";
      id: string;
      listKey: string;
      text: string;
      senderPhone: string;
      occurredAt: string;
      rawJson: unknown;
    }
  | {
      kind: "outbound";
      id: string;
      listKey: string;
      text: string;
      statusLabel: string;
      createdAt: string;
      rawJson: unknown;
    }
  | {
      kind: "system";
      id: string;
      listKey: string;
      text: string;
      occurredAt: string;
      rawJson: unknown;
    };

type AutopilotSectionProps = {
  leadId: string;
  autopilotRun: AutopilotRunData;
  eventLogTimeline: EventLogItem[];
  outboundMessages: OutboundMessageItem[];
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
  whatsapp_inbound: "Mesaj WhatsApp primit",
  autopilot_inbound: "Mesaj primit",
  autopilot_ai_planned: "AI planner",
  message_queued: "Mesaj in coada",
  message_sent: "Mesaj trimis",
  message_blocked: "Mesaj blocat: lipseste numar",
  autopilot_handover: "Handover",
  handover_notified: "Agent notificat",
  handover_notification_failed: "Notificare agent esuata",
  handover_notification_blocked: "Notificare agent blocata",
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

function resolveOutboundStatusLabel(
  outbound: OutboundMessageItem,
  eventLogTimeline: EventLogItem[]
): string {
  const proofEvents = eventLogTimeline.filter((e) => e.eventType === "proof_whatsapp_status");
  const forThisMessage = proofEvents.filter((e) => {
    const p = e.payload as Record<string, unknown> | null;
    return p && p.providerMessageId === outbound.providerMessageId;
  });
  const latestProof = forThisMessage.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  )[0];
  if (latestProof) {
    const p = latestProof.payload as Record<string, unknown> | null;
    const status = (p?.status as string)?.toLowerCase();
    if (status === "read") return "Citit";
    if (status === "delivered") return "Livrat";
  }
  const failed = eventLogTimeline.some((e) => {
    if (e.eventType !== "message_failed") return false;
    const p = e.payload as Record<string, unknown> | null;
    return p && p.outboundMessageId === outbound.id;
  });
  if (failed) return "Eroare";
  switch (outbound.status) {
    case "QUEUED":
      return "In asteptare";
    case "SENT":
      return "Trimis";
    case "FAILED":
      return "Eroare";
    default:
      return outbound.status;
  }
}

function buildChatItems(
  eventLogTimeline: EventLogItem[],
  outboundMessages: OutboundMessageItem[]
): ChatItem[] {
  const items: ChatItem[] = [];

  for (const e of eventLogTimeline) {
    if (e.eventType === "whatsapp_inbound") {
      const p = (e.payload as Record<string, unknown>) ?? {};
      const text = (p.text as string) ?? (p.Body as string) ?? "";
      const from = (p.from as string) ?? "";
      items.push({
        kind: "inbound",
        id: e.id,
        listKey: `inbound-${e.id}`,
        text: text.trim() || "(fara text)",
        senderPhone: from || "Lead",
        occurredAt: e.occurredAt,
        rawJson: { eventType: e.eventType, payload: e.payload, occurredAt: e.occurredAt },
      });
    } else if (e.eventType === "autopilot_handover") {
      items.push({
        kind: "system",
        id: e.id,
        listKey: `system-${e.id}`,
        text: "Transfer catre operator",
        occurredAt: e.occurredAt,
        rawJson: { eventType: e.eventType, payload: e.payload, occurredAt: e.occurredAt },
      });
    }
  }

  for (const m of outboundMessages) {
    const statusLabel = resolveOutboundStatusLabel(m, eventLogTimeline);
    items.push({
      kind: "outbound",
      id: m.id,
      listKey: `outbound-${m.id}`,
      text: (m.text ?? "").trim() || "(Mesaj fara continut)",
      statusLabel,
      createdAt: m.createdAt,
      rawJson: {
        outboundMessageId: m.id,
        text: m.text,
        status: m.status,
        createdAt: m.createdAt,
        providerMessageId: m.providerMessageId,
        toPhone: m.toPhone,
      },
    });
  }

  items.sort((a, b) => {
    const tA = a.kind === "outbound" ? a.createdAt : a.occurredAt;
    const tB = b.kind === "outbound" ? b.createdAt : b.occurredAt;
    return new Date(tA).getTime() - new Date(tB).getTime();
  });
  return items;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutopilotSection({
  leadId,
  autopilotRun,
  eventLogTimeline,
  outboundMessages,
  scenarios,
}: AutopilotSectionProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ResultState>({ type: "idle", message: "" });
  const [isPending, startTransition] = useTransition();
  const [pendingStartSuccess, setPendingStartSuccess] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());
  const [isTimelineOpen, setIsTimelineOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`autopilotTimelineOpen:${leadId}`) === "true";
  });

  const chatItems = useMemo(
    () => buildChatItems(eventLogTimeline, outboundMessages),
    [eventLogTimeline, outboundMessages]
  );

  const toggleDetail = useCallback((listKey: string) => {
    setExpandedDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(listKey)) next.delete(listKey);
      else next.add(listKey);
      return next;
    });
  }, []);

  const copyPayload = useCallback((payload: unknown) => {
    const str =
      typeof payload === "object" && payload !== null
        ? JSON.stringify(payload, null, 2)
        : String(payload ?? "{}");
    void navigator.clipboard.writeText(str);
  }, []);

  const toggleTimelineOpen = useCallback(() => {
    setIsTimelineOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`autopilotTimelineOpen:${leadId}`, next ? "true" : "false");
      } catch {
        // ignore
      }
      return next;
    });
  }, [leadId]);

  const lastChatItem = chatItems.length > 0 ? chatItems[chatItems.length - 1]! : null;
  const lastMessageAtLabel = lastChatItem
    ? formatDateTime(
        lastChatItem.kind === "outbound" ? lastChatItem.createdAt : lastChatItem.occurredAt
      )
    : null;

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

  // Sync timeline open state when leadId changes (e.g. client navigation)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTimelineOpen(localStorage.getItem(`autopilotTimelineOpen:${leadId}`) === "true");
  }, [leadId]);
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

      {/* Chat-style timeline (collapsible) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">Timeline autopilot</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTimelineOpen}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {isTimelineOpen ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  Ascunde conversatia
                </>
              ) : (
                <>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  Arata conversatia
                </>
              )}
            </button>
            {isTimelineOpen && (
              <button
                type="button"
                onClick={() => setShowTechnicalDetails((v) => !v)}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {showTechnicalDetails ? "Ascunde detalii tehnice" : "Detalii tehnice"}
              </button>
            )}
          </div>
        </div>
        {!isTimelineOpen && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <p>Conversatie: {chatItems.length} mesaje</p>
            {lastMessageAtLabel ? (
              <p className="mt-0.5 text-xs text-slate-500">Ultimul: {lastMessageAtLabel}</p>
            ) : null}
          </div>
        )}
        {isTimelineOpen && chatItems.length === 0 ? (
          <p className="text-sm text-slate-600">Nu exista mesaje in conversatie.</p>
        ) : isTimelineOpen ? (
          <ul className="space-y-3">
            {chatItems.map((item) => {
              const isDetailExpanded = expandedDetailIds.has(item.listKey);
              return (
                <li key={item.listKey}>
                  {item.kind === "inbound" && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-emerald-100 px-3 py-2 shadow-sm">
                        <p className="text-xs text-emerald-800">{item.senderPhone}</p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-900">
                          {item.text}
                        </p>
                        <p className="mt-1 text-[10px] text-emerald-700">
                          {formatDateTime(item.occurredAt)}
                        </p>
                      </div>
                    </div>
                  )}
                  {item.kind === "outbound" && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-100 px-3 py-2 shadow-sm">
                        <p className="whitespace-pre-wrap break-words text-sm text-slate-900">
                          {item.text}
                        </p>
                        <p className="mt-1 text-[10px] text-orange-700">{item.statusLabel}</p>
                        <p className="text-[10px] text-orange-600">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  )}
                  {item.kind === "system" && (
                    <div className="flex justify-center">
                      <div className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
                        {item.text} · {formatDateTime(item.occurredAt)}
                      </div>
                    </div>
                  )}
                  {showTechnicalDetails && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleDetail(item.listKey)}
                        className="mt-1 flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        {isDetailExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        Detalii tehnice
                      </button>
                      {isDetailExpanded && (
                        <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                          <div className="mb-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => copyPayload(item.rawJson)}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Copy className="h-3 w-3" />
                              Copiaza
                            </button>
                          </div>
                          <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                            {JSON.stringify(item.rawJson, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
