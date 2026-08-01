import {
  addMonths,
  civilToIso,
  computeReviewStatus,
  toCivil,
  type ArtifactInput,
  type RequirementInput,
  type SourceRegister,
} from '@finrep/compliance'
import { KNOWLEDGE_TAG_PATTERNS } from './evidence-tag-match.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — AUTO-SATISFACTION, as a LIVE QUERY that writes nothing.
//
// The demo moment this file exists for: "we changed nothing in accreditation and
// readiness moved." A school that keeps its policy register current, adopts a
// strategic plan and uploads its audit has already answered a dozen accreditor
// asks — it just never told the accreditation module. So we do not ask it to.
// Resolution happens on every read of /evidence-readiness, against the register
// that ALREADY OWNS the artifact, and NO EVIDENCE ROW IS EVER CREATED. Two
// properties fall out for free: supersession (the newest plan/budget/audit is
// the one we judge) and currency (the register's own cycle is the anchor). The
// school maintains one thing in one place.
//
// THE TWO RULES THAT MAKE IT HONEST:
//   1. WE NEVER COPY A DATE. A source_interval requirement delegates verbatim to
//      computeReviewStatus / StrategicPlan.endDate, read live. Editing a
//      policy's review interval in Governance changes the evidence state with no
//      second edit anywhere, because there is no second copy to edit.
//   2. WE NEVER INFER ONE. KnowledgeDocument.createdAt is an UPLOAD date, not a
//      document date, so the knowledge resolver returns effectiveDate: null —
//      ALWAYS. It resolves (the school sees the file, named) and it evaluates as
//      `unknown` with "which period does this cover?". That is the phase's
//      signature honesty moment and it is asserted by spec.
//
// Every query is schoolId-scoped and memoised per request, so a school with 45
// requirement rows across three frameworks issues ONE read per register, not one
// per requirement.
// ─────────────────────────────────────────────────────────────────────────────

/** One artifact the currency engine can judge. Attached OR auto-resolved. */
export interface ResolvedArtifact extends ArtifactInput {
  /** Only set on aggregate registers (policy_manual). */
  sourceCount?: number
  undatedSourceCount?: number
}

/**
 * The DOMAIN a school would go to in order to fix this row. Deliberately the
 * user-facing domain name, not the table name.
 */
export const REGISTER_DOMAIN_LABEL: Record<SourceRegister, string> = {
  policy: 'Governance',
  meeting: 'Governance',
  strategic_plan: 'Strategy',
  period_budget: 'Budget',
  enrollment_snapshot: 'Enrollment',
  knowledge_document: 'your document store',
  board_report: 'Reports',
  maintenance_item: 'Facilities',
  staff_evaluation_register: 'HR',
  professional_development: 'HR',
  clearance_register: 'HR',
  lms: 'your assessment system',
  portal: 'your accreditor portal',
}

/** Where the "renew this" CTA sends the school. Null = nowhere to send them yet. */
export const REGISTER_ROUTE: Record<SourceRegister, string | null> = {
  policy: '/governance',
  meeting: '/governance',
  strategic_plan: '/strategy',
  period_budget: '/budget',
  enrollment_snapshot: '/enrollment',
  knowledge_document: '/knowledge',
  board_report: '/reports',
  maintenance_item: null,
  staff_evaluation_register: null,
  professional_development: null,
  clearance_register: null,
  lms: null,
  portal: null,
}

/** FROZEN copy. For `policy` this renders "Auto-linked from Governance — you never entered this." */
export const autoLinkedNote = (r: SourceRegister): string =>
  `Auto-linked from ${REGISTER_DOMAIN_LABEL[r]} — you never entered this.`

/** FROZEN sub-line for the policy aggregate: the register is one artifact, not many. */
export const POLICY_AGGREGATE_NOTE =
  'Your policy register is only as current as its most overdue policy.'

/** The frozen CTA copy for the curriculum-review CONVENTION (no curriculum model ships). */
export const CURRICULUM_CONVENTION_NOTE =
  'Add a policy in Governance with the category "Curriculum" and a review interval. ' +
  "We can't see your curriculum — we can track when you last reviewed its documentation."

/** Worst-first: the aggregate is only as current as its most overdue member. */
const POLICY_STATUS_RANK: Record<string, number> = {
  overdue: 0,
  'due-soon': 1,
  current: 2,
  unknown: 3,
}

/** The five FORWARD-DECLARED registers have no resolver — and issue no query. */
const RESOLVERS = new Set<SourceRegister>([
  'policy',
  'meeting',
  'strategic_plan',
  'period_budget',
  'enrollment_snapshot',
  'knowledge_document',
  'board_report',
])

// ── The narrow Prisma surface this file needs (keeps it unit-testable) ───────

type Find = (args: unknown) => Promise<never>
export interface AnchorPrisma {
  policy: { findMany: Find }
  meeting: { findFirst: Find }
  strategicPlan: { findMany: Find }
  periodBudget: { findFirst: Find }
  enrollmentSnapshot: { findFirst: Find }
  knowledgeDocument: { findMany: Find }
  boardReport: { findFirst: Find }
}

interface PolicyRow {
  id: string
  title: string
  category: string | null
  status: string
  adoptedDate: Date | null
  lastReviewedDate: Date | null
  reviewIntervalMonths: number
}

/** yyyy-mm-dd with no timezone drift (the @db.Date UTC-midnight round-trip). */
function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function base(register: SourceRegister, sourceRef: string | null, label: string): ResolvedArtifact {
  return {
    key: `${register}:${sourceRef ?? ''}`,
    origin: 'auto',
    sourceType: register,
    sourceRef,
    label,
    effectiveDate: null,
    expiresAt: null,
    cycle: null,
    alsoInPortal: null,
    link: REGISTER_ROUTE[register],
    autoLinkedNote: autoLinkedNote(register),
  }
}

/**
 * A per-request resolver. Holds a memo of raw register reads so N requirement
 * rows across M standards cost ONE query per register, and exposes `queryCount`
 * so a spec can prove there is no N+1.
 */
export function createAnchorResolver(prisma: AnchorPrisma, schoolId: string, now: Date) {
  const memo = new Map<string, Promise<unknown>>()
  let queryCount = 0

  /** Memoised, FAIL-SOFT read: a register that throws degrades that one row to
   *  `missing`/`unknown` — it never 500s the Evidence Index. */
  const read = <T>(cacheKey: string, run: () => Promise<T>): Promise<T | null> => {
    const hit = memo.get(cacheKey)
    if (hit) return hit as Promise<T | null>
    queryCount += 1
    const p = run().catch(() => null)
    memo.set(cacheKey, p)
    return p
  }

  const policies = (): Promise<PolicyRow[] | null> =>
    read('policy', async () => {
      const rows = (await prisma.policy.findMany({
        // ACTIVE only: a draft or retired policy has no live review clock, and
        // computeReviewStatus would return 'unknown' for it anyway.
        where: { schoolId, status: 'active' },
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          adoptedDate: true,
          lastReviewedDate: true,
          reviewIntervalMonths: true,
        },
      })) as unknown as PolicyRow[]
      return rows
    })

  /** The policy AGGREGATE: one artifact standing for the whole register, ranked
   *  worst-first, because that is what an accreditor's question actually means. */
  const resolvePolicy = async (tag: string): Promise<ResolvedArtifact | null> => {
    const all = await policies()
    if (!all || all.length === 0) return null
    // The curriculum CONVENTION — no curriculum model, no curriculum code: a
    // Policy whose category names curriculum carries the review cycle, and
    // computeReviewStatus does the rest for free.
    const scoped =
      tag === 'curriculum_review'
        ? all.filter((p) => (p.category ?? '').toLowerCase().includes('curric'))
        : all
    if (scoped.length === 0) return null

    const ranked = [...scoped].sort((a, b) => {
      const sa = computeReviewStatus(
        { adoptedDate: a.adoptedDate, lastReviewedDate: a.lastReviewedDate, reviewIntervalMonths: a.reviewIntervalMonths, status: a.status },
        now,
      ).status
      const sb = computeReviewStatus(
        { adoptedDate: b.adoptedDate, lastReviewedDate: b.lastReviewedDate, reviewIntervalMonths: b.reviewIntervalMonths, status: b.status },
        now,
      ).status
      const r = (POLICY_STATUS_RANK[sa] ?? 9) - (POLICY_STATUS_RANK[sb] ?? 9)
      return r !== 0 ? r : a.title.localeCompare(b.title)
    })
    const worst = ranked[0]
    return {
      ...base('policy', worst.id, `${worst.title}${worst.category ? ` (${worst.category})` : ''}`),
      // The anchor the currency engine falls back to when the requirement is
      // 'fixed'; for 'source_interval' the CYCLE below is what it actually uses.
      effectiveDate: isoDate(worst.lastReviewedDate ?? worst.adoptedDate),
      cycle: {
        kind: 'policy_review',
        adoptedDate: isoDate(worst.adoptedDate),
        lastReviewedDate: isoDate(worst.lastReviewedDate),
        reviewIntervalMonths: worst.reviewIntervalMonths,
        status: worst.status,
      },
      sourceCount: scoped.length,
      undatedSourceCount: scoped.filter((p) => !p.lastReviewedDate && !p.adoptedDate).length,
    }
  }

  const resolveMeeting = async (): Promise<ResolvedArtifact | null> => {
    const m = (await read('meeting', () =>
      prisma.meeting.findFirst({
        where: { schoolId, minutesStatus: 'approved' },
        orderBy: { scheduledAt: 'desc' },
        select: { id: true, title: true, scheduledAt: true },
      }),
    )) as { id: string; title: string; scheduledAt: Date } | null
    if (!m) return null
    return {
      ...base('meeting', m.id, `${m.title} — ${isoDate(m.scheduledAt) ?? 'undated'}`),
      effectiveDate: isoDate(m.scheduledAt),
    }
  }

  const resolvePlan = async (): Promise<ResolvedArtifact | null> => {
    const rows = (await read('strategic_plan', () =>
      prisma.strategicPlan.findMany({
        where: { schoolId },
        select: { id: true, name: true, status: true, fyEndYear: true, startDate: true, endDate: true, adoptedAt: true, createdAt: true },
        orderBy: [{ fyEndYear: 'desc' }, { adoptedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    )) as
      | { id: string; name: string; status: string; fyEndYear: number; startDate: Date | null; endDate: Date | null; adoptedAt: Date | null; createdAt: Date }[]
      | null
    if (!rows || rows.length === 0) return null
    // The ladder, in one pass over one read: a CURRENT adopted plan first, then
    // the latest adopted plan (so an expired plan reads `stale` rather than
    // vanishing), then whatever exists.
    const todayIso = now.toISOString().slice(0, 10)
    const adopted = rows.filter((p) => p.status === 'adopted')
    const plan =
      adopted.find((p) => p.endDate === null || (isoDate(p.endDate) ?? '') >= todayIso) ??
      adopted[0] ??
      rows[0]
    return {
      ...base('strategic_plan', plan.id, plan.name),
      effectiveDate: isoDate(plan.startDate),
      cycle: { kind: 'plan_term', endDate: isoDate(plan.endDate) },
    }
  }

  const resolveBudget = async (): Promise<ResolvedArtifact | null> => {
    const b = (await read('period_budget', () =>
      prisma.periodBudget.findFirst({
        where: { schoolId, fiscalPeriod: { periodType: 'annual' } },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
        select: { id: true, fiscalPeriod: { select: { label: true, periodEndDate: true } } },
      }),
    )) as { id: string; fiscalPeriod: { label: string; periodEndDate: Date } | null } | null
    if (!b) return null
    return {
      ...base('period_budget', b.id, `Budget — ${b.fiscalPeriod?.label ?? 'period'}`),
      effectiveDate: isoDate(b.fiscalPeriod?.periodEndDate ?? null),
    }
  }

  const resolveEnrollment = async (): Promise<ResolvedArtifact | null> => {
    const s = (await read('enrollment_snapshot', () =>
      prisma.enrollmentSnapshot.findFirst({
        where: { schoolId },
        orderBy: { observedOn: 'desc' },
        select: { id: true, observedOn: true, totalEnrolled: true, provider: true },
      }),
    )) as { id: string; observedOn: Date; totalEnrolled: number; provider: string } | null
    if (!s) return null
    return {
      ...base('enrollment_snapshot', s.id, `Enrollment as of ${isoDate(s.observedOn)}`),
      effectiveDate: isoDate(s.observedOn),
    }
  }

  /**
   * THE SIGNATURE HONESTY MOMENT. A title match finds the file; nothing tells us
   * what period it covers. `createdAt` is when it was UPLOADED — reading it as a
   * document date is the exact guess this phase bans — so effectiveDate is null,
   * always, and the row evaluates as `unknown` with "which period does this
   * cover?". Uploading a new audit still visibly moves /evidence-readiness
   * (missing → unknown, naming the file) with zero accreditation interaction.
   */
  const resolveDocument = async (tag: string): Promise<ResolvedArtifact | null> => {
    const patterns = KNOWLEDGE_TAG_PATTERNS[tag as keyof typeof KNOWLEDGE_TAG_PATTERNS]
    if (!patterns || patterns.length === 0) return null
    const docs = (await read(`knowledge_document:${tag}`, () =>
      prisma.knowledgeDocument.findMany({
        where: {
          schoolId,
          OR: patterns.map((p) => ({ title: { contains: p, mode: 'insensitive' as const } })),
        },
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
    )) as { id: string; title: string; createdAt: Date }[] | null
    if (!docs || docs.length === 0) return null
    const d = docs[0]
    return { ...base('knowledge_document', d.id, d.title), effectiveDate: null }
  }

  /**
   * ATTACHING A COPY MUST NEVER DESTROY THE REGISTER'S OWN CLOCK.
   *
   * An evidence row that LINKS a policy or a strategic plan carries no cycle of
   * its own — the register still owns it. Before such a row is judged we hand it
   * back the live anchor from the register it points at, read from the SAME
   * memoised query the auto-resolver uses (so this costs no extra round-trip when
   * the register was already read, and exactly one when it was not).
   *
   * We only ever ADD what the row is missing: a school-set effectiveDate or
   * expiresAt still wins, because the school's own assertion outranks ours.
   *
   * Meetings, budgets, enrollment snapshots and board reports are deliberately
   * NOT enriched here: they are `fixed`-window artifacts whose anchor is a date,
   * and the auto-resolved twin already supplies it on key collision. Looking up
   * an arbitrary one by id would buy a query per attached row for nothing.
   */
  const enrichAttached = async (art: ArtifactInput): Promise<ArtifactInput> => {
    if (art.origin !== 'attached' || !art.sourceRef) return art

    if (art.sourceType === 'policy') {
      const all = await policies()
      const p = all?.find((x) => x.id === art.sourceRef)
      if (!p) return art
      return {
        ...art,
        effectiveDate: art.effectiveDate ?? isoDate(p.lastReviewedDate ?? p.adoptedDate),
        cycle: art.cycle ?? {
          kind: 'policy_review',
          adoptedDate: isoDate(p.adoptedDate),
          lastReviewedDate: isoDate(p.lastReviewedDate),
          reviewIntervalMonths: p.reviewIntervalMonths,
          status: p.status,
        },
      }
    }

    if (art.sourceType === 'strategic_plan') {
      const rows = (await read('strategic_plan', () =>
        prisma.strategicPlan.findMany({
          where: { schoolId },
          select: { id: true, name: true, status: true, fyEndYear: true, startDate: true, endDate: true, adoptedAt: true, createdAt: true },
          orderBy: [{ fyEndYear: 'desc' }, { adoptedAt: 'desc' }, { createdAt: 'desc' }],
        }),
      )) as { id: string; startDate: Date | null; endDate: Date | null }[] | null
      const plan = rows?.find((x) => x.id === art.sourceRef)
      if (!plan) return art
      return {
        ...art,
        effectiveDate: art.effectiveDate ?? isoDate(plan.startDate),
        cycle: art.cycle ?? { kind: 'plan_term', endDate: isoDate(plan.endDate) },
      }
    }

    return art
  }

  const resolveBoardReport = async (): Promise<ResolvedArtifact | null> => {
    const r = (await read('board_report', () =>
      prisma.boardReport.findFirst({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, reportTitle: true, generatedAt: true, createdAt: true },
      }),
    )) as { id: string; reportTitle: string | null; generatedAt: Date | null; createdAt: Date } | null
    if (!r) return null
    return {
      ...base('board_report', r.id, r.reportTitle?.trim() || 'Board report'),
      effectiveDate: isoDate(r.generatedAt ?? r.createdAt),
    }
  }

  /**
   * Resolve the ONE artifact the owning register offers for this requirement, or
   * null. A NON-PLATFORM requirement is `not_tracked` before any resolver runs,
   * and a forward-declared register issues NO QUERY AT ALL.
   */
  const resolve = async (req: RequirementInput): Promise<ResolvedArtifact | null> => {
    if (req.dataAvailability !== 'platform') return null
    const register = req.sourceRegister as SourceRegister | null
    if (register === null || !RESOLVERS.has(register)) return null
    switch (register) {
      case 'policy':
        return resolvePolicy(req.tag)
      case 'meeting':
        return resolveMeeting()
      case 'strategic_plan':
        return resolvePlan()
      case 'period_budget':
        return resolveBudget()
      case 'enrollment_snapshot':
        return resolveEnrollment()
      case 'knowledge_document':
        return resolveDocument(req.tag)
      default:
        return resolveBoardReport()
    }
  }

  return {
    resolve,
    enrichAttached,
    /** Distinct register reads issued so far — the N+1 guard's assertion handle. */
    get queryCount() {
      return queryCount
    },
  }
}

export type AnchorResolver = ReturnType<typeof createAnchorResolver>

// ─────────────────────────────────────────────────────────────────────────────
// THE DEFENSIBLE COUNT — `verifiedPct` moves from "evidence exists" to "evidence
// exists and is NOT KNOWN TO BE OUT OF DATE".
//
// The asymmetry is deliberate and is the whole reason this deploy does not
// collapse every school's hero number. We only subtract an artifact we can PROVE
// is stale: an explicit expiry in the past, an overdue policy read live from
// Governance, an ended plan, or a dated artifact past a FIXED requirement window
// that the catalog actually asks for. Everything else — including every undated
// legacy row — counts. We do not assert staleness we cannot prove, in either
// direction; the pressure to date documents lives on the Evidence Index, where
// `unknown` is excluded from the denominator and the sentence says so.
//
// SPARSENESS FALLS OUT: a leaf with zero requirement rows, no policy/plan-linked
// evidence and no expiresAt has currentEvidenceCount === evidenceCount, so
// verifiedPct is byte-identical to pre-Phase-C.
// ─────────────────────────────────────────────────────────────────────────────

/** The projection the count needs — nothing more leaves the database. */
export interface CurrencyEvidenceRow {
  standardId: string
  sourceType: string | null
  sourceRef: string | null
  tag: string | null
  effectiveDate: Date | null
  expiresAt: Date | null
}

/** The fixed-window asks a catalog standard makes, keyed by tag. */
export type FixedWindowsByCatalog = Map<string, Map<string, number>>

export interface CurrencyCountsPrisma {
  policy: { findMany: Find }
  strategicPlan: { findMany: Find }
}

export interface EvidenceCounts {
  /** standardId → total attached evidence rows (the Phase-A definition). */
  evidenceCount: Map<string, number>
  /** standardId → rows we cannot prove are out of date (the Phase-C definition). */
  currentEvidenceCount: Map<string, number>
}

export async function computeEvidenceCounts(
  prisma: CurrencyCountsPrisma,
  schoolId: string,
  rows: readonly CurrencyEvidenceRow[],
  /** standardId → its catalog standard id (null on hand-made rows). */
  catalogOf: ReadonlyMap<string, string | null>,
  fixedWindows: FixedWindowsByCatalog,
  now: Date,
): Promise<EvidenceCounts> {
  const evidenceCount = new Map<string, number>()
  const currentEvidenceCount = new Map<string, number>()
  for (const r of rows) evidenceCount.set(r.standardId, (evidenceCount.get(r.standardId) ?? 0) + 1)

  // The two extra reads are SKIPPED ENTIRELY when no evidence row links one —
  // a school with a hand-made register issues exactly the queries it did before.
  const policyIds = [
    ...new Set(rows.filter((r) => r.sourceType === 'policy' && r.sourceRef).map((r) => r.sourceRef as string)),
  ]
  const planIds = [
    ...new Set(
      rows.filter((r) => r.sourceType === 'strategic_plan' && r.sourceRef).map((r) => r.sourceRef as string),
    ),
  ]

  const policyById = new Map<string, PolicyRow>()
  if (policyIds.length > 0) {
    const found = (await prisma.policy
      .findMany({
        where: { id: { in: policyIds }, schoolId },
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          adoptedDate: true,
          lastReviewedDate: true,
          reviewIntervalMonths: true,
        },
      })
      .catch(() => [])) as unknown as PolicyRow[]
    for (const p of found) policyById.set(p.id, p)
  }

  const planEndById = new Map<string, string | null>()
  if (planIds.length > 0) {
    const found = (await prisma.strategicPlan
      .findMany({ where: { id: { in: planIds }, schoolId }, select: { id: true, endDate: true } })
      .catch(() => [])) as unknown as { id: string; endDate: Date | null }[]
    for (const p of found) planEndById.set(p.id, isoDate(p.endDate))
  }

  const todayIso = now.toISOString().slice(0, 10)

  const provablyStale = (e: CurrencyEvidenceRow): boolean => {
    // 1 — an explicit school-set expiry in the past.
    const explicit = isoDate(e.expiresAt)
    if (explicit !== null) return explicit < todayIso

    // 2 — a POLICY read LIVE from the register. Only 'overdue' is proof; every
    //     other status (including 'unknown') is not.
    if (e.sourceType === 'policy' && e.sourceRef) {
      const p = policyById.get(e.sourceRef)
      if (!p) return false
      return (
        computeReviewStatus(
          {
            adoptedDate: p.adoptedDate,
            lastReviewedDate: p.lastReviewedDate,
            reviewIntervalMonths: p.reviewIntervalMonths,
            status: p.status,
          },
          now,
        ).status === 'overdue'
      )
    }

    // 3 — a strategic plan whose term has ended.
    if (e.sourceType === 'strategic_plan' && e.sourceRef) {
      const end = planEndById.get(e.sourceRef) ?? null
      return end !== null && end < todayIso
    }

    // 4 — a DATED artifact past a FIXED window the catalog actually asks for.
    //     No requirement row, or no date, means no proof: it counts.
    const eff = isoDate(e.effectiveDate)
    if (eff === null || !e.tag) return false
    const catalogId = catalogOf.get(e.standardId) ?? null
    if (!catalogId) return false
    const months = fixedWindows.get(catalogId)?.get(e.tag)
    if (months === undefined) return false
    const anchor = toCivil(eff)
    if (anchor === null) return false
    return civilToIso(addMonths(anchor, Math.trunc(months))) < todayIso
  }

  for (const r of rows) {
    if (provablyStale(r)) continue
    currentEvidenceCount.set(r.standardId, (currentEvidenceCount.get(r.standardId) ?? 0) + 1)
  }
  return { evidenceCount, currentEvidenceCount }
}

/**
 * Build the fixed-window lookup from raw requirement rows (one read, no N+1).
 *
 * NON-`platform` ROWS ARE SKIPPED, ALWAYS. An `external` / `intake` /
 * `integration` requirement is excluded from EVERY denominator — including this
 * one. Letting a self-study or a Safe-Environment ask contribute a window would
 * let a hole we deliberately chose not to dig deduct from the hero's Defensible
 * figure, which is the one thing the honesty rule forbids in both directions.
 */
export function fixedWindowsFrom(
  rows: readonly {
    catalogStandardId: string
    tag: string
    windowKind: string
    windowMonths: number | null
    dataAvailability: string
  }[],
): FixedWindowsByCatalog {
  const out: FixedWindowsByCatalog = new Map()
  for (const r of rows) {
    if (r.dataAvailability !== 'platform') continue
    if (r.windowKind !== 'fixed' || r.windowMonths == null) continue
    const byTag = out.get(r.catalogStandardId) ?? new Map<string, number>()
    byTag.set(r.tag, r.windowMonths)
    out.set(r.catalogStandardId, byTag)
  }
  return out
}
