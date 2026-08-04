// Phase 2 — the enrollment ADAPTER strategy interface. Each SIS/roster provider
// implements this; the service picks one by `provider` and calls fetch() for a
// live sync. Mirrors the QBO connector's split (a stateless client owns HTTP/OAuth;
// the adapters own provider-shape → normalized-snapshot). `isConfigured()` is the
// server-level readiness gate (env keys present) — a provider whose keys are unset
// stays DARK (never advertised, never called) exactly like QboClient.isConfigured().
import type { EnrollmentProviderKey, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentSource } from '@finrep/db'
import type { RawStudentRow } from '../enrollment.normalize.js'
import { buildNormalizedSnapshot } from '../enrollment.normalize.js'

/**
 * What one live pull actually produced: the headcount AND the people it counted.
 *
 * `fetch()` used to return the snapshot alone, and that single fact is why a
 * connected school got a number on the Enrollment page and an EMPTY student
 * register forever — every adapter was already fetching people and then throwing
 * them away one line later, inside buildNormalizedSnapshot. Nothing needed to be
 * requested that wasn't already being requested.
 *
 * `rows` is `[]`, never undefined, and `[]` is a real answer: this provider gave
 * us no identity, so sync counts and creates no records — exactly what a
 * counts-only CSV does on the upload path.
 */
export interface AdapterRoster {
  snapshot: NormalizedEnrollmentSnapshot
  rows: readonly RawStudentRow[]
}

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
  fetch(source: EnrollmentSource, asOf?: string): Promise<AdapterRoster>
}

/**
 * Pair a normalized snapshot with the rows it was built from.
 *
 * Every adapter returns through here so the snapshot and the people it counted
 * are assembled in ONE place: pairing them per-adapter is how they drift, and a
 * snapshot describing one set of rows while `rows` carries another is a bug that
 * would surface as a roster quietly disagreeing with its own headcount.
 */
export function snapshotAndRows(
  provider: EnrollmentProviderKey,
  rows: RawStudentRow[],
  opts: Parameters<typeof buildNormalizedSnapshot>[2],
): AdapterRoster {
  return { snapshot: buildNormalizedSnapshot(provider, rows, opts), rows }
}
