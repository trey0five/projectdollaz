// Phase 2 — the enrollment ADAPTER strategy interface. Each SIS/roster provider
// implements this; the service picks one by `provider` and calls fetch() for a
// live sync. Mirrors the QBO connector's split (a stateless client owns HTTP/OAuth;
// the adapters own provider-shape → normalized-snapshot). `isConfigured()` is the
// server-level readiness gate (env keys present) — a provider whose keys are unset
// stays DARK (never advertised, never called) exactly like QboClient.isConfigured().
import type { EnrollmentProviderKey, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentSource } from '@finrep/db'

export interface EnrollmentAdapter {
  /** The provider this adapter handles — matches the Prisma EnrollmentProvider enum. */
  readonly provider: EnrollmentProviderKey
  /** True when this server has the env credentials to actually talk to the provider. */
  isConfigured(): boolean
  /**
   * Pull a roster as of `asOf` (ISO yyyy-mm-dd; defaults to today) and normalize it.
   * `source` carries the per-school creds (already token-refreshed by the service for
   * OAuth providers). Throws for providers with no live fetch (oneroster_csv → upload).
   */
  fetch(source: EnrollmentSource, asOf?: string): Promise<NormalizedEnrollmentSnapshot>
}
