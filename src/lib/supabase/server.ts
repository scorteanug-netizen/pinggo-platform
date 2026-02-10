import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./env";
import { getSupabaseServiceRoleKey } from "./service-role.server";

export function getSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  const cookieStore = cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components may expose a read-only cookie store.
        }
      },
    },
  });
}

export function getSupabaseAdminClient() {
  const config = getSupabasePublicConfig();
  return createClient(config.url, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
