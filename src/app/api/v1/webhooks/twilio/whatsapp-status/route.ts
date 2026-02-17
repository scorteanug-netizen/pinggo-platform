import { OutboundMessageStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { prisma } from "@/server/db";

function buildWebhookUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const actualHost = forwardedHost ?? host ?? "localhost";
  const protocol = forwardedProto ?? (actualHost.includes("localhost") ? "http" : "https");
  const path = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  return `${protocol}://${actualHost}${path}${search}`;
}

function formDataToParams(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params = formDataToParams(formData);

  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  const messageStatus = (params.MessageStatus ?? "").toLowerCase();
  const to = params.To ?? "";
  const from = params.From ?? "";
  const accountSid = params.AccountSid ?? "";

  const skipSignatureCheck = process.env.TWILIO_SKIP_SIGNATURE_CHECK === "true";
  if (!skipSignatureCheck) {
    const authToken =
      process.env.TWILIO_WEBHOOK_SECRET?.trim() ?? process.env.TWILIO_AUTH_TOKEN?.trim();
    if (authToken) {
      const signature = request.headers.get("x-twilio-signature") ?? "";
      const url = buildWebhookUrl(request);
      const isValid = Twilio.validateRequest(authToken, signature, url, params);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
  }

  if (messageSid) {
    const outbound = await prisma.outboundMessage.findFirst({
      where: { providerMessageId: messageSid },
      select: { id: true, leadId: true, status: true },
    });

    if (outbound) {
      let newStatus: OutboundMessageStatus | null = null;
      if (messageStatus === "delivered" || messageStatus === "read") {
        newStatus = OutboundMessageStatus.SENT;
      } else if (messageStatus === "failed" || messageStatus === "undelivered") {
        newStatus = OutboundMessageStatus.FAILED;
      }

      if (newStatus !== null) {
        await prisma.outboundMessage.update({
          where: { id: outbound.id },
          data: {
            status: newStatus,
            ...(newStatus === OutboundMessageStatus.SENT ? { sentAt: new Date() } : {}),
          },
        });
      }

      await prisma.eventLog.create({
        data: {
          leadId: outbound.leadId,
          eventType: "proof_whatsapp_status",
          payload: {
            provider: "twilio",
            providerMessageId: messageSid,
            status: messageStatus,
            to,
            from,
            ...(accountSid ? { accountSid } : {}),
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
