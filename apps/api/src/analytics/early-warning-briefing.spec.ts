import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { TWIN_RULE_IDS, VISIBLE_HOLE_RULE_IDS } from '@finrep/compliance'
import {
  BriefingService,
  EARLY_WARNING_BRIEFABLE_RULE_IDS,
  EARLY_WARNING_MAX_ITEMS,
  EARLY_WARNING_SUPPRESSED,
} from './briefing.service.js'
import { applyLens } from './briefing-lens.js'
import type { AttentionItem } from './briefing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — BRIEFING STEP 2.16.
//
// THE ONE IDEA THIS FILE DEFENDS: the warning engine contributes the
// ACCREDITATION CONSEQUENCE, never the operational restatement. Everything below
// is a way of failing the build when that stops being true —
//
//   • the CAP is in code, before any lens: 40 findings -> 2 items, every lens
//   • the SUPPRESSION TABLE is total over the firing rules: a new rule that is on
//     neither side FAILS THIS SPEC rather than silently appearing in the briefing
//   • the GATE is fail-closed: a finance-only school gets zero items (acceptance 7)
//   • the READ is fail-soft: a throwing query is zero items and a 200
//   • the COPY is outcome-voiced: no operator CTA, no coverage-count restatement
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2026' }

interface Seed {
  ruleId: string
  severity?: string
  standardTags?: string[]
  title?: string
  rationale?: string
  consequence?: string
  mutedUntil?: Date | null
  horizonKind?: string
  horizonDate?: Date | null
  /** A row an older engine wrote: no title, no rationale — it composes to null. */
  malformed?: boolean
}

function seedRow(s: Seed, i: number) {
  return {
    ruleId: s.ruleId,
    findingKey: `${s.ruleId}:scope-${i}`,
    severity: s.severity ?? 'warn',
    standardTags: s.standardTags ?? ['COG-8'],
    horizonKind: s.horizonKind ?? 'none',
    horizonDate: s.horizonDate ?? null,
    mutedUntil: s.mutedUntil ?? null,
    status: 'open',
    clearedAt: null,
    evidencePayload: s.malformed
      ? {}
      : {
          title: s.title ?? 'A finding title',
          rationale: s.rationale ?? 'A stored rationale.',
          consequence: s.consequence ?? 'A stored consequence.',
        },
  }
}

/**
 * A BriefingService whose ONLY live signal is the findings ledger. Every other
 * source is stubbed empty so an assertion about `earlywarning` items cannot be
 * satisfied — or broken — by something else in the briefing.
 */
function makeService(over: {
  licensed?: boolean
  seeds?: Seed[]
  findManyThrows?: boolean
  capture?: (args: Record<string, unknown>) => void
  /** Return rows WARN-FIRST, simulating a collation the orderBy does not promise. */
  hostileOrder?: boolean
}) {
  const rows = (over.seeds ?? []).map(seedRow)
  const findMany = vi.fn(async (args: Record<string, unknown>) => {
    over.capture?.(args)
    if (over.findManyThrows) throw new Error('relation "accreditation_findings" does not exist')
    const where = args.where as Record<string, never>
    const allowed = new Set((where.ruleId as { in: string[] } | undefined)?.in ?? [])
    const sevs = new Set((where.severity as { in: string[] } | undefined)?.in ?? [])
    return rows
      .filter((r) => allowed.size === 0 || allowed.has(r.ruleId))
      .filter((r) => sevs.size === 0 || sevs.has(r.severity))
      .filter((r) => r.mutedUntil === null || r.mutedUntil.getTime() <= Date.now())
      .sort((a, b) =>
        over.hostileOrder
          ? b.severity.localeCompare(a.severity)
          : a.severity.localeCompare(b.severity),
      )
      .slice(0, args.take as number)
  })

  const billing = {
    isEntitledForModule: async (_s: string, moduleKey: string) =>
      moduleKey === 'accreditation' ? (over.licensed ?? true) : false,
  }

  return {
    findMany,
    svc: new BriefingService(
      { getOwnedPeriod: async () => PERIOD } as never,
      { computeMetricsResponse: async () => ({ metrics: [] }) } as never,
      { evaluateForPeriod: async () => null } as never,
      { getChecklist: async () => null } as never,
      { reconcileForPeriod: async () => null } as never,
      { getPlan: async () => null } as never,
      billing as never,
      { list: async () => ({ policies: [] }) } as never,
      {
        listMeetings: async () => ({
          meetings: [],
          summary: {
            total: 0,
            upcomingCount: 0,
            agendaMissingSoonCount: 0,
            minutesPendingCount: 0,
            minutesOverdueCount: 0,
            nextMeetingAt: null,
            earliestMinutesPendingHeldAt: null,
          },
        }),
      } as never,
      { listOpenForBriefing: async () => [] } as never,
      {
        listStandards: async () => ({
          standards: [],
          summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 },
          ratingSummary: null,
        }),
      } as never,
      {
        listMaintenance: async () => ({
          items: [],
          summary: {
            total: 0,
            openCount: 0,
            highPriorityOpenCount: 0,
            criticalOpen: 0,
            overdueOpen: 0,
            backlogCost: 0,
          },
        }),
      } as never,
      {
        listCampaigns: async () => ({
          campaigns: [],
          summary: {
            total: 0,
            activeCount: 0,
            totalGoal: 0,
            totalRaised: 0,
            overallPctOfGoal: null,
            behindGoalActiveCount: 0,
            closingSoonActiveCount: 0,
            overdueActiveCount: 0,
          },
        }),
      } as never,
      { getActivePlanComputed: async () => ({ hasPlan: false }) } as never,
      { accreditationFinding: { findMany } } as never,
    ),
  }
}

const ew = (items: AttentionItem[]) => items.filter((i) => i.source === 'earlywarning')

describe('STEP 2.16 — the suppression table is TOTAL over the firing rules', () => {
  const firing = TWIN_RULE_IDS.filter(
    (id) => !(VISIBLE_HOLE_RULE_IDS as readonly string[]).includes(id),
  )

  it('every firing rule is CONSCIOUSLY suppressed or briefable — never neither', () => {
    const covered = new Set<string>([...EARLY_WARNING_SUPPRESSED, ...EARLY_WARNING_BRIEFABLE_RULE_IDS])
    const missing = firing.filter((id) => !covered.has(id))
    expect(missing, `unclassified rule(s): ${missing.join(', ')}`).toEqual([])
  })

  it('…and never BOTH', () => {
    const both = EARLY_WARNING_BRIEFABLE_RULE_IDS.filter((id) => EARLY_WARNING_SUPPRESSED.has(id))
    expect(both).toEqual([])
  })

  it('names no rule that does not exist, and no VISIBLE HOLE', () => {
    const all = new Set<string>(TWIN_RULE_IDS)
    const holes = new Set<string>(VISIBLE_HOLE_RULE_IDS)
    for (const id of [...EARLY_WARNING_SUPPRESSED, ...EARLY_WARNING_BRIEFABLE_RULE_IDS]) {
      expect(all.has(id), `${id} is not a rule id`).toBe(true)
      // A rule that can never evaluate can never fire, so it can never brief.
      expect(holes.has(id), `${id} is a visible hole and cannot brief`).toBe(false)
    }
  })

  // The count is DERIVED from the two tables and the rule vocabulary, never
  // retyped. A hardcoded "eleven" is a number that goes stale the moment a rule is
  // appended — which is exactly what happened when AIC Phase F added three — and a
  // stale literal fails the suite without telling anyone anything they did not
  // already know from the totality assertion above.
  it('the two tables PARTITION the firing rules exactly — no gap, no overlap', () => {
    expect(EARLY_WARNING_BRIEFABLE_RULE_IDS.length + EARLY_WARNING_SUPPRESSED.size).toBe(
      firing.length,
    )
    expect(new Set(EARLY_WARNING_BRIEFABLE_RULE_IDS).size).toBe(
      EARLY_WARNING_BRIEFABLE_RULE_IDS.length,
    )
    // …and the firing set is the vocabulary minus the four visible holes.
    expect(firing.length).toBe(TWIN_RULE_IDS.length - VISIBLE_HOLE_RULE_IDS.length)
  })

  it('every AIC Phase-F rule landed on exactly one side of the table', () => {
    // A rule on neither side FAILS THE BUILD by design (§3.7); this names the
    // three so a reader can see which side each was consciously put on.
    expect(EARLY_WARNING_BRIEFABLE_RULE_IDS).toContain('HR-EVAL-OVERDUE')
    expect(EARLY_WARNING_BRIEFABLE_RULE_IDS).toContain('FAC-INSPECTION-DUE')
    expect(EARLY_WARNING_BRIEFABLE_RULE_IDS).toContain('ACC-PRIOR-FINDING-OPEN')
  })
})

describe('STEP 2.16 — the gate and the cap', () => {
  it('ACCEPTANCE 7: a finance-only school gets ZERO early-warning items', async () => {
    const h = makeService({
      licensed: false,
      seeds: [{ ruleId: 'ACC-ASSURANCE-GAP', severity: 'critical' }],
    })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(ew(res.items)).toHaveLength(0)
  })

  it('the cap does not TRUST the database order — a critical survives a hostile sort', async () => {
    // The orderBy was luck, not design: `severity` is a plain String column and
    // 'critical' < 'warn' only lexically. With the two-item cap downstream, any
    // collation or vocabulary change that reordered rows would silently drop the
    // critical. The service now re-ranks in code; this feeds it WARN-FIRST rows
    // and demands the critical lead anyway.
    const h = makeService({
      hostileOrder: true,
      seeds: [
        { ruleId: 'GOV-CADENCE-GAP', severity: 'warn', standardTags: ['COG-1'] },
        { ruleId: 'EVI-STALE', severity: 'warn', standardTags: ['COG-2'] },
        { ruleId: 'ACC-ASSURANCE-GAP', severity: 'critical', standardTags: ['COG-A1'] },
      ],
    })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    const items = ew(res.items)
    expect(items).toHaveLength(2)
    expect(items[0].severity).toBe('critical')
  })

  it('ACCEPTANCE 4: forty open findings produce EXACTLY TWO items, under every lens', async () => {
    const seeds: Seed[] = Array.from({ length: 40 }, (_, i) => ({
      ruleId: EARLY_WARNING_BRIEFABLE_RULE_IDS[i % EARLY_WARNING_BRIEFABLE_RULE_IDS.length],
      severity: i % 3 === 0 ? 'critical' : 'warn',
      standardTags: [`COG-${i}`],
    }))
    for (const lens of ['owner', 'accountant', 'viewer'] as const) {
      const h = makeService({ seeds })
      const res = await h.svc.getBriefing('school-1', PERIOD.id, lens)
      expect(ew(res.items)).toHaveLength(EARLY_WARNING_MAX_ITEMS)
    }
  })

  it('the CAP is 2 and it is applied BEFORE the lens', () => {
    expect(EARLY_WARNING_MAX_ITEMS).toBe(2)
  })

  it('TWO findings of the SAME rule emit ONE item — ids are distinct, always', async () => {
    // ACC-ASSURANCE-GAP is per-STANDARD: a school with two standards holding unmet
    // assurance gates is the common case. Both rows pass the briefable filter, and
    // the id is derived from the ruleId alone — so without a dedupe the cap emits
    // two AttentionItems with an identical id: duplicate React keys on the home
    // briefing, a non-total localeCompare tiebreak in applyLens, and a colliding
    // `${schoolId}:${item.id}` in the org roll-up.
    const h = makeService({
      seeds: [
        { ruleId: 'ACC-ASSURANCE-GAP', severity: 'critical', standardTags: ['COG-A1'], title: 'One' },
        { ruleId: 'ACC-ASSURANCE-GAP', severity: 'critical', standardTags: ['COG-A2'], title: 'Two' },
      ],
    })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    const items = ew(res.items)
    expect(items).toHaveLength(1)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('ids are distinct under the FULL forty-finding cap too', async () => {
    const seeds: Seed[] = Array.from({ length: 40 }, (_, i) => ({
      ruleId: EARLY_WARNING_BRIEFABLE_RULE_IDS[i % EARLY_WARNING_BRIEFABLE_RULE_IDS.length],
      severity: i % 3 === 0 ? 'critical' : 'warn',
      standardTags: [`COG-${i}`],
    }))
    const res = await makeService({ seeds }).svc.getBriefing('school-1', PERIOD.id, 'owner')
    const items = ew(res.items)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('a MALFORMED payload in the top rows does not consume a cap slot', async () => {
    // A row written by an older engine (the stamp went 1.0.0 → 1.1.0 this phase)
    // can lack `title`/`rationale` and compose to null. Slicing the ROWS first let
    // it eat a slot and silently suppress a valid warning behind it.
    const h = makeService({
      seeds: [
        { ruleId: 'ACC-ASSURANCE-GAP', severity: 'critical', malformed: true },
        { ruleId: 'FIN-AUDIT-STALE', severity: 'warn', title: 'Audit is stale' },
        { ruleId: 'GOV-CADENCE-GAP', severity: 'warn', title: 'Cadence gap' },
      ],
    })
    const items = ew((await h.svc.getBriefing('school-1', PERIOD.id, 'owner')).items)
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.id).sort()).toEqual([
      'earlywarning:fin-audit-stale',
      'earlywarning:gov-cadence-gap',
    ])
  })

  it('a throwing ledger read is ZERO items and a 200 — never a partial briefing', async () => {
    const h = makeService({ findManyThrows: true, seeds: [{ ruleId: 'ACC-UNSCORED' }] })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(ew(res.items)).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })
})

describe('STEP 2.16 — what reaches the briefing, and what does not', () => {
  it('EVERY suppressed ruleId produces ZERO items, even seeded alone', async () => {
    for (const ruleId of EARLY_WARNING_SUPPRESSED) {
      const h = makeService({ seeds: [{ ruleId, severity: 'critical' }] })
      const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
      expect(ew(res.items), `${ruleId} leaked into the briefing`).toHaveLength(0)
    }
  })

  it('EVERY briefable ruleId produces one item when it is alone', async () => {
    for (const ruleId of EARLY_WARNING_BRIEFABLE_RULE_IDS) {
      const h = makeService({ seeds: [{ ruleId, severity: 'warn' }] })
      const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
      const items = ew(res.items)
      expect(items, `${ruleId} produced no item`).toHaveLength(1)
      expect(items[0].id).toBe(`earlywarning:${ruleId.toLowerCase()}`)
    }
  })

  it('the SQL carries the suppression table, the severities and the mute window', async () => {
    let args: Record<string, unknown> | null = null
    const h = makeService({ seeds: [], capture: (a) => (args = a) })
    await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    const where = (args as unknown as { where: Record<string, unknown> }).where
    expect(where.clearedAt).toBeNull()
    expect(where.status).toEqual({ notIn: ['resolved', 'dismissed'] })
    expect(where.severity).toEqual({ in: ['critical', 'warn'] })
    expect((where.ruleId as { in: string[] }).in).toEqual([...EARLY_WARNING_BRIEFABLE_RULE_IDS])
    expect(where.OR).toHaveLength(2)
    expect((args as unknown as { take: number }).take).toBe(20)
    // 'critical' sorts before 'warn' ALPHABETICALLY. Pinned so a future severity
    // value cannot silently reorder the two items a school actually sees.
    expect((args as unknown as { orderBy: unknown[] }).orderBy[0]).toEqual({ severity: 'asc' })
    expect('critical' < 'warn').toBe(true)
  })

  it('G3 AT THE BRIEFING TOO: a finding with no standard code produces no item', async () => {
    const h = makeService({ seeds: [{ ruleId: 'ACC-UNSCORED', standardTags: [] }] })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(ew(res.items)).toHaveLength(0)
  })

  it('a finding whose stored payload has no composed prose produces no item', async () => {
    // The engine composes and validates the sentence; if it is not there, the
    // briefing does not invent one.
    const bad = makeService({ seeds: [{ ruleId: 'ACC-UNSCORED' }] })
    // Blank the payload to simulate a legacy or partially-written row.
    bad.findMany.mockImplementationOnce(
      async () => [{ ...seedRow({ ruleId: 'ACC-UNSCORED' }, 0), evidencePayload: {} }] as never,
    )
    const res = await bad.svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(ew(res.items)).toHaveLength(0)
  })
})

describe('STEP 2.16 — the item itself', () => {
  it('leads with the standard code, links to the Signals tab, and never composes a number', async () => {
    const h = makeService({
      seeds: [
        {
          ruleId: 'ACC-ASSURANCE-GAP',
          severity: 'critical',
          standardTags: ['COG-A2'],
          title: 'An assurance gate has no evidence attached',
          rationale: 'COG-A2 is an assurance gate with 0 artifacts attached.',
          consequence:
            'Assurances are pass or fail. An unmet one is not a low score — it is the accreditation blocked until it is met.',
        },
      ],
    })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    const item = ew(res.items)[0]
    expect(item.title).toBe('COG-A2 — An assurance gate has no evidence attached')
    expect(item.why).toBe(
      'COG-A2 is an assurance gate with 0 artifacts attached. Assurances are pass or fail. An unmet one is not a low score — it is the accreditation blocked until it is met.',
    )
    // The link carries the SCOPE as well as the rule. The cap emits one item per
    // ruleId, but this rule is per-standard — so without `finding` the page cannot
    // tell which of several same-rule findings the brief actually named, and it
    // marked all of them "From your briefing".
    expect(item.link).toBe(
      '/accreditation?center=signals&rule=ACC-ASSURANCE-GAP&finding=ACC-ASSURANCE-GAP%3Ascope-0',
    )
    expect(item.metricKey).toBeNull()
    expect(item.value).toBeNull()
    expect(item.severity).toBe('critical')
  })

  it('a STATED register date becomes a dueDate; a projection never does', async () => {
    const dated = makeService({
      seeds: [
        {
          ruleId: 'STRAT-PLAN-EXPIRED',
          horizonKind: 'by_date',
          horizonDate: new Date('2027-06-30T00:00:00.000Z'),
        },
      ],
    })
    expect(ew((await dated.svc.getBriefing('s', PERIOD.id, 'owner')).items)[0].dueDate).toBe(
      '2027-06-30',
    )

    const projected = makeService({
      seeds: [{ ruleId: 'ACC-UNSCORED', horizonKind: 'periods_to_breach' }],
    })
    expect(ew((await projected.svc.getBriefing('s', PERIOD.id, 'owner')).items)[0].dueDate).toBeNull()
  })

  it('survives keepForViewer — an accreditation consequence is a board matter', async () => {
    const h = makeService({ seeds: [{ ruleId: 'ACC-ASSURANCE-GAP', severity: 'critical' }] })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(ew(res.items)).toHaveLength(1)
    expect(res.items.find((i) => i.source === 'earlywarning')?.voice).toBe('governance')
  })
})

describe('STEP 2.16 — the copy constraints', () => {
  it("ACC-ASSURANCE-GAP's why never restates a coverage count", async () => {
    const h = makeService({
      seeds: [
        {
          ruleId: 'ACC-ASSURANCE-GAP',
          severity: 'critical',
          standardTags: ['COG-A2'],
          rationale: 'COG-A2 is an assurance gate with 0 artifacts attached.',
        },
      ],
    })
    const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(ew(res.items)[0].why).not.toMatch(/\d+ of \d+ standard/)
  })

  // FAC-INSPECTION-DUE is briefable ALONGSIDE a suppressed FAC-BACKLOG, and the
  // justification in briefing.service.ts is that the two say different things:
  // STEP 2.8 already states the backlog SIZE, so this item earns its slot only by
  // naming the INSPECTION KIND and the STANDARD it is cited under. That is a
  // promise about copy, so it is asserted about copy — over the sentences the pure
  // engine actually freezes, not over a hand-written fixture.
  it("FAC-INSPECTION-DUE's why names the kind and the standard, and restates no backlog count", async () => {
    const h = makeService({
      seeds: [
        {
          ruleId: 'FAC-INSPECTION-DUE',
          severity: 'critical',
          standardTags: ['COG-A3'],
          title: 'A recorded compliance inspection is past its own target date',
          rationale:
            'A recorded fire and life-safety inspection is past its own target date, by 12 days.',
          consequence:
            "Cognia's safety assurance is a binary gate and MSA and NSBECS both name facilities adequacy. An inspection your own register says is past due is the first document a visiting team asks to see.",
        },
      ],
    })
    const item = ew((await h.svc.getBriefing('school-1', PERIOD.id, 'owner')).items)[0]
    // The KIND is in the sentence, and the STANDARD leads the title.
    expect(item.why).toContain('fire and life-safety')
    expect(item.title).toBe(
      'COG-A3 — A recorded compliance inspection is past its own target date',
    )
    // NOT the backlog. STEP 2.8 owns "N open maintenance items"; repeating it here
    // would spend one of two briefing slots restating a number the head of school
    // has already read on the same page.
    expect(item.why).not.toMatch(/open maintenance item/i)
    expect(item.why).not.toMatch(/\d+ (?:open |)maintenance/i)
    expect(item.why).not.toMatch(/backlog/i)
  })

  it('the ENGINE freezes FAC-INSPECTION-DUE to name a kind in BOTH of its sentences', () => {
    // The copy constraint above can only hold if the engine's own templates carry
    // the kind — a `why` is `rationale + consequence`, read verbatim.
    const require_ = createRequire(import.meta.url)
    const src = readFileSync(
      require_.resolve('@finrep/compliance').replace(/dist[/\\]index\.js$/, 'src/accreditation-twin.ts'),
      'utf8',
    )
    const block = src.slice(src.indexOf("id: 'FAC-INSPECTION-DUE'"), src.indexOf("id: 'ACC-PRIOR-FINDING-OPEN'"))
    const templates = [...block.matchAll(/rationaleTemplate(?:Low)?:\s*\n?\s*'([^']*)'/g)].map((m) => m[1])
    expect(templates).toHaveLength(2)
    for (const t of templates) {
      expect(t, t).toContain('{{kinds}}')
      expect(t.toLowerCase(), t).not.toContain('backlog')
    }
  })

  it('no 2.16 why starts with an operator CTA verb or contains "go fix"', async () => {
    for (const ruleId of EARLY_WARNING_BRIEFABLE_RULE_IDS) {
      const h = makeService({ seeds: [{ ruleId }] })
      const res = await h.svc.getBriefing('school-1', PERIOD.id, 'owner')
      const why = ew(res.items)[0].why
      expect(why).not.toMatch(/^(Go |Fix |Reconcile |Attach |Upload )/)
      expect(why.toLowerCase()).not.toContain('go fix')
    }
  })

  it('the ENGINE’s own frozen consequences are outcome-voiced, not operator-voiced', () => {
    // The constraint is enforced where the sentences are WRITTEN, not only where
    // they are rendered: a `why` is `rationale + consequence`, both composed by
    // the pure engine, so this is the assertion that actually protects the board.
    const require_ = createRequire(import.meta.url)
    const src = readFileSync(
      require_.resolve('@finrep/compliance').replace(/dist[/\\]index\.js$/, 'src/accreditation-twin.ts'),
      'utf8',
    )
    const sentences = [...src.matchAll(/consequence:\s*\n?\s*'([^']*)'/g)].map((m) => m[1])
    expect(sentences.length).toBeGreaterThan(15)
    for (const s of sentences) {
      expect(s, s).not.toMatch(/^(Go |Fix |Reconcile |Attach |Upload )/)
      expect(s.toLowerCase(), s).not.toContain('go fix')
    }
  })
})

describe('STEP 2.16 — the lens never reorders it away', () => {
  it('earlywarning sorts between accreditation and facilities on every lens', () => {
    const base = {
      severity: 'warn' as const,
      metricKey: null,
      value: null,
      dueDate: null,
      why: 'w',
      title: 't',
      link: '/x',
    }
    const items = [
      { ...base, id: 'facilities:maintenance-backlog', source: 'facilities' as const },
      { ...base, id: 'earlywarning:acc-assurance-gap', source: 'earlywarning' as const },
      { ...base, id: 'accreditation:coverage-gap', source: 'accreditation' as const },
    ]
    for (const lens of ['owner', 'accountant', 'viewer'] as const) {
      expect(applyLens(items, lens).map((i) => i.source)).toEqual([
        'accreditation',
        'earlywarning',
        'facilities',
      ])
    }
  })
})
