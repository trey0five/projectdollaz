import { describe, expect, it } from 'vitest'
import type { MetricResult } from '@finrep/analytics'
import {
  DOMAIN_TO_MODULE,
  moduleForDomain,
  moduleForMetricKey,
  entitledModulesForSchool,
  entitledModulesForOrg,
  filterMetricsByEntitlement,
  type EntitlementResolver,
} from './metric-gating.js'

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-SCOPED METRIC GATING — the domain→module map + the fail-closed filter.
// Framework-free: hand-mock the billing resolver, assert the NO-LOCKOUT rules
// (finance NEVER hidden; only enrollment/hr gated; trial all; fail-closed).
// ─────────────────────────────────────────────────────────────────────────────

/** A stub MetricResult carrying just the key (the only field the gate reads). */
function m(key: string): MetricResult {
  return { key } as unknown as MetricResult
}

// Representative keys across every domain (finance-family + the two gated wedges).
const FINANCE = m('operating_margin')
const OPERATIONS = m('cost_per_pupil')
const AID = m('pct_students_on_aid')
const ENROLLMENT = m('enrollment_change_yoy')
const HR = m('student_teacher_ratio')
const ALL = [FINANCE, OPERATIONS, AID, ENROLLMENT, HR]

/** A billing mock. `entitled` is the set of TRUE modules; anything else is false.
 *  When `throwFor` includes a module, its lookup rejects (to test fail-closed). */
function billingMock(opts: {
  entitled?: string[]
  throwFor?: string[]
  trial?: boolean
}): EntitlementResolver {
  return {
    isEntitledForModule: async (_schoolId: string, moduleKey: string) => {
      if (opts.throwFor?.includes(moduleKey)) throw new Error('billing down')
      if (opts.trial) return true
      return (opts.entitled ?? []).includes(moduleKey)
    },
  }
}

describe('domain → module map', () => {
  it('finance/operations/aid all map to finance; enrollment→enrollment; hr→hr', () => {
    expect(DOMAIN_TO_MODULE).toEqual({
      finance: 'finance', operations: 'finance', aid: 'finance',
      enrollment: 'enrollment', hr: 'hr',
    })
  })

  it('moduleForDomain defaults an absent domain to finance (never hidden)', () => {
    expect(moduleForDomain(undefined)).toBe('finance')
    expect(moduleForDomain('hr')).toBe('hr')
    expect(moduleForDomain('operations')).toBe('finance')
  })

  it('moduleForMetricKey resolves the registry domain', () => {
    expect(moduleForMetricKey('operating_margin')).toBe('finance')
    expect(moduleForMetricKey('cost_per_pupil')).toBe('finance')
    expect(moduleForMetricKey('pct_students_on_aid')).toBe('finance')
    expect(moduleForMetricKey('enrollment_change_yoy')).toBe('enrollment')
    expect(moduleForMetricKey('student_teacher_ratio')).toBe('hr')
    // Unknown key → finance (fail-open to the always-present module).
    expect(moduleForMetricKey('nope')).toBe('finance')
  })
})

describe('entitledModulesForSchool + filter — per-school gate', () => {
  async function gate(billing: EntitlementResolver) {
    const set = await entitledModulesForSchool('s1', billing)
    return filterMetricsByEntitlement(ALL, set).map((x) => x.key)
  }

  it('TRIAL (all-access): every metric shows', async () => {
    expect(await gate(billingMock({ trial: true }))).toEqual([
      'operating_margin', 'cost_per_pupil', 'pct_students_on_aid',
      'enrollment_change_yoy', 'student_teacher_ratio',
    ])
  })

  it('FINANCE-ONLY active: excludes enrollment + hr, keeps all finance-family', async () => {
    const keys = await gate(billingMock({ entitled: [] }))
    expect(keys).toEqual(['operating_margin', 'cost_per_pupil', 'pct_students_on_aid'])
    expect(keys).not.toContain('enrollment_change_yoy')
    expect(keys).not.toContain('student_teacher_ratio')
  })

  it('ENROLLMENT-licensed (no hr): includes enrollment, excludes hr', async () => {
    const keys = await gate(billingMock({ entitled: ['enrollment'] }))
    expect(keys).toContain('enrollment_change_yoy')
    expect(keys).not.toContain('student_teacher_ratio')
  })

  it('HR-licensed: includes student_teacher_ratio', async () => {
    const keys = await gate(billingMock({ entitled: ['hr'] }))
    expect(keys).toContain('student_teacher_ratio')
    expect(keys).not.toContain('enrollment_change_yoy')
  })

  it('FAIL-CLOSED: billing throws for hr → hr metric hidden, finance metrics survive', async () => {
    const keys = await gate(billingMock({ entitled: ['enrollment'], throwFor: ['hr'] }))
    expect(keys).toContain('operating_margin') // finance NEVER dropped by a throw
    expect(keys).toContain('cost_per_pupil')
    expect(keys).toContain('pct_students_on_aid')
    expect(keys).toContain('enrollment_change_yoy')
    expect(keys).not.toContain('student_teacher_ratio') // dropped, fail-closed
  })

  it('FAIL-CLOSED: billing throws for BOTH gated modules → only finance-family survive', async () => {
    const keys = await gate(billingMock({ throwFor: ['enrollment', 'hr'] }))
    expect(keys).toEqual(['operating_margin', 'cost_per_pupil', 'pct_students_on_aid'])
  })
})

describe('entitledModulesForOrg — widest-set (any school licenses)', () => {
  async function gateOrg(schoolIds: string[], perSchool: Record<string, string[]>) {
    const billing: EntitlementResolver = {
      isEntitledForModule: async (schoolId, moduleKey) =>
        (perSchool[schoolId] ?? []).includes(moduleKey),
    }
    const set = await entitledModulesForOrg(schoolIds, billing)
    return filterMetricsByEntitlement(ALL, set).map((x) => x.key)
  }

  it('ANY school licensing enrollment/hr surfaces the org metric', async () => {
    // s1 finance-only, s2 enrollment-licensed → org shows enrollment, not hr.
    const keys = await gateOrg(['s1', 's2'], { s1: [], s2: ['enrollment'] })
    expect(keys).toContain('enrollment_change_yoy')
    expect(keys).not.toContain('student_teacher_ratio')
  })

  it('a fully finance-only org excludes both org enrollment + hr metrics', async () => {
    const keys = await gateOrg(['s1', 's2'], { s1: [], s2: [] })
    expect(keys).toEqual(['operating_margin', 'cost_per_pupil', 'pct_students_on_aid'])
  })

  it('finance-family org metrics are ALWAYS present regardless of licensing', async () => {
    const keys = await gateOrg(['s1'], { s1: [] })
    expect(keys).toContain('operating_margin')
  })
})
