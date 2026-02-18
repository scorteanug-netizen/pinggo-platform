import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { LeadSourceType } from "@prisma/client";
import { prisma } from "../db";

export const WEBHOOK_INGEST_PATH = "/api/v1/leads/ingest";
const WEBHOOK_INTEGRATION_TYPE = "WEBHOOK";
const WEBHOOK_LAST_24H_EVENT_TYPES = ["lead_received", "lead_updated"] as const;
const WEBHOOK_INGEST_SOURCE_TYPES: LeadSourceType[] = [
  "WEBHOOK",
  "FORM",
  "CRM",
  "EMAIL",
  "WHATSAPP",
  "API",
  "FACEBOOK",
];
const WEBHOOK_INGEST_SOURCE_TYPES_FALLBACK: LeadSourceType[] = ["WEBHOOK", "EMAIL", "API"];

type WebhookIntegrationConfig = {
  token?: string; // legacy plaintext token for backward compatibility
  tokenId?: string;
  tokenHash?: string;
  tokenCreatedAt?: string;
  lastRotatedAt?: string;
  lastReceivedAt?: string;
  lastEventType?: string;
  lastReceivedSource?: string;
  lastReceivedLeadId?: string;
  active: boolean;
  endpointPath: string;
};

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWebhookTokenId(config: unknown): string | null {
  if (!isJsonRecord(config)) return null;
  const tokenId = config.tokenId;
  return typeof tokenId === "string" && tokenId.trim().length > 0 ? tokenId : null;
}

function readWebhookToken(config: unknown): string | null {
  if (!isJsonRecord(config)) return null;
  const token = config.token;
  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

function readWebhookTokenHash(config: unknown): string | null {
  if (!isJsonRecord(config)) return null;
  const tokenHash = config.tokenHash;
  return typeof tokenHash === "string" && tokenHash.trim().length > 0 ? tokenHash : null;
}

function readWebhookActive(config: unknown): boolean {
  if (!isJsonRecord(config)) return false;
  return config.active === true;
}

function readWebhookEndpointPath(config: unknown): string | null {
  if (!isJsonRecord(config)) return null;
  const endpointPath = config.endpointPath;
  return typeof endpointPath === "string" && endpointPath.trim().length > 0 ? endpointPath : null;
}

function readWebhookIsoField(config: unknown, key: "tokenCreatedAt" | "lastRotatedAt" | "lastReceivedAt") {
  if (!isJsonRecord(config)) return null;
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function readWebhookStringField(config: unknown, key: "lastEventType" | "lastReceivedSource" | "lastReceivedLeadId") {
  if (!isJsonRecord(config)) return null;
  const value = config[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function generateWebhookToken() {
  return randomBytes(16).toString("hex");
}

function getWebhookTokenSecret() {
  return (
    process.env.PINGGO_WEBHOOK_TOKEN_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "pinggo-webhook-dev-secret"
  );
}

function buildSignedWebhookToken(workspaceId: string, tokenId: string) {
  const signature = createHmac("sha256", getWebhookTokenSecret())
    .update(`${workspaceId}:${tokenId}`)
    .digest("base64url");
  return `${tokenId}.${signature}`;
}

function hashWebhookToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isLeadSourceTypeEnumMismatch(error: unknown) {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message: string }).message ?? "")
      : String(error ?? "");

  return /invalid input value for enum\s+\\?"LeadSourceType\\?"/.test(message);
}

function buildFreshWebhookTokenData(workspaceId: string) {
  const tokenId = generateWebhookToken();
  const token = buildSignedWebhookToken(workspaceId, tokenId);
  const now = new Date().toISOString();
  return {
    tokenId,
    token,
    tokenHash: hashWebhookToken(token),
    tokenCreatedAt: now,
    lastRotatedAt: now,
  };
}

function normalizeWebhookConfig(existingConfig: unknown, workspaceId: string) {
  const existingRecord = isJsonRecord(existingConfig) ? existingConfig : {};
  const existingTokenId = readWebhookTokenId(existingConfig);
  const existingLegacyToken = readWebhookToken(existingConfig);
  const now = new Date().toISOString();

  let token = existingLegacyToken;
  let tokenId = existingTokenId;
  let tokenHash = readWebhookTokenHash(existingConfig);
  let tokenCreatedAt = readWebhookIsoField(existingConfig, "tokenCreatedAt");
  let lastRotatedAt = readWebhookIsoField(existingConfig, "lastRotatedAt");

  if (tokenId) {
    token = buildSignedWebhookToken(workspaceId, tokenId);
    // Keep hash aligned with the deterministic token even if secret changed.
    tokenHash = hashWebhookToken(token);
  }

  if (!token) {
    const fresh = buildFreshWebhookTokenData(workspaceId);
    token = fresh.token;
    tokenId = fresh.tokenId;
    tokenHash = fresh.tokenHash;
    tokenCreatedAt = fresh.tokenCreatedAt;
    lastRotatedAt = fresh.lastRotatedAt;
  }

  if (!tokenHash) {
    tokenHash = hashWebhookToken(token);
  }
  if (!tokenCreatedAt) {
    tokenCreatedAt = now;
  }
  if (!lastRotatedAt) {
    lastRotatedAt = tokenCreatedAt;
  }

  const nextRecord: JsonRecord = {
    ...existingRecord,
    active: true,
    endpointPath: WEBHOOK_INGEST_PATH,
    tokenHash,
    tokenCreatedAt,
    lastRotatedAt,
  };
  if (tokenId) {
    nextRecord.tokenId = tokenId;
    // Remove legacy plaintext token once deterministic token is available.
    if ("token" in nextRecord) {
      delete nextRecord.token;
    }
  } else if (existingLegacyToken) {
    // Transitional fallback for legacy rows.
    nextRecord.token = existingLegacyToken;
  }

  return {
    token,
    config: nextRecord as WebhookIntegrationConfig,
  };
}

export function buildWorkspaceWebhookEndpoint() {
  return WEBHOOK_INGEST_PATH;
}

export async function ensureWorkspaceWebhookIntegration(workspaceId: string) {
  const existing = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    select: { id: true, config: true },
  });

  const normalized = normalizeWebhookConfig(existing?.config, workspaceId);
  const isActive = readWebhookActive(existing?.config);
  const endpointPath = readWebhookEndpointPath(existing?.config);
  const tokenHash = readWebhookTokenHash(existing?.config);
  const normalizedTokenHash = readWebhookTokenHash(normalized.config);
  const tokenCreatedAt = readWebhookIsoField(existing?.config, "tokenCreatedAt");
  const lastRotatedAt = readWebhookIsoField(existing?.config, "lastRotatedAt");
  const hasTokenHashMismatch = tokenHash !== normalizedTokenHash;

  if (
    !existing ||
    !isActive ||
    endpointPath !== WEBHOOK_INGEST_PATH ||
    !tokenHash ||
    !tokenCreatedAt ||
    !lastRotatedAt ||
    hasTokenHashMismatch
  ) {
    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
      create: {
        workspaceId,
        type: WEBHOOK_INTEGRATION_TYPE,
        config: normalized.config,
      },
      update: {
        config: normalized.config,
      },
    });
  }

  return {
    token: normalized.token,
    endpoint: buildWorkspaceWebhookEndpoint(),
    tokenCreatedAt:
      readWebhookIsoField(normalized.config, "tokenCreatedAt") ?? new Date().toISOString(),
    lastRotatedAt:
      readWebhookIsoField(normalized.config, "lastRotatedAt") ?? new Date().toISOString(),
    lastReceivedAt: readWebhookIsoField(normalized.config, "lastReceivedAt"),
    lastEventType: readWebhookStringField(normalized.config, "lastEventType"),
    lastReceivedSource: readWebhookStringField(normalized.config, "lastReceivedSource"),
    lastReceivedLeadId: readWebhookStringField(normalized.config, "lastReceivedLeadId"),
  };
}

export async function getWorkspaceIntegrationStatus(workspaceId: string) {
  const integrations = await prisma.integration.findMany({
    where: { workspaceId },
    select: { type: true, config: true },
  });

  const map = new Map(integrations.map((integration) => [integration.type, integration.config]));
  return {
    webhookInbound: readWebhookActive(map.get("WEBHOOK")),
    emailForward: readWebhookActive(map.get("EMAIL_FORWARD")),
    whatsappProvider: readWebhookActive(map.get("WHATSAPP_PROVIDER")),
    slack: readWebhookActive(map.get("SLACK")),
    googleCalendar: readWebhookActive(map.get("GOOGLE_CALENDAR")),
    facebookLeadAds: readWebhookActive(map.get("FACEBOOK_LEAD_ADS")),
  };
}

export async function getWorkspaceWebhookToken(workspaceId: string) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    select: { config: true },
  });
  const tokenId = readWebhookTokenId(integration?.config);
  if (tokenId) {
    return buildSignedWebhookToken(workspaceId, tokenId);
  }
  return readWebhookToken(integration?.config);
}

export async function validateWorkspaceWebhookToken(workspaceId: string, providedToken: string) {
  const resolved = await resolveWorkspaceByWebhookToken(providedToken);
  return Boolean(resolved && resolved.workspaceId === workspaceId);
}

export async function resolveWorkspaceByWebhookToken(providedToken: string) {
  const trimmedToken = providedToken.trim();
  if (!trimmedToken) {
    return null;
  }

  const incomingHash = hashWebhookToken(trimmedToken);
  const byHash = await prisma.integration.findFirst({
    where: {
      type: WEBHOOK_INTEGRATION_TYPE,
      workspace: {
        disabledAt: null,
      },
      config: {
        path: ["tokenHash"],
        equals: incomingHash,
      },
    },
    select: {
      workspaceId: true,
      config: true,
    },
  });

  if (byHash && readWebhookActive(byHash.config)) {
    return {
      workspaceId: byHash.workspaceId,
    };
  }

  const activeIntegrations = await prisma.integration.findMany({
    where: {
      type: WEBHOOK_INTEGRATION_TYPE,
      workspace: {
        disabledAt: null,
      },
    },
    select: {
      workspaceId: true,
      config: true,
    },
  });

  for (const item of activeIntegrations) {
    if (!readWebhookActive(item.config)) continue;

    const storedHash = readWebhookTokenHash(item.config);
    if (storedHash && secureCompare(incomingHash, storedHash)) {
      return {
        workspaceId: item.workspaceId,
      };
    }

    const legacyToken = readWebhookToken(item.config);
    if (legacyToken && secureCompare(trimmedToken, legacyToken)) {
      return {
        workspaceId: item.workspaceId,
      };
    }
  }

  return null;
}

export async function rotateWorkspaceWebhookToken(workspaceId: string) {
  const existing = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    select: { config: true },
  });

  const existingRecord = isJsonRecord(existing?.config) ? existing.config : {};
  const { token: _legacyToken, ...rest } = existingRecord;
  const nextToken = buildFreshWebhookTokenData(workspaceId);

  const nextConfig = {
    ...rest,
    active: true,
    endpointPath: WEBHOOK_INGEST_PATH,
    tokenId: nextToken.tokenId,
    tokenHash: nextToken.tokenHash,
    tokenCreatedAt: nextToken.tokenCreatedAt,
    lastRotatedAt: nextToken.lastRotatedAt,
  } as WebhookIntegrationConfig;

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    create: {
      workspaceId,
      type: WEBHOOK_INTEGRATION_TYPE,
      config: nextConfig,
    },
    update: {
      config: nextConfig,
    },
  });

  return {
    token: nextToken.token,
    endpoint: buildWorkspaceWebhookEndpoint(),
    tokenCreatedAt: nextToken.tokenCreatedAt,
    lastRotatedAt: nextToken.lastRotatedAt,
  };
}

export async function markWorkspaceWebhookReceived(
  workspaceId: string,
  params: {
    source: string;
    leadId: string;
  }
) {
  const existing = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    select: { config: true },
  });

  const normalized = normalizeWebhookConfig(existing?.config, workspaceId);
  const receivedAt = new Date().toISOString();
  const nextConfig = {
    ...normalized.config,
    lastReceivedAt: receivedAt,
    lastEventType: params.source,
    lastReceivedSource: params.source,
    lastReceivedLeadId: params.leadId,
  } as WebhookIntegrationConfig;

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    create: {
      workspaceId,
      type: WEBHOOK_INTEGRATION_TYPE,
      config: nextConfig,
    },
    update: {
      config: nextConfig,
    },
  });
}

export async function getWorkspaceWebhookIngestStatus(workspaceId: string) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: WEBHOOK_INTEGRATION_TYPE } },
    select: { config: true },
  });

  const now = new Date();
  const last24hThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let totalEventsLast24h: number;

  try {
    totalEventsLast24h = await prisma.leadEvent.count({
      where: {
        workspaceId,
        type: { in: [...WEBHOOK_LAST_24H_EVENT_TYPES] },
        createdAt: { gte: last24hThreshold },
        lead: {
          sourceType: { in: WEBHOOK_INGEST_SOURCE_TYPES },
        },
      },
    });
  } catch (error) {
    if (!isLeadSourceTypeEnumMismatch(error)) {
      throw error;
    }

    totalEventsLast24h = await prisma.leadEvent.count({
      where: {
        workspaceId,
        type: { in: [...WEBHOOK_LAST_24H_EVENT_TYPES] },
        createdAt: { gte: last24hThreshold },
        lead: {
          sourceType: { in: WEBHOOK_INGEST_SOURCE_TYPES_FALLBACK },
        },
      },
    });
  }

  return {
    lastReceivedAt: readWebhookIsoField(integration?.config, "lastReceivedAt"),
    lastReceivedSource: readWebhookStringField(integration?.config, "lastReceivedSource"),
    lastReceivedLeadId: readWebhookStringField(integration?.config, "lastReceivedLeadId"),
    lastEventType: readWebhookStringField(integration?.config, "lastEventType"),
    totalEventsLast24h,
  };
}
