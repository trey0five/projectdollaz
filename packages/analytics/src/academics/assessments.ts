// ─────────────────────────────────────────────────────────────────────────────
// ACADEMICS — the pure assessment layer.
//
// Everything the academic dashboards claim is computed here, so a school page,
// an org page, a print packet and the assistant can never disagree about the
// same school's numbers. Pure by construction: no clock, no i/o, no ambient
// state — every input arrives as an argument.
//
// TWO TEST FAMILIES, ONE ENGINE. The college exams (ACT/SAT) report scale
// scores against published readiness benchmarks; the norm-referenced tests
// (TerraNova and its peers) report national percentiles with an objective
// summary underneath. The reports leadership actually wants — peer comparison,
// grade-level comparison, distribution, trend, strengths and opportunities —
// are the SAME reports for both. So the shapes below take the family as data
// and never branch into two parallel implementations.
//
// THE WEIGHTING RULE, STATED ONCE: a diocesan average is Σ(score × tested) ÷
// Σ(tested), never the mean of school means. A twelve-tester school must not
// swing the network like a three-hundred-tester school. When tester counts are
// absent (a file carried averages only) the helpers fall back to a simple mean
// and SAY SO in `weighting`, so a caller can label it honestly rather than
// quietly present a different statistic under the same name.
// ─────────────────────────────────────────────────────────────────────────────

/** A school's result for one year/test/grade — the unit every report reads. */
export interface AssessmentRow {
  schoolId: string
  schoolName?: string
  schoolYear: number
  testType: string
  family: TestFamily
  scoreType: ScoreType
  /** 'all' for the whole-school row, else a grade key ('5', '11', 'K'). */
  gradeLevel: string
  avgComposite: number | null
  /** Per-subject averages, keyed by the family's subject vocabulary. */
  sectionAverages?: Record<string, number | null> | null
  testedCount?: number | null
  eligibleCount?: number | null
  benchmarkMetCount?: number | null
  /** Students with a benchmark DETERMINATION — the denominator of attainment. */
  benchmarkTestedCount?: number | null
  benchmarkRates?: Record<string, number | null> | null
  /** Achievement-band counts, e.g. { q1: 8, q2: 14, q3: 19, q4: 11 }. */
  distribution?: Record<string, number | null> | null
  /** True when the row's cohort is under the small-cell floor and its values
   *  were nulled server-side before this object was built. */
  suppressed?: boolean
}

export type TestFamily = 'act' | 'sat' | 'nrt'
export type ScoreType = 'scale' | 'percentile' | 'nce'
export type Weighting = 'tester-weighted' | 'simple'

/** Objective-level mastery for the strengths/opportunities report. */
export interface ObjectiveRow {
  schoolId: string
  schoolYear: number
  gradeLevel: string
  subject: string
  objectiveLabel: string
  objectiveCode?: string | null
  opi: number | null
  testedCount?: number | null
  masteryCounts?: Record<string, number | null> | null
}

// ── College-readiness benchmarks (publisher-published, not our opinion) ───────

/** ACT college-readiness benchmarks by section. */
export const ACT_BENCHMARKS: Record<string, number> = {
  english: 18,
  math: 22,
  reading: 22,
  science: 23,
}

/** SAT college-readiness benchmarks by section. */
export const SAT_BENCHMARKS: Record<string, number> = {
  erw: 480,
  math: 530,
}

/** Norm-referenced tests carry no readiness benchmark — the national percentile
 *  IS the comparison, and inventing a cut score would be us making one up. */
export function benchmarksFor(family: TestFamily): Record<string, number> | null {
  if (family === 'act') return ACT_BENCHMARKS
  if (family === 'sat') return SAT_BENCHMARKS
  return null
}

/** The theoretical range of a family's headline number — axis bounds that don't
 *  shift as data changes, so two charts side by side stay comparable. */
export function scoreRange(family: TestFamily, scoreType: ScoreType): { min: number; max: number } {
  if (scoreType === 'percentile') return { min: 1, max: 99 }
  if (scoreType === 'nce') return { min: 1, max: 99 }
  if (family === 'sat') return { min: 400, max: 1600 }
  return { min: 1, max: 36 }
}

/**
 * The smallest difference worth calling a difference, in the family's own units.
 * Below this a school is "in line with" its peers — a dashboard that flags a
 * 0.2-point ACT gap as a finding trains its reader to ignore findings.
 */
export function materialGap(family: TestFamily, scoreType: ScoreType): number {
  if (scoreType === 'percentile' || scoreType === 'nce') return 5
  if (family === 'sat') return 20
  return 0.5
}

// ── Small-cell suppression ───────────────────────────────────────────────────

/** Cells thinner than this are suppressed everywhere they could identify a
 *  child — the same floor the roster analytics use. */
export const MIN_CELL = 5

export interface Suppressible<T> {
  value: T | null
  suppressed: boolean
}

/**
 * Wrap a value with the count that produced it: under the floor, the value never
 * leaves the server.
 *
 * FAILS CLOSED on an UNKNOWN count. A missing denominator is not evidence of
 * safety — it is the absence of evidence, and the whole point of a suppression
 * rule is that it holds when nobody remembered to thread the count through. A
 * caller with a genuinely unknown-but-large cohort passes `Infinity` to say so
 * deliberately.
 */
export function suppressSmallCell<T>(value: T | null, count: number | null | undefined): Suppressible<T> {
  if (value === null || value === undefined) return { value: null, suppressed: false }
  if (count === null || count === undefined) return { value: null, suppressed: true }
  if (count > 0 && count < MIN_CELL) return { value: null, suppressed: true }
  return { value, suppressed: false }
}

// ── THE GATE ─────────────────────────────────────────────────────────────────
//
// Every consumer of the aggregate table — the dashboard, the org roll-up, the
// briefing, the assistant, the operational promote — must pass its raw rows
// through this ONE function. Round 1 of review put the suppression inside a
// single service method and five other readers simply queried the table
// directly, which is the failure mode a rule enforced by convention always has.
// Putting the gate here, in the pure layer, means it needs no DI, unit-tests
// directly, and is the same code on every path.
//
// It does two jobs that must always happen together:
//   1. COLLAPSE derived-over-ingested, so a school holding both a summary row
//      and student-derived rows is counted once, at its better number.
//   2. SUPPRESS every value on a row whose cohort is under the floor — the
//      average, the per-subject averages, the distribution AND the benchmark
//      counts, because a rate rebuilt from met/determined is just as invertible
//      as the average it replaced.

/** The raw shape a Prisma read of the aggregate table yields. */
export interface RawAggregateRow {
  schoolId: string
  schoolName?: string
  schoolYear: number
  testType: string
  gradeLevel: string
  derivation: string
  scoreType?: string | null
  avgComposite: number | null
  sectionAverages?: Record<string, number> | null
  testedCount?: number | null
  eligibleCount?: number | null
  benchmarkMetCount?: number | null
  benchmarkTestedCount?: number | null
  benchmarkRates?: Record<string, number> | null
  distribution?: Record<string, number> | null
}

/**
 * Collapse + suppress. `familyOf` maps a testType to its family so the pure
 * layer stays free of the vocabulary package.
 */
export function gateAggregates(
  rows: RawAggregateRow[],
  familyOf: (testType: string) => TestFamily,
  scoreTypeOf: (family: TestFamily) => ScoreType,
): AssessmentRow[] {
  const best = new Map<string, RawAggregateRow>()
  for (const r of rows) {
    const key = `${r.schoolId}|${r.schoolYear}|${r.testType}|${r.gradeLevel}`
    const cur = best.get(key)
    if (!cur) {
      best.set(key, r)
      continue
    }
    if (r.derivation === 'derived' && cur.derivation !== 'derived') {
      // The derived row wins on SCORES, but it cannot know how many students
      // were ELIGIBLE — only a summary file reports the ones who did not sit the
      // exam, and deriveAggregates always writes eligibleCount: null. Discarding
      // the ingested row wholesale therefore destroyed the participation
      // denominator the moment a school uploaded student-level results, and
      // participation silently became unavailable for exactly the schools that
      // gave us the most data.
      best.set(key, { ...r, eligibleCount: r.eligibleCount ?? cur.eligibleCount ?? null })
    } else if (cur.derivation === 'derived' && r.derivation !== 'derived') {
      best.set(key, { ...cur, eligibleCount: cur.eligibleCount ?? r.eligibleCount ?? null })
    }
  }

  return [...best.values()].map((r) => {
    const family = familyOf(r.testType)
    // FAIL CLOSED on an unknown count: a row whose cohort size nobody recorded
    // is not known to be safe, and the whole point of a floor is that it holds
    // when someone forgot to thread the count through.
    //
    // A count of ZERO is the same problem wearing a number. If the row also
    // carries an average, that average came from students the count denies —
    // a contradiction that used to sail through, because 0 is not "> 0 and
    // under the floor". A score with no denominator is exactly the row a floor
    // exists to stop, so it suppresses like any other unknown; a genuinely
    // empty row (no count, no score) has nothing to suppress either way.
    const count = r.testedCount ?? null
    const thin = count === null || count < MIN_CELL
    return {
      schoolId: r.schoolId,
      schoolName: r.schoolName,
      schoolYear: r.schoolYear,
      testType: r.testType,
      family,
      scoreType: (r.scoreType as ScoreType | undefined) ?? scoreTypeOf(family),
      gradeLevel: r.gradeLevel,
      avgComposite: thin ? null : r.avgComposite,
      sectionAverages: thin ? null : (r.sectionAverages ?? null),
      testedCount: thin ? null : (r.testedCount ?? null),
      eligibleCount: thin ? null : (r.eligibleCount ?? null),
      // A benchmark RATE is met ÷ determined; publishing both counts for a
      // two-student cohort restates one child's readiness determination exactly
      // as surely as publishing the average would.
      benchmarkMetCount: thin ? null : (r.benchmarkMetCount ?? null),
      benchmarkTestedCount: thin ? null : (r.benchmarkTestedCount ?? null),
      benchmarkRates: thin ? null : (r.benchmarkRates ?? null),
      distribution: thin ? null : (r.distribution ?? null),
      suppressed: thin,
    }
  })
}

/** Is this cohort publishable at all? The one predicate every writer should ask. */
export function cohortPublishable(testedCount: number | null | undefined): boolean {
  return testedCount !== null && testedCount !== undefined && testedCount >= MIN_CELL
}

// ── Averaging ────────────────────────────────────────────────────────────────

export interface AverageResult {
  value: number | null
  weighting: Weighting
  /** Schools (or rows) that contributed — the denominator of the claim. */
  schools: number
  tested: number | null
}

/**
 * Tester-weighted average of a set of rows, falling back to a simple mean when
 * counts are missing. `weighting` always reports which one happened.
 */
export function averageOf(rows: AssessmentRow[], pick: (r: AssessmentRow) => number | null = (r) => r.avgComposite): AverageResult {
  const usable = rows.filter((r) => pick(r) !== null)
  if (usable.length === 0) return { value: null, weighting: 'tester-weighted', schools: 0, tested: null }

  const weighted = usable.filter((r) => (r.testedCount ?? 0) > 0)
  if (weighted.length === usable.length) {
    let num = 0
    let den = 0
    for (const r of weighted) {
      const v = pick(r) as number
      const w = r.testedCount as number
      num += v * w
      den += w
    }
    if (den > 0) {
      return { value: num / den, weighting: 'tester-weighted', schools: usable.length, tested: den }
    }
  }
  const sum = usable.reduce((acc, r) => acc + (pick(r) as number), 0)
  return { value: sum / usable.length, weighting: 'simple', schools: usable.length, tested: null }
}

/**
 * The diocesan (peer) average. `excludeSchoolId` answers "how do I compare with
 * everyone else?" — the honest denominator for a variance chip, since including
 * yourself in the number you are measured against damps every gap.
 */
export function peerAverage(
  rows: AssessmentRow[],
  opts: { excludeSchoolId?: string; pick?: (r: AssessmentRow) => number | null } = {},
): AverageResult {
  const pool = opts.excludeSchoolId ? rows.filter((r) => r.schoolId !== opts.excludeSchoolId) : rows
  return averageOf(pool, opts.pick ?? ((r) => r.avgComposite))
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export interface RankedSchool {
  schoolId: string
  schoolName?: string
  value: number | null
  rank: number | null
  of: number
}

/** Schools ordered best-first, each carrying its rank. Ties share a rank
 *  (two 2nds are followed by a 4th) — the standard competition ranking. */
export function rankSchools(rows: AssessmentRow[]): RankedSchool[] {
  const scored = rows.map((r) => ({ schoolId: r.schoolId, schoolName: r.schoolName, value: r.avgComposite }))
  const rankable = scored.filter((s) => s.value !== null)
  const sorted = [...rankable].sort((a, b) => (b.value as number) - (a.value as number))
  const of = rankable.length
  const out: RankedSchool[] = sorted.map((s, i) => {
    const tiedWithPrior = i > 0 && sorted[i - 1].value === s.value
    return { ...s, rank: tiedWithPrior ? (null as unknown as number) : i + 1, of }
  })
  // Resolve tie ranks in a second pass so ties share the FIRST of their run.
  let lastRank = 0
  for (let i = 0; i < out.length; i++) {
    if (out[i].rank === null) out[i].rank = lastRank
    else lastRank = out[i].rank as number
  }
  for (const s of scored) {
    if (s.value === null) out.push({ ...s, rank: null, of })
  }
  return out
}

/** One school's standing, for the "Rank 2 of 5" chip. */
export function rankOf(rows: AssessmentRow[], schoolId: string): { rank: number | null; of: number } {
  const found = rankSchools(rows).find((r) => r.schoolId === schoolId)
  return { rank: found?.rank ?? null, of: found?.of ?? 0 }
}

// ── Variance / comparison ────────────────────────────────────────────────────

export type Standing = 'strong' | 'average' | 'below' | 'unknown'

export interface Comparison {
  value: number | null
  peer: number | null
  variance: number | null
  standing: Standing
  weighting: Weighting
}

/** Where a value sits against its peers, banded by the family's material gap. */
export function compareToPeer(
  value: number | null,
  peer: AverageResult,
  family: TestFamily,
  scoreType: ScoreType,
): Comparison {
  if (value === null || peer.value === null) {
    return { value, peer: peer.value, variance: null, standing: 'unknown', weighting: peer.weighting }
  }
  const variance = value - peer.value
  const gap = materialGap(family, scoreType)
  const standing: Standing = variance >= gap ? 'strong' : variance <= -gap ? 'below' : 'average'
  return { value, peer: peer.value, variance, standing, weighting: peer.weighting }
}

export interface SubjectComparison extends Comparison {
  subject: string
}

/**
 * The executive snapshot: every subject, the school's number, the peer number,
 * and the gap between them. This is the table leadership reads first.
 */
export function subjectComparisons(
  school: AssessmentRow | null,
  peers: AssessmentRow[],
  subjects: readonly string[],
  opts: { excludeSchoolId?: string } = {},
): SubjectComparison[] {
  return subjects.map((subject) => {
    const own = school?.sectionAverages?.[subject] ?? null
    const peerAvg = peerAverage(peers, {
      excludeSchoolId: opts.excludeSchoolId,
      pick: (r) => r.sectionAverages?.[subject] ?? null,
    })
    const family = school?.family ?? peers[0]?.family ?? 'act'
    const scoreType = school?.scoreType ?? peers[0]?.scoreType ?? 'scale'
    return { subject, ...compareToPeer(own, peerAvg, family, scoreType) }
  })
}

// ── Grade × subject heat map ─────────────────────────────────────────────────

export interface HeatCell extends Comparison {
  grade: string
  subject: string
  tested: number | null
  suppressed: boolean
}

/**
 * The grade-level matrix — where instruction is working and where it isn't,
 * one row per grade and one column per subject, each cell banded against the
 * same grade at peer schools. Comparing 5th-grade math to 5th-grade math is the
 * only comparison that means anything; comparing it to a school average is not.
 */
export function gradeHeatmap(
  schoolRows: AssessmentRow[],
  peerRows: AssessmentRow[],
  subjects: readonly string[],
  opts: { excludeSchoolId?: string } = {},
): HeatCell[] {
  const grades = [...new Set(schoolRows.map((r) => r.gradeLevel).filter((g) => g !== 'all'))].sort(byGrade)
  const cells: HeatCell[] = []
  for (const grade of grades) {
    const own = schoolRows.find((r) => r.gradeLevel === grade) ?? null
    const peersInGrade = peerRows.filter((r) => r.gradeLevel === grade)
    for (const subject of subjects) {
      const value = own?.sectionAverages?.[subject] ?? null
      const peer = peerAverage(peersInGrade, {
        excludeSchoolId: opts.excludeSchoolId,
        pick: (r) => r.sectionAverages?.[subject] ?? null,
      })
      const family = own?.family ?? peersInGrade[0]?.family ?? 'nrt'
      const scoreType = own?.scoreType ?? peersInGrade[0]?.scoreType ?? 'percentile'
      const tested = own?.testedCount ?? null
      const guarded = suppressSmallCell(value, tested)
      const cmp = compareToPeer(guarded.value, peer, family, scoreType)
      cells.push({ grade, subject, tested, suppressed: guarded.suppressed, ...cmp })
    }
  }
  return cells
}

/** Grade ordering that puts K before 1 and 9 before 10. */
export function byGrade(a: string, b: string): number {
  const rank = (g: string): number => {
    const up = g.trim().toUpperCase()
    if (up === 'PK3') return -2
    if (up === 'PK4' || up === 'PK') return -1
    if (up === 'K') return 0
    const n = Number.parseInt(up, 10)
    return Number.isFinite(n) ? n : 99
  }
  return rank(a) - rank(b)
}

// ── Distribution ─────────────────────────────────────────────────────────────

export interface DistributionSlice {
  band: string
  count: number
  share: number | null
}

/**
 * How students spread across achievement bands. An average hides the shape: two
 * schools can both average the 55th percentile while one has everybody near the
 * middle and the other has a quarter of its students in the bottom band.
 */
export function distributionOf(row: AssessmentRow | null, bands: readonly string[]): DistributionSlice[] {
  const dist = row?.distribution ?? null
  const total = bands.reduce((acc, b) => acc + (dist?.[b] ?? 0), 0)
  return bands.map((band) => {
    const count = dist?.[band] ?? 0
    return { band, count, share: total > 0 ? count / total : null }
  })
}

// ── Trend ────────────────────────────────────────────────────────────────────

export interface AssessmentTrendPoint {
  schoolYear: number
  school: number | null
  peer: number | null
  variance: number | null
}

/** Multi-year series, school against the peer average of the same year. */
export function trendSeries(
  schoolRows: AssessmentRow[],
  peerRows: AssessmentRow[],
  opts: { excludeSchoolId?: string } = {},
): AssessmentTrendPoint[] {
  const years = [...new Set([...schoolRows, ...peerRows].map((r) => r.schoolYear))].sort((a, b) => a - b)
  return years.map((schoolYear) => {
    const school = schoolRows.find((r) => r.schoolYear === schoolYear)?.avgComposite ?? null
    const peer = peerAverage(
      peerRows.filter((r) => r.schoolYear === schoolYear),
      { excludeSchoolId: opts.excludeSchoolId },
    ).value
    return {
      schoolYear,
      school,
      peer,
      variance: school !== null && peer !== null ? school - peer : null,
    }
  })
}

export type TrendDirection = 'improving' | 'declining' | 'stable' | 'unknown'

/** Direction of travel over the available years, in the family's own units. */
export function trendDirection(points: AssessmentTrendPoint[], family: TestFamily, scoreType: ScoreType): TrendDirection {
  const withValues = points.filter((p) => p.school !== null)
  if (withValues.length < 2) return 'unknown'
  const first = withValues[0].school as number
  const last = withValues[withValues.length - 1].school as number
  const gap = materialGap(family, scoreType)
  const delta = last - first
  if (delta >= gap) return 'improving'
  if (delta <= -gap) return 'declining'
  return 'stable'
}

/** Change between the two most recent years with data. */
export function yoyChange(points: AssessmentTrendPoint[]): number | null {
  const withValues = points.filter((p) => p.school !== null)
  if (withValues.length < 2) return null
  const last = withValues[withValues.length - 1].school as number
  const prior = withValues[withValues.length - 2].school as number
  return last - prior
}

// ── Participation ────────────────────────────────────────────────────────────

export interface Participation {
  rate: number | null
  tested: number | null
  eligible: number | null
  peerRate: number | null
  comparable: boolean
}

/**
 * Participation makes results comparable — or doesn't. A school where a third of
 * the class sits the exam can post a high average for reasons that have nothing
 * to do with teaching, so this figure belongs beside every ranking.
 */
export function participationOf(
  row: AssessmentRow | null,
  peers: AssessmentRow[],
  opts: { excludeSchoolId?: string } = {},
): Participation {
  const tested = row?.testedCount ?? null
  const eligible = row?.eligibleCount ?? null
  const rate = tested !== null && eligible !== null && eligible > 0 ? tested / eligible : null
  const pool = opts.excludeSchoolId ? peers.filter((r) => r.schoolId !== opts.excludeSchoolId) : peers
  let num = 0
  let den = 0
  for (const r of pool) {
    if ((r.testedCount ?? null) !== null && (r.eligibleCount ?? 0) > 0) {
      num += r.testedCount as number
      den += r.eligibleCount as number
    }
  }
  const peerRate = den > 0 ? num / den : null
  // Within ten points of the peer rate, the comparison is fair on its face.
  const comparable = rate !== null && peerRate !== null ? Math.abs(rate - peerRate) <= 0.1 : false
  return { rate, tested, eligible, peerRate, comparable }
}

// ── Objectives: strengths & opportunities ────────────────────────────────────

export interface ObjectiveStanding {
  subject: string
  objectiveLabel: string
  objectiveCode: string | null
  grade: string
  opi: number | null
  peerOpi: number | null
  variance: number | null
  standing: Standing
}

/**
 * The instructional payload: which specific skills a school leads on and which
 * it trails on, against the same objective at peer schools. This is the step
 * that turns "Math is down" into something a principal can actually schedule.
 */
export function objectiveStandings(
  own: ObjectiveRow[],
  peers: ObjectiveRow[],
  opts: { excludeSchoolId?: string } = {},
): ObjectiveStanding[] {
  const pool = opts.excludeSchoolId ? peers.filter((r) => r.schoolId !== opts.excludeSchoolId) : peers
  return own
    .filter((o) => o.opi !== null)
    .map((o) => {
      const matches = pool.filter(
        (p) => p.objectiveLabel === o.objectiveLabel && p.subject === o.subject && p.gradeLevel === o.gradeLevel && p.opi !== null,
      )
      // ALL-OR-NOTHING, like averageOf. Mixing real tester counts with a
      // fallback weight of 1 silently makes a 400-student school count the same
      // as a 4-student one — this was the only weighted average in the file
      // that neither followed the rule nor said which statistic it produced.
      // If ANY matched peer is missing its count, every peer weighs the same.
      const weighted = matches.every((m) => m.testedCount !== null && m.testedCount !== undefined)
      let num = 0
      let den = 0
      for (const m of matches) {
        const w = weighted ? (m.testedCount as number) : 1
        num += (m.opi as number) * w
        den += w
      }
      const peerOpi = den > 0 ? num / den : null
      const variance = peerOpi !== null ? (o.opi as number) - peerOpi : null
      // OPI runs 0–100; five points is the smallest gap worth naming.
      const standing: Standing =
        variance === null ? 'unknown' : variance >= 5 ? 'strong' : variance <= -5 ? 'below' : 'average'
      return {
        subject: o.subject,
        objectiveLabel: o.objectiveLabel,
        objectiveCode: o.objectiveCode ?? null,
        grade: o.gradeLevel,
        opi: o.opi,
        peerOpi,
        variance,
        standing,
      }
    })
}

/** The top and bottom of the objective list — the two lists a principal wants. */
export function strengthsAndOpportunities(
  standings: ObjectiveStanding[],
  limit = 5,
): { strengths: ObjectiveStanding[]; opportunities: ObjectiveStanding[] } {
  const ranked = [...standings]
    .filter((s) => s.opi !== null)
    .sort((a, b) => {
      // Rank by peer variance where known, else by raw mastery.
      const av = a.variance ?? (a.opi as number) - 50
      const bv = b.variance ?? (b.opi as number) - 50
      return bv - av
    })
  // SPLIT, don't slice twice. With fewer than 2 x limit standings the two slices
  // overlap, and a school with six objectives on file was told the same one was
  // both its greatest strength and its biggest opportunity — in adjacent cards.
  const half = Math.min(limit, Math.floor(ranked.length / 2))
  return {
    strengths: ranked.slice(0, half),
    opportunities: ranked.slice(ranked.length - half).reverse(),
  }
}

// ── System insights + the narrative ──────────────────────────────────────────

export interface SystemInsights {
  top: RankedSchool | null
  bottom: RankedSchool | null
  spread: number | null
  average: AverageResult
}

/** The network at a glance: who leads, who trails, and how far apart they are. */
export function systemInsights(rows: AssessmentRow[]): SystemInsights {
  const ranked = rankSchools(rows).filter((r) => r.value !== null)
  const top = ranked[0] ?? null
  const bottom = ranked.length > 0 ? ranked[ranked.length - 1] : null
  const spread = top && bottom && top.value !== null && bottom.value !== null ? top.value - bottom.value : null
  return { top, bottom, spread, average: averageOf(rows) }
}

export interface InsightInput {
  schoolName: string
  family: TestFamily
  scoreType: ScoreType
  rank: { rank: number | null; of: number }
  overall: Comparison
  subjects: SubjectComparison[]
  trend: TrendDirection
  participation: Participation
  /** Override only for a non-English packet; the default is the canonical map. */
  subjectLabel?: (subject: string) => string
}

/**
 * The display name for a subject key — canonical, in the semantic layer, beside
 * every other label the product renders.
 *
 * The hook above was optional and NOBODY SUPPLIED IT, so the narrative read
 * "reading is the widest gap" in the same card whose chart, two inches away,
 * labelled the identical bar "Reading". A default that is right is worth more
 * than a hook that is available.
 */
export const SUBJECT_LABELS: Record<string, string> = {
  english: 'English',
  math: 'Math',
  reading: 'Reading',
  science: 'Science',
  erw: 'Reading & Writing',
  language: 'Language',
  socialStudies: 'Social Studies',
  writing: 'Writing',
  vocabulary: 'Vocabulary',
  spelling: 'Spelling',
}

/** Title-cased subject name, falling back to the raw key rather than blanking. */
export function subjectLabelOf(subject: string): string {
  return SUBJECT_LABELS[subject] ?? subject.charAt(0).toUpperCase() + subject.slice(1)
}

/**
 * The key-insight box, written deterministically from the numbers. A template
 * that always says something true beats a model that sometimes says something
 * wrong — and when an LLM upgrade lands later, this stays the baseline it has
 * to beat, exactly as the board report's narrative works.
 */
export function buildAssessmentInsight(input: InsightInput): string {
  const label = input.subjectLabel ?? subjectLabelOf
  const parts: string[] = []

  if (input.rank.rank !== null && input.rank.of > 1) {
    const standing =
      input.overall.standing === 'strong'
        ? 'above the network average'
        : input.overall.standing === 'below'
          ? 'below the network average'
          : 'in line with the network average'
    parts.push(`${input.schoolName} ranks ${input.rank.rank} of ${input.rank.of} and is ${standing}.`)
  } else if (input.overall.value !== null) {
    parts.push(`${input.schoolName} posted an average of ${round1(input.overall.value)}.`)
  }

  const weakest = [...input.subjects].filter((s) => s.variance !== null).sort((a, b) => (a.variance as number) - (b.variance as number))[0]
  const strongest = [...input.subjects].filter((s) => s.variance !== null).sort((a, b) => (b.variance as number) - (a.variance as number))[0]
  if (weakest && weakest.standing === 'below') {
    parts.push(`${label(weakest.subject)} is the widest gap at ${signed(weakest.variance)} versus peers.`)
  }
  if (strongest && strongest.standing === 'strong' && strongest.subject !== weakest?.subject) {
    parts.push(`${label(strongest.subject)} leads at ${signed(strongest.variance)}.`)
  }

  if (input.trend === 'declining') parts.push('Results have declined across the years on file.')
  else if (input.trend === 'improving') parts.push('Results have improved across the years on file.')
  else if (input.trend === 'stable') parts.push('Results have held steady across the years on file.')

  if (input.participation.rate !== null) {
    parts.push(
      input.participation.comparable
        ? 'Participation is in line with peers, so the comparison is fair.'
        : 'Participation differs from peers — read the comparison with that in mind.',
    )
  }

  return parts.join(' ')
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

function signed(n: number | null): string {
  if (n === null) return '—'
  const r = Math.round(n * 10) / 10
  return r > 0 ? `+${r}` : `${r}`
}

// ═══ LONGITUDINAL COHORTS ════════════════════════════════════════════════════
//
// The question a year-over-year chart cannot answer: did THESE CHILDREN learn?
// Comparing this year's 4th grade to last year's 4th grade compares two
// different groups of children — a fair measure of the grade, but not of
// growth. Following the students who were 3rd graders last year into 4th grade
// this year measures the same cohort twice, which is the only comparison that
// speaks to teaching.
//
// A cohort is identified by the year it would finish a fixed reference grade:
// cohortId = schoolYear - gradeRank. Two rows belong to the same cohort exactly
// when that difference matches, which makes the whole feature one subtraction
// rather than a stored cohort table.

/** Stable identity for the group of students in `grade` during `schoolYear`. */
export function cohortIdOf(schoolYear: number, gradeLevel: string): number | null {
  const rank = gradeRankOf(gradeLevel)
  if (rank === null) return null
  return schoolYear - rank
}

/** Numeric rank of a grade key; null when the grade is not a real grade. */
export function gradeRankOf(grade: string): number | null {
  const up = grade.trim().toUpperCase()
  if (up === 'ALL') return null
  if (up === 'PK3') return -2
  if (up === 'PK4' || up === 'PK') return -1
  if (up === 'K') return 0
  const n = Number.parseInt(up, 10)
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null
}

export interface CohortLeg {
  schoolYear: number
  gradeLevel: string
  value: number | null
  /** Carried so the cohort summary stays tester-weighted like every other
   *  average in this file — dropping it here would silently change the
   *  statistic under the same label. */
  tested?: number | null
}

export interface CohortMovement {
  schoolId: string
  schoolName?: string
  prior: CohortLeg | null
  current: CohortLeg | null
  change: number | null
  direction: 'gained' | 'declined' | 'held' | 'unknown'
}

/**
 * One cohort's two legs per school: where the group scored in its prior grade
 * and where it scored after moving up. `subject` picks a subject series; omit
 * it to follow the headline score.
 */
export function cohortMovements(
  rows: AssessmentRow[],
  opts: { currentYear: number; currentGrade: string; subject?: string; family?: TestFamily; scoreType?: ScoreType },
): CohortMovement[] {
  const pick = (r: AssessmentRow): number | null =>
    opts.subject ? (r.sectionAverages?.[opts.subject] ?? null) : r.avgComposite
  const currentRank = gradeRankOf(opts.currentGrade)
  if (currentRank === null) return []
  const priorYear = opts.currentYear - 1
  const priorRank = currentRank - 1

  const bySchool = new Map<string, CohortMovement>()
  for (const r of rows) {
    const rank = gradeRankOf(r.gradeLevel)
    if (rank === null) continue
    const isCurrent = r.schoolYear === opts.currentYear && rank === currentRank
    const isPrior = r.schoolYear === priorYear && rank === priorRank
    if (!isCurrent && !isPrior) continue

    const entry = bySchool.get(r.schoolId) ?? {
      schoolId: r.schoolId,
      schoolName: r.schoolName,
      prior: null,
      current: null,
      change: null,
      direction: 'unknown' as const,
    }
    const leg: CohortLeg = {
      schoolYear: r.schoolYear,
      gradeLevel: r.gradeLevel,
      value: pick(r),
      tested: r.testedCount ?? null,
    }
    if (isCurrent) entry.current = leg
    else entry.prior = leg
    entry.schoolName = entry.schoolName ?? r.schoolName
    bySchool.set(r.schoolId, entry)
  }

  const family = opts.family ?? rows[0]?.family ?? 'nrt'
  const scoreType = opts.scoreType ?? rows[0]?.scoreType ?? 'percentile'
  const gap = materialGap(family, scoreType)

  return [...bySchool.values()].map((m) => {
    const a = m.prior?.value ?? null
    const b = m.current?.value ?? null
    const change = a !== null && b !== null ? b - a : null
    const direction: CohortMovement['direction'] =
      change === null ? 'unknown' : change >= gap ? 'gained' : change <= -gap ? 'declined' : 'held'
    return { ...m, change, direction }
  })
}

export interface CohortSummary {
  priorAverage: AverageResult
  currentAverage: AverageResult
  change: number | null
  gained: number
  declined: number
  held: number
}

/** The network's read on one cohort — the four numbers the summary cards show. */
export function cohortSummary(movements: CohortMovement[]): CohortSummary {
  const asRows = (leg: 'prior' | 'current'): AssessmentRow[] =>
    movements
      .filter((m) => m[leg]?.value !== null && m[leg] !== null)
      .map((m) => ({
        schoolId: m.schoolId,
        schoolYear: (m[leg] as CohortLeg).schoolYear,
        testType: '',
        family: 'nrt' as TestFamily,
        scoreType: 'percentile' as ScoreType,
        gradeLevel: (m[leg] as CohortLeg).gradeLevel,
        avgComposite: (m[leg] as CohortLeg).value,
        testedCount: (m[leg] as CohortLeg).tested ?? null,
      }))
  const priorAverage = averageOf(asRows('prior'))
  const currentAverage = averageOf(asRows('current'))
  return {
    priorAverage,
    currentAverage,
    change:
      priorAverage.value !== null && currentAverage.value !== null ? currentAverage.value - priorAverage.value : null,
    gained: movements.filter((m) => m.direction === 'gained').length,
    declined: movements.filter((m) => m.direction === 'declined').length,
    held: movements.filter((m) => m.direction === 'held').length,
  }
}

/** Which cohorts can actually be followed, given the years on file. */
export function availableCohorts(rows: AssessmentRow[]): Array<{ currentYear: number; currentGrade: string }> {
  const seen = new Set<string>()
  const out: Array<{ currentYear: number; currentGrade: string }> = []
  for (const r of rows) {
    const rank = gradeRankOf(r.gradeLevel)
    if (rank === null) continue
    const hasPrior = rows.some((p) => p.schoolYear === r.schoolYear - 1 && gradeRankOf(p.gradeLevel) === rank - 1)
    if (!hasPrior) continue
    const key = `${r.schoolYear}:${r.gradeLevel}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ currentYear: r.schoolYear, currentGrade: r.gradeLevel })
  }
  return out.sort((a, b) => b.currentYear - a.currentYear || (gradeRankOf(a.currentGrade) ?? 0) - (gradeRankOf(b.currentGrade) ?? 0))
}

// ═══ PEER ANONYMITY ══════════════════════════════════════════════════════════

export interface AnonymousPeer {
  /** Stable within one payload, meaningless across payloads. */
  label: string
  value: number | null
  isFocus: boolean
  /** Only ever populated for the focus school. */
  schoolName?: string
  schoolId?: string
}

/**
 * A ranked field where the reader's own school is named and every other school
 * is not. A principal must be able to see exactly where they stand without the
 * deck becoming a leaderboard someone screenshots — so the labels are positional
 * ("School 7"), the identity is dropped SERVER-SIDE rather than hidden in the
 * UI, and the ordering is by score so the anonymised positions still carry the
 * only information that matters.
 */
export function anonymizePeers(rows: AssessmentRow[], focusSchoolId: string): AnonymousPeer[] {
  const ranked = [...rows]
    .filter((r) => r.avgComposite !== null)
    .sort((a, b) => (b.avgComposite as number) - (a.avgComposite as number))
  let n = 0
  return ranked.map((r) => {
    const isFocus = r.schoolId === focusSchoolId
    if (isFocus) {
      return { label: r.schoolName ?? 'This school', value: r.avgComposite, isFocus: true, schoolName: r.schoolName, schoolId: r.schoolId }
    }
    n += 1
    return { label: `School ${n}`, value: r.avgComposite, isFocus: false }
  })
}

// ═══ REFERENCE LINES ═════════════════════════════════════════════════════════

/**
 * The national reference for a score type. A national percentile is defined so
 * that 50 is the national midpoint — that line belongs on every norm-referenced
 * chart, because "68" means nothing until the reader sees where average sits.
 * Scale-scored exams have no such fixed constant, so the caller must supply one
 * rather than have us invent it.
 */
export function nationalReference(scoreType: ScoreType): number | null {
  if (scoreType === 'percentile') return 50
  if (scoreType === 'nce') return 50
  return null
}

/**
 * Whether a missing figure is genuinely absent or simply not in yet. A school
 * that reported five of its six grades is waiting on one, and printing a blank
 * (or worse, a zero) next to the others misrepresents it — "forthcoming" is the
 * honest label, and it is DERIVED rather than stored so nobody has to remember
 * to set a flag.
 */
export function isForthcoming(
  rows: AssessmentRow[],
  schoolId: string,
  schoolYear: number,
  gradeLevel: string,
): boolean {
  const has = rows.some(
    (r) => r.schoolId === schoolId && r.schoolYear === schoolYear && r.gradeLevel === gradeLevel && r.avgComposite !== null,
  )
  if (has) return false
  const reportedOtherGrades = rows.some(
    (r) => r.schoolId === schoolId && r.schoolYear === schoolYear && r.gradeLevel !== gradeLevel && r.avgComposite !== null,
  )
  const peersReportedThisGrade = rows.some(
    (r) => r.schoolId !== schoolId && r.schoolYear === schoolYear && r.gradeLevel === gradeLevel && r.avgComposite !== null,
  )
  return reportedOtherGrades && peersReportedThisGrade
}

// ═══ MOVEMENT (year over year, same grade) ═══════════════════════════════════

export interface Movement {
  schoolId: string
  schoolName?: string
  current: number | null
  prior: number | null
  change: number | null
  direction: 'improved' | 'declined' | 'stable' | 'unknown'
  belowNational: boolean
}

/**
 * Year-over-year movement per school for one grade and subject — the "who moved
 * and which way" view. Distinct from a cohort: this compares this year's 4th
 * grade with last year's 4th grade, which measures the GRADE rather than a
 * group of children. Both belong on the page; conflating them does not.
 */
export function movements(
  rows: AssessmentRow[],
  opts: { currentYear: number; gradeLevel?: string; subject?: string; family?: TestFamily; scoreType?: ScoreType },
): Movement[] {
  const pick = (r: AssessmentRow): number | null =>
    opts.subject ? (r.sectionAverages?.[opts.subject] ?? null) : r.avgComposite
  const inGrade = (r: AssessmentRow): boolean => !opts.gradeLevel || r.gradeLevel === opts.gradeLevel
  const family = opts.family ?? rows[0]?.family ?? 'nrt'
  const scoreType = opts.scoreType ?? rows[0]?.scoreType ?? 'percentile'
  const gap = materialGap(family, scoreType)
  const national = nationalReference(scoreType)

  const ids = [...new Set(rows.filter(inGrade).map((r) => r.schoolId))]
  return ids
    .map((schoolId) => {
      const cur = rows.find((r) => r.schoolId === schoolId && r.schoolYear === opts.currentYear && inGrade(r))
      const prev = rows.find((r) => r.schoolId === schoolId && r.schoolYear === opts.currentYear - 1 && inGrade(r))
      const current = cur ? pick(cur) : null
      const prior = prev ? pick(prev) : null
      const change = current !== null && prior !== null ? current - prior : null
      const direction: Movement['direction'] =
        change === null ? 'unknown' : change >= gap ? 'improved' : change <= -gap ? 'declined' : 'stable'
      return {
        schoolId,
        schoolName: cur?.schoolName ?? prev?.schoolName,
        current,
        prior,
        change,
        direction,
        belowNational: national !== null && current !== null ? current < national : false,
      }
    })
    .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity))
}
