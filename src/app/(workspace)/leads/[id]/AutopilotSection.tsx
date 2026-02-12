"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type AutopilotSnapshot = {
  state:
    | "IDLE"
    | "ACK_SENT"
    | "QUESTION_1_SENT"
    | "QUESTION_2_SENT"
    | "BOOKING_OFFERED"
    | "HANDOVER_REQUESTED";
  questionsAsked: number;
  bookingOffered: boolean;
  handoverRequested: boolean;
  started: boolean;
  ackSent: boolean;
};

type TimelineItem = {
  id: string;
  type: string;
  createdAt: string;
  payload: unknown;
};

type AutopilotSectionProps = {
  leadId: string;
  initialSnapshot: AutopilotSnapshot;
  initialTimeline: TimelineItem[];
};

type ResultState = {
  type: "idle" | "success" | "error";
  message: string;
};

const STATE_LABEL: Record<AutopilotSnapshot["state"], string> = {
  IDLE: "Inactiv",
  ACK_SENT: "Ack trimis",
  QUESTION_1_SENT: "Intrebare 1 trimisa",
  QUESTION_2_SENT: "Intrebare 2 trimisa",
  BOOKING_OFFERED: "Link booking trimis",
  HANDOVER_REQUESTED: "Handover cerut",
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

function stateBadgeClass(state: AutopilotSnapshot["state"]) {
  if (state === "HANDOVER_REQUESTED") return "bg-rose-100 text-rose-700";
  if (state === "BOOKING_OFFERED") return "bg-emerald-100 text-emerald-700";
  if (state === "IDLE") return "bg-slate-100 text-slate-600";
  return "bg-orange-100 text-orange-700 font-extrabold";
}

export function AutopilotSection({
  leadId,
  initialSnapshot,
  initialTimeline,
}: AutopilotSectionProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ResultState>({
    type: "idle",
    message: "",
  });
  const [isPending, startTransition] = useTransition();

  function applyResult(payload: unknown, successMessage: string) {
    const record =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    if (!record) {
      setResult({ type: "success", message: successMessage });
      router.refresh();
      return;
    }

    if (record.snapshot && typeof record.snapshot === "object") {
      setSnapshot(record.snapshot as AutopilotSnapshot);
    }
    if (Array.isArray(record.timeline)) {
      setTimeline(record.timeline as TimelineItem[]);
    }
    setResult({ type: "success", message: successMessage });
    router.refresh();
  }

  function runAction(
    request: () => Promise<Response>,
    successMessage: string,
    fallbackErrorMessage: string
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
        applyResult(payload, successMessage);
      } catch {
        setResult({ type: "error", message: fallbackErrorMessage });
      }
    });
  }

  function sendMessage(nextMessage: string) {
    const trimmed = nextMessage.trim();
    if (!trimmed) {
      setResult({ type: "error", message: "Mesajul este gol." });
      return;
    }

    runAction(
      () =>
        fetch("/api/v1/autopilot/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId,
            message: trimmed,
          }),
        }),
      "Mesaj procesat de autopilot.",
      "Nu am putut procesa mesajul autopilot."
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stateBadgeClass(snapshot.state)}`}>
          {STATE_LABEL[snapshot.state]}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          Intrebari: {snapshot.questionsAsked}/2
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={isPending}
          className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
          onClick={() =>
            runAction(
              () =>
                fetch("/api/v1/autopilot/start", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ leadId }),
                }),
              "Autopilot pornit.",
              "Nu am putut porni autopilot."
            )
          }
        >
          Porneste autopilot
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => sendMessage("Vreau mai multe detalii despre oferta.")}
        >
          Simuleaza mesaj client
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => sendMessage("Nu inteleg, vreau un operator uman.")}
        >
          Simuleaza handover
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[260px] flex-1 space-y-1 text-xs text-slate-600">
          <span>Mesaj manual</span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Scrie un mesaj pentru autopilot..."
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            sendMessage(message);
            setMessage("");
          }}
        >
          Trimite mesaj
        </Button>
      </div>

      {result.type === "success" ? <p className="text-sm text-emerald-600">{result.message}</p> : null}
      {result.type === "error" ? <p className="text-sm text-rose-600">{result.message}</p> : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Timeline autopilot</p>
        {timeline.length === 0 ? (
          <p className="text-sm text-slate-600">Nu exista evenimente autopilot.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((event) => (
              <li key={event.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{event.type}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
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
