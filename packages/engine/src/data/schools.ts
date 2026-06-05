// ─────────────────────────────────────────────────────────────
// School configuration (ported from the legacy src/data/schools.js).
// Each entry holds the beginning net-asset balances required to roll
// the Statement of Activities forward into an ending balance. `pin` is
// retained for the web app; the engine itself ignores it.
// ─────────────────────────────────────────────────────────────
import type { SchoolConfig } from '../types/school.js'

export const SCHOOLS: Record<string, SchoolConfig> = {
  school01: {
    name: 'Sample 01 High School',
    pin: '1234',
    netAssetsBegin: 7_870_000.0, // FY26 opening = FY25 ending (roll-forward)
    pyNetAssetsBegin: 7_500_000.0, // FY25 opening (unaudited)
    auditNetAssetsBegin: 7_500_000.0, // FY25 opening (audited)
  },
}

export const SCHOOL_OPTIONS = Object.entries(SCHOOLS).map(([id, s]) => ({
  id,
  name: s.name,
}))
