type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

function getSupabaseUrl() {
  // Client bundles can only inline statically referenced NEXT_PUBLIC_* vars.
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (publicUrl) return publicUrl;

  // Server-side fallback (API/routes/middleware).
  if (typeof window === "undefined" && process.env.SUPABASE_URL) {
    return process.env.SUPABASE_URL;
  }

  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
}

function getSupabaseAnonKey() {
  const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (publicAnonKey) return publicAnonKey;

  // Support Supabase publishable key naming if provided.
  const publicPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (publicPublishableKey) return publicPublishableKey;

  if (typeof window === "undefined" && process.env.SUPABASE_ANON_KEY) {
    return process.env.SUPABASE_ANON_KEY;
  }

  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY");
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return {
    url: getSupabaseUrl(),
    anonKey: getSupabaseAnonKey(),
  };
}
