// Phase 2 — FACTS SIS (Renweb) adapter. Built to the documented FACTS Family/SIS API
// shape and config-gated DARK: FACTS access is per-school customer-gated (no open
// sandbox), so isConfigured() is false unless the server sets the FACTS env keys — the
// normalizer is the unit-tested seam. Auth = a subscription/API key header + the
// school's district credentials on the source.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentProviderKey, EnrollmentSource } from '@finrep/db'
import type { AdapterRoster, EnrollmentAdapter } from './adapter.js'
import { snapshotAndRows } from './adapter.js'
import type { RawStudentRow } from '../enrollment.normalize.js'

interface FactsStudent {
  gradeLevel?: string
  grade?: string
  status?: string
  enrollmentStatus?: string
// ── Identity, read from the SAME row the headcount already came from. Optional
// on RawStudentRow, so a deployment whose provider omits them keeps today's
// counts-only sync unchanged. This connector is config-gated dark, so the field
// names are mapped defensively from the documented shape rather than verified
// against a live tenant — an absent field is null, never a guess.
  studentId?: string | number
  id?: string | number
  firstName?: string
  lastName?: string
  birthDate?: string
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
export class FactsAdapter implements EnrollmentAdapter {
  readonly provider: EnrollmentProviderKey = 'facts'

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (this.config.get<string>('enrollment.facts.clientId') ?? '').length > 0
  }

  async fetch(source: EnrollmentSource, asOf?: string): Promise<AdapterRoster> {
    // GET {baseUrl}/school/v1/students — the current enrollment roster.
    const url = `${source.baseUrl ?? ''}/school/v1/students`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // FACTS uses an app subscription key plus the school's own credential id.
        'Ocp-Apim-Subscription-Key': source.subscriptionKey ?? this.config.get<string>('enrollment.facts.apiKey') ?? '',
        Authorization: `Bearer ${source.apiKeySecret ?? ''}`,
      },
    })
    if (!res.ok) throw new Error(`FACTS students request failed (${res.status})`)
    const data = (await res.json()) as { students?: FactsStudent[] }
    const rows: RawStudentRow[] = (data.students ?? []).map((s) => ({
      grade: s.gradeLevel ?? s.grade ?? null,
      status: s.status ?? s.enrollmentStatus ?? null,
      externalId: s.studentId != null ? String(s.studentId) : s.id != null ? String(s.id) : null,
      firstName: s.firstName ?? null,
      lastName: s.lastName ?? null,
      birthDate: isoDateOrNull(s.birthDate),
    }))
    return snapshotAndRows('facts', rows, { observedOn: asOf ?? todayIso() })
  }
}
