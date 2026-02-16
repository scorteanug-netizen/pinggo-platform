import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentOrgId } from "@/server/authMode";
import { DispatchButton } from "./DispatchButton";
import { SimulateReplyBox } from "./SimulateReplyBox";
import { SetDefaultScenarioButton } from "./SetDefaultScenarioButton";
import { LeadHeaderActions } from "./LeadHeaderActions";

type LeadDetailApiResponse = {
  lead: {
    id: string;
    workspaceId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    externalId: string | null;
    createdAt: string;
    status: string;
  };
  sla: {
    startedAt: string;
    deadlineAt: string;
    stoppedAt: string | null;
    stopReason: string | null;
    breachedAt: string | null;
  } | null;
  timeline: Array<{
    id: string;
    eventType: string;
    payload: unknown;
    occurredAt: string;
  }>;
  proof: Array<{
    id: string;
    channel: string;
    type: string;
    provider: string;
    providerMessageId: string | null;
    occurredAt: string;
  }>;
  autopilot: {
    id: string;
    status: string;
    currentStep: string;
    stateJson: { node?: string; answers?: Record<string, string> } | null;
    scenarioId: string | null;
    scenarioMode: string | null;
    scenario: { id: string; name: string; mode: string; isDefault: boolean } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  lastMessage: {
    id: string;
    channel: string;
    status: string;
    toPhone: string | null;
    text: string | null;
    provider: string | null;
    providerMessageId: string | null;
    sentAt: string | null;
    createdAt: string;
  } | null;
};

type LeadDetailFetchResult =
  | {
      kind: "ok";
      data: LeadDetailApiResponse;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "error";
    };

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ro-RO");
}

const EVENT_LABELS: Record<string, string> = {
  lead_received: "Lead primit",
  sla_started: "Cronometru SLA pornit",
  sla_breached: "SLA depasit",
  sla_stopped: "Cronometru SLA oprit",
  proof_received: "Dovada primita",
  autopilot_started: "Autopilot pornit",
  message_queued: "Mesaj in coada",
  message_sent: "Mesaj trimis",
  message_failed: "Mesaj esuat",
  autopilot_completed: "Autopilot finalizat",
  autopilot_handed_over: "Autopilot predat agentului",
  autopilot_failed: "Autopilot esuat",
  booking_created: "Programare creata",
  autopilot_inbound: "Reply primit (autopilot)",
  message_blocked: "Mesaj blocat: lipseste numar",
};

function toLabel(value: string) {
  if (EVENT_LABELS[value]) return EVENT_LABELS[value];
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const AUTOPILOT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  HANDED_OVER: "bg-slate-100 text-slate-700",
  FAILED: "bg-red-100 text-red-700",
};

const MESSAGE_STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-yellow-100 text-yellow-700",
  SENT: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function payloadPreview(payload: unknown) {
  if (payload === null || payload === undefined) return "-";
  if (typeof payload === "string") return payload;
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized;
  } catch {
    return "-";
  }
}

async function fetchLeadDetail(leadId: string): Promise<LeadDetailFetchResult> {
  try {
    const requestHeaders = headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    if (!host) {
      return { kind: "error" };
    }

    const protocol =
      requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
    const response = await fetch(`${protocol}://${host}/api/v1/leads/${leadId}`, {
      cache: "no-store",
    });

    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "error" };

    const data = (await response.json()) as LeadDetailApiResponse;
    return { kind: "ok", data };
  } catch {
    return { kind: "error" };
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) notFound();
  const { id } = await params;
  const leadDetailResult = await fetchLeadDetail(id);

  if (leadDetailResult.kind === "not_found") {
    return <p className="text-sm text-slate-600">Lead not found</p>;
  }

  if (leadDetailResult.kind === "error") {
    return <p className="text-sm text-slate-600">Failed to load lead</p>;
  }

  const leadDetail = leadDetailResult.data;

  const timelineItems = leadDetail.timeline.map((event) => ({
    id: event.id,
    label: toLabel(event.eventType),
    at: event.occurredAt,
    payload: event.payload,
  }));

  const displayName =
    [leadDetail.lead.firstName, leadDetail.lead.lastName].filter(Boolean).join(" ").trim() ||
    leadDetail.lead.email ||
    leadDetail.lead.id.slice(0, 8);

  const slaStatus = leadDetail.sla
    ? leadDetail.sla.stoppedAt
      ? "Stopped"
      : leadDetail.sla.breachedAt
        ? "Breached"
        : "Running"
    : "-";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Lead: {displayName}</h1>
          <p className="text-sm text-slate-600">
            {leadDetail.lead.email ?? "-"} · {leadDetail.lead.phone ?? "-"}
          </p>
        </div>
        <LeadHeaderActions leadId={leadDetail.lead.id} lead={leadDetail.lead} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle className="text-xl">Identitate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Nume: {displayName}</p>
            <p>Email: {leadDetail.lead.email ?? "-"}</p>
            <p>Telefon: {leadDetail.lead.phone ?? "-"}</p>
            <p>Workspace: {leadDetail.lead.workspaceId}</p>
            <p>Status: {leadDetail.lead.status}</p>
            <p>Sursa: {leadDetail.lead.source ?? "-"}</p>
            <p>External ID: {leadDetail.lead.externalId ?? "-"}</p>
            <p>Creat: {formatDateTime(leadDetail.lead.createdAt)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle className="text-xl">Cronometre SLA</CardTitle>
          </CardHeader>
          <CardContent>
            {!leadDetail.sla ? (
              <p className="text-muted-foreground text-sm">Niciun cronometru.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                <li>Status: {slaStatus}</li>
                <li>Pornit la: {formatDateTime(leadDetail.sla.startedAt)}</li>
                <li>Termen limita: {formatDateTime(leadDetail.sla.deadlineAt)}</li>
                {leadDetail.sla.stoppedAt ? (
                  <li>
                    Oprit la: {formatDateTime(leadDetail.sla.stoppedAt)}
                    {leadDetail.sla.stopReason ? ` (${leadDetail.sla.stopReason})` : ""}
                  </li>
                ) : null}
                {leadDetail.sla.breachedAt ? (
                  <li className="text-rose-700">
                    Depasit la: {formatDateTime(leadDetail.sla.breachedAt)}
                  </li>
                ) : null}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle className="text-xl">Autopilot</CardTitle>
          </CardHeader>
          <CardContent>
            {!leadDetail.autopilot ? (
              <p className="text-muted-foreground text-sm">Autopilot inactiv.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-slate-600">Status:</span>
                  <StatusBadge
                    label={leadDetail.autopilot.status}
                    className={AUTOPILOT_STATUS_COLORS[leadDetail.autopilot.status] ?? "bg-slate-100 text-slate-700"}
                  />
                  {leadDetail.autopilot.scenarioMode ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        leadDetail.autopilot.scenarioMode === "AI"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {leadDetail.autopilot.scenarioMode === "AI" ? "AI" : "Reguli"}
                    </span>
                  ) : null}
                </div>
                {leadDetail.autopilot.scenario ? (
                  <p className="text-sm text-slate-600">
                    Scenariu: {leadDetail.autopilot.scenario.name} ({leadDetail.autopilot.scenario.mode})
                    {leadDetail.autopilot.scenarioId ? (
                      <span className="ml-1 font-mono text-xs text-slate-500">
                        {leadDetail.autopilot.scenarioId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <ul className="space-y-1 text-sm">
                  <li>Step curent: <strong>{leadDetail.autopilot.currentStep}</strong></li>
                  {leadDetail.autopilot.stateJson?.node ? (
                    <li>Nod conversatie: <strong>{leadDetail.autopilot.stateJson.node}</strong></li>
                  ) : null}
                  {leadDetail.autopilot.stateJson?.answers &&
                  Object.keys(leadDetail.autopilot.stateJson.answers).length > 0 ? (
                    <li>
                      Raspunsuri:{" "}
                      <code className="text-xs">
                        {JSON.stringify(leadDetail.autopilot.stateJson.answers)}
                      </code>
                    </li>
                  ) : null}
                  <li>Pornit: {formatDateTime(leadDetail.autopilot.createdAt)}</li>
                  <li>Actualizat: {formatDateTime(leadDetail.autopilot.updatedAt)}</li>
                </ul>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {leadDetail.autopilot.scenario ? (
                    <SetDefaultScenarioButton
                      scenarioId={leadDetail.autopilot.scenario.id}
                      isDefault={leadDetail.autopilot.scenario.isDefault}
                    />
                  ) : null}
                </div>
                <div className="mt-2">
                  <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Simuleaza reply</p>
                  <SimulateReplyBox leadId={leadDetail.lead.id} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle className="text-xl">Ultimul mesaj</CardTitle>
          </CardHeader>
          <CardContent>
            {!leadDetail.lastMessage ? (
              <p className="text-muted-foreground text-sm">Niciun mesaj trimis.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">Status:</span>
                  <StatusBadge
                    label={leadDetail.lastMessage.status}
                    className={MESSAGE_STATUS_COLORS[leadDetail.lastMessage.status] ?? "bg-slate-100 text-slate-700"}
                  />
                </div>
                <ul className="space-y-1 text-sm">
                  <li>Canal: {leadDetail.lastMessage.channel}</li>
                  <li>Destinatar: {leadDetail.lastMessage.toPhone ?? "-"}</li>
                  {leadDetail.lastMessage.text ? (
                    <li className="text-slate-500 text-xs italic">
                      &ldquo;{leadDetail.lastMessage.text.length > 100 ? `${leadDetail.lastMessage.text.slice(0, 97)}...` : leadDetail.lastMessage.text}&rdquo;
                    </li>
                  ) : null}
                  <li>Provider: {leadDetail.lastMessage.provider ?? "-"}</li>
                  {leadDetail.lastMessage.providerMessageId ? (
                    <li>Provider ID: <code className="text-xs">{leadDetail.lastMessage.providerMessageId}</code></li>
                  ) : null}
                  <li>Trimis: {formatDateTime(leadDetail.lastMessage.sentAt)}</li>
                </ul>
                <DispatchButton />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle className="text-xl">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">Niciun eveniment.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {timelineItems.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}</strong> - {formatDateTime(entry.at)}
                  <div className="text-xs text-slate-500">Payload: {payloadPreview(entry.payload)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle className="text-xl">Proof</CardTitle>
        </CardHeader>
        <CardContent>
          {leadDetail.proof.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nicio dovada.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {leadDetail.proof.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <strong>{toLabel(item.type)}</strong> ({item.channel}) - {formatDateTime(item.occurredAt)}
                  <div className="text-xs text-slate-500">
                    {item.provider}
                    {item.providerMessageId ? ` · ${item.providerMessageId}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
