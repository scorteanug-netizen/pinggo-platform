import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

export type FacebookLeadAdsConfig = {
  active: boolean;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  connectedAt: string;
  connectedByUserId: string;
  lastLeadgenAt?: string;
};

const INTEGRATION_TYPE = "FACEBOOK_LEAD_ADS";

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFacebookConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function buildFacebookOAuthUrl(workspaceId: string, redirectUri: string): string {
  const appId = process.env.META_APP_ID!;
  const scopes = "pages_manage_ads,leads_retrieval,pages_show_list,pages_read_engagement";
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: workspaceId,
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string }> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook token exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

export async function getLongLivedToken(shortLivedToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook long-lived token exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getUserPages(
  userAccessToken: string
): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const res = await fetch(
    `${META_GRAPH_BASE}/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook getUserPages failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };
  return data.data ?? [];
}

export async function subscribePageToLeadgen(
  pageId: string,
  pageAccessToken: string
): Promise<void> {
  const res = await fetch(
    `${META_GRAPH_BASE}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${pageAccessToken}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook subscribePageToLeadgen failed: ${res.status} ${body}`);
  }
}

export async function connectFacebookPage(
  workspaceId: string,
  userId: string,
  page: { id: string; name: string; access_token: string }
): Promise<void> {
  const config: FacebookLeadAdsConfig = {
    active: true,
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    connectedAt: new Date().toISOString(),
    connectedByUserId: userId,
  };

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    create: { workspaceId, type: INTEGRATION_TYPE, config: config as unknown as Record<string, unknown> },
    update: { config: config as unknown as Record<string, unknown> },
  });
}

export async function disconnectFacebookPage(workspaceId: string): Promise<void> {
  await prisma.integration.deleteMany({
    where: { workspaceId, type: INTEGRATION_TYPE },
  });
}

export async function fetchLeadData(
  leadgenId: string,
  pageAccessToken: string
): Promise<Record<string, string>> {
  const fields = "id,created_time,field_data";
  const res = await fetch(
    `${META_GRAPH_BASE}/${leadgenId}?fields=${fields}&access_token=${pageAccessToken}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook fetchLeadData failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    id: string;
    created_time: string;
    field_data: Array<{ name: string; values: string[] }>;
  };

  const result: Record<string, string> = { id: data.id, created_time: data.created_time };
  for (const field of data.field_data ?? []) {
    result[field.name] = field.values?.[0] ?? "";
  }
  return result;
}

export async function getWorkspaceFacebookIntegration(
  workspaceId: string
): Promise<FacebookLeadAdsConfig | null> {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    select: { config: true },
  });
  if (!integration?.config || !isJsonRecord(integration.config)) return null;
  const config = integration.config as unknown as FacebookLeadAdsConfig;
  if (!config.active || !config.pageId) return null;
  return config;
}

export async function findWorkspaceByPageId(
  pageId: string
): Promise<{ workspaceId: string; config: FacebookLeadAdsConfig } | null> {
  const integrations = await prisma.integration.findMany({
    where: { type: INTEGRATION_TYPE },
    select: { workspaceId: true, config: true },
  });

  for (const integration of integrations) {
    if (!isJsonRecord(integration.config)) continue;
    const config = integration.config as unknown as FacebookLeadAdsConfig;
    if (config.active && config.pageId === pageId) {
      return { workspaceId: integration.workspaceId, config };
    }
  }
  return null;
}

export async function updateLastLeadgenAt(workspaceId: string): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    select: { config: true },
  });
  if (!integration?.config || !isJsonRecord(integration.config)) return;

  await prisma.integration.update({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    data: {
      config: {
        ...(integration.config as Record<string, unknown>),
        lastLeadgenAt: new Date().toISOString(),
      },
    },
  });
}
