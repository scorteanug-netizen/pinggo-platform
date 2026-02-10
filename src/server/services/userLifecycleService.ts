import { MembershipRole } from "@prisma/client";
import { Resend } from "resend";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type LinkDelivery = "email" | "link";

type GeneratedLifecycleLink = {
  link: string;
  hashedToken: string | null;
  supabaseUserId: string | null;
  delivery: LinkDelivery;
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function getActionLinkFromResponse(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const properties = (data as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return null;
  const actionLink = (properties as { action_link?: unknown }).action_link;
  return typeof actionLink === "string" && actionLink.trim().length > 0 ? actionLink : null;
}

function getHashedTokenFromResponse(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const properties = (data as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return null;
  const hashedToken = (properties as { hashed_token?: unknown }).hashed_token;
  return typeof hashedToken === "string" && hashedToken.trim().length > 0 ? hashedToken : null;
}

function getSupabaseUserIdFromResponse(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const userId = (user as { id?: unknown }).id;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

function getAuthCallbackUrl(requestUrl: string) {
  const callbackUrl = new URL("/auth/callback", requestUrl);
  callbackUrl.searchParams.set("next", "/auth/set-password");
  return callbackUrl.toString();
}

async function maybeSendEmail(params: {
  to: string;
  subject: string;
  title: string;
  body: string;
  actionLink: string;
}) {
  if (!resend) {
    return false;
  }

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Pinggo <onboarding@resend.dev>",
    to: params.to,
    subject: params.subject,
    html: [
      `<p><strong>${params.title}</strong></p>`,
      `<p>${params.body}</p>`,
      `<p><a href="${params.actionLink}">${params.actionLink}</a></p>`,
      "<p>Linkul este one-time si expira conform politicii de securitate.</p>",
    ].join(""),
  });

  return true;
}

async function generateRecoveryLink(params: {
  email: string;
  requestUrl: string;
}) {
  const adminClient = getSupabaseAdminClient();
  return adminClient.auth.admin.generateLink({
    type: "recovery",
    email: params.email,
    options: {
      redirectTo: getAuthCallbackUrl(params.requestUrl),
    },
  });
}

export async function generateInviteLifecycleLink(params: {
  email: string;
  name?: string | null;
  role: MembershipRole;
  workspaceId: string;
  workspaceName: string;
  requestUrl: string;
}): Promise<GeneratedLifecycleLink> {
  const adminClient = getSupabaseAdminClient();
  const metadata = {
    name: params.name?.trim() ?? "",
    workspaceId: params.workspaceId,
    workspaceName: params.workspaceName,
    role: params.role,
  };
  const callbackUrl = getAuthCallbackUrl(params.requestUrl);

  let generated = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: params.email,
    options: {
      redirectTo: callbackUrl,
      data: metadata,
    },
  });

  if (generated.error) {
    const recovery = await generateRecoveryLink({
      email: params.email,
      requestUrl: params.requestUrl,
    });
    if (recovery.error) {
      throw new Error(generated.error.message || recovery.error.message || "Nu am putut genera linkul de invitatie.");
    }
    generated = recovery;
  }

  const link = getActionLinkFromResponse(generated.data);
  if (!link) {
    throw new Error("Nu am putut genera linkul de invitatie.");
  }

  const hashedToken = getHashedTokenFromResponse(generated.data);
  const supabaseUserId = getSupabaseUserIdFromResponse(generated.data);

  let delivery: LinkDelivery = "link";
  try {
    const emailed = await maybeSendEmail({
      to: params.email,
      subject: "Invitatie Pinggo",
      title: "Ai fost invitat in Pinggo",
      body: `Acceseaza linkul de mai jos pentru a activa contul in compania ${params.workspaceName}.`,
      actionLink: link,
    });
    if (emailed) {
      delivery = "email";
    }
  } catch {
    delivery = "link";
  }

  return {
    link,
    hashedToken,
    supabaseUserId,
    delivery,
  };
}

export async function generateResetPasswordLifecycleLink(params: {
  email: string;
  name?: string | null;
  requestUrl: string;
}): Promise<GeneratedLifecycleLink> {
  const generated = await generateRecoveryLink({
    email: params.email,
    requestUrl: params.requestUrl,
  });

  if (generated.error) {
    throw new Error(generated.error.message || "Nu am putut genera linkul de resetare.");
  }

  const link = getActionLinkFromResponse(generated.data);
  if (!link) {
    throw new Error("Nu am putut genera linkul de resetare.");
  }

  const hashedToken = getHashedTokenFromResponse(generated.data);
  const supabaseUserId = getSupabaseUserIdFromResponse(generated.data);

  let delivery: LinkDelivery = "link";
  try {
    const emailed = await maybeSendEmail({
      to: params.email,
      subject: "Resetare parola Pinggo",
      title: "Link resetare parola",
      body: "Acceseaza linkul de mai jos pentru a seta o parola noua.",
      actionLink: link,
    });
    if (emailed) {
      delivery = "email";
    }
  } catch {
    delivery = "link";
  }

  return {
    link,
    hashedToken,
    supabaseUserId,
    delivery,
  };
}
