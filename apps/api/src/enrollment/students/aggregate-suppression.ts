// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC-SURFACE suppression for the raw StudentAggregate (privacy hardening F1).
//
// StudentsService.aggregate deliberately returns TRUE counts — its two internal
// consumers (EnrollmentAnalyticsService.buildMix and the twin's rosterAggregate)
// gate what they publish themselves, and double-suppression there would corrupt
// the honesty rules those layers already enforce. But two surfaces consumed it
// RAW: Penny's get_roster_summary tool (an LLM egress) and the viewer-readable
// GET /schools/:id/enrollment/students/aggregate. A supportFlags of { iep: 1 }
// on either is a findable child. This module is the ONE gate both pass through.
//
// The shape follows the established Penny structural-honesty convention (see
// enrollment-cohort-tools.spec.ts): a suppressed cell is `{ suppressed: true }`
// with NO value key at all — there is nothing to quote, mis-read as zero, or
// helpfully fill in. Unsuppressed cells stay plain numbers so existing numeric
// consumers keep working.
//
// WHAT STAYS RAW, deliberately:
//   · `total` / `kpis.enrolled` — whole-school totals identify nobody (the same
//     rule EnrollmentAnalyticsService states for VsPlan totals).
//   · `filteredTotal` — ONLY while the query is unfiltered or filtered by GRADE
//     alone. The moment an ATTRIBUTE filter is active (status, demographics,
//     flags, age band, or a name search), `filteredTotal` IS an attribute count
//     ("how many IEP students") and is floored like any other cell.
//   · `counts.grade` — grade-level headcounts are directory-style information
//     (how many 3rd-graders a school has), the enrollment page's grade ring,
//     facet pickers and add-data flows depend on them, and a grade count does
//     not couple a child to a protected attribute. This line is a product
//     decision documented here and in the compliance docs — and it holds ONLY
//     while no attribute filter is active: under `?flags=iep` a grade cell is
//     "3rd-graders WITH an IEP", a cross-tab, and is gated like everything else.
//
// Everything that couples a small count to an ATTRIBUTE (status, gender, race,
// ethnicity, age band, support flags) is floored at MIN_CELL — the same
// @finrep/analytics floor every other surface uses — with complementary
// handling so one unsuppressed cell plus a published total cannot back a
// suppressed cell out by subtraction.
//
// THE SUBTRACTION MODEL (reviewer-hardened). An attacker holds ONE payload and
// may subtract any published numbers: `total`, `filteredTotal`, `kpis.enrolled`,
// raw grade counts, and every visible cell. Three rules keep every suppressed
// cell non-derivable within that payload:
//   1. TWIN LOCKSTEP — `kpis.waitlist` republishes `counts.status.waitlist` and
//      `kpis.flagged` bounds/republishes `counts.flags.any` whenever the counts
//      cover the whole roster (filteredTotal === total). So each KPI twin
//      follows its dimension twin's FINAL decision — companion suppression
//      included — never just its own self-floor.
//   2. PINNED CELLS — `kpis.enrolled` is raw by product decision, so when the
//      counts cover the whole roster, `counts.status.enrolled` is ALREADY
//      published no matter what we do here. A pinned cell is therefore treated
//      as visible: it is published raw (hiding it would be theater), it can
//      never serve as a complementary companion, and a hidden cell "protected"
//      only by it counts as lone.
//   3. ZERO COMPANIONS — when a lone hidden cell has no positive un-pinned
//      companion available, a ZERO cell is taken as the companion. The pair-sum
//      stays derivable (standard complementary suppression accepts that — the
//      attacker learns the pair's combined size, never the split), but the lone
//      cell itself no longer is. The old "positive companions only" rule left a
//      lone hidden cell fully derivable in exactly this case.
//   · `kpis.newThisYear` sums with nothing published (there is no "returning
//     students" figure anywhere in the payload), so its own MIN_CELL floor is
//     sufficient — no lockstep partner exists to betray it.
// HONEST LIMIT: this protects each payload against subtraction WITHIN itself.
// A determined insider issuing many differently-filtered queries is running the
// linked-tables problem, which per-response suppression cannot fully solve; the
// mitigations there are the role gate on the route and the audit trail.
// ─────────────────────────────────────────────────────────────────────────────
import { MIN_CELL, suppressSmallCell } from '@finrep/analytics'
import type { StudentAggregate } from './students.service.js'
import type { StudentFilterQueryDto } from './students.dto.js'

/** A published cell: the true count, or a marker carrying NO value key. */
export type PublicCell = number | { suppressed: true }

export interface SuppressedStudentAggregate {
  source: 'roster'
  total: number
  /** RAW unless the query carried an attribute filter — see the header note. */
  filteredTotal: PublicCell
  counts: {
    /** RAW by design on unfiltered/grade-only reads; gated cross-tab cells
     *  whenever an attribute filter is active — see the header note. */
    grade: Record<string, PublicCell>
    status: Record<string, PublicCell>
    gender: Record<string, PublicCell>
    race: Record<string, PublicCell>
    ethnicity: Record<string, PublicCell>
    ageBand: Record<string, PublicCell>
    flags: { iep: PublicCell; plan504: PublicCell; ell: PublicCell; any: PublicCell }
  }
  kpis: {
    enrolled: number
    waitlist: PublicCell
    flagged: PublicCell
    newThisYear: PublicCell
  }
  /** The floor, published so no client explainer can disagree with the server. */
  minCell: number
}

const isSuppressed = (c: PublicCell): c is { suppressed: true } => typeof c !== 'number'

/** One count → its public cell. A zero is safe (nobody is behind it); 0<n<floor
 *  is a findable child. Rides the ONE canonical gate rather than re-deriving it. */
export function gateCount(n: number): PublicCell {
  const g = suppressSmallCell(n, n)
  return g.suppressed ? { suppressed: true } : n
}

/**
 * The ATTRIBUTE-filter test the REST route keys the strict mode on. Grade is
 * deliberately absent (grade-scoped headcounts are the documented raw line);
 * `q` — the name search — is INCLUDED: `?q=smith` makes every count in the
 * response a fact about the students matching a NAME, the tightest coupling of
 * all. Empty arrays / blank strings (the DTO omits empties, but belt-and-
 * suspenders) do not count as active.
 */
export function hasAttributeFilter(query: Partial<StudentFilterQueryDto> | null | undefined): boolean {
  if (!query) return false
  if (typeof query.q === 'string' && query.q.trim().length > 0) return true
  const dims: (keyof StudentFilterQueryDto)[] = ['status', 'race', 'gender', 'ethnicity', 'flags', 'ageBand']
  return dims.some((k) => {
    const v = query[k]
    return Array.isArray(v) && v.length > 0
  })
}

/**
 * A whole dimension of counts → public cells, with COMPLEMENTARY suppression:
 * when exactly ONE cell in a dimension is under the floor, the published total
 * minus the visible cells backs it out exactly (grades, age bands and statuses
 * sum to `filteredTotal`), so a companion is suppressed with it. Two or more
 * suppressed cells protect each other and need no companion.
 *
 * `pinned` keys are cells whose exact value is republished RAW elsewhere in the
 * same payload by product decision (today: `status.enrolled` ↔ `kpis.enrolled`
 * when the counts cover the whole roster). Hiding a pinned cell protects
 * nothing, so it is published raw; it can never be a companion (the raw twin
 * would defeat it by subtraction — the reviewer's BLOCKER); and it never counts
 * as protection for another hidden cell.
 *
 * Companion choice: the smallest still-visible POSITIVE un-pinned cell; when
 * none exists, a ZERO un-pinned cell — a lone hidden cell must never remain
 * (the pair-sum alone may be derivable; the individual cell may not).
 */
export function suppressDimension(
  counts: Partial<Record<string, number>>,
  opts: { pinned?: readonly string[] } = {},
): Record<string, PublicCell> {
  const pinned = new Set(opts.pinned ?? [])
  const out: Record<string, PublicCell> = {}
  for (const [k, n] of Object.entries(counts)) {
    if (typeof n !== 'number') continue
    // A pinned cell's value is already public via its raw twin — publish it
    // (suppressing it here would be theater, and would read as protection).
    out[k] = pinned.has(k) ? n : gateCount(n)
  }
  const hidden = Object.keys(out).filter((k) => isSuppressed(out[k]) && !pinned.has(k))
  if (hidden.length === 1) {
    const candidates = (Object.entries(out) as [string, PublicCell][]).filter(
      ([k, c]) => typeof c === 'number' && !pinned.has(k) && k !== hidden[0],
    ) as [string, number][]
    const companion =
      candidates.filter(([, c]) => c > 0).sort((a, b) => a[1] - b[1])[0] ??
      // No positive companion left (the rest are pinned or zero): take a zero —
      // leaving the hidden cell lone would make it exactly total − visible.
      candidates[0]
    if (companion) out[companion[0]] = { suppressed: true }
  }
  return out
}

/**
 * Support flags are suppressed HARD (the enrollment-analytics precedent: one
 * ELL child in a 40-pupil school is a name), and `any` is the flags' own total:
 * when exactly one of the three components is hidden, a visible `any` minus the
 * visible components bounds the hidden one — so `any` is suppressed with it.
 */
export function suppressFlags(flags: {
  iep: number
  plan504: number
  ell: number
  any: number
}): { iep: PublicCell; plan504: PublicCell; ell: PublicCell; any: PublicCell } {
  const out = {
    iep: gateCount(flags.iep),
    plan504: gateCount(flags.plan504),
    ell: gateCount(flags.ell),
    any: gateCount(flags.any),
  }
  const hiddenComponents = (['iep', 'plan504', 'ell'] as const).filter((k) => isSuppressed(out[k]))
  if (hiddenComponents.length === 1 && !isSuppressed(out.any)) {
    out.any = { suppressed: true }
  }
  return out
}

export interface SuppressOptions {
  /** True when the query carried any ATTRIBUTE filter (hasAttributeFilter):
   *  `filteredTotal` and the grade cells then get the full gate too. */
  attributeFiltered?: boolean
}

/** The gate both public consumers pass the raw aggregate through. */
export function suppressStudentAggregate(
  agg: StudentAggregate,
  opts: SuppressOptions = {},
): SuppressedStudentAggregate {
  const attributeFiltered = opts.attributeFiltered === true
  // The kpis count the UNFILTERED roster; the counts count the FILTERED one.
  // Only when the filter selected everyone (or there was none) do the two speak
  // about the same population — which is exactly when a raw KPI twin can
  // republish a suppressed dimension cell (the reviewer's BLOCKER) and when
  // kpis.enrolled pins status.enrolled.
  const samePopulation = agg.filteredTotal === agg.total
  const status = suppressDimension(agg.counts.status, samePopulation ? { pinned: ['enrolled'] } : {})
  const flags = suppressFlags(agg.counts.flags)
  return {
    source: agg.source,
    total: agg.total,
    // An attribute-filtered total IS an attribute count ("how many IEP
    // students") — floored. Grade-only/unfiltered totals stay raw by design;
    // so does a filter that matched the ENTIRE roster (samePopulation): its
    // "filtered" total is the raw whole-school `total` sitting right beside it,
    // and hiding one copy of a published number is theater, not protection.
    filteredTotal:
      attributeFiltered && !samePopulation ? gateCount(agg.filteredTotal) : agg.filteredTotal,
    counts: {
      // RAW on unfiltered/grade-only reads (see the header note); under an
      // attribute filter every grade cell is a cross-tab with that attribute
      // and takes the full dimension treatment (grades sum to filteredTotal).
      grade: attributeFiltered ? suppressDimension(agg.counts.grade) : { ...agg.counts.grade } as Record<string, PublicCell>,
      status,
      gender: suppressDimension(agg.counts.gender),
      race: suppressDimension(agg.counts.race),
      ethnicity: suppressDimension(agg.counts.ethnicity),
      ageBand: suppressDimension(agg.counts.ageBand),
      flags,
    },
    kpis: {
      // Whole-school total — never suppressed (it identifies nobody).
      enrolled: agg.kpis.enrolled,
      // TWIN LOCKSTEP (the reviewer's BLOCKER): over the same population this
      // IS counts.status.waitlist, so it follows that cell's FINAL decision —
      // companion suppression included — not merely its own floor. A KPI tile
      // republishing the number the dimension just hid hands the hidden status
      // straight back via total − enrolled − visible statuses − kpis.waitlist.
      waitlist:
        samePopulation && isSuppressed(status.waitlist)
          ? { suppressed: true }
          : gateCount(agg.kpis.waitlist),
      // Same lockstep with flags.any: flagged ≤ any always, and over the same
      // population a visible flagged bounds (or, when statuses beyond enrolled
      // carry no flags, equals) the any the flags block just suppressed.
      flagged:
        samePopulation && isSuppressed(flags.any) ? { suppressed: true } : gateCount(agg.kpis.flagged),
      // Sums with nothing published (no "returning students" figure exists in
      // the payload), so the self-floor is the whole requirement — the same
      // cell() treatment EnrollmentAnalyticsService.buildMix gives this figure.
      newThisYear: gateCount(agg.kpis.newThisYear),
    },
    minCell: MIN_CELL,
  }
}
