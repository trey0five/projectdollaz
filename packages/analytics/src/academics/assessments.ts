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
  /** Set only on a cell hidden to PROTECT another (complementary suppression):
   *  it is not itself small, so surfaces print "withheld", never `<5`.
   *  Absent on a cell hidden for its own size. See small-cell-groups.ts. */
  reason?: 'complementary'
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

  // ── THE COMPLEMENT PASS ────────────────────────────────────────────────────
  //
  // Suppressing a row in isolation is not suppression. The per-grade rows and
  // the gradeLevel:'all' row of one (school, year, test) are an exact PARTITION:
  // grade 11 has 5 scored students averaging 22.0, grade 12 has 1 averaging 33,
  // and 'all' has 6 averaging 23.833. Nulling only grade 12 leaves
  //   (6 x 23.833 - 5 x 22.0) / (6 - 5) = 33
  // — that senior's exact ACT composite, reconstructed from two rows that each
  // cleared the floor. Round 1 caught this shape on subgroups and round 3 caught
  // it on distribution bands; grades are the third instance.
  //
  // The rule: if any grade in a group is suppressed, the RESIDUAL must still
  // cover at least MIN_CELL students. If it does not, the 'all' row goes with
  // it — the whole-school number is the one thing the subtraction needs.
  const collapsed = [...best.values()]
  const thinOf = (r: RawAggregateRow): boolean => {
    const c = r.testedCount ?? null
    return c === null || c < MIN_CELL
  }
  const suppressAll = new Set<string>()
  /** Grades hidden not for their own size but to cover a smaller neighbour. */
  const alsoHide = new Set<string>()
  const rowKey = (r: RawAggregateRow): string =>
    `${r.schoolId}|${r.schoolYear}|${r.testType}|${r.gradeLevel}`
  const groups = new Map<string, RawAggregateRow[]>()
  for (const r of collapsed) {
    const key = `${r.schoolId}|${r.schoolYear}|${r.testType}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  for (const [key, list] of groups) {
    const all = list.find((r) => r.gradeLevel === 'all')
    if (!all || thinOf(all)) continue
    const grades = list.filter((r) => r.gradeLevel !== 'all')
    const hidden = grades.filter(thinOf)
    if (hidden.length === 0) continue

    // IT IS THE HIDDEN SET THAT HAS TO BE BIG, not the visible remainder. The
    // rows form an exact partition, so the hidden grades' combined mean is
    // ALWAYS recoverable as (T_all x A_all - Σ T_g x A_g) ÷ (T_all - Σ T_g) —
    // whether five children or five hundred are visible makes no difference to
    // that arithmetic. What matters is how many students the recovered number
    // describes: one senior is a disclosure, twelve students is a statistic.
    //
    // So hide the next-smallest grades until the hidden set itself clears the
    // floor — exactly the second-band rule safeDistribution already applies to
    // achievement bands. Only when no combination can (too few grades, or a
    // count we never knew) does the whole-school row itself come down.
    if (hidden.some((g) => g.testedCount === null || g.testedCount === undefined)) {
      suppressAll.add(key)
      continue
    }
    let hiddenTotal = hidden.reduce((acc, g) => acc + (g.testedCount ?? 0), 0)
    const spare = grades
      .filter((g) => !thinOf(g))
      .sort((a2, b2) => (a2.testedCount ?? 0) - (b2.testedCount ?? 0))
    for (const g of spare) {
      if (hiddenTotal >= MIN_CELL) break
      alsoHide.add(rowKey(g))
      hiddenTotal += g.testedCount ?? 0
    }
    if (hiddenTotal < MIN_CELL) suppressAll.add(key)
  }

  return collapsed.map((r) => {
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
    const thin =
      count === null ||
      count < MIN_CELL ||
      alsoHide.has(rowKey(r)) ||
      (r.gradeLevel === 'all' && suppressAll.has(`${r.schoolId}|${r.schoolYear}|${r.testType}`))
    const determined = r.benchmarkTestedCount ?? null
    const thinBenchmark = thin || determined === null || determined < MIN_CELL
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
      // A benchmark RATE is met ÷ determined, and DETERMINED is its own, smaller
      // cohort: only students with a complete section set can be called ready or
      // not. Flooring these on testedCount let a grade of forty publish a rate
      // built from the two children who happened to sit every section — the
      // headline count clears the floor while the number it guards does not.
      benchmarkMetCount: thinBenchmark ? null : (r.benchmarkMetCount ?? null),
      benchmarkTestedCount: thinBenchmark ? null : (r.benchmarkTestedCount ?? null),
      benchmarkRates: thinBenchmark ? null : (r.benchmarkRates ?? null),
      distribution: thin ? null : (r.distribution ?? null),
      suppressed: thin,
    }
  })
}

/**
 * THE COMPLEMENT RULE, once.
 *
 * Suppressing a cell in isolation is never suppression when the cells partition
 * a published total: the hidden cells' combined value follows by subtraction.
 * What decides safety is not how much is VISIBLE but how many people the
 * recovered figure describes — so keep hiding the smallest visible cells until
 * the HIDDEN set itself clears the floor.
 *
 * This rule has now been got wrong independently at three sites: the grade rows
 * (fixed), the achievement bands (widened only when exactly one band was thin,
 * so two thin bands stayed exactly recoverable) and the gradebook terms
 * (measured the hidden mass in MARKS while suppressing on distinct STUDENTS, so
 * a one-child term with six marks sailed through). It lives here now, and every
 * site calls it.
 *
 * Returns the final hidden key set, or null when no combination can cover the
 * hidden cells — in which case the caller must suppress the total as well.
 */
export function coverHiddenSet<T>(
  cells: T[],
  opts: {
    key: (c: T) => string
    /** The unit the floor is measured in. Pass several when a cell can be thin
     *  for more than one reason — every unit must clear the floor. */
    weights: Array<(c: T) => number>
    hidden: (c: T) => boolean
    floor?: number
  },
): Set<string> | null {
  const floor = opts.floor ?? MIN_CELL
  const hidden = new Set(cells.filter(opts.hidden).map(opts.key))
  if (hidden.size === 0) return hidden
  const mass = (): number[] => {
    const inSet = cells.filter((c) => hidden.has(opts.key(c)))
    return opts.weights.map((w) => inSet.reduce((acc, c) => acc + w(c), 0))
  }
  const covered = (): boolean => mass().every((m) => m >= floor)
  const spare = cells
    .filter((c) => !hidden.has(opts.key(c)))
    .filter((c) => opts.weights.some((w) => w(c) > 0))
    .sort((a, b) => opts.weights[0](a) - opts.weights[0](b))
  for (const c of spare) {
    if (covered()) break
    hidden.add(opts.key(c))
  }
  return covered() ? hidden : null
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

// ═══ LONGITUDINAL COHORT TRAJECTORIES ════════════════════════════════════════
//
// `cohortMovements` above follows a cohort for exactly two legs — a slope. Two
// points cannot show a recovery, a plateau or a slide, and they cannot answer
// the question a school actually asks about the children it has taught since
// kindergarten: what happened over the WHOLE time we have had them.
//
// This block follows one cohort across a span of 2, 3 or 4 grades. It is
// ADDITIVE: the two-leg functions above and every caller of them are untouched.
//
// THREE RULES THAT THE UI CANNOT RECOVER FROM IF THEY ARE BROKEN HERE.
//
//  1. A trajectory ALWAYS carries exactly `opts.window` legs, in ascending
//     grade-rank order. A year with no result keeps its slot and reports WHY it
//     is empty. Dropping the slot would slide the remaining points left and
//     draw a line through years that were never measured.
//  2. A gap is NEVER interpolated and never zero. Four states, all distinct:
//     observed / suppressed (a thin cell, held back deliberately) /
//     not-reported (the school reported the grade but not this series) /
//     missing (no row at all). A reader must be able to tell "we protected
//     these children's privacy" from "nobody uploaded that year".
//  3. Net change is STRICTLY last-leg minus first-leg. When either ENDPOINT is
//     empty the change is null, the direction is 'unknown', and
//     `netChangeUnavailable` names which end failed and why. The tempting
//     substitute — first non-null to last non-null — silently relabels a
//     two-grade change as a four-grade claim. That figure is still useful, so
//     it ships as `observedChange`, carrying its OWN grade labels and span so
//     it can never be mistaken for the headline number.
//
// Direction is decided here, against `materialGap`, exactly as the two-leg
// version decides it. A +3 percentile move is not "growth"; a caller reading
// `netChange > 0` would paint it green, which is why the sign never leaves this
// file unaccompanied.

/**
 * Which series a trajectory follows: `'total'` for the publisher's REPORTED
 * composite, or a subject key from the family's own vocabulary.
 */
export type CohortSeries = string

/**
 * The reported-composite series.
 *
 * TOTAL BATTERY IS NOT THE MEAN OF THE SUBJECT COLUMNS. It is the composite the
 * publisher printed (`avgComposite`), computed by them over each student's own
 * total; averaging the section columns produces a different, unpublished
 * number. Payloads say `seriesBasis:'reported-composite'` so a matrix's Total
 * column can never be read as a row average of the columns beside it.
 */
export const COHORT_TOTAL_SERIES = 'total'

/**
 * WHAT THE COMPOSITE IS CALLED, PER FAMILY — never one hardcoded string.
 *
 * "Total Battery" is a norm-referenced publisher's word. On an ACT school the
 * same column is the Composite and on an SAT school it is the Total, and
 * printing the TerraNova word over either is the same class of error as an
 * axis captioned "TerraNova Scale Score" on a 1–36 chart. Every label the web
 * shows for the composite comes from here, through `availableSeries`.
 */
export function compositeSeriesLabel(family: TestFamily | string | null | undefined): string {
  if (family === 'act') return 'ACT Composite'
  if (family === 'sat') return 'SAT Total'
  if (family === 'nrt') return 'Total Battery'
  return 'Composite'
}

/** Why a leg has no value — never collapsed into a single "no data". */
export type LegState = 'observed' | 'suppressed' | 'not-reported' | 'missing'

export interface TrajectoryLeg {
  schoolYear: number
  /** The grade as the school itself wrote it when a row exists, else the
   *  canonical key for the rank — so a school storing 'PK' keeps 'PK'. */
  gradeLevel: string
  gradeRank: number
  value: number | null
  /** Null whenever `value` is null: a count without a score is a disclosure
   *  with no reporting value. */
  tested: number | null
  state: LegState
}

export type NetChangeUnavailable =
  | 'start-missing'
  | 'start-suppressed'
  | 'start-not-reported'
  | 'end-missing'
  | 'end-suppressed'
  | 'end-not-reported'

/** The first→last-observed figure, kept explicitly separate from netChange. */
export interface ObservedChange {
  value: number
  fromGrade: string
  toGrade: string
  /** How many grades that change actually spans — 2 is not 4. */
  spanGrades: number
}

export interface CohortTrajectory {
  cohortId: number
  /**
   * schoolId/schoolName/label sit at the TOP LEVEL of this object on purpose:
   * the payload anonymiser keys on sibling properties, so a trajectory nested
   * under `school: {}` would sail through it with the name attached. `label`
   * is the school's display name and is rewritten alongside schoolName, which
   * is why a peer line must be keyed on `label` and never on schoolId (that is
   * nulled for peers).
   */
  schoolId: string
  schoolName?: string
  label: string
  isFocus: boolean
  startGrade: string
  endGrade: string
  startYear: number
  endYear: number
  /** ALWAYS `window` entries, ascending by grade rank. */
  legs: TrajectoryLeg[]
  observedLegs: number
  complete: boolean
  /** STRICTLY last − first, or null. */
  netChange: number | null
  netChangeUnavailable: NetChangeUnavailable | null
  direction: 'gained' | 'declined' | 'held' | 'unknown'
  observedChange: ObservedChange | null
}

export interface CohortSpan {
  low: number | null
  high: number | null
  lowGrade: string | null
  highGrade: string | null
  gradesOnFile: string[]
  gradeDepth: number
  yearDepth: number
  /** The longest span this school's own grades can support; 0 when none can. */
  maxWindow: 0 | 2 | 3 | 4
  windows: number[]
}

export interface CohortPanelPlan {
  /** End ranks to draw, ascending. */
  endRanks: number[]
  /** How many the span supports before the cap — the honest denominator. */
  panelsAvailable: number
  truncated: boolean
}

export interface CohortTrajectoryOptions {
  window: number
  /** END-year anchored: every trajectory finishes in this year, so the panels
   *  are comparable with each other rather than each ending somewhere else. */
  endYear: number
  schoolIds?: string[]
  endGrades?: string[]
  gradeSpan?: { low: number | null; high: number | null }
  series?: CohortSeries
  family?: TestFamily
  scoreType?: ScoreType
  /** Below this many observed legs a trajectory is not drawn at all, rather
   *  than rendering an empty plot with a title. */
  minObservedLegs?: number
  focusSchoolId?: string
  maxPanels?: number
}

/**
 * The canonical grade key for a rank — the inverse of `gradeRankOf`.
 *
 * MATCHING IS ALWAYS BY RANK, never by string. 'PK' and 'PK4' are the same
 * grade (gradeRankOf maps both to −1) and schools use both spellings, so a
 * label-based join would lose a whole year of pre-K for half the network. This
 * returns 'PK4' for −1 and is used only to LABEL a slot that has no row.
 */
export function gradeKeyOfRank(rank: number): string | null {
  if (rank === -2) return 'PK3'
  if (rank === -1) return 'PK4'
  if (rank === 0) return 'K'
  return rank >= 1 && rank <= 12 ? `${rank}` : null
}

/**
 * The grades a school actually has results for.
 *
 * DERIVED FROM THE ROWS, NOT THE PROFILE — the same argument `schoolLevelFrom`
 * makes: the rows are a fact, the profile field is a label someone typed. A
 * high school whose rows run 9–12 can then never be offered a "grades 2 → 5"
 * panel, whatever its profile says, and a K-8 school inside a K-12 diocese does
 * not inherit the diocese's high-school grades.
 *
 * The span is read from the COMPOSITE column even when a subject series is
 * being drawn, so the set of panels does not reshape when the reader switches
 * series. Rows whose values were suppressed AND emptied contribute nothing: a
 * panel that could only ever be blank is not a panel.
 */
export function cohortSpanOf(rows: AssessmentRow[], schoolIds?: string[]): CohortSpan {
  const only = schoolIds ? new Set(schoolIds) : null
  const ranks: number[] = []
  const gradeByRank = new Map<number, string>()
  const years = new Set<number>()
  for (const r of rows) {
    if (only && !only.has(r.schoolId)) continue
    const rank = gradeRankOf(r.gradeLevel)
    if (rank === null) continue
    if (r.avgComposite === null && r.suppressed) continue
    ranks.push(rank)
    if (!gradeByRank.has(rank)) gradeByRank.set(rank, r.gradeLevel)
    years.add(r.schoolYear)
  }
  if (ranks.length === 0) {
    return {
      low: null,
      high: null,
      lowGrade: null,
      highGrade: null,
      gradesOnFile: [],
      gradeDepth: 0,
      yearDepth: 0,
      maxWindow: 0,
      windows: [],
    }
  }
  let low = ranks[0]
  let high = ranks[0]
  for (const r of ranks) {
    if (r < low) low = r
    if (r > high) high = r
  }
  const gradeDepth = high - low + 1
  const maxWindow: CohortSpan['maxWindow'] = gradeDepth >= 4 ? 4 : gradeDepth === 3 ? 3 : gradeDepth === 2 ? 2 : 0
  const windows: number[] = []
  for (let w = 2; w <= maxWindow; w += 1) windows.push(w)
  return {
    low,
    high,
    lowGrade: gradeByRank.get(low) ?? gradeKeyOfRank(low),
    highGrade: gradeByRank.get(high) ?? gradeKeyOfRank(high),
    gradesOnFile: [...gradeByRank.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g),
    gradeDepth,
    // Reported, deliberately NOT used to clamp the span: a school missing a
    // year in the middle still has a real 4-grade cohort, and that year shows
    // up honestly as a missing leg rather than shortening everyone's panel.
    yearDepth: years.size,
    maxWindow,
    windows,
  }
}

/**
 * Which panels a span supports at a given span length — the ONE enumeration,
 * shared by the trajectories, the matrix and the payload's own count, so the
 * table and the charts can never disagree about how many cohorts exist.
 *
 * A span shorter than the requested length yields NO panels rather than an
 * error: an 11-12 school asking for four grades is a legitimate question with
 * the answer "not with these grades".
 */
export function cohortPanelPlan(
  span: { low: number | null; high: number | null },
  opts: { window: number; endGrades?: string[]; maxPanels?: number },
): CohortPanelPlan {
  if (span.low === null || span.high === null || opts.window < 2) {
    return { endRanks: [], panelsAvailable: 0, truncated: false }
  }
  const wanted =
    opts.endGrades && opts.endGrades.length > 0
      ? new Set(opts.endGrades.map((g) => gradeRankOf(g)).filter((r): r is number => r !== null))
      : null
  const all: number[] = []
  for (let rank = span.low + opts.window - 1; rank <= span.high; rank += 1) {
    if (wanted && !wanted.has(rank)) continue
    all.push(rank)
  }
  const cap = opts.maxPanels ?? 12
  const truncated = all.length > cap
  // Keep the HIGHEST end grades: the most recent thing that happened to the
  // oldest children on file is the reading a head of school opens this for.
  return { endRanks: truncated ? all.slice(all.length - cap) : all, panelsAvailable: all.length, truncated }
}

/** The picker for a series — `'total'` (or nothing) reads the reported composite. */
function seriesPicker(series?: CohortSeries): (r: AssessmentRow) => number | null {
  if (!series || series === COHORT_TOTAL_SERIES) return (r) => r.avgComposite
  return (r) => r.sectionAverages?.[series] ?? null
}

/**
 * One row per school/year/grade, built once and reused by every series.
 *
 * Rows whose grade is not a real grade ('all') are dropped here, which is what
 * structurally prevents a whole-school row from becoming a cohort leg.
 */
function indexTrajectoryRows(rows: AssessmentRow[], schoolIds?: string[]): Map<string, AssessmentRow> {
  const only = schoolIds ? new Set(schoolIds) : null
  const index = new Map<string, AssessmentRow>()
  for (const r of rows) {
    if (only && !only.has(r.schoolId)) continue
    const rank = gradeRankOf(r.gradeLevel)
    if (rank === null) continue
    const key = `${r.schoolId}|${r.schoolYear}|${rank}`
    const held = index.get(key)
    if (held === undefined || preferTrajectoryRow(r, held)) index.set(key, r)
  }
  return index
}

/** A total order over duplicate rows, so a shuffled input cannot change a
 *  chart: a reported value beats a blank, then the larger cohort, then the
 *  lower test-type key. */
function preferTrajectoryRow(next: AssessmentRow, held: AssessmentRow): boolean {
  const nextHas = next.avgComposite !== null
  const heldHas = held.avgComposite !== null
  if (nextHas !== heldHas) return nextHas
  const nextTested = next.testedCount ?? -1
  const heldTested = held.testedCount ?? -1
  if (nextTested !== heldTested) return nextTested > heldTested
  return next.testType < held.testType
}

/** Schools with at least one gradeable row, focus first then a stable order. */
function trajectorySchools(
  rows: AssessmentRow[],
  schoolIds?: string[],
  focusSchoolId?: string,
): Array<{ id: string; name?: string }> {
  const only = schoolIds ? new Set(schoolIds) : null
  const seen = new Map<string, { id: string; name?: string }>()
  for (const r of rows) {
    if (only && !only.has(r.schoolId)) continue
    if (gradeRankOf(r.gradeLevel) === null) continue
    const held = seen.get(r.schoolId)
    if (held === undefined) seen.set(r.schoolId, { id: r.schoolId, name: r.schoolName })
    else if (held.name === undefined && r.schoolName !== undefined) held.name = r.schoolName
  }
  return [...seen.values()].sort((a, b) => {
    if (focusSchoolId) {
      if (a.id === focusSchoolId) return -1
      if (b.id === focusSchoolId) return 1
    }
    const an = a.name ?? ''
    const bn = b.name ?? ''
    if (an !== bn) return an < bn ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

function buildTrajectory(
  index: Map<string, AssessmentRow>,
  school: { id: string; name?: string },
  endRank: number,
  endYear: number,
  span: number,
  pick: (r: AssessmentRow) => number | null,
  gap: number,
  focusSchoolId?: string,
): CohortTrajectory {
  const legs: TrajectoryLeg[] = []
  for (let i = 0; i < span; i += 1) {
    const back = span - 1 - i
    const schoolYear = endYear - back
    const gradeRank = endRank - back
    const row = index.get(`${school.id}|${schoolYear}|${gradeRank}`)
    const gradeLevel = row?.gradeLevel ?? gradeKeyOfRank(gradeRank) ?? `${gradeRank}`
    if (row === undefined) {
      legs.push({ schoolYear, gradeLevel, gradeRank, value: null, tested: null, state: 'missing' })
      continue
    }
    if (row.suppressed) {
      // Belt AND braces: the gate already emptied this row, and we empty it
      // again here, so a future caller that hands us ungated rows still cannot
      // publish a thin cell through this door.
      legs.push({ schoolYear, gradeLevel, gradeRank, value: null, tested: null, state: 'suppressed' })
      continue
    }
    const value = pick(row)
    legs.push({
      schoolYear,
      gradeLevel,
      gradeRank,
      value,
      tested: value === null ? null : (row.testedCount ?? null),
      // An INGESTED row's subject columns carry no per-subject count, so a
      // subject the publisher withheld and a subject suppressed upstream both
      // arrive as a blank. We report the weaker claim ('not-reported') rather
      // than assert a suppression we cannot evidence.
      state: value === null ? 'not-reported' : 'observed',
    })
  }

  const first = legs[0]
  const last = legs[legs.length - 1]
  const netChange = first.value !== null && last.value !== null ? last.value - first.value : null
  const netChangeUnavailable: NetChangeUnavailable | null =
    first.value === null
      ? (`start-${first.state}` as NetChangeUnavailable)
      : last.value === null
        ? (`end-${last.state}` as NetChangeUnavailable)
        : null
  const direction: CohortTrajectory['direction'] =
    netChange === null ? 'unknown' : netChange >= gap ? 'gained' : netChange <= -gap ? 'declined' : 'held'

  const observedIdx = legs.map((l, i) => (l.value === null ? -1 : i)).filter((i) => i >= 0)
  const observedChange: ObservedChange | null =
    observedIdx.length >= 2
      ? {
          value: (legs[observedIdx[observedIdx.length - 1]].value as number) - (legs[observedIdx[0]].value as number),
          fromGrade: legs[observedIdx[0]].gradeLevel,
          toGrade: legs[observedIdx[observedIdx.length - 1]].gradeLevel,
          spanGrades: legs[observedIdx[observedIdx.length - 1]].gradeRank - legs[observedIdx[0]].gradeRank,
        }
      : null

  const label = school.name ?? school.id
  return {
    cohortId: endYear - endRank,
    schoolId: school.id,
    schoolName: school.name,
    label,
    isFocus: focusSchoolId !== undefined && school.id === focusSchoolId,
    startGrade: first.gradeLevel,
    endGrade: last.gradeLevel,
    startYear: first.schoolYear,
    endYear: last.schoolYear,
    legs,
    observedLegs: observedIdx.length,
    complete: observedIdx.length === legs.length,
    netChange,
    netChangeUnavailable,
    direction,
    observedChange,
  }
}

/**
 * Every cohort a set of schools can be followed through, END-YEAR ANCHORED.
 *
 * Anchoring on the end year is what makes a screen of panels readable: they all
 * finish in the same year, so the reader compares cohorts rather than comparing
 * different vintages of the calendar. Leg i of a span of `w` is
 * `endYear − (w−1−i)` at rank `endRank − (w−1−i)` — one subtraction, no cohort
 * table, exactly as `cohortIdOf` intends.
 */
export function cohortTrajectories(rows: AssessmentRow[], opts: CohortTrajectoryOptions): CohortTrajectory[] {
  if (opts.window < 2 || opts.window > 4) return []
  const span = opts.gradeSpan ?? cohortSpanOf(rows, opts.focusSchoolId ? [opts.focusSchoolId] : opts.schoolIds)
  const plan = cohortPanelPlan(span, {
    window: opts.window,
    endGrades: opts.endGrades,
    maxPanels: opts.maxPanels,
  })
  if (plan.endRanks.length === 0) return []

  const index = indexTrajectoryRows(rows, opts.schoolIds)
  const schools = trajectorySchools(rows, opts.schoolIds, opts.focusSchoolId)
  const family = opts.family ?? rows[0]?.family ?? 'nrt'
  const scoreType = opts.scoreType ?? rows[0]?.scoreType ?? 'percentile'
  const gap = materialGap(family, scoreType)
  const pick = seriesPicker(opts.series)
  const minObserved = opts.minObservedLegs ?? 2

  const out: CohortTrajectory[] = []
  for (const endRank of plan.endRanks) {
    for (const school of schools) {
      const t = buildTrajectory(index, school, endRank, opts.endYear, opts.window, pick, gap, opts.focusSchoolId)
      if (t.observedLegs < minObserved) continue
      out.push(t)
    }
  }
  return out
}

export interface CohortMatrixCohort {
  key: string
  cohortId: number
  label: string
  startGrade: string
  endGrade: string
  startYear: number
  endYear: number
}

export interface CohortMatrixCell {
  cohortKey: string
  series: CohortSeries
  netChange: number | null
  netChangeUnavailable: NetChangeUnavailable | null
  direction: CohortTrajectory['direction']
  startValue: number | null
  endValue: number | null
  startTested: number | null
  endTested: number | null
  startState: LegState
  endState: LegState
  observedChange: ObservedChange | null
}

export interface CohortMatrixResult {
  cohorts: CohortMatrixCohort[]
  series: Array<{ key: CohortSeries; label: string }>
  cells: CohortMatrixCell[]
  /** The Total column is the publisher's composite, not a mean of the columns
   *  beside it — see COHORT_TOTAL_SERIES. */
  seriesBasis: 'reported-composite'
}

export interface CohortMatrixOptions extends Omit<CohortTrajectoryOptions, 'series' | 'schoolIds' | 'focusSchoolId'> {
  /** The matrix is FOCUS-SCHOOL-ONLY, always: a grid of every school's every
   *  subject is not a reading, it is a spreadsheet. */
  schoolId: string
  series: CohortSeries[]
}

/**
 * The whole cohort table in ONE pass: the row index is built and the panels
 * enumerated once, then each series is a different pick over the SAME legs.
 * Six series over twelve cohorts is one traversal and 72 picks, not six
 * traversals and never six round trips.
 */
export function cohortMatrix(rows: AssessmentRow[], opts: CohortMatrixOptions): CohortMatrixResult {
  const seriesKeys = opts.series.length > 0 ? opts.series : [COHORT_TOTAL_SERIES]
  // Resolved BEFORE the labels, not after: the composite's name is a property
  // of the family, so an ACT matrix must never be headed "Total Battery".
  const labelFamily = opts.family ?? rows[0]?.family ?? 'nrt'
  const seriesDefs = seriesKeys.map((key) => ({
    key,
    label: key === COHORT_TOTAL_SERIES ? compositeSeriesLabel(labelFamily) : subjectLabelOf(key),
  }))
  const empty: CohortMatrixResult = { cohorts: [], series: seriesDefs, cells: [], seriesBasis: 'reported-composite' }
  if (opts.window < 2 || opts.window > 4) return empty

  const span = opts.gradeSpan ?? cohortSpanOf(rows, [opts.schoolId])
  const plan = cohortPanelPlan(span, { window: opts.window, endGrades: opts.endGrades, maxPanels: opts.maxPanels })
  if (plan.endRanks.length === 0) return empty

  const index = indexTrajectoryRows(rows, [opts.schoolId])
  const school = trajectorySchools(rows, [opts.schoolId], opts.schoolId)[0] ?? { id: opts.schoolId }
  const family = opts.family ?? rows[0]?.family ?? 'nrt'
  const scoreType = opts.scoreType ?? rows[0]?.scoreType ?? 'percentile'
  const gap = materialGap(family, scoreType)
  const pickers = seriesDefs.map((s) => ({ key: s.key, pick: seriesPicker(s.key) }))

  const cohorts: CohortMatrixCohort[] = []
  const cells: CohortMatrixCell[] = []
  for (const endRank of plan.endRanks) {
    const built = pickers.map((p) => ({
      key: p.key,
      trajectory: buildTrajectory(index, school, endRank, opts.endYear, opts.window, p.pick, gap, opts.schoolId),
    }))
    // A row where NOTHING was observed in any series is a row of dashes; the
    // row set stays series-independent otherwise, so switching the panel series
    // never reshapes the table underneath it.
    // Admit a matrix row on the SAME test the panels use, or the table can
    // outnumber the charts and the web's cohortKey join finds an orphan row
    // (review-caught: `> 0` here vs `>= minObserved` for panels).
    if (!built.some((b) => b.trajectory.observedLegs >= (opts.minObservedLegs ?? 2))) continue
    const shape = built[0].trajectory
    const cohortKey = cohortPanelKey(shape.cohortId, shape.legs[0].gradeRank, endRank)
    cohorts.push({
      key: cohortKey,
      cohortId: shape.cohortId,
      label: cohortPanelLabel(shape.startGrade, shape.endGrade),
      startGrade: shape.startGrade,
      endGrade: shape.endGrade,
      startYear: shape.startYear,
      endYear: shape.endYear,
    })
    for (const b of built) {
      const first = b.trajectory.legs[0]
      const last = b.trajectory.legs[b.trajectory.legs.length - 1]
      cells.push({
        cohortKey,
        series: b.key,
        netChange: b.trajectory.netChange,
        netChangeUnavailable: b.trajectory.netChangeUnavailable,
        direction: b.trajectory.direction,
        startValue: first.value,
        endValue: last.value,
        startTested: first.tested,
        endTested: last.tested,
        startState: first.state,
        endState: last.state,
        observedChange: b.trajectory.observedChange,
      })
    }
  }
  return { cohorts, series: seriesDefs, cells, seriesBasis: 'reported-composite' }
}

/** The join key between a panel and its matrix row — one spelling, both sides. */
export function cohortPanelKey(cohortId: number, startRank: number, endRank: number): string {
  return `c${cohortId}.g${startRank}_${endRank}`
}

/** "Grades 2 → 5" / "Grades K → 3". */
export function cohortPanelLabel(startGrade: string, endGrade: string): string {
  return `Grades ${startGrade} → ${endGrade}`
}

export interface CohortTrajectorySummaryLeg extends AverageResult {
  schoolYear: number
  gradeLevel: string
  gradeRank: number
}

export interface CohortTrajectorySummary {
  legs: CohortTrajectorySummaryLeg[]
  /** Last leg minus first — ONLY when both ends are the same statistic. */
  change: number | null
  /** The weighting both ends share when `change` is published; else null. */
  changeWeighting: 'tester-weighted' | 'simple' | null
  /** False when the ends are different statistics — distinct from absent data. */
  changeComparable: boolean
  gained: number
  declined: number
  held: number
  schools: number
}

/**
 * The network's read on one cohort: a tester-weighted average PER LEG.
 *
 * Per leg, and never one blended "trajectory average". Each leg reports its own
 * `weighting`, so a year whose files carried no tester counts is labelled
 * 'simple' rather than being folded into a weighted number and presented under
 * the same name — the rule this whole file is organised around.
 */
export function cohortTrajectorySummary(
  trajectories: CohortTrajectory[],
  opts: { family?: TestFamily; scoreType?: ScoreType } = {},
): CohortTrajectorySummary {
  const family = opts.family ?? 'nrt'
  const scoreType = opts.scoreType ?? 'percentile'
  const width = trajectories.reduce((acc, t) => Math.max(acc, t.legs.length), 0)
  const legs: CohortTrajectorySummaryLeg[] = []
  for (let i = 0; i < width; i += 1) {
    const at = trajectories.map((t) => t.legs[i]).filter((l): l is TrajectoryLeg => l !== undefined)
    const asRows: AssessmentRow[] = at
      .filter((l) => l.value !== null)
      .map((l) => ({
        schoolId: '',
        schoolYear: l.schoolYear,
        testType: '',
        family,
        scoreType,
        gradeLevel: l.gradeLevel,
        avgComposite: l.value,
        testedCount: l.tested ?? null,
      }))
    const shape = at[0]
    legs.push({
      ...averageOf(asRows),
      schoolYear: shape?.schoolYear ?? 0,
      gradeLevel: shape?.gradeLevel ?? '',
      gradeRank: shape?.gradeRank ?? 0,
    })
  }
  const first = legs[0]
  const last = legs[legs.length - 1]
  // SUBTRACT LIKE FROM LIKE. Each leg reports its own `weighting`, and a leg
  // whose rows are missing a tested count falls back to a simple mean. Taking
  // the difference of a simple mean and a tester-weighted one is not a change —
  // it is two different statistics subtracted, and it can flip the sign of the
  // headline number (review-caught: a fixture read −16.5 where the comparable
  // figure was +2.0). When the ends disagree we publish no change and say why.
  const comparable =
    !!first && !!last && first.value !== null && last.value !== null && first.weighting === last.weighting
  return {
    legs,
    change: comparable ? last!.value! - first!.value! : null,
    /** The statistic both ends share, when they share one — else null. */
    changeWeighting: comparable ? (first!.weighting ?? null) : null,
    /** False when the ends are different statistics (not when data is absent). */
    changeComparable: comparable,
    gained: trajectories.filter((t) => t.direction === 'gained').length,
    declined: trajectories.filter((t) => t.direction === 'declined').length,
    held: trajectories.filter((t) => t.direction === 'held').length,
    schools: trajectories.length,
  }
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
  /** How many sat the test this year. A move of +9 across eleven children and
   *  one across two hundred are different findings, and the reader cannot tell
   *  them apart unless the cohort size travels with the change. */
  tested: number | null
  priorTested: number | null
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
        tested: cur?.testedCount ?? null,
        priorTested: prev?.testedCount ?? null,
      }
    })
    .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity))
}

// ── THE GRADEBOOK GATE ───────────────────────────────────────────────────────
//
// The score path has gateAggregates; the gradebook needed the same one door and
// did not have it. Round 3 put a floor inside GradebookService.summary and left
// Penny's get_gradebook_summary running its own copy of the query, so the REST
// route answered "suppressed" while the chattiest surface in the product
// answered with the number. That is the identical mistake round 2 found on the
// score path, one table over.
//
// Three things the first floor got wrong, fixed here:
//   1. It counted MARKS. One student with five courses cleared a floor meant to
//      mean five students, so their own average was published as the school's.
//   2. It gated on the ROW count while the average it guarded is computed by SQL
//      over non-null marks only — a cohort of two scored marks among five rows
//      passed a floor its own average never met.
//   3. It floored each term independently while publishing the school total, so
//      a thin term was recoverable by subtraction — the same complement attack
//      as the grades above.

export interface GradebookTermInput {
  term: string | null
  /** Marks with a NUMBER in them — the population the average is taken over. */
  scoredCount: number
  /** Distinct students behind those marks. */
  studentCount: number
  average: number | null
}

export interface GradebookSummaryInput {
  totalMarks: number
  courses: number
  scoredCount: number
  studentCount: number
  average: number | null
  byTerm: GradebookTermInput[]
}

export interface GradebookTermOutput {
  term: string
  count: number
  average: number | null
  suppressed: boolean
}

export interface GradebookSummaryOutput {
  total: number
  courses: number
  average: number | null
  suppressed: boolean
  byTerm: GradebookTermOutput[]
}

/**
 * Floor a gradebook summary. The ONE function both the REST route and the
 * assistant call — a floor that lives in one caller is not a floor.
 */
export function gateGradebookSummary(input: GradebookSummaryInput): GradebookSummaryOutput {
  const publishable = (studentCount: number, scoredCount: number, average: number | null): boolean =>
    average !== null && studentCount >= MIN_CELL && scoredCount >= MIN_CELL

  const terms = input.byTerm.map((t) => ({
    term: t.term ?? 'unspecified',
    // The COUNT is safe — "3 marks on file" names nobody. The average is not.
    count: t.scoredCount,
    average: publishable(t.studentCount, t.scoredCount, t.average) ? t.average : null,
    suppressed: !publishable(t.studentCount, t.scoredCount, t.average),
  }))

  // THE COMPLEMENT, through the shared rule — and measured in BOTH units.
  //
  // A school average of 87.0 over 11 marks beside a visible term of 10 marks
  // averaging 88.0 gives up the eleventh mark exactly: 11 x 87.0 - 10 x 88.0 =
  // 77. Counting the hidden mass only in MARKS missed the worse case: a term
  // suppressed for having ONE CHILD but six marks cleared a marks-only test, and
  // (36 x 86.17 - 30 x 85.0) / 6 returned that child's exact average.
  const cover = coverHiddenSet(input.byTerm, {
    key: (t) => t.term ?? '',
    weights: [(t) => t.scoredCount, (t) => t.studentCount],
    hidden: (t) => !publishable(t.studentCount, t.scoredCount, t.average),
  })
  const hiddenKeys = cover ?? new Set(input.byTerm.map((t) => t.term ?? ''))
  const overallOk = cover !== null && publishable(input.studentCount, input.scoredCount, input.average)

  return {
    total: input.totalMarks,
    courses: input.courses,
    average: overallOk ? input.average : null,
    suppressed: !overallOk && input.totalMarks > 0,
    byTerm: terms.map((t, i) => {
      const raw = input.byTerm[i]
      const hide = hiddenKeys.has(raw.term ?? '')
      return hide ? { ...t, average: null, suppressed: true } : t
    }),
  }
}
