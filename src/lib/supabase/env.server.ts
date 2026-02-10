export function getSuperAdminEmails() {
  const raw = process.env.PINGGO_SUPER_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isConfiguredSuperAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getSuperAdminEmails().includes(normalized);
}
