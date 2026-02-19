"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RotateCcw, Send, ChevronDown, ChevronUp } from "lucide-react";

type ConversationEntry = {
  role: "client" | "assistant" | "system";
  text: string;
  createdAt: string;
};

type PlaygroundResult = {
  status: string;
  nodeAfter: string;
  messageBlocked: boolean;
  messageBlockedReason?: string;
  handoverTriggered: boolean;
  assistantText: string | null;
};

type PlaygroundMessageResponse = {
  role: "user" | "assistant" | "system";
  text: string;
  occurredAt: string;
  eventType: string;
};

interface ScenarioPlaygroundProps {
  scenarioId: string;
}

export function ScenarioPlayground({ scenarioId }: ScenarioPlaygroundProps) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PlaygroundResult | null>(null);
  const [lastRawResponse, setLastRawResponse] = useState<unknown>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const baseUrl = `/api/v1/autopilot/scenarios/${scenarioId}/playground`;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation]);

  function getErrorDetail(data: { detail?: string; error?: string }): string {
    return data?.detail ?? data?.error ?? "Unknown error";
  }

  async function fetchMessages(lid: string): Promise<ConversationEntry[]> {
    const res = await fetch(
      `${baseUrl}/messages?leadId=${encodeURIComponent(lid)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.messages)) return [];
    return (data.messages as PlaygroundMessageResponse[]).map((m) => ({
      role: m.role === "user" ? "client" : m.role,
      text: m.text,
      createdAt: m.occurredAt,
    }));
  }

  async function ensureStarted(): Promise<{ leadId: string; runId: string } | null> {
    if (leadId && runId) return { leadId, runId };
    setStartError(null);
    try {
      const res = await fetch(baseUrl + "/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStartError(getErrorDetail(data));
        return null;
      }
      const lid = data.leadId ?? null;
      const rid = data.runId ?? null;
      if (lid && rid) {
        setLeadId(lid);
        setRunId(rid);
        setStartError(null);
        const messages = await fetchMessages(lid);
        setConversation(messages);
        return { leadId: lid, runId: rid };
      }
      setStartError("Invalid start response");
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start playground";
      setStartError(msg);
      return null;
    }
  }

  async function handleRetryStart() {
    setStartError(null);
    const session = await ensureStarted();
    if (session) setSendError(null);
  }

  async function handleReset() {
    setStartError(null);
    setSendError(null);
    setLastResult(null);
    setLastRawResponse(null);
    setConversation([]);
    try {
      const res = await fetch(baseUrl + "/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.leadId && data.runId) {
        setLeadId(data.leadId);
        setRunId(data.runId);
      } else {
        setLeadId(null);
        setRunId(null);
        if (!res.ok) setStartError(getErrorDetail(data));
      }
    } catch {
      setLeadId(null);
      setRunId(null);
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || sending) return;

    setSendError(null);
    setLastResult(null);
    setLastRawResponse(null);

    const session = await ensureStarted();
    if (!session) {
      setSendError("Could not start session. Use Retry above or try again.");
      return;
    }

    setSending(true);
    setInputText("");

    try {
      const res = await fetch(baseUrl + "/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: session.leadId, text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSendError(getErrorDetail(data));
        setInputText(text);
        return;
      }

      setLastRawResponse(data);
      if (data.result) {
        setLastResult(data.result);
        if (data.result.messageBlocked) {
          setSendError(
            data.result.messageBlockedReason === "missing_phone"
              ? "Mesaj blocat: lead fără număr de telefon."
              : "Mesaj blocat."
          );
        }
      }

      const messages = await fetchMessages(session.leadId);
      setConversation(messages);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Failed to send message");
      setInputText(text);
    } finally {
      setSending(false);
    }
  }

  const errorMessage = startError ?? sendError;

  return (
    <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden">
      <CardHeader className="p-4 pb-2 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Playground (simulare)
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex flex-col">
        {startError && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <span>{startError}</span>
            <Button variant="outline" size="sm" onClick={handleRetryStart} className="shrink-0">
              Retry
            </Button>
          </div>
        )}
        <div
          ref={scrollRef}
          className="flex-1 min-h-[320px] max-h-[420px] overflow-y-auto p-4 space-y-3 bg-slate-50/50"
        >
          {conversation.length === 0 && !errorMessage && (
            <p className="text-xs text-slate-500 text-center py-8">
              Scrie un mesaj pentru a simula conversația. Același logic ca în producție.
            </p>
          )}
          {conversation.map((entry, i) => {
            if (entry.role === "system") {
              return (
                <div key={i} className="flex justify-center">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                    {entry.text}
                  </span>
                </div>
              );
            }
            if (entry.role === "client") {
              return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-emerald-500 text-white px-4 py-2.5 shadow-sm">
                    <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
                    <p className="text-[10px] opacity-80 mt-1">
                      {formatTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-amber-500 text-white px-4 py-2.5 shadow-sm">
                  <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
                  <p className="text-[10px] opacity-80 mt-1">
                    {formatTime(entry.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {sendError && !startError && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">
            {sendError}
          </div>
        )}

        <div className="p-4 border-t border-slate-100 flex gap-2">
          <Input
            placeholder="Mesaj client..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={sending || !inputText.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
          >
            <Send className="h-4 w-4" />
            Trimite
          </Button>
        </div>

        {(lastResult || !!lastRawResponse) && (
          <div className="border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowTechnical((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-500 hover:bg-slate-50"
            >
              Detalii tehnice
              {showTechnical ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {showTechnical && lastRawResponse != null && (
              <pre className="px-4 pb-4 text-[10px] text-slate-600 overflow-x-auto bg-slate-50 p-3 rounded mx-4 mb-2 border border-slate-100">
                {JSON.stringify(lastRawResponse, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}