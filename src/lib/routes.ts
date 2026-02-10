const ROUTE_ALIASES: Record<string, string> = {
  "/setari": "/settings",
  "/rapoarte": "/reports",
  "/integrari": "/integrations",
  "/companii": "/companies",
  "/useri": "/users",
  "/leaduri": "/leads",
  "/fluxuri": "/flows",
};

const KNOWN_PREFIXES = [
  "/",
  "/login",
  "/dashboard",
  "/leads",
  "/companies",
  "/users",
  "/flows",
  "/settings",
  "/reports",
  "/integrations",
  "/notifications",
  "/auth/",
  "/app",
];

function normalizePathname(pathname: string) {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

export function resolveRouteAlias(pathname: string) {
  const normalized = normalizePathname(pathname);
  return ROUTE_ALIASES[normalized] ?? normalized;
}

export function isKnownAppPath(pathname: string) {
  return KNOWN_PREFIXES.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function sanitizeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, "http://localhost");
  } catch {
    return fallback;
  }

  if (!parsed.pathname.startsWith("/")) return fallback;

  const canonicalPath = resolveRouteAlias(parsed.pathname);
  if (!isKnownAppPath(canonicalPath)) return fallback;

  return `${canonicalPath}${parsed.search}`;
}

