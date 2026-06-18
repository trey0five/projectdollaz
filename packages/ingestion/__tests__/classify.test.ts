// ─────────────────────────────────────────────────────────────
// Ingestion: role classification, batch resolution, period inference.
// Verifies the three samples classify correctly (PY vs Audited split by
// KEYWORD despite both being FY25), plus collision / low-confidence /
// manual-override paths.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  classifyRole,
  resolveRoles,
  inferPeriod,
  isFiscalYearEnd,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const sampleDir = resolve(here, '..', '..', '..', 'sample-data')

function load(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(sampleDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

function classifyFile(name: string) {
  const res = ingest(name, load(name))
  return classifyRole({ fileName: name, metadata: res.metadata })
}

/**
 * Classify a sample under a NEUTRAL filename (role keyword stripped) using its
 * REAL parsed metadata, and return a ResolvedFile carrying the content signals
 * — to prove resolution is content-based, not filename-based.
 *
 * `neutralTitle: true` ALSO blanks the role keyword out of the in-sheet
 * periodTitle (replacing it with a plain "Trial Balance"), so neither the
 * filename NOR the title can leak "Current Year" / "Prior Year" / "Audited".
 * What remains is purely the parsed period-end date + the audited flag — the
 * airtight proof that cy/py/audit resolve from sheet CONTENT alone.
 */
function contentResolvedFile(
  sampleFile: string,
  neutralName: string,
  id: string,
  opts: { neutralTitle?: boolean } = {}
) {
  const res = ingest(sampleFile, load(sampleFile))
  const metadata = opts.neutralTitle
    ? { ...res.metadata!, periodTitle: 'Trial Balance' }
    : res.metadata
  const c = classifyRole({ fileName: neutralName, metadata })
  return {
    id,
    role: c.role,
    fiscalYear: res.metadata?.fiscalYear,
    periodEndDate: res.metadata?.periodEndDate,
    periodEndSource: res.metadata?.periodEndSource,
    auditStatus: res.metadata?.auditStatus,
    confidence: c.confidence,
  }
}

describe('classifyRole — sample files', () => {
  it('classifies the current-year sample as cy with high confidence', () => {
    const c = classifyFile('TB_CurrentYear_FY26.xlsx')
    expect(c.role).toBe('cy')
    expect(c.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('classifies the prior-year sample as py (keyword, not FY)', () => {
    const c = classifyFile('TB_PriorYear_FY25.xlsx')
    expect(c.role).toBe('py')
    expect(c.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('classifies the audited sample as audit despite sharing FY25 with PY', () => {
    const c = classifyFile('TB_AuditedFYEnd_FY25.xlsx')
    expect(c.role).toBe('audit')
    expect(c.confidence).toBeGreaterThanOrEqual(0.8)
  })
})

describe('classifyRole — signals & fallbacks', () => {
  it('trusts the sheet title over a disagreeing filename', () => {
    const c = classifyRole({
      fileName: 'random.xlsx',
      metadata: { sourceName: 'random.xlsx', rowCount: 1, periodTitle: 'Prior Year (FY25)', fiscalYear: 2025 },
    })
    expect(c.role).toBe('py')
    expect(c.signals.fromTitle).toBe('py')
  })

  it('falls back to filename when no title metadata exists', () => {
    const c = classifyRole({ fileName: 'CurrentYearTB.csv' })
    expect(c.role).toBe('cy')
    expect(c.confidence).toBeLessThan(0.8)
    expect(c.confidence).toBeGreaterThanOrEqual(0.4)
  })

  it('returns unknown / low confidence when no signal is present', () => {
    const c = classifyRole({ fileName: 'export_12345.csv' })
    expect(c.role).toBe('unknown')
    expect(c.confidence).toBeLessThan(0.4)
  })
})

describe('resolveRoles', () => {
  it('maps clean per-file roles into slots with no conflicts', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'a', role: 'cy' },
      { id: 'b', role: 'py' },
      { id: 'c', role: 'audit' },
    ])
    expect(slots).toEqual({ cy: 'a', py: 'b', audit: 'c' })
    expect(conflicts).toHaveLength(0)
  })

  it('flags a duplicate role and leaves the slot empty (no arbitrary winner)', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'a', role: 'cy' },
      { id: 'b', role: 'cy' },
    ])
    expect(slots.cy).toBeUndefined()
    expect(conflicts).toContainEqual({ kind: 'duplicate', role: 'cy', fileIds: ['a', 'b'] })
  })

  it('flags unresolved (unknown) files', () => {
    const { conflicts } = resolveRoles([
      { id: 'a', role: 'cy' },
      { id: 'b', role: 'unknown' },
    ])
    expect(conflicts).toContainEqual({ kind: 'unresolved', fileIds: ['b'] })
  })

  it('flags a missing current-year file', () => {
    const { conflicts } = resolveRoles([{ id: 'a', role: 'py' }])
    expect(conflicts).toContainEqual({ kind: 'missing-current' })
  })

  // ── ROLE-FIRST placement (regression locks for the date-first bug) ──
  it('places a LONE prior-year file in PY (not CY), even with a date', () => {
    // The headline bug: a single TB_PriorYear_FY25 (role py) used to land in CY
    // because it was the only dated file. Role-first now sends it to PY and
    // surfaces the still-required CY slot as missing-current.
    const { slots, conflicts } = resolveRoles([
      { id: 'py1', role: 'py', periodEndDate: '2025-06-30' },
    ])
    expect(slots.py).toBe('py1')
    expect(slots.cy).toBeUndefined()
    expect(conflicts).toContainEqual({ kind: 'missing-current' })
  })

  it('places a lone audited file in AUDIT (not CY), and reports missing-current', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'aud', role: 'unknown', periodEndDate: '2025-06-30', auditStatus: 'audited' },
    ])
    expect(slots.audit).toBe('aud')
    expect(slots.cy).toBeUndefined()
    expect(slots.py).toBeUndefined()
    expect(conflicts).toContainEqual({ kind: 'missing-current' })
  })

  it('a lone SIGNAL-LESS (unknown) file with a date still defaults to CY', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'u', role: 'unknown', periodEndDate: '2026-06-30' },
    ])
    expect(slots.cy).toBe('u')
    expect(conflicts.some((c) => c.kind === 'missing-current')).toBe(false)
  })

  it('detected role beats date order: older cy stays cy, newer unknown does not steal it', () => {
    // The cy-classified file has the EARLIER date; a newer unknown file would
    // have won cy under date-first. Role-first keeps cy where it belongs and
    // the newer unknown falls into the still-empty py slot.
    const { slots } = resolveRoles([
      { id: 'cyfile', role: 'cy', periodEndDate: '2025-06-30' },
      { id: 'newer', role: 'unknown', periodEndDate: '2026-06-30' },
    ])
    expect(slots.cy).toBe('cyfile')
    expect(slots.py).toBe('newer')
  })

  it('an audited file never also competes for cy; the detected cy file wins cy', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'cyfile', role: 'cy' },
      { id: 'aud', role: 'audit', auditStatus: 'audited' },
    ])
    expect(slots.cy).toBe('cyfile')
    expect(slots.audit).toBe('aud')
    expect(conflicts.some((c) => c.kind === 'missing-current')).toBe(false)
  })

  it('two files with the SAME detected role collide -> duplicate, slot empty', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'a', role: 'py', periodEndDate: '2025-06-30' },
      { id: 'b', role: 'py', periodEndDate: '2024-06-30' },
      { id: 'c', role: 'cy', periodEndDate: '2026-06-30' },
    ])
    expect(slots.cy).toBe('c')
    expect(slots.py).toBeUndefined()
    expect(conflicts).toContainEqual({ kind: 'duplicate', role: 'py', fileIds: ['a', 'b'] })
  })

  it('ignores files marked ignore', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'a', role: 'cy' },
      { id: 'b', role: 'ignore' },
    ])
    expect(slots.cy).toBe('a')
    expect(conflicts).toHaveLength(0)
  })

  // ── NEVER-DROP: a detected file that loses a slot must SURFACE ──
  it('a CY override + a competing detected-cy file: the loser surfaces (never dropped)', () => {
    // 'ovr' hard-claims cy via override. 'det' is also detected cy but the slot
    // is taken — it must NOT vanish; it surfaces as unresolved so the UI can
    // show it in the "Needs a role" row.
    const { slots, conflicts } = resolveRoles([
      { id: 'ovr', role: 'cy', override: true },
      { id: 'det', role: 'cy' },
    ])
    expect(slots.cy).toBe('ovr')
    expect(conflicts).toContainEqual({ kind: 'unresolved', fileIds: ['det'] })
  })

  it('an audit override + a competing detected-audit file: the loser surfaces', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'ovr', role: 'audit', override: true },
      { id: 'det', role: 'unknown', auditStatus: 'audited' },
    ])
    expect(slots.audit).toBe('ovr')
    expect(conflicts).toContainEqual({ kind: 'unresolved', fileIds: ['det'] })
  })

  // ── LONE signal-less file defaults to CY (per the DECISION) ──
  it('a lone DATELESS + keywordless file defaults to CY', () => {
    const { slots, conflicts } = resolveRoles([{ id: 'u', role: 'unknown' }])
    expect(slots.cy).toBe('u')
    expect(conflicts.some((c) => c.kind === 'missing-current')).toBe(false)
    expect(conflicts.some((c) => c.kind === 'unresolved')).toBe(false)
  })
})

describe('resolveRoles — content-first (date + audited flag)', () => {
  it('audited flag wins the audit slot regardless of keyword', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'a', role: 'unknown', periodEndDate: '2026-06-30', auditStatus: 'unaudited' },
      { id: 'b', role: 'unknown', periodEndDate: '2025-06-30', auditStatus: 'unaudited' },
      { id: 'c', role: 'unknown', periodEndDate: '2025-06-30', auditStatus: 'audited' },
    ])
    expect(slots).toEqual({ cy: 'a', py: 'b', audit: 'c' })
    expect(conflicts).toHaveLength(0)
  })

  it('latest period-end -> cy, earlier -> py (no keywords at all)', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'older', role: 'unknown', periodEndDate: '2025-06-30' },
      { id: 'newer', role: 'unknown', periodEndDate: '2026-06-30' },
    ])
    expect(slots.cy).toBe('newer')
    expect(slots.py).toBe('older')
    expect(conflicts).toHaveLength(0)
  })

  it('two unaudited files with the SAME date -> ambiguous-period (slots empty)', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'x', role: 'unknown', periodEndDate: '2025-06-30' },
      { id: 'y', role: 'unknown', periodEndDate: '2025-06-30' },
    ])
    expect(slots.cy).toBeUndefined()
    expect(slots.py).toBeUndefined()
    expect(conflicts).toContainEqual({ kind: 'ambiguous-period', fileIds: ['x', 'y'] })
  })

  it('a single dated unaudited file is cy with no missing-current alarm', () => {
    const { slots, conflicts } = resolveRoles([
      { id: 'lone', role: 'unknown', periodEndDate: '2026-06-30' },
    ])
    expect(slots.cy).toBe('lone')
    expect(conflicts.some((c) => c.kind === 'missing-current')).toBe(false)
  })

  it('a dateless + keywordless file -> unresolved', () => {
    const { conflicts } = resolveRoles([
      { id: 'a', role: 'unknown', periodEndDate: '2026-06-30' },
      { id: 'b', role: 'unknown' },
    ])
    expect(conflicts).toContainEqual({ kind: 'unresolved', fileIds: ['b'] })
  })

  it('a confirmed user override is a HARD assignment that beats content', () => {
    // File "a" has the latest date (would auto-be cy) but the user overrode it
    // to py; the override wins and the other dated file takes cy.
    const { slots } = resolveRoles([
      { id: 'a', role: 'py', periodEndDate: '2026-06-30', override: true },
      { id: 'b', role: 'unknown', periodEndDate: '2025-06-30' },
    ])
    expect(slots.py).toBe('a')
    expect(slots.cy).toBe('b')
  })
})

describe('content-based resolution PROOF (role keyword stripped from filenames)', () => {
  it('resolves cy/py/audit purely from sheet content with neutral filenames', () => {
    const files = [
      contentResolvedFile('TB_CurrentYear_FY26.xlsx', 'TB_alpha.xlsx', 'alpha'),
      contentResolvedFile('TB_PriorYear_FY25.xlsx', 'TB_beta.xlsx', 'beta'),
      contentResolvedFile('TB_AuditedFYEnd_FY25.xlsx', 'TB_gamma.xlsx', 'gamma'),
    ]

    // Sanity: the neutral filenames carry NO role keyword.
    for (const f of files) {
      expect(['alpha', 'beta', 'gamma']).toContain(f.id)
    }

    const { slots, conflicts } = resolveRoles(files)
    expect(slots).toEqual({ cy: 'alpha', py: 'beta', audit: 'gamma' })
    expect(conflicts).toHaveLength(0)
  })

  it('resolves cy/py/audit with role keywords stripped from BOTH filename AND title', () => {
    // The hardest proof: neither the filename nor the in-sheet title contains
    // "Current Year" / "Prior Year" / "Audited". cy/py can ONLY come from the
    // parsed period-end DATE (latest=cy, earlier=py); audit ONLY from the
    // in-sheet audited flag. If resolution still lands all three, it is
    // genuinely content-driven — not keyword-driven.
    const cy = contentResolvedFile('TB_CurrentYear_FY26.xlsx', 'TB_alpha.xlsx', 'alpha', {
      neutralTitle: true,
    })
    const py = contentResolvedFile('TB_PriorYear_FY25.xlsx', 'TB_beta.xlsx', 'beta', {
      neutralTitle: true,
    })
    const audit = contentResolvedFile('TB_AuditedFYEnd_FY25.xlsx', 'TB_gamma.xlsx', 'gamma', {
      neutralTitle: true,
    })

    // With the title neutralized, the keyword-derived per-file role must NOT be
    // cy/py for the unaudited files — they only carry a date. (audit still
    // classifies via its content flag, which is the intended content signal.)
    expect(cy.role).toBe('unknown')
    expect(py.role).toBe('unknown')
    expect(cy.periodEndDate).toBe('2026-06-30')
    expect(py.periodEndDate).toBe('2025-06-30')
    expect(audit.auditStatus).toBe('audited')

    const { slots, conflicts } = resolveRoles([cy, py, audit])
    expect(slots).toEqual({ cy: 'alpha', py: 'beta', audit: 'gamma' })
    expect(conflicts).toHaveLength(0)
  })

  it('the audited sample is recognized by its in-sheet flag even with a neutral name', () => {
    const res = ingest('TB_AuditedFYEnd_FY25.xlsx', load('TB_AuditedFYEnd_FY25.xlsx'))
    const c = classifyRole({ fileName: 'TB_gamma.xlsx', metadata: res.metadata })
    expect(c.role).toBe('audit')
    expect(c.signals.auditStatus).toBe('audited')
    expect(c.signals.fromContent).toBe('audit')
    expect(c.confidence).toBeGreaterThanOrEqual(0.8)
  })
})

describe('inferPeriod', () => {
  it('infers FY26 -> 2026-06-30, periodType fy', () => {
    const res = ingest('TB_CurrentYear_FY26.xlsx', load('TB_CurrentYear_FY26.xlsx'))
    const p = inferPeriod(res.metadata)
    expect(p.periodEndDate).toBe('2026-06-30')
    expect(p.periodType).toBe('fy')
    expect(p.fiscalYear).toBe(2026)
  })

  it('defaults to ytd when no period metadata', () => {
    const p = inferPeriod(undefined)
    expect(p.periodEndDate).toBeUndefined()
    expect(p.periodType).toBe('ytd')
  })

  it('detects the FL fiscal-year end', () => {
    expect(isFiscalYearEnd('2026-06-30')).toBe(true)
    expect(isFiscalYearEnd('2026-05-31')).toBe(false)
  })
})
