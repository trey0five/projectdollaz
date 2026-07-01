import { describe, expect, it } from 'vitest'
import type { AttentionItem } from './briefing.service.js'
import { applyLens, availableLensesFor, clampLens, type Lens } from './briefing-lens.js'

// A fixture covering every id the briefing can emit, with realistic severities.
function fixture(): AttentionItem[] {
  return [
    {
      id: 'metric:operating_margin',
      severity: 'critical',
      source: 'metric',
      title: 'Operating Margin is in the risk band',
      why: 'Operating Margin is -2.0% — below the 0.0% risk floor.',
      metricKey: 'operating_margin',
      value: -0.02,
      link: '/analytics?metric=operating_margin',
      dueDate: null,
    },
    {
      id: 'metric:days_cash_on_hand',
      severity: 'warn',
      source: 'metric',
      title: 'Days Cash on Hand is on watch',
      why: 'Days Cash on Hand is 45 days, under the 60 day healthy target.',
      metricKey: 'days_cash_on_hand',
      value: 45,
      link: '/analytics?metric=days_cash_on_hand',
      dueDate: null,
    },
    {
      id: 'compliance:material',
      severity: 'critical',
      source: 'compliance',
      title: '2 material findings to resolve',
      why: 'A review will require a Corrective Action Plan. Open the readiness findings to address them.',
      metricKey: null,
      value: null,
      link: '/readiness',
      dueDate: null,
    },
    {
      id: 'compliance:reconciliation',
      severity: 'warn',
      source: 'compliance',
      title: 'Scholarship funds do not reconcile',
      why: 'Recorded scholarship revenue and disbursements differ by $1,200. Reconcile before the AUP review.',
      metricKey: null,
      value: null,
      link: '/readiness',
      dueDate: null,
    },
    {
      id: 'compliance:cap-open',
      severity: 'warn',
      source: 'compliance',
      title: '3 corrective actions still open',
      why: '3 corrective-action items have not been started.',
      metricKey: null,
      value: null,
      link: '/readiness',
      dueDate: '2026-08-01',
    },
    {
      id: 'compliance:checklist',
      severity: 'info',
      source: 'compliance',
      title: 'Year-end checklist 60% complete',
      why: '4 of 10 checklist items still need attention.',
      metricKey: null,
      value: null,
      link: '/readiness',
      dueDate: null,
    },
    {
      id: 'data:no-snapshot',
      severity: 'info',
      source: 'data',
      title: "Generate this period's statements",
      why: 'No financial statements have been saved for FY2025 yet.',
      metricKey: null,
      value: null,
      link: '/data',
      dueDate: null,
    },
    {
      id: 'data:unmapped',
      severity: 'info',
      source: 'data',
      title: 'Some accounts are unmapped',
      why: 'Some trial-balance accounts are not yet categorized.',
      metricKey: null,
      value: null,
      link: '/data',
      dueDate: null,
    },
  ]
}

const VALUE_FIELDS: (keyof AttentionItem)[] = [
  'id',
  'severity',
  'source',
  'title',
  'metricKey',
  'value',
  'link',
  'dueDate',
]

describe('clampLens', () => {
  it('defaults to the caller role when no override', () => {
    expect(clampLens('owner')).toBe('owner')
    expect(clampLens('accountant')).toBe('accountant')
    expect(clampLens('viewer')).toBe('viewer')
  })
  it('owner may preview narrower lenses', () => {
    expect(clampLens('owner', 'accountant')).toBe('accountant')
    expect(clampLens('owner', 'viewer')).toBe('viewer')
    expect(clampLens('owner', 'owner')).toBe('owner')
  })
  it('accountant may preview viewer but not widen to owner', () => {
    expect(clampLens('accountant', 'viewer')).toBe('viewer')
    expect(clampLens('accountant', 'owner')).toBe('accountant') // clamped
  })
  it('viewer can never widen', () => {
    expect(clampLens('viewer', 'owner')).toBe('viewer')
    expect(clampLens('viewer', 'accountant')).toBe('viewer')
  })
})

describe('availableLensesFor', () => {
  it('lists own role + every narrower lens', () => {
    expect(availableLensesFor('owner')).toEqual(['owner', 'accountant', 'viewer'])
    expect(availableLensesFor('accountant')).toEqual(['accountant', 'viewer'])
    expect(availableLensesFor('viewer')).toEqual(['viewer'])
  })
})

describe('applyLens — inclusion', () => {
  it('owner and accountant keep every item', () => {
    const input = fixture()
    expect(applyLens(input, 'owner')).toHaveLength(input.length)
    expect(applyLens(input, 'accountant')).toHaveLength(input.length)
  })
  it('viewer keeps all metric + compliance:material + data:no-snapshot, drops the rest', () => {
    const out = applyLens(fixture(), 'viewer').map((i) => i.id)
    expect(out).toContain('metric:operating_margin')
    expect(out).toContain('metric:days_cash_on_hand')
    expect(out).toContain('compliance:material')
    expect(out).toContain('data:no-snapshot')
    expect(out).not.toContain('compliance:reconciliation')
    expect(out).not.toContain('compliance:cap-open')
    expect(out).not.toContain('compliance:checklist')
    expect(out).not.toContain('data:unmapped')
  })
  it('viewer compliance inclusion is allowlisted by id, NOT by severity — a critical compliance item not on the allowlist is still dropped (stays in lockstep with the governance reframe map)', () => {
    const future: AttentionItem = {
      id: 'compliance:future-critical',
      severity: 'critical',
      source: 'compliance',
      title: 'Some future critical compliance finding',
      why: 'Go fix this operational thing right now.',
      metricKey: null,
      value: null,
      link: '/readiness',
      dueDate: null,
    }
    const out = applyLens([...fixture(), future], 'viewer').map((i) => i.id)
    expect(out).not.toContain('compliance:future-critical')
  })
})

describe('applyLens — emphasis / rerank', () => {
  it('accountant === today data-first source ordering within a severity', () => {
    // Among the two criticals (metric:operating_margin, compliance:material),
    // data/compliance-first means compliance:material precedes the metric.
    const out = applyLens(fixture(), 'accountant').map((i) => i.id)
    expect(out.indexOf('compliance:material')).toBeLessThan(
      out.indexOf('metric:operating_margin'),
    )
  })
  it('owner/viewer lead with the financial signal (metric-first within a severity)', () => {
    const owner = applyLens(fixture(), 'owner').map((i) => i.id)
    expect(owner.indexOf('metric:operating_margin')).toBeLessThan(
      owner.indexOf('compliance:material'),
    )
  })
  it('severity always dominates the source weight', () => {
    // criticals (operating_margin, material) precede every warn/info regardless of lens.
    for (const lens of ['owner', 'accountant', 'viewer'] as Lens[]) {
      const out = applyLens(fixture(), lens)
      const lastCritical = out.map((i) => i.severity).lastIndexOf('critical')
      const firstNonCritical = out.findIndex((i) => i.severity !== 'critical')
      if (firstNonCritical !== -1) expect(lastCritical).toBeLessThan(firstNonCritical)
    }
  })
  it('is deterministic — running twice yields identical order', () => {
    const a = applyLens(fixture(), 'owner').map((i) => i.id)
    const b = applyLens(fixture(), 'owner').map((i) => i.id)
    expect(a).toEqual(b)
  })
})

describe('applyLens — reframe / voice', () => {
  it('stamps the per-lens voice on every item', () => {
    expect(applyLens(fixture(), 'owner').every((i) => i.voice === 'decision')).toBe(true)
    expect(applyLens(fixture(), 'accountant').every((i) => i.voice === 'action')).toBe(true)
    expect(applyLens(fixture(), 'viewer').every((i) => i.voice === 'governance')).toBe(true)
  })
  it('rewrites viewer no-snapshot + material why into governance voice', () => {
    const viewer = applyLens(fixture(), 'viewer')
    const noSnap = viewer.find((i) => i.id === 'data:no-snapshot')!
    expect(noSnap.why).toBe(
      'This school has not yet reported financial statements for this period.',
    )
    const material = viewer.find((i) => i.id === 'compliance:material')!
    expect(material.why).not.toContain('Open the readiness findings')
    expect(material.why).toContain('corrective action plan')
  })
  it('owner/accountant why text passes through verbatim', () => {
    const original = fixture()
    for (const lens of ['owner', 'accountant'] as Lens[]) {
      const out = applyLens(original, lens)
      for (const o of out) {
        const src = original.find((i) => i.id === o.id)!
        expect(o.why).toBe(src.why)
      }
    }
  })
})

describe('applyLens — VALUE-SAFETY invariant (the headline guarantee)', () => {
  it('never alters id/severity/source/metricKey/value/dueDate/title/link for any surviving item', () => {
    const original = fixture()
    const ownerOut = applyLens(original, 'owner')
    for (const lens of ['owner', 'accountant', 'viewer'] as Lens[]) {
      for (const item of applyLens(original, lens)) {
        const base = ownerOut.find((o) => o.id === item.id)!
        for (const f of VALUE_FIELDS) {
          expect(item[f]).toStrictEqual(base[f])
        }
      }
    }
  })
  it('does not mutate its input array or items', () => {
    const input = fixture()
    const snapshot = JSON.parse(JSON.stringify(input))
    applyLens(input, 'viewer')
    applyLens(input, 'owner')
    expect(input).toStrictEqual(snapshot) // no voice/why mutation leaked back
  })
})

// Phase 4 Accreditation — the accreditation source is a board matter (KEPT for the
// viewer, like governance) and slots between governance and workflow in the rank.
describe('applyLens — accreditation (Phase 4)', () => {
  function accItems(): AttentionItem[] {
    return [
      {
        id: 'accreditation:coverage-gap',
        severity: 'warn',
        source: 'accreditation',
        title: '3 of 10 standards still need evidence',
        why: '3 accreditation standards have no evidence attached.',
        metricKey: null,
        value: null,
        link: '/accreditation',
        dueDate: '2026-09-01',
      },
      {
        id: 'workflow:tasks-overdue',
        severity: 'warn',
        source: 'workflow',
        title: '2 tasks are overdue',
        why: '2 open tasks have passed their due date.',
        metricKey: null,
        value: null,
        link: '/tasks',
        dueDate: null,
      },
      {
        id: 'governance:policies-overdue',
        severity: 'warn',
        source: 'governance',
        title: '1 policy is overdue for review',
        why: '1 board policy has passed its scheduled review date.',
        metricKey: null,
        value: null,
        link: '/governance',
        dueDate: null,
      },
    ]
  }

  it('viewer KEEPS the accreditation item, DROPS the workflow item, KEEPS governance', () => {
    const out = applyLens(accItems(), 'viewer').map((i) => i.id)
    expect(out).toContain('accreditation:coverage-gap')
    expect(out).toContain('governance:policies-overdue')
    expect(out).not.toContain('workflow:tasks-overdue')
  })

  it('owner ranks accreditation right after governance and ahead of workflow within a severity', () => {
    const out = applyLens(accItems(), 'owner').map((i) => i.id)
    expect(out.indexOf('governance:policies-overdue')).toBeLessThan(
      out.indexOf('accreditation:coverage-gap'),
    )
    expect(out.indexOf('accreditation:coverage-gap')).toBeLessThan(
      out.indexOf('workflow:tasks-overdue'),
    )
  })

  it('value-safety: applyLens never alters an accreditation item value field', () => {
    const [acc] = accItems()
    const out = applyLens([acc], 'viewer')[0]
    expect(out.id).toBe(acc.id)
    expect(out.severity).toBe(acc.severity)
    expect(out.source).toBe(acc.source)
    expect(out.link).toBe(acc.link)
    expect(out.dueDate).toBe(acc.dueDate)
    expect(out.voice).toBe('governance')
  })
})
