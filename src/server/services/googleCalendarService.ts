import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

const INTEGRATION_TYPE = "GOOGLE_CALENDAR";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarConfig = {
  active: boolean;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number; // unix timestamp seconds
  accountEmail: string;
  connectedAt: string;
  connectedByUserId: string;
  calendarId?: string; // defaults to "primary"
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleOAuthUrl(workspaceId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events email profile",
    access_type: "offline",
    prompt: "consent",
    state: workspaceId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${body}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Fetch user email
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = (await userInfoRes.json()) as { email?: string };

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    email: userInfo.email ?? "unknown",
  };
}

export async function connectGoogleCalendar(
  workspaceId: string,
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number; email: string }
): Promise<void> {
  const config: GoogleCalendarConfig = {
    active: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
    accountEmail: tokens.email,
    connectedAt: new Date().toISOString(),
    connectedByUserId: userId,
    calendarId: "primary",
  };

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    create: { workspaceId, type: INTEGRATION_TYPE, config: config as unknown as import("@prisma/client").Prisma.InputJsonValue },
    update: { config: config as unknown as import("@prisma/client").Prisma.InputJsonValue },
  });
}

export async function disconnectGoogleCalendar(workspaceId: string): Promise<void> {
  await prisma.integration.deleteMany({
    where: { workspaceId, type: INTEGRATION_TYPE },
  });
}

async function refreshAccessTokenIfNeeded(
  workspaceId: string,
  config: GoogleCalendarConfig
): Promise<GoogleCalendarConfig> {
  const now = Math.floor(Date.now() / 1000);
  // Refresh if token expires within 5 minutes
  if (config.tokenExpiresAt > now + 300) {
    return config;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const updatedConfig: GoogleCalendarConfig = {
    ...config,
    accessToken: data.access_token,
    tokenExpiresAt: now + data.expires_in,
  };

  await prisma.integration.update({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    data: { config: updatedConfig as unknown as import("@prisma/client").Prisma.InputJsonValue },
  });

  return updatedConfig;
}

export async function createCalendarEvent(
  workspaceId: string,
  params: {
    summary: string;
    description?: string;
    startTime: string; // ISO 8601
    endTime: string; // ISO 8601
    attendeeEmail?: string;
  }
): Promise<{ eventId: string; meetLink: string | null }> {
  const config = await getWorkspaceGoogleCalendarIntegration(workspaceId);
  if (!config) {
    throw new Error("Google Calendar not connected for this workspace");
  }

  const refreshedConfig = await refreshAccessTokenIfNeeded(workspaceId, config);
  const calendarId = refreshedConfig.calendarId || "primary";

  const eventBody: Record<string, unknown> = {
    summary: params.summary,
    description: params.description ?? "",
    start: { dateTime: params.startTime },
    end: { dateTime: params.endTime },
    conferenceData: {
      createRequest: {
        requestId: `pinggo-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  if (params.attendeeEmail) {
    eventBody.attendees = [{ email: params.attendeeEmail }];
  }

  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${refreshedConfig.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar createEvent failed: ${res.status} ${body}`);
  }

  const event = (await res.json()) as {
    id: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string }> };
  };

  const meetLink =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((ep) => ep.uri?.includes("meet.google.com"))?.uri ??
    null;

  return { eventId: event.id, meetLink };
}

export async function getWorkspaceGoogleCalendarIntegration(
  workspaceId: string
): Promise<GoogleCalendarConfig | null> {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: INTEGRATION_TYPE } },
    select: { config: true },
  });
  if (!integration?.config || !isJsonRecord(integration.config)) return null;
  const config = integration.config as unknown as GoogleCalendarConfig;
  if (!config.active || !config.refreshToken) return null;
  return config;
}
