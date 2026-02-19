import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  findWorkspaceByPageId,
  fetchLeadData,
  updateLastLeadgenAt,
} from "@/server/services/facebookLeadAdsService";
import { logger } from "@/lib/logger";

// GET: Facebook webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 403 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// POST: Facebook leadgen webhook event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entries = body.entry as Array<{
      id: string;
      changes: Array<{
        field: string;
        value: { leadgen_id: string; page_id: string; created_time: number };
      }>;
    }> | undefined;

    if (!entries) {
      // Facebook sometimes sends test payloads
      return NextResponse.json({ ok: true });
    }

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, page_id } = change.value;
        if (!leadgen_id || !page_id) continue;

        try {
          await processLeadgenEvent(leadgen_id, page_id);
        } catch (err) {
          logger.error({ err, leadgen_id, page_id }, "Failed to process Facebook leadgen event");
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error(error, "Facebook leadgen webhook error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function processLeadgenEvent(leadgenId: string, pageId: string) {
  const workspace = await findWorkspaceByPageId(pageId);
  if (!workspace) {
    logger.warn({ pageId }, "No workspace found for Facebook page");
    return;
  }

  const { workspaceId, config } = workspace;

  // Fetch lead data from Facebook
  const leadData = await fetchLeadData(leadgenId, config.pageAccessToken);

  // Map Facebook fields to identity
  const identity = {
    name: leadData.full_name || leadData.first_name || null,
    email: leadData.email || null,
    phone: leadData.phone_number || leadData.phone || null,
    company: leadData.company_name || null,
  };

  // Create lead via direct DB (not ingest endpoint — we're already inside the system)
  const lead = await prisma.$transaction(async (tx) => {
    const newLead = await tx.lead.create({
      data: {
        workspaceId,
        sourceType: "FACEBOOK",
        externalId: leadgenId,
        firstName: identity.name,
        email: identity.email,
        phone: identity.phone,
        status: "NEW",
      },
      select: { id: true },
    });

    if (identity.name || identity.email || identity.phone || identity.company) {
      await tx.leadIdentity.upsert({
        where: { leadId: newLead.id },
        create: {
          leadId: newLead.id,
          name: identity.name ?? undefined,
          email: identity.email ?? undefined,
          phone: identity.phone ?? undefined,
          company: identity.company ?? undefined,
          meta: leadData as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
        update: {
          name: identity.name ?? undefined,
          email: identity.email ?? undefined,
          phone: identity.phone ?? undefined,
          company: identity.company ?? undefined,
          meta: leadData as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    }

    await tx.leadEvent.create({
      data: {
        leadId: newLead.id,
        workspaceId,
        type: "lead_received",
        payload: {
          source: "FACEBOOK",
          leadgenId,
          pageId,
          fbData: leadData,
        },
      },
    });

    await tx.leadEvent.create({
      data: {
        leadId: newLead.id,
        workspaceId,
        type: "facebook_leadgen_received",
        payload: {
          leadgenId,
          pageId,
          pageName: config.pageName,
        },
      },
    });

    return newLead;
  });

  await updateLastLeadgenAt(workspaceId);

  logger.info({ leadId: lead.id, leadgenId, workspaceId }, "Facebook lead created");
}
