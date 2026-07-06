// Phase 2 — Blackbaud SKY (Education Management) adapter: the LIVE-verifiable SIS.
// OAuth2 + a Bb-Api-Subscription-Key header, both handled by EnrollmentClient. The
// service refreshes/persists the token and sets it on `source` before calling fetch,
// so this adapter just pulls the roster and normalizes it. Config-gated: dark until
// the server carries the SKY OAuth app credentials.
import { Injectable } from '@nestjs/common'
import type { EnrollmentProviderKey, EnrollmentSource, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentAdapter } from './adapter.js'
import { EnrollmentClient } from '../enrollment.client.js'
import { buildNormalizedSnapshot } from '../enrollment.normalize.js'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

@Injectable()
export class BlackbaudAdapter implements EnrollmentAdapter {
  readonly provider: EnrollmentProviderKey = 'blackbaud'

  constructor(private readonly client: EnrollmentClient) {}

  isConfigured(): boolean {
    return this.client.isConfigured()
  }

  async fetch(source: EnrollmentSource, asOf?: string): Promise<NormalizedEnrollmentSnapshot> {
    // `source.accessToken` was refreshed + set by the service prior to this call.
    const rows = await this.client.getStudents(source, source.accessToken ?? '')
    return buildNormalizedSnapshot('blackbaud', rows, { observedOn: asOf ?? todayIso() })
  }
}
