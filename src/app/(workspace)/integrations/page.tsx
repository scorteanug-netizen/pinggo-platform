import { redirect } from "next/navigation";
import { CopyField } from "@/components/ui/copy-field";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
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
    <span
      className={
        active
          ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700"
          : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
      }
    >
      {active ? "Activ" : "Neconfigurat"}
    </span>
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
    },
    {
      title: "WhatsApp provider",
      description: "Conectare provider WhatsApp pentru dovada si automatizari.",
      active: status.whatsappProvider,
    },
    {
      title: "Slack",
      description: "Notificari operationale si alerte de escaladare in Slack.",
      active: status.slack,
    },
    {
      title: "Google Calendar",
      description: "Sincronizare booking-uri si link-uri de meeting.",
      active: status.googleCalendar,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrari"
        subtitle="Configureaza canalele de ingestie si conexiunile externe pentru workspace."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Webhook inbound"
          description="Endpoint pentru ingestie leaduri din sisteme externe."
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
            actions={<StatusBadge active={card.active} />}
          >
            <p className="text-sm text-slate-500">Placeholder MVP. Configurarea va fi adaugata ulterior.</p>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
