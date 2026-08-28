import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { AccreditationExplainerService } from './accreditation-explainer.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F3 — the STANDARD EXPLAINER. The honesty rules under test:
//   • a foreign/cross-tenant standardId 404s (the compound-lookup rule);
//   • a NULL plainLanguage passes through as null — nothing invented, ever;
//   • the checklist is the SAME currency build the Evidence Index serves,
//     with server-authored whereItLives strings;
//   • hand-made standards (no catalog link) explain honestly: no statement,
//     no plain language, no checklist — never lorem.
// ─────────────────────────────────────────────────────────────────────────────

const STD = {
  id: 'std-1',
  schoolId: 'school-A',
  code: 'COG-8',
  title: 'The governing authority demonstrates a commitment to learners…',
  rubricScore: 3,
  frameworkId: 'fw-2025',
  catalogStandardId: 'cat-8',
}

const CATALOG = {
  id: 'cat-8',
  code: 'COG-8',
  title:
    "The governing authority demonstrates a commitment to learners by collaborating with leaders to uphold the institution's priorities and to drive continuous improvement.",
  plainLanguage:
    "Does your governing authority genuinely work with school leadership to uphold the school's priorities and push improvement forward — with minutes to show it?",
  signalKeys: ['days_cash_on_hand'],
  parent: { code: 'COG-KC2', title: 'Leadership for Learning' },
}

const FRAMEWORK = {
  id: 'fw-2025',
  code: 'cognia_2025',
  rubricLabels: ['Insufficient', 'Developing', 'Engaging', 'Demonstrating'],
  rubricDescriptors: [
    'Reflecting areas with insufficient evidence and/or limited activity leading toward improvement',
    'Developing or improving practices that provide evidence that effort approaches desired level of effectiveness',
    'Engaging in practices that provide evidence of expected effectiveness that is reflected in the standard',
    'Demonstrating noteworthy practices producing clear results that positively impact learners',
  ],
}

function makeService(over: {
  standard?: Record<string, unknown> | null
  catalog?: Record<string, unknown> | null
  currency?: Record<string, unknown[]>
  suggestions?: unknown[]
} = {}) {
  const prisma = {
    accreditationStandard: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; schoolId: string } }) => {
        const std = over.standard === undefined ? STD : over.standard
        if (!std) return null
        return where.id === std.id && where.schoolId === std.schoolId ? std : null
      }),
    },
    accreditationCatalogStandard: {
      findFirst: vi.fn(async () => (over.catalog === undefined ? CATALOG : over.catalog)),
    },
    accreditationFramework: { findFirst: vi.fn(async () => FRAMEWORK) },
  }
  const accreditation = {
    listSuggestions: vi.fn(async () => ({ suggestions: over.suggestions ?? [{ sourceType: 'policy', sourceRef: 'p-1' }] })),
  }
  const evidenceReadiness = {
    getCurrencyByStandard: vi.fn(async () => ({
      byStandard: over.currency ?? {
        'std-1': [
          {
            tag: 'board_minutes',
            label: 'Approved board minutes',
            dataAvailability: 'platform',
            sourceRegister: 'meeting',
            windowKind: 'fixed',
            windowMonths: 6,
            state: 'current',
            artifacts: [{ id: 'a1' }, { id: 'a2' }],
          },
          {
            tag: 'policy_manual',
            label: 'Board policy manual',
            dataAvailability: 'platform',
            sourceRegister: 'policy',
            windowKind: 'source_interval',
            windowMonths: null,
            state: 'missing',
            artifacts: [],
          },
        ],
      },
      framework: null,
      demoData: false,
    })),
  }
  const svc = new AccreditationExplainerService(
    prisma as never,
    accreditation as never,
    evidenceReadiness as never,
  )
  return { svc, prisma, accreditation, evidenceReadiness }
}

describe('explainer — the whole story of one standard', () => {
  it('composes statement, plain language, KC, rubric position, live checklist and suggestions', async () => {
    const { svc } = makeService()
    const res = await svc.getExplainer('school-A', 'std-1')
    expect(res.code).toBe('COG-8')
    expect(res.statement).toBe(CATALOG.title)
    expect(res.plainLanguage).toBe(CATALOG.plainLanguage)
    expect(res.keyCharacteristic).toEqual({ code: 'COG-KC2', label: 'Leadership for Learning' })
    // Rubric: four steps, the long-form descriptor beside each word, current marked.
    expect(res.rubric).toHaveLength(4)
    expect(res.rubric[2]).toEqual({
      score: 3,
      label: 'Engaging',
      descriptor: FRAMEWORK.rubricDescriptors[2],
      current: true,
    })
    expect(res.rubric.filter((r) => r.current)).toHaveLength(1)
    // The checklist: live currency states + server-authored whereItLives.
    expect(res.evidenceChecklist).toEqual([
      expect.objectContaining({
        tag: 'board_minutes',
        whereItLives: 'Governance meetings',
        window: 'Refresh every 6 months',
        state: 'current',
        artifactCount: 2,
      }),
      expect.objectContaining({
        tag: 'policy_manual',
        whereItLives: 'Governance policies',
        window: "Follows its owning register's own review cycle",
        state: 'missing',
        artifactCount: 0,
      }),
    ])
    expect(res.signals).toEqual([
      { key: 'days_cash_on_hand', label: expect.any(String), availability: null },
    ])
    expect(res.suggestions).toHaveLength(1)
  })

  it('a foreign / cross-tenant standardId 404s', async () => {
    const { svc } = makeService()
    await expect(svc.getExplainer('school-B', 'std-1')).rejects.toBeInstanceOf(NotFoundException)
    await expect(svc.getExplainer('school-A', 'std-nope')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('a NULL plainLanguage passes through as null — the drawer omits the block, nothing invented', async () => {
    const { svc } = makeService({ catalog: { ...CATALOG, plainLanguage: null } })
    const res = await svc.getExplainer('school-A', 'std-1')
    expect(res.plainLanguage).toBeNull()
    expect(res.statement).toBe(CATALOG.title)
  })

  it('a HAND-MADE standard explains honestly: no statement, no plain text, no KC', async () => {
    const { svc } = makeService({
      standard: { ...STD, catalogStandardId: null, frameworkId: null },
      catalog: null,
    })
    const res = await svc.getExplainer('school-A', 'std-1')
    expect(res.statement).toBeNull()
    expect(res.plainLanguage).toBeNull()
    expect(res.keyCharacteristic).toBeNull()
    expect(res.rubric).toEqual([]) // no framework → no labels to render
    expect(res.signals).toEqual([])
  })

  it('a degraded currency read costs the checklist, never the drawer (fail-soft)', async () => {
    const { svc, evidenceReadiness } = makeService()
    evidenceReadiness.getCurrencyByStandard.mockRejectedValueOnce(new Error('down'))
    const res = await svc.getExplainer('school-A', 'std-1')
    expect(res.evidenceChecklist).toEqual([])
    expect(res.statement).toBe(CATALOG.title)
  })
})
