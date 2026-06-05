// ─────────────────────────────────────────────────────────────
// Ingestion: metadata extraction from sheet title/banner rows.
// Verifies the three sample files yield the right fiscalYear /
// periodEndDate / periodTitle, plus pure negative cases.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  extractSheetMetadata,
  detectFiscalYear,
  detectExplicitDate,
  detectAuditStatus,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const sampleDir = resolve(here, '..', '..', '..', 'sample-data')

function load(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(sampleDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('extractSheetMetadata (pure)', () => {
  it('reads FY token, June-30 FYE inference, and title', () => {
    const meta = extractSheetMetadata(
      ['Sample 01 High School — Trial Balance — Current Year (FY26)'],
      'x.xlsx',
      42
    )
    expect(meta.fiscalYear).toBe(2026)
    expect(meta.periodEndDate).toBe('2026-06-30')
    expect(meta.periodTitle).toContain('Current Year')
    expect(meta.rowCount).toBe(42)
    expect(meta.sourceName).toBe('x.xlsx')
  })

  it('prefers an explicit date over the FY-end inference (with source flag)', () => {
    const meta = extractSheetMetadata(
      ['Trial Balance — as of June 30, 2026 (FY26)'],
      'x.xlsx',
      10
    )
    expect(meta.periodEndDate).toBe('2026-06-30')
    expect(meta.periodEndSource).toBe('explicit')
  })

  it('marks the source as fiscal-year-end when only an FY token is present', () => {
    const meta = extractSheetMetadata(['Trial Balance (FY26)'], 'x.xlsx', 10)
    expect(meta.periodEndDate).toBe('2026-06-30')
    expect(meta.periodEndSource).toBe('fiscal-year-end')
  })

  it('parses the audited/unaudited content markers', () => {
    const cy = extractSheetMetadata(
      ['For the Year Ending June 30, 2026 — Unaudited'],
      'x.xlsx',
      10
    )
    expect(cy.auditStatus).toBe('unaudited')
    expect(cy.periodEndDate).toBe('2026-06-30')
    expect(cy.periodEndSource).toBe('explicit')

    const audited = extractSheetMetadata(
      ['For the Year Ended June 30, 2025 — Audited'],
      'x.xlsx',
      10
    )
    expect(audited.auditStatus).toBe('audited')
    expect(audited.periodEndDate).toBe('2025-06-30')
  })

  it('returns rowCount/title only when no FY or date is present', () => {
    const meta = extractSheetMetadata(['Some Random Trial Balance'], 'x.csv', 5)
    expect(meta.fiscalYear).toBeUndefined()
    expect(meta.periodEndDate).toBeUndefined()
    expect(meta.rowCount).toBe(5)
  })

  it('handles a completely empty header (CSV with no banner)', () => {
    const meta = extractSheetMetadata([], 'tb.csv', 3)
    expect(meta.fiscalYear).toBeUndefined()
    expect(meta.periodEndDate).toBeUndefined()
    expect(meta.periodTitle).toBeUndefined()
    expect(meta.rowCount).toBe(3)
  })
})

describe('detectFiscalYear / detectExplicitDate', () => {
  it('normalizes 2-digit FY tokens to the 21st century', () => {
    expect(detectFiscalYear('FY26')).toBe(2026)
    expect(detectFiscalYear("FY'25")).toBe(2025)
    expect(detectFiscalYear('FY 2024')).toBe(2024)
  })

  it('falls back to a bare 4-digit year', () => {
    expect(detectFiscalYear('Trial Balance 2023')).toBe(2023)
    expect(detectFiscalYear('no year here')).toBeUndefined()
  })

  it('parses named and numeric explicit dates', () => {
    expect(detectExplicitDate('as of June 30, 2026')).toBe('2026-06-30')
    expect(detectExplicitDate('6/30/2026')).toBe('2026-06-30')
    expect(detectExplicitDate('For the Year Ended June 30, 2025')).toBe('2025-06-30')
    expect(detectExplicitDate('nothing')).toBeUndefined()
  })
})

describe('detectAuditStatus', () => {
  it('does NOT misread "Unaudited" as audited (the un- trap)', () => {
    expect(detectAuditStatus('For the Year Ending June 30, 2026 — Unaudited')).toBe('unaudited')
    expect(detectAuditStatus('Un-Audited management figures')).toBe('unaudited')
  })

  it('reads a clean "Audited" marker as audited', () => {
    expect(detectAuditStatus('For the Year Ended June 30, 2025 — Audited')).toBe('audited')
  })

  it('treats management/internal/draft as unaudited', () => {
    expect(detectAuditStatus('Management trial balance')).toBe('unaudited')
    expect(detectAuditStatus('Internal draft')).toBe('unaudited')
  })

  it('returns undefined when no audit signal is present', () => {
    expect(detectAuditStatus('Trial Balance — Current Year')).toBeUndefined()
  })
})

describe('ingest() attaches metadata for the three samples', () => {
  const cases: Array<[string, number, 'audited' | 'unaudited']> = [
    ['TB_CurrentYear_FY26.xlsx', 2026, 'unaudited'],
    ['TB_PriorYear_FY25.xlsx', 2025, 'unaudited'],
    ['TB_AuditedFYEnd_FY25.xlsx', 2025, 'audited'],
  ]

  it.each(cases)(
    '%s -> EXPLICIT Jun-30 date + auditStatus from the content marker',
    (file, fy, audit) => {
      const res = ingest(file, load(file))
      expect(res.metadata).toBeDefined()
      expect(res.metadata!.fiscalYear).toBe(fy)
      // The regenerated samples carry an explicit in-sheet period-end date,
      // so the source is 'explicit' (not the FY-end fallback).
      expect(res.metadata!.periodEndDate).toBe(`${fy}-06-30`)
      expect(res.metadata!.periodEndSource).toBe('explicit')
      expect(res.metadata!.auditStatus).toBe(audit)
      expect(res.metadata!.rowCount).toBe(res.rows.length)
      expect(res.metadata!.rowCount).toBeGreaterThan(0)
      expect(res.metadata!.sourceName).toBe(file)
    }
  )

  it('keeps rows identical (metadata is additive)', () => {
    const res = ingest('TB_CurrentYear_FY26.xlsx', load('TB_CurrentYear_FY26.xlsx'))
    expect(res.rows.some((r) => r.acct === 401)).toBe(true)
    for (const r of res.rows) {
      expect(typeof r.acct).toBe('number')
      expect(typeof r.desc).toBe('string')
      expect(typeof r.total).toBe('number')
    }
  })
})
