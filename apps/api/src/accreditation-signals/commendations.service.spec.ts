import { describe, expect, it, vi } from 'vitest'
import { AccreditationCommendationsService } from './commendations.service.js'
import { AccreditationCommendationsController } from './commendations.controller.js'
import type { RequirementCurrency } from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — COMMENDATIONS at the API boundary.
//
// The defect this file exists to PIN: when the signal panel cannot value
// anything, the temptation is to fall back to "well, they scored themselves a 4"
// and call it a strength. That is precisely the unverified claim the whole
// program exists to stop shipping. Degraded ⇒ ZERO commendations plus the
// reason, HTTP 200, never a rubric-only list.
// ─────────────────────────────────────────────────────────────────────────────

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  name: 'Cognia',
  rubricLabels: ['Insufficient', 'Initiating', 'Improving', 'Impacting'],
}

function stdRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: 'school-A',
    parentId: null,
    code: 'COG-15',
    title: 'Equitable allocation of resources',
    frameworkId: 'fw-cognia',
    catalogStandardId: 'c15',
    rubricScore: 4,
    ...over,
  }
}

function currency(state: string): RequirementCurrency {
  return {
    tag: 'financial_audit',
    label: 'Annual external financial audit',
    dataAvailability: 'platform',
    sourceRegister: 'knowledge_document',
    windowKind: 'fixed',
    windowMonths: 18,
    state,
    expiresOn: '2027-12-30',
    daysUntilExpiry: 500,
    message: 'm',
    basis: 'fixed_window',
    artifacts: [],
    autoSatisfied: false,
    alsoInPortal: null,
  } as unknown as RequirementCurrency
}

function signalsPayload(over: Record<string, unknown> = {}) {
  return {
    period: { id: 'p1', label: 'FY26', periodEndDate: '2026-06-30' },
    asOf: '2026-07-01T00:00:00.000Z',
    unavailable: null,
    signals: [
      {
        key: 'operating_margin',
        label: 'Operating margin',
        unit: 'percent',
        metricDomain: 'finance',
        goodDirection: 'up',
        formula: '',
        description: '',
        available: true,
        value: 0.062,
        status: 'good',
        bands: null,
        periodOverPeriodDelta: null,
        asOf: '2026-06-30',
        lineage: null,
        unavailable: null,
      },
    ],
    byStandard: { s1: ['operating_margin'] },
    byDomain: {},
    ...over,
  }
}

function makeService(over: {
  standards?: unknown[]
  byStandard?: Record<string, RequirementCurrency[]>
  signals?: unknown | null
  catalog?: unknown[]
} = {}) {
  const prisma = {
    accreditationStandard: { findMany: vi.fn(async () => over.standards ?? [stdRow()]) },
    accreditationFramework: { findMany: vi.fn(async () => [COGNIA]) },
    accreditationCatalogStandard: {
      findMany: vi.fn(async () => over.catalog ?? [{ id: 'c15', isAssurance: false, domainKey: 'finance', domainWeights: null, signalKeys: ['operating_margin'] }]),
    },
  }
  const signals = {
    getSignals: vi.fn(async () => {
      if (over.signals === null) throw new Error('metrics down')
      return over.signals ?? signalsPayload()
    }),
  }
  const currencySvc = {
    getCurrencyByStandard: vi.fn(async () => ({
      byStandard: over.byStandard ?? { s1: [currency('current')] },
      framework: COGNIA,
      demoData: false,
    })),
  }
  const svc = new AccreditationCommendationsService(
    prisma as never,
    signals as never,
    currencySvc as never,
  )
  return { svc, prisma, signals, currencySvc }
}

describe('AccreditationCommendationsService', () => {
  it('all three conditions met → one commendation, formatted through the canonical formatter', async () => {
    const { svc } = makeService()
    const res = await svc.getCommendations('school-A')
    expect(res.commendations).toHaveLength(1)
    expect(res.commendations[0].narrative).toBe(
      'COG-15 — Equitable allocation of resources: scored Impacting of 4, backed by 1 current artifact and 1 favorable operating figure (Operating margin 6.2% as of 2026-06-30).',
    )
    expect(res.exclusions.eligible).toBe(1)
    expect(res.caveat).toBe(
      'Strengths we can defend: a strong self-score, current evidence, and a favorable operating figure — all three. 1 of 1 standards qualify.',
    )
    expect(res.signalsUnavailable).toBeNull()
  })

  it('SIGNALS UNAVAILABLE → zero commendations plus the reason, never a rubric-only list', async () => {
    const { svc } = makeService({
      signals: signalsPayload({
        unavailable: { reason: 'no_snapshot', message: 'No saved statements yet — import a trial balance to light these signals.' },
        signals: [
          {
            key: 'operating_margin',
            label: 'Operating margin',
            unit: 'percent',
            metricDomain: 'finance',
            goodDirection: 'up',
            formula: '',
            description: '',
            available: false,
            value: null,
            status: 'neutral',
            bands: null,
            periodOverPeriodDelta: null,
            asOf: null,
            lineage: null,
            unavailable: { reason: 'no_data', message: 'x' },
          },
        ],
      }),
    })
    const res = await svc.getCommendations('school-A')
    // The rubric is a 4 and the evidence is current — and it still does not
    // qualify, because a self-score plus a folder is not a defensible strength.
    expect(res.commendations).toEqual([])
    expect(res.exclusions.noFavorableSignal).toBe(1)
    expect(res.signalsUnavailable).toEqual({
      reason: 'no_snapshot',
      message: 'No saved statements yet — import a trial balance to light these signals.',
    })
    expect(res.caveat).toContain('0 of 1 standards qualify')
  })

  it('a signal COMPUTE that throws is still a 200 with an explained empty list', async () => {
    const { svc } = makeService({ signals: null })
    const res = await svc.getCommendations('school-A')
    expect(res.commendations).toEqual([])
    expect(res.signalsUnavailable?.reason).toBe('metrics_unavailable')
  })

  it('an UNLICENSED metric never leaks a value into a commendation', async () => {
    // The panel already nulls the value and flags module_not_licensed; we must
    // not re-derive availability or the number would reappear here.
    const { svc } = makeService({
      signals: signalsPayload({
        signals: [
          {
            key: 'operating_margin',
            label: 'Operating margin',
            unit: 'percent',
            metricDomain: 'finance',
            goodDirection: 'up',
            formula: '',
            description: '',
            available: false,
            value: null,
            status: 'neutral',
            bands: null,
            periodOverPeriodDelta: null,
            asOf: null,
            lineage: null,
            unavailable: { reason: 'module_not_licensed', moduleKey: 'finance', message: 'Unlock…' },
          },
        ],
      }),
    })
    const res = await svc.getCommendations('school-A')
    expect(res.commendations).toEqual([])
    expect(JSON.stringify(res)).not.toContain('6.2%')
  })

  it('EXPIRING evidence does not qualify — only current does', async () => {
    const { svc } = makeService({ byStandard: { s1: [currency('expiring')] } })
    const res = await svc.getCommendations('school-A')
    expect(res.commendations).toEqual([])
    expect(res.exclusions.noCurrentEvidence).toBe(1)
  })

  it('an ASSURANCE gate is never a commendation (it is a checklist item)', async () => {
    const { svc } = makeService({
      standards: [stdRow({ id: 's1', code: 'COG-A2', catalogStandardId: 'cA2' })],
      catalog: [{ id: 'cA2', isAssurance: true, domainKey: 'finance', domainWeights: null, signalKeys: [] }],
    })
    const res = await svc.getCommendations('school-A')
    expect(res.commendations).toEqual([])
    expect(res.caveat).toContain('0 of 0 standards qualify')
  })

  it('a school with no standards at all is a clean, explained empty payload', async () => {
    const { svc } = makeService({ standards: [], byStandard: {}, catalog: [] })
    const res = await svc.getCommendations('school-A')
    expect(res.commendations).toEqual([])
    expect(res.exclusions).toEqual({
      eligible: 0,
      noScore: 0,
      lowScore: 0,
      noRequirements: 0,
      noCurrentEvidence: 0,
      noFavorableSignal: 0,
    })
    expect(res.caveat).toContain('0 of 0 standards qualify')
  })
})

describe('module wiring', () => {
  it('the controller and its service load together — an import CYCLE would fail here', async () => {
    // AccreditationSignalsModule gained a direct AccreditationModule import.
    // If anyone reintroduces accreditation → analytics, this ESM import graph
    // resolves to a partially-initialised module and the constructor blows up.
    const mod = await import('./accreditation-signals.module.js')
    expect(mod.AccreditationSignalsModule).toBeDefined()
    const { svc } = makeService()
    const controller = new AccreditationCommendationsController(svc)
    const res = await controller.get('school-A', {})
    expect(res.commendations).toHaveLength(1)
  })
})
