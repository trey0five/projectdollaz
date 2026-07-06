// Phase 2 — OneRoster 1.1/1.2 REST adapter (Rostering service, /users). Built to the
// documented IMS Global shape and config-gated DARK: most OneRoster REST endpoints are
// per-district customer-gated (no open sandbox), so isConfigured() is false unless the
// server sets the OneRoster OAuth client env keys. The normalizer is unit-tested against
// a synthetic fixture instead of a live call. Auth = OAuth2 client-credentials using the
// source's apiKeyId/apiKeySecret against the provider's token endpoint.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentProviderKey, EnrollmentSource, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentAdapter } from './adapter.js'
import { buildNormalizedSnapshot, type RawStudentRow } from '../enrollment.normalize.js'

interface OneRosterUser {
  role?: string
  status?: string
  grades?: string[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

@Injectable()
export class OneRosterApiAdapter implements EnrollmentAdapter {
  readonly provider: EnrollmentProviderKey = 'oneroster_api'

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (this.config.get<string>('enrollment.oneroster.clientId') ?? '').length > 0
  }

  private async token(source: EnrollmentSource): Promise<string> {
    const tokenUrl = `${source.baseUrl ?? ''}/token`
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${source.apiKeyId ?? ''}:${source.apiKeySecret ?? ''}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roster-core.readonly' }),
    })
    if (!res.ok) throw new Error(`OneRoster token request failed (${res.status})`)
    const data = (await res.json()) as { access_token?: string }
    return data.access_token ?? ''
  }

  async fetch(source: EnrollmentSource, asOf?: string): Promise<NormalizedEnrollmentSnapshot> {
    const token = await this.token(source)
    // GET /ims/oneroster/v1p1/users?filter=role='student' — the roster headcount source.
    const url = `${source.baseUrl ?? ''}/ims/oneroster/v1p1/users?filter=${encodeURIComponent("role='student'")}&limit=10000`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`OneRoster users request failed (${res.status})`)
    const data = (await res.json()) as { users?: OneRosterUser[] }
    const rows: RawStudentRow[] = (data.users ?? [])
      .filter((u) => (u.role ?? '').toLowerCase() === 'student')
      .map((u) => ({ grade: u.grades?.[0] ?? null, status: u.status ?? null }))
    return buildNormalizedSnapshot('oneroster_api', rows, {
      observedOn: asOf ?? todayIso(),
      // OneRoster active-status vocabulary: tobedeleted = withdrawn.
      withdrawnStatuses: ['tobedeleted', 'inactive'],
    })
  }
}
