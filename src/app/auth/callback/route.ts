import { NextRequest, NextResponse } from "next/server";
import { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/env";
import { sanitizeNextPath } from "@/lib/routes";

function isEmailOtpType(value: string | null): value is EmailOtpType {
  if (!value) return false;
  return ["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(value);
}

export async function GET(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicConfig();
  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get("type");
  const defaultNextPath = type === "invite" || type === "recovery" ? "/auth/set-password" : "/dashboard";
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"), defaultNextPath);
  let response = NextResponse.redirect(new URL(nextPath, request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const token = requestUrl.searchParams.get("token");
  const email = requestUrl.searchParams.get("email");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
    }
    return response;
  }

  if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
    }
    return response;
  }

  if (token && email && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token,
      email,
      type,
    });
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
    }
    return response;
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
