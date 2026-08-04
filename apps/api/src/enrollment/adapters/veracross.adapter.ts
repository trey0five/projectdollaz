// Phase 2 — Veracross adapter (Veracross API v3, OAuth2 client-credentials). Built to
// the documented shape and config-gated DARK: Veracross API access is per-school
// customer-gated (no open sandbox), so isConfigured() is false unless the server sets
// the Veracross env keys — the normalizer is the unit-tested seam. The source carries
// the school's client id/secret; the token endpoint issues a short-lived bearer.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentProviderKey, EnrollmentSource } from '@finrep/db'
import type { AdapterRoster, EnrollmentAdapter } from './adapter.js'
import { snapshotAndRows } from './adapter.js'
import type { RawStudentRow } from '../enrollment.normalize.js'

interface VeracrossStudent {
  grade_level?: string
  grade?: string
  status?: string
  enrollment_status?: string
// ── Identity, read from the SAME row the headcount already came from. Optional
// on RawStudentRow, so a deployment whose provider omits them keeps today's
// counts-only sync unchanged. This connector is config-gated dark, so the field
// names are mapped defensively from the documented shape rather than verified
// against a live tenant — an absent field is null, never a guess.
  person_pk?: string | number
  id?: string | number
  first_name?: string
  last_name?: string
  birth_date?: string
}

/** yyyy-mm-dd or nothing — a birth date is only ever a match FALLBACK. */
function isoDateOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim())
  return m ? m[1]! : null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

@Injectable()
export class VeracrossAdapter implements EnrollmentAdapter {
  readonly provider: EnrollmentProviderKey = 'veracross'

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (this.config.get<string>('enrollment.veracross.clientId') ?? '').length > 0
  }

  private async token(source: EnrollmentSource): Promise<string> {
    const res = await fetch(`${source.baseUrl ?? ''}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: source.apiKeyId ?? '',
        client_secret: source.apiKeySecret ?? '',
        scope: 'students:list',
      }),
    })
    if (!res.ok) throw new Error(`Veracross token request failed (${res.status})`)
    const data = (await res.json()) as { access_token?: string }
    return data.access_token ?? ''
  }

  async fetch(source: EnrollmentSource, asOf?: string): Promise<AdapterRoster> {
    const token = await this.token(source)
    // GET {baseUrl}/v3/students?enrollment_status=active — the current roster.
    const res = await fetch(`${source.baseUrl ?? ''}/v3/students`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'X-API-Value-Lists': 'include',
      },
    })
    if (!res.ok) throw new Error(`Veracross students request failed (${res.status})`)
    const data = (await res.json()) as { data?: VeracrossStudent[] }
    const rows: RawStudentRow[] = (data.data ?? []).map((s) => ({
      grade: s.grade_level ?? s.grade ?? null,
      status: s.status ?? s.enrollment_status ?? null,
      externalId: s.person_pk != null ? String(s.person_pk) : s.id != null ? String(s.id) : null,
      firstName: s.first_name ?? null,
      lastName: s.last_name ?? null,
      birthDate: isoDateOrNull(s.birth_date),
    }))
    return snapshotAndRows('veracross', rows, { observedOn: asOf ?? todayIso() })
  }
}
