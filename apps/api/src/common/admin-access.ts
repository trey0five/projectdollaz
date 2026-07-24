// ─────────────────────────────────────────────────────────────────────────────
// Effective-admin math — PURE over primitives (no ConfigService/Prisma coupling)
// so it is the SINGLE source of truth reused by both the guards (which read the
// ConfigService) and AuthService.me() (which reads its own stored fields).
//
// Effective admin = the DB `isAdmin` flag OR the env ADMIN_EMAILS allowlist OR the
// bootstrap super-admin. The super-admin username is ALSO folded into ADMIN_EMAILS
// by configuration.ts, so env-membership already subsumes the super-admin — the OR
// is deliberately redundant and fail-safe: the super-admin can never lose access.
// ─────────────────────────────────────────────────────────────────────────────

/** True iff the email is the configured bootstrap super-admin (case/space-normalized). */
export function computeIsSuperadmin(
  email: string,
  superadminUsername: string | null,
): boolean {
  if (!superadminUsername) return false
  return email.trim().toLowerCase() === superadminUsername
}

/**
 * True iff the user is an effective platform admin. `adminEmails` is expected to be
 * already trimmed/lowercased (configuration.ts normalizes it). The DB flag alone is
 * sufficient — so a granted admin passes even when the env allowlist is empty.
 */
export function computeIsEffectiveAdmin(
  user: { email: string; isAdmin: boolean },
  adminEmails: string[],
  superadminUsername: string | null,
): boolean {
  if (user.isAdmin === true) return true
  const email = user.email.trim().toLowerCase()
  if (adminEmails.includes(email)) return true
  return computeIsSuperadmin(email, superadminUsername)
}
