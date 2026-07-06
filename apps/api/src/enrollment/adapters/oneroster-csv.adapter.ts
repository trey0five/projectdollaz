// Phase 2 — the universal OneRoster CSV/ZIP adapter. It has NO live fetch: a
// OneRoster bulk export is a file the user uploads, parsed by the pure
// @finrep/ingestion parser in the service's upload handler. This adapter exists so
// the provider registry is complete and always "configured" (the CSV path needs no
// server credentials); fetch() is intentionally unsupported.
import { BadRequestException, Injectable } from '@nestjs/common'
import type { EnrollmentProviderKey, NormalizedEnrollmentSnapshot } from '@finrep/db'
import type { EnrollmentAdapter } from './adapter.js'

@Injectable()
export class OneRosterCsvAdapter implements EnrollmentAdapter {
  readonly provider: EnrollmentProviderKey = 'oneroster_csv'

  /** Always available — a CSV/ZIP upload needs no server-side credentials. */
  isConfigured(): boolean {
    return true
  }

  fetch(): Promise<NormalizedEnrollmentSnapshot> {
    throw new BadRequestException(
      'OneRoster CSV is imported by uploading the export file, not by sync.',
    )
  }
}
