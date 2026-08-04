import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ImprovementPlanDrafterService,
  emptyDraftReason,
  MAX_DRAFT_STEPS,
} from './improvement-plan-drafter.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// MA-3 — MODE A NEVER CALLS A LANGUAGE MODEL.
//
// This file is named in improvement-plan-drafter.service.ts's own header comment
// as the proof of that guarantee. IT DID NOT EXIST. The single strongest claim the
// phase makes about its only write path — "not called and then guarded; NEVER
// CALLED" — was defended by a comment describing a test nobody had written.
//
// SEEN RED. Adding an AssistantClient import to the service (improvement.module.spec.ts
// forbids naming the path here) reddens MA-3.1 and MA-3.2. Making `emptyDraftReason` return one
// string for every basis reddens MA-3.5.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_SRC = readFileSync(
  fileURLToPath(new URL('./improvement-plan-drafter.service.ts', import.meta.url)),
  'utf8',
)

/**
 * THE CODE, WITH COMMENTS STRIPPED. The file's own header talks ABOUT never calling
 * `assistant.client`, and a naive grep over the raw source therefore matches the
 * sentence promising the opposite — a screen that fails on its own documentation is
 * a screen that gets deleted. Every assertion below runs on this.
 */
const CODE = SERVICE_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

describe('MA-3 — the drafter cannot reach a model', () => {
  it('MA-3.1 the source names no assistant client', () => {
    expect(CODE).not.toMatch(/assistant\.client/i)
    expect(CODE).not.toMatch(/AssistantClient/)
  })

  it('MA-3.2 it imports nothing from the assistant module at all', () => {
    const imports = [...CODE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const spec of imports) {
      expect(spec, `the drafter imports ${spec}`).not.toMatch(/assistant/i)
    }
  })

  it('MA-3.3 it mentions no prompt, no completion and no model', () => {
    for (const forbidden of [/\.chat\(/, /openai/i, /anthropic/i, /\bcompletions?\b/i]) {
      expect(CODE, `the drafter references ${forbidden}`).not.toMatch(forbidden)
    }
  })

  it('MA-3.4 its constructor takes Prisma plus ONE domain service, like the strategy drafter', () => {
    const ctor = /constructor\(([\s\S]*?)\)\s*\{/.exec(CODE)?.[1] ?? ''
    expect(ctor).toContain('PrismaService')
    expect(ctor).toContain('ImprovementService')
    // The "Cannot access 'X' before initialization" crash-loop class has taken this
    // container down twice; a drafter is exactly the sort of late addition that
    // reaches for a heavy service because it is convenient.
    for (const heavy of ['AnalyticsService', 'InsightService', 'BriefingService', 'AssistantService']) {
      expect(ctor, `the drafter injects ${heavy}`).not.toContain(heavy)
    }
  })

  it('MA-3.5 the three "nothing to draft" reasons stay DISTINCT', () => {
    const unlicensed = emptyDraftReason({ accreditationLicensed: false, frameworkAdopted: false })
    const noFramework = emptyDraftReason({ accreditationLicensed: true, frameworkAdopted: false })
    const allClear = emptyDraftReason({ accreditationLicensed: true, frameworkAdopted: true })
    expect(new Set([unlicensed, noFramework, allClear]).size).toBe(3)
    // The one that matters: an unread register must NEVER read as an all-clear.
    expect(unlicensed).toMatch(/not licensed/i)
    expect(unlicensed).toMatch(/not a finding that your school is clear/i)
    expect(unlicensed).not.toMatch(/already being worked/i)
    expect(noFramework).toMatch(/framework/i)
    expect(allClear).toMatch(/already being worked/i)
  })

  it('MA-3.6 draft() reads the rail and writes NOTHING', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const getRecommendations = vi.fn().mockResolvedValue({
      basis: { accreditationLicensed: true, frameworkAdopted: true },
      demoData: false,
      recommendations: [
        {
          title: 'Move COG-1.1 up one rubric level',
          rationale: 'COG-1.1 is rated Emerging today.',
          findingKey: null,
          originType: 'gap',
          originRef: 'std-1',
          standardTags: ['governance'],
          suggestedTargetRubricScore: 3,
        },
      ],
    })
    const create = vi.fn()
    const prisma = { improvementInitiative: { findFirst, create } } as never
    const improvement = { getRecommendations, createInitiative: create } as never

    const svc = new ImprovementPlanDrafterService(prisma, improvement)
    const plan = await svc.draft('sch-1', {})

    // Every string traces to a Recommendation field or a frozen template.
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].label).toBe('Move COG-1.1 up one rubric level')
    expect(plan.steps[0].rationale).toBe('COG-1.1 is rated Emerging today.')
    expect(plan.title).toMatch(/^Improvement plan: 1 recommended step$/)
    expect(plan.alreadyDraftedInitiativeId).toBeNull()
    // NOTHING WAS WRITTEN.
    expect(create).not.toHaveBeenCalled()
  })

  it('MA-3.7 an existing live draft is returned as THAT draft, and still nothing is written', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'init-9' })
    const getRecommendations = vi.fn().mockResolvedValue({
      basis: { accreditationLicensed: true, frameworkAdopted: true },
      demoData: false,
      recommendations: [
        {
          title: 'Attach evidence to COG-2.3',
          rationale: 'COG-2.3 carries no artifacts.',
          findingKey: 'ACC-EVIDENCE-GAP:standard:std-2',
          originType: 'finding',
          originRef: 'ACC-EVIDENCE-GAP:standard:std-2',
          standardTags: [],
          suggestedTargetRubricScore: null,
        },
      ],
    })
    const create = vi.fn()
    const svc = new ImprovementPlanDrafterService(
      { improvementInitiative: { findFirst, create } } as never,
      { getRecommendations, createInitiative: create } as never,
    )
    const plan = await svc.draft('sch-1', {})
    expect(plan.alreadyDraftedInitiativeId).toBe('init-9')
    expect(create).not.toHaveBeenCalled()
  })

  it('MA-3.8 `limit` is clamped, never trusted', async () => {
    const recs = Array.from({ length: 20 }, (_, i) => ({
      title: `Step ${i}`,
      rationale: 'r',
      findingKey: null,
      originType: 'gap',
      originRef: `std-${i}`,
      standardTags: [],
      suggestedTargetRubricScore: null,
    }))
    const svc = new ImprovementPlanDrafterService(
      { improvementInitiative: { findFirst: vi.fn().mockResolvedValue(null) } } as never,
      {
        getRecommendations: vi.fn().mockResolvedValue({
          basis: { accreditationLicensed: true, frameworkAdopted: true },
          demoData: false,
          recommendations: recs,
        }),
      } as never,
    )
    const plan = await svc.draft('sch-1', { limit: 999 })
    expect(plan.steps.length).toBeLessThanOrEqual(MAX_DRAFT_STEPS)
  })
})
