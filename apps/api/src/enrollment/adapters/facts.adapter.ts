// Phase 2 — FACTS SIS (Renweb) adapter. Built to the documented FACTS Family/SIS API
// shape and config-gated DARK: FACTS access is per-school customer-gated (no open
// sandbox), so isConfigured() is false unless the server sets the FACTS env keys — the
// normalizer is the unit-tested seam. Auth = a subscription/API key header + the
// school's district credentials on the source.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentProviderKey, EnrollmentSource, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentAdapter } from './adapter.js'
import { buildNormalizedSnapshot, type RawStudentRow } from '../enrollment.normalize.js'

interface FactsStudent {
  gradeLevel?: string
  grade?: string
  status?: string
  enrollmentStatus?: string
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

  async fetch(source: EnrollmentSource, asOf?: string): Promise<NormalizedEnrollmentSnapshot> {
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
    }))
    return buildNormalizedSnapshot('facts', rows, { observedOn: asOf ?? todayIso() })
  }
}
