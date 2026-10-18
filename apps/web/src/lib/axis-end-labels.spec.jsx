// ─────────────────────────────────────────────────────────────────────────────
// A DATE AXIS MUST SAY WHICH YEARS IT SPANS.
//
// The enrollment trend printed "Oct 1" … "Oct 17" under a line that ran from
// Oct 1, 2022 to Oct 17, 2026 — a five-year series that read like seventeen
// days. The fix lives in ONE formatter (lib/dates axisEndLabels) used by every
// trend chart that labels its two ends; this file pins the formatter AND both
// callers, because "fixed in one caller" is how this family of bug comes back.
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { axisEndLabels } from './dates.js'
import EnrollmentHeadcountTrend from '../components/enrollment/EnrollmentHeadcountTrend.jsx'

vi.mock('../components/analytics/charts/Tooltip.jsx', () => ({
  useTooltip: () => ({ show: () => {}, move: () => {}, hide: () => {}, node: null }),
}))

describe('axisEndLabels', () => {
  it('prints BOTH years when the span crosses a calendar year', () => {
    expect(axisEndLabels('2022-10-01', '2026-10-17')).toEqual(['Oct 1, 2022', 'Oct 17, 2026'])
    expect(axisEndLabels('2025-12-30', '2026-01-02')).toEqual(['Dec 30, 2025', 'Jan 2, 2026'])
  })

  it('prints the year once (on the last end) inside a single year', () => {
    expect(axisEndLabels('2026-08-03', '2026-08-14')).toEqual(['Aug 3', 'Aug 14, 2026'])
  })

  it('never drops a year off a multi-year span, whatever the input shape', () => {
    // ISO timestamps (the server sometimes sends them) and day-only strings.
    const [a, b] = axisEndLabels('2022-10-01T00:00:00.000Z', '2026-10-17T12:00:00Z')
    expect(a).toMatch(/2022/)
    expect(b).toMatch(/2026/)
  })

  it('is UTC-safe: Jan 1 never slips back to Dec 31 of the prior year', () => {
    expect(axisEndLabels('2023-01-01', '2024-01-01')).toEqual(['Jan 1, 2023', 'Jan 1, 2024'])
  })

  it('never prints "Invalid Date"; a readable end keeps its year', () => {
    expect(axisEndLabels('garbage', '2026-10-17')).toEqual(['garbage', 'Oct 17, 2026'])
    expect(axisEndLabels(null, '2026-10-17')).toEqual([null, 'Oct 17, 2026'])
  })
})

describe('the enrollment headcount trend uses it on its axis', () => {
  it('labels a five-year line with its years, not "Oct 1" / "Oct 17"', () => {
    const points = [
      { observedOn: '2022-10-01', total: 248 },
      { observedOn: '2023-10-02', total: 251 },
      { observedOn: '2024-10-01', total: 244 },
      { observedOn: '2025-10-01', total: 239 },
      { observedOn: '2026-10-17', total: 233 },
    ]
    const { container } = render(<EnrollmentHeadcountTrend points={points} reduce />)
    const texts = [...container.querySelectorAll('svg text')].map((t) => t.textContent.trim())
    expect(texts).toContain('Oct 1, 2022')
    expect(texts).toContain('Oct 17, 2026')
    expect(texts).not.toContain('Oct 1')
    expect(texts).not.toContain('Oct 17')
  })
})

describe('the accreditation readiness trend uses it on its axis', () => {
  it('labels both axis ends through axisEndLabels (same bug family, second caller)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/accreditation/ReadinessTrendStrip.jsx'), 'utf8')
    const axis = src.slice(src.indexOf('date axis ends'), src.indexOf('</svg>', src.indexOf('date axis ends')))
    expect(axis).toMatch(/axisEndLabels\(rows\[0\]\.date, last\.date\)\[0\]/)
    expect(axis).toMatch(/axisEndLabels\(rows\[0\]\.date, last\.date\)\[1\]/)
    expect(axis).not.toMatch(/axisDate\(/)
  })
})
