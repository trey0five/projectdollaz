// ─────────────────────────────────────────────────────────────
// Test-only fixtures: pre-parsed, checked-in normalized rows derived
// from sample-data/*.xlsx. Using a JSON fixture (instead of importing the
// ingestion Excel adapter) keeps the engine package's test suite free of
// any parsing-lib (xlsx) dependency — the engine can be built and tested
// in full isolation. The real xlsx adapter is exercised by an
// ingestion-level test (packages/ingestion/__tests__) that proves it
// still yields these same rows.
//
// Regenerate after intentional sample-data changes:
//   npx tsx -e 'import {parseTrialBalance} from
//     "./packages/ingestion/src/adapters/excelAdapter.ts";
//     ...write __tests__/__fixtures__/sampleRows.json'
// ─────────────────────────────────────────────────────────────
import sampleRows from './__fixtures__/sampleRows.json' with { type: 'json' }
import type { NormalizedRow } from '../src/index.js'

export const cyData = sampleRows.cyData as NormalizedRow[]
export const pyData = sampleRows.pyData as NormalizedRow[]
export const auditData = sampleRows.auditData as NormalizedRow[]

export const school = {
  name: 'Sample 01 High School',
  netAssetsBegin: 1_000_000.0,
  pyNetAssetsBegin: 850_000.0,
  auditNetAssetsBegin: 850_000.0,
}
