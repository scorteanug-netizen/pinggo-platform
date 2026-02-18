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
import { isFacebookConfigured, getWorkspaceFacebookIntegration } from "@/server/services/facebookLeadAdsService";
import { isGoogleCalendarConfigured, getWorkspaceGoogleCalendarIntegration } from "@/server/services/googleCalendarService";
import { generateEmbedCode } from "@/server/services/embedFormService";
import { WebhookTestButton } from "./WebhookTestButton";
import { WebhookRotateTokenButton } from "./WebhookRotateTokenButton";
import { FacebookLeadAdsCard } from "./FacebookLeadAdsCard";
import { GoogleCalendarCard } from "./GoogleCalendarCard";
import { EmbedFormCard } from "./EmbedFormCard";
import { IngestLogTable } from "./IngestLogTable";

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

  const [webhook, status, webhookIngestStatus, fbConfig, gcConfig] = await Promise.all([
    ensureWorkspaceWebhookIntegration(workspaceId),
    getWorkspaceIntegrationStatus(workspaceId),
    getWorkspaceWebhookIngestStatus(workspaceId),
    getWorkspaceFacebookIntegration(workspaceId),
    getWorkspaceGoogleCalendarIntegration(workspaceId),
  ]);

  const fbConfigured = isFacebookConfigured();
  const gcConfigured = isGoogleCalendarConfigured();

  function formatDateTime(value: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleString("ro-RO");
  }

  // Calculate stats from integration status
  const activeIntegrationsCount = [
    status.webhookInbound,
    status.emailForward,
    status.whatsappProvider,
    status.slack,
    status.googleCalendar,
    status.facebookLeadAds,
  ].filter(Boolean).length;

  const stats = {
    activeIntegrations: activeIntegrationsCount,
    webhookEvents: webhookIngestStatus.totalEventsLast24h,
    lastLeadId: webhookIngestStatus.lastReceivedLeadId,
  };

  const embedCode = generateEmbedCode(webhook.token, "");

  return (
    <div className="space-y-12">
      {/* Header */}
      <PageHeader
        title="Integrari"
        subtitle="Configureaza canalele de ingestie si conexiunile externe pentru workspace."
        icon={PlugZap}
        iconBgColor="bg-orange-50"
        iconColor="text-orange-600"
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          icon={PlugZap}
          label="Integrari Active"
          value={stats.activeIntegrations}
          accent="violet"
        />
        <StatCard
          icon={CheckCircle}
          label="Evenimente 24h"
          value={stats.webhookEvents}
          helper="prin webhook"
          accent="violet"
        />
        <StatCard
          icon={Link2}
          label="Ultimul Lead"
          value={stats.lastLeadId ? "Primit" : "-"}
          helper={stats.lastLeadId || "Niciun lead inca"}
          accent={stats.lastLeadId ? "green" : "gray"}
        />
      </div>

      {/* Canal Principal */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Canal Principal</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="WhatsApp"
            description="Conectare provider WhatsApp pentru dovada si automatizari."
            borderColor="violet"
            actions={<StatusBadge active={status.whatsappProvider} />}
          >
            <p className="text-sm text-slate-500">Configurarea va fi adaugata ulterior.</p>
          </SectionCard>
        </div>
      </section>

      {/* Surse de Leaduri */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Surse de Leaduri</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Webhook Inbound - existent */}
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

          {/* Facebook Lead Ads */}
          <FacebookLeadAdsCard
            connected={Boolean(fbConfig)}
            configured={fbConfigured}
            pageName={fbConfig?.pageName}
            lastLeadgenAt={fbConfig?.lastLeadgenAt}
          />

          {/* Website Form Embed */}
          <EmbedFormCard embedCode={embedCode} />
        </div>
      </section>

      {/* Booking */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Booking</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <GoogleCalendarCard
            connected={Boolean(gcConfig)}
            configured={gcConfigured}
            accountEmail={gcConfig?.accountEmail}
          />
        </div>
      </section>

      {/* Avansat */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Avansat</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Email Forward"
            description="Redirectionare e-mail catre pipeline de leaduri."
            borderColor="orange"
            actions={<StatusBadge active={status.emailForward} />}
          >
            <p className="text-sm text-slate-500">Configurarea va fi adaugata ulterior.</p>
          </SectionCard>

          <SectionCard
            title="Slack"
            description="Notificari operationale si alerte de escaladare in Slack."
            borderColor="violet"
            actions={<StatusBadge active={status.slack} />}
          >
            <p className="text-sm text-slate-500">Configurarea va fi adaugata ulterior.</p>
          </SectionCard>
        </div>
      </section>

      {/* Ingest Log */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Ultimele Evenimente de Ingestie</h2>
        <SectionCard borderColor="gray" hover={false}>
          <IngestLogTable />
        </SectionCard>
      </section>
    </div>
  );
}
