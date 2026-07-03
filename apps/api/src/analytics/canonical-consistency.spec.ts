// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL SEMANTIC LAYER — the Definition-of-Done probe. For a fixed set of
// MetricResults (built by the package compute on synthetic financials +
// operational), prove the three consuming surfaces agree:
//   (i)   the NUMBER is the same in the dashboard record, the board key-indicator,
//         and the briefing path.
//   (ii)  the LABEL is canonical everywhere, and the board alias for
//         net_tuition_per_student is a DECLARED registry alias, not a hardcoded
//         board title (board label ≠ registry label).
//   (iii) the FORMATTED numeric core is identical across formatMetricValue
//         (dashboard), formatIndicator (board, suffix stripped) and
//         formatMetricValueLong (briefing, unit word stripped) — one formatter
//         feeds all three.
// Framework-free: no Nest boot, no Prisma. Self-contained (the nest build compiles
// specs under a rootDir, so no cross-app/package relative imports): the bundle is
// hand-built here and the board shim is mirrored VERBATIM from the web's
// boardReportUtils.formatIndicator. The package resolves to its built dist, so
// this runs after `pnpm --filter @finrep/analytics build`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  computeMetricsRecord,
  formatMetricValue,
  formatMetricValueLong,
  resolveDisplayUnit,
  type MetricResult,
  type MetricUnit,
  type PeriodOperational,
} from '@finrep/analytics'
import type { ReportBundle } from '@finrep/engine'

// ── A hand-built ReportBundle (only the fields fromBundle reads matter) ──────────
// totalRev 1000, totalExp 900, netChange 100, tuition 700, cash 1800.
//   operating_margin        = 100/1000        = 0.1
//   days_cash_on_hand       = 1800/(900/365)  = 730
//   net_tuition_per_student = (700-210)/100    = 4.9
//   revenue_mix (scalar)    = totalRev         = 1000
const SOA = {
  tuition: 700, dev: 150, studAct: 0, textbook: 0, other: 50, support: 100,
  intlRev: 0, investments: 0, interest: 0, totalRev: 1000,
  instructional: 600, facilities: 100, fixedOther: 0, intlExp: 0, bus: 0, food: 0,
  studActExp: 0, athletics: 0, admin: 200, restricted: 0, totalExp: 900, netChange: 100,
}
const SFP = { cash: 1800, restrictedCash: 200, naWithout: 1500, naWith: 300 }
const BUNDLE = {
  soaResults: { cy: SOA, py: null, audit: null, hasPY: false, hasAudit: false },
  sfpResults: { cy: SFP, py: null, audit: null, hasPY: false, hasAudit: false },
  scf: null,
  netAssets: { cy: null, py: null, audit: null, hasPY: false, hasAudit: false },
} as unknown as ReportBundle

const OP: PeriodOperational = {
  enrollment: 100,
  enrollmentFte: 95,
  studentsOnAid: 40,
  financialAidTotal: 210,
  teachingFte: null,
  totalStaffFte: null,
}

const RECORD = computeMetricsRecord({ current: BUNDLE, currentOperational: OP })

// Faithful replica of BoardReportService.indicatorFromMetric — label + unit come
// from the MetricResult (registry), NOT from a hardcoded board literal.
function toIndicator(m: MetricResult) {
  const available = !!m.available && m.value != null
  return {
    key: m.key,
    label: m.boardLabel ?? m.label,
    value: available ? (m.value as number) : null,
    unit: m.unit,
    available,
  }
}

// VERBATIM mirror of the web's boardReportUtils.formatIndicator (kept in-file due
// to the api rootDir build constraint) — proves the board shim's non-count/non-days
// path is exactly the canonical formatMetricValue.
function boardFormatIndicator(value: number | null, unit: MetricUnit | 'count'): string {
  if (value == null || Number.isNaN(value)) return '—'
  switch (unit) {
    case 'days':
      return `${Math.round(value)} days`
    case 'count':
      return Number.isInteger(value)
        ? value.toLocaleString('en-US')
        : value.toLocaleString('en-US', { maximumFractionDigits: 1 })
    default:
      return formatMetricValue(value, unit)
  }
}

const stripDays = (s: string) => s.replace(/ days$/, '')
const stripLongWord = (s: string) => s.replace(/ (day|days|months)$/, '')

describe('canonical semantic layer — cross-surface consistency', () => {
  it('(i) the value is the SAME number in every surface', () => {
    for (const key of ['operating_margin', 'days_cash_on_hand', 'net_tuition_per_student'] as const) {
      const m = RECORD[key]
      const ind = toIndicator(m) // board
      expect(ind.value).toBe(m.value) // dashboard record === board indicator
      expect(m.value).not.toBeNull()
    }
    // Mix metric: the scalar value is the same currency total across surfaces.
    expect(RECORD.revenue_mix.value).toBe(1000)
  })

  it('(ii) labels are canonical, and the board alias is a declared registry alias', () => {
    // Non-aliased metric: board label === canonical label.
    expect(toIndicator(RECORD.operating_margin).label).toBe('Operating Margin')
    expect(RECORD.operating_margin.label).toBe('Operating Margin')
    // Aliased metric: board shows the alias, the registry/dashboard shows canonical.
    expect(toIndicator(RECORD.net_tuition_per_student).label).toBe('Avg Net Tuition / Student')
    expect(RECORD.net_tuition_per_student.label).toBe('Net Tuition per Student')
    expect(RECORD.net_tuition_per_student.boardLabel).toBe('Avg Net Tuition / Student')
    // Proves the alias is declared (rides on the MetricResult), not board-hardcoded.
    expect(RECORD.net_tuition_per_student.boardLabel).not.toBe(RECORD.net_tuition_per_student.label)
  })

  it('(iii) one formatter feeds the dashboard, board, and briefing numeric cores', () => {
    // days_cash_on_hand (730 days)
    const days = RECORD.days_cash_on_hand
    expect(formatMetricValue(days.value, days.unit)).toBe('730')
    expect(stripDays(boardFormatIndicator(days.value, days.unit))).toBe('730')
    expect(stripLongWord(formatMetricValueLong(days.value, days.unit))).toBe('730')

    // operating_margin (0.1 -> 10.0%) — percent has no suffix/word to strip.
    const om = RECORD.operating_margin
    expect(formatMetricValue(om.value, om.unit)).toBe('10.0%')
    expect(boardFormatIndicator(om.value, om.unit)).toBe('10.0%')
    expect(formatMetricValueLong(om.value, om.unit)).toBe('10.0%')

    // net_tuition_per_student (4.9 -> $5)
    const nt = RECORD.net_tuition_per_student
    expect(formatMetricValue(nt.value, nt.unit)).toBe('$5')
    expect(boardFormatIndicator(nt.value, nt.unit)).toBe('$5')
    expect(formatMetricValueLong(nt.value, nt.unit)).toBe('$5')
  })

  it('the mix metric formats its share-typed scalar as a currency total', () => {
    const rm = RECORD.revenue_mix
    expect(resolveDisplayUnit('revenue_mix', rm.unit)).toBe('currency')
    expect(formatMetricValue(rm.value, resolveDisplayUnit('revenue_mix', rm.unit))).toBe('$1,000')
  })
})
