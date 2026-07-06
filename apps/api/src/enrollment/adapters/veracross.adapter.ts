// Phase 2 — Veracross adapter (Veracross API v3, OAuth2 client-credentials). Built to
// the documented shape and config-gated DARK: Veracross API access is per-school
// customer-gated (no open sandbox), so isConfigured() is false unless the server sets
// the Veracross env keys — the normalizer is the unit-tested seam. The source carries
// the school's client id/secret; the token endpoint issues a short-lived bearer.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentProviderKey, EnrollmentSource, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentAdapter } from './adapter.js'
import { buildNormalizedSnapshot, type RawStudentRow } from '../enrollment.normalize.js'

interface VeracrossStudent {
  grade_level?: string
  grade?: string
  status?: string
  enrollment_status?: string
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

  async fetch(source: EnrollmentSource, asOf?: string): Promise<NormalizedEnrollmentSnapshot> {
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
    }))
    return buildNormalizedSnapshot('veracross', rows, { observedOn: asOf ?? todayIso() })
  }
}
