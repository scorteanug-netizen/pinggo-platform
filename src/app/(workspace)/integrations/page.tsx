import { redirect } from "next/navigation";
import { PlugZap, CheckCircle, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-field";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import {
  ensureWorkspaceWebhookIntegration,
  getWorkspaceWebhookIngestStatus,
  getWorkspaceIntegrationStatus,
} from "@/server/services/integrationService";
import { WebhookTestButton } from "./WebhookTestButton";
import { WebhookRotateTokenButton } from "./WebhookRotateTokenButton";

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "green" : "gray"}>
      {active ? "Activ" : "Neconfigurat"}
    </Badge>
  );
}

export default async function IntegrationsPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewIntegrations) {
    redirect("/dashboard");
  }
  const workspaceId = context.workspaceId;

  const [webhook, status, webhookIngestStatus] = await Promise.all([
    ensureWorkspaceWebhookIntegration(workspaceId),
    getWorkspaceIntegrationStatus(workspaceId),
    getWorkspaceWebhookIngestStatus(workspaceId),
  ]);

  function formatDateTime(value: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleString("ro-RO");
  }

  const placeholderCards = [
    {
      title: "Email forward",
      description: "Redirectionare e-mail catre pipeline de leaduri.",
      active: status.emailForward,
      borderColor: "orange" as const,
    },
    {
      title: "WhatsApp provider",
      description: "Conectare provider WhatsApp pentru dovada si automatizari.",
      active: status.whatsappProvider,
      borderColor: "orange" as const,
    },
    {
      title: "Slack",
      description: "Notificari operationale si alerte de escaladare in Slack.",
      active: status.slack,
      borderColor: "orange" as const,
    },
    {
      title: "Google Calendar",
      description: "Sincronizare booking-uri si link-uri de meeting.",
      active: status.googleCalendar,
      borderColor: "orange" as const,
    },
  ];

  // Calculate stats from integration status
  const activeIntegrationsCount = [
    status.webhookInbound,
    status.emailForward,
    status.whatsappProvider,
    status.slack,
    status.googleCalendar,
  ].filter(Boolean).length;

  const stats = {
    activeIntegrations: activeIntegrationsCount,
    webhookEvents: webhookIngestStatus.totalEventsLast24h,
    lastLeadId: webhookIngestStatus.lastReceivedLeadId,
  };

  return (
    <div className="space-y-6">
      {/* Header cu icon */}
      <PageHeader
        title="Integrari"
        subtitle="Configureaza canalele de ingestie si conexiunile externe pentru workspace."
        icon={PlugZap}
      />

      {/* Stat Cards - REAL DATA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={PlugZap}
          label="Integrări Active"
          value={stats.activeIntegrations}
        />

        <StatCard
          icon={CheckCircle}
          label="Evenimente 24h"
          value={stats.webhookEvents}
          helper="prin webhook"
        />

        <StatCard
          icon={Link2}
          label="Ultimul Lead"
          value={stats.lastLeadId ? "Primit" : "-"}
          helper={stats.lastLeadId || "Niciun lead încă"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Webhook inbound"
          description="Endpoint pentru ingestie leaduri din sisteme externe."
          borderColor="orange"
          actions={<StatusBadge active={status.webhookInbound} />}
          contentClassName="space-y-4"
        >
          <CopyField
            label="Endpoint"
            value={webhook.endpoint}
            toastMessage="Endpoint copiat in clipboard"
          />
          <CopyField
            label="Token header (x-pinggo-token)"
            value={webhook.token}
            toastMessage="Token copiat in clipboard"
          />
          <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <p>
              Token creat la: <span className="font-medium">{formatDateTime(webhook.tokenCreatedAt)}</span>
            </p>
            <p>
              Ultima rotire: <span className="font-medium">{formatDateTime(webhook.lastRotatedAt)}</span>
            </p>
            <p>
              Ultimul eveniment:{" "}
              <span className="font-medium">
                {webhookIngestStatus.lastReceivedAt
                  ? `${formatDateTime(webhookIngestStatus.lastReceivedAt)} (${webhookIngestStatus.lastReceivedSource ?? webhookIngestStatus.lastEventType ?? "necunoscut"})`
                  : "-"}
              </span>
            </p>
            <p>
              Ultimul lead: <span className="font-medium">{webhookIngestStatus.lastReceivedLeadId ?? "-"}</span>
            </p>
            <p>
              Evenimente 24h: <span className="font-medium">{webhookIngestStatus.totalEventsLast24h}</span>
            </p>
          </div>
          <WebhookRotateTokenButton canRotate={context.globalRole === "SUPER_ADMIN"} />
          <WebhookTestButton endpoint={webhook.endpoint} token={webhook.token} />
        </SectionCard>

        {placeholderCards.map((card) => (
          <SectionCard
            key={card.title}
            title={card.title}
            description={card.description}
            borderColor={card.borderColor}
            actions={<StatusBadge active={card.active} />}
          >
            <p className="text-sm text-slate-500">Placeholder MVP. Configurarea va fi adaugata ulterior.</p>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
