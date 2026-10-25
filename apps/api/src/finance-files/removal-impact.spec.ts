import { describe, it, expect } from 'vitest'
import {
  changedPeriods,
  comparativeSources,
  sourceFor,
  toResolverPeriods,
  withoutSlot,
  type ImportLite,
  type PeriodLite,
} from './removal-impact.js'

const FY24: PeriodLite = { id: 'p24', periodEndDate: new Date('2024-06-30') }
const FY25: PeriodLite = { id: 'p25', periodEndDate: new Date('2025-06-30') }
const FY26: PeriodLite = { id: 'p26', periodEndDate: new Date('2026-06-30') }

let t = 0
function imp(id: string, periodId: string, role: string): ImportLite {
  t += 1
  return { id, fiscalPeriodId: periodId, role, createdAt: new Date(2026, 0, 1, 0, 0, t) }
}

function impact(periods: PeriodLite[], imports: ImportLite[], periodId: string, role: string) {
  const before = comparativeSources(toResolverPeriods(periods, imports))
  const afterPeriods = toResolverPeriods(periods, withoutSlot(imports, periodId, role))
  const after = comparativeSources(afterPeriods)
  return { changed: changedPeriods(before, after, periodId), afterPeriods }
}

describe('removal impact — which later years lose or change a comparison', () => {
  it('removing FY25 cy with no FY24: FY26 loses its prior-year comparison', () => {
    const imports = [imp('c25', 'p25', 'cy'), imp('c26', 'p26', 'cy')]
    const { changed } = impact([FY25, FY26], imports, 'p25', 'cy')
    expect(changed).toEqual([{ periodId: 'p26', comparison: 'prior-year', afterFromPeriodId: null }])
  })

  it('with FY24 on file, FY26 falls back to FY24', () => {
    const imports = [imp('c24', 'p24', 'cy'), imp('c25', 'p25', 'cy'), imp('c26', 'p26', 'cy')]
    const { changed } = impact([FY24, FY25, FY26], imports, 'p25', 'cy')
    expect(changed).toEqual([{ periodId: 'p26', comparison: 'prior-year', afterFromPeriodId: 'p24' }])
  })

  it('an FY26 with its own prior-year file is unaffected', () => {
    const imports = [imp('c25', 'p25', 'cy'), imp('c26', 'p26', 'cy'), imp('py26', 'p26', 'py')]
    const { changed } = impact([FY25, FY26], imports, 'p25', 'cy')
    expect(changed).toEqual([])
  })

  it('removing an FY25 audit changes FY26 audited — none, or the FY24 audit', () => {
    const base = [imp('c25', 'p25', 'cy'), imp('a25', 'p25', 'audit'), imp('c26', 'p26', 'cy')]
    expect(impact([FY25, FY26], base, 'p25', 'audit').changed).toEqual([
      { periodId: 'p26', comparison: 'audited', afterFromPeriodId: null },
    ])
    const withFy24 = [imp('a24', 'p24', 'audit'), ...base]
    expect(impact([FY24, FY25, FY26], withFy24, 'p25', 'audit').changed).toEqual([
      { periodId: 'p26', comparison: 'audited', afterFromPeriodId: 'p24' },
    ])
  })

  it('removing an FY26 py makes FY26 itself fall back to the FY25 cy', () => {
    const imports = [imp('c25', 'p25', 'cy'), imp('c26', 'p26', 'cy'), imp('py26', 'p26', 'py')]
    const { afterPeriods, changed } = impact([FY25, FY26], imports, 'p26', 'py')
    expect(sourceFor(afterPeriods, 'p26')).toMatchObject({ pyImportId: 'c25', pyFromPeriodId: 'p25' })
    expect(changed).toEqual([]) // the target period is never listed
  })

  it('withoutSlot drops the whole stack, not just the newest version', () => {
    const imports = [imp('old', 'p25', 'cy'), imp('new', 'p25', 'cy'), imp('py', 'p25', 'py')]
    expect(withoutSlot(imports, 'p25', 'cy').map((i) => i.id)).toEqual(['py'])
    // …so an older version can never resurface as "the" FY25 cy for FY26.
    const { changed } = impact([FY25, FY26], [...imports, imp('c26', 'p26', 'cy')], 'p25', 'cy')
    expect(changed).toEqual([{ periodId: 'p26', comparison: 'prior-year', afterFromPeriodId: null }])
  })

  it('the excluded period is never listed, even though its own sources change', () => {
    const imports = [imp('c24', 'p24', 'cy'), imp('c25', 'p25', 'cy'), imp('py25', 'p25', 'py')]
    const { changed } = impact([FY24, FY25], imports, 'p25', 'py')
    expect(changed.find((c) => c.periodId === 'p25')).toBeUndefined()
  })

  it('the active version per role is the newest createdAt regardless of input order', () => {
    const older = imp('older', 'p25', 'cy')
    const newer = imp('newer', 'p25', 'cy')
    const rp = toResolverPeriods([FY25], [older, newer])
    expect(rp[0]!.active.cy?.id).toBe('newer')
  })
})
