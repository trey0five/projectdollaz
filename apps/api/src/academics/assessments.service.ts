// ─────────────────────────────────────────────────────────────────────────────
// AssessmentsService — ingest, aggregate, and serve the academic dashboards.
//
// THE ONE-DOOR RULE. Student rows (with names) live in assessment_results and
// are read ONLY by the register endpoints, which are role-gated. Every other
// surface — the dashboards, the org roll-up, the briefing, the assistant —
// reads assessment_school_aggregates, a table with no identity column in it.
// The protection is the SHAPE, not a filter someone must remember to apply.
//
// DERIVE, DON'T TRUST. When a file carries student rows we compute the school
// aggregate ourselves (derivation:'derived') rather than believing a summary
// row, so the dashboard's average and the register's rows can never disagree.
// A school-aggregate file stores derivation:'ingested'; when both exist the
// derived row wins, because only it carries the tester counts that make an
// honest tester-weighted diocesan average possible.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  SCORE_TYPE_FOR_FAMILY,
  SUBJECTS_FOR_FAMILY,
  TEST_FAMILY,
  isTestTypeKey,
  schoolLevelFrom,
  testTypesForLevel,
  type TestTypeKey,
} from '@finrep/db'
import {
  anonymizePeers,
  availableCohorts,
  benchmarksFor,
  cohortPublishable,
  gateAggregates,
  averageOf,
  buildAssessmentInsight,
  cohortMovements,
  cohortSummary,
  compareToPeer,
  distributionOf,
  gradeHeatmap,
  isForthcoming,
  movements,
  nationalReference,
  objectiveStandings,
  participationOf,
  peerAverage,
  rankOf,
  rankSchools,
  scoreRange,
  MIN_CELL,
  strengthsAndOpportunities,
  subjectComparisons,
  systemInsights,
  trendDirection,
  trendSeries,
  yoyChange,
  type AssessmentRow,
  type ObjectiveRow,
  getMetric,
  coverHiddenSet,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  TOTAL_KEY,
  looksLikeObjectiveFile,
  parseAssessmentCsv,
  parseObjectiveCsv,
  subjectsSeen,
  type AssessmentParseResult,
} from './parsers/assessment-file.parser.js'
import { matchAll, type MatchCandidate, type RosterStudent } from './matching/student-match.js'

/** How many register rows one page returns. The page reports the total too. */
const REGISTER_PAGE = 500

const ACHIEVEMENT_BANDS = ['q1', 'q2', 'q3', 'q4'] as const

export interface UploadPreview {
  scope: 'student' | 'school_aggregate'
  testType: TestTypeKey
  family: string
  scoreType: string
  years: number[]
  subjects: string[]
  rows: number
  warnings: string[]
  /** Student files only — how the roster match went. */
  match?: { matched: number; unmatched: number; ambiguous: number }
  /** A short, non-identifying sample so the reviewer can sanity-check parsing. */
  sample: Array<Record<string, unknown>>
  /** Echoed back to /commit so the file is parsed once, not twice. */
  token: string
}

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Ingest ────────────────────────────────────────────────────────────────

  /**
   * Parse a file and REPORT what we found — no writes. The reviewer sees the
   * shape, the years, the subjects, the match rate and any warnings before a
   * single row lands.
   */
  async preview(
    schoolId: string,
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; gradeLevel?: string } = {},
  ): Promise<UploadPreview> {
    // An objective summary is a different file with a different grain, so it is
    // detected and routed here rather than being forced through the score path.
    if (this.isObjectiveFile(file)) return this.previewObjectives(file, opts)
    const parsed = this.parse(file, opts)
    const subjects = subjectsSeen(parsed)

    let match: UploadPreview['match'] | undefined
    if (parsed.scope === 'student') {
      const roster = await this.roster(schoolId)
      match = matchAll(this.candidates(parsed), roster).summary
    }

    const sample =
      parsed.scope === 'student'
        ? // Sample WITHOUT names — a preview is not a reason to echo identity back.
          parsed.students.slice(0, 5).map((s) => ({
            grade: s.gradeLevel,
            composite: s.composite,
            ...s.sectionScores,
          }))
        : parsed.aggregates.slice(0, 5).map((a) => ({
            school: a.schoolName,
            grade: a.gradeLevel,
            year: a.schoolYear,
            total: a.scores[TOTAL_KEY] ?? null,
            tested: a.testedCount,
          }))

    return {
      scope: parsed.scope,
      testType: parsed.testType,
      family: parsed.family,
      scoreType: parsed.scoreType,
      years: parsed.years,
      subjects,
      rows: parsed.scope === 'student' ? parsed.students.length : parsed.aggregates.length,
      warnings: parsed.warnings,
      match,
      sample,
      token: Buffer.from(JSON.stringify({ n: file.originalname ?? null })).toString('base64url'),
    }
  }

  /**
   * Parse AND write. Idempotent per (school, year, test, grade, derivation):
   * re-uploading a corrected file replaces that slice rather than doubling it.
   */
  async commit(
    schoolId: string,
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; gradeLevel?: string; userId?: string } = {},
  ): Promise<{ importId: string; resultsCreated: number; aggregatesUpserted: number; matched: number; unmatched: number; warnings: string[] }> {
    if (this.isObjectiveFile(file)) return this.commitObjectives(schoolId, file, opts)
    const parsed = this.parse(file, opts)
    const year = opts.schoolYear ?? parsed.years[0] ?? null
    if (year === null) {
      throw new BadRequestException('No school year in the file — choose one before committing.')
    }

    const imp = await this.prisma.assessmentImport.create({
      data: {
        schoolId,
        kind: 'upload',
        scope: parsed.scope,
        fileName: file.originalname ?? null,
        testTypeHint: parsed.testType,
        yearHint: year,
        rowsParsed: parsed.scope === 'student' ? parsed.students.length : parsed.aggregates.length,
        warnings: parsed.warnings,
        uploadedByUserId: opts.userId ?? null,
      },
      select: { id: true },
    })

    let resultsCreated = 0
    let matched = 0
    let unmatched = 0
    let touchedYears: number[] = [year]

    if (parsed.scope === 'student') {
      const roster = await this.roster(schoolId)
      const { decisions } = matchAll(this.candidates(parsed), roster)
      const rows = parsed.students.map((s, i) => {
        const d = decisions[i]
        if (d.studentId) matched += 1
        else unmatched += 1
        return {
          schoolId,
          importId: imp.id,
          studentId: d.studentId,
          matchStatus: d.status,
          matchExternalId: s.externalId,
          matchName: [s.lastName, s.firstName].filter(Boolean).join(', ') || s.rawName,
          testType: parsed.testType,
          scoreType: parsed.scoreType,
          schoolYear: s.schoolYear ?? year,
          gradeLevel: s.gradeLevel ?? opts.gradeLevel ?? null,
          composite: s.composite === null ? null : Math.round(s.composite),
          sectionScores: Object.keys(s.sectionScores).length > 0 ? s.sectionScores : undefined,
          benchmarksMet: this.benchmarksMet(parsed, s.sectionScores),
          source: 'upload',
        }
      })
      // Replace EVERY year the file carries, not just the hint year. A file
      // spanning two years re-uploaded would otherwise clear one year and append
      // the other, doubling it — and the untouched years would never be
      // re-aggregated, so their dashboards would keep the stale average.
      const years = [...new Set(rows.map((r) => r.schoolYear))]
      // ...BUT ONLY THE GRADES THIS FILE CARRIES. Clearing the whole (year,
      // test) slice meant a school uploading grade 3 and then grade 4 — or one
      // administration then the next — silently destroyed the first upload, and
      // the UI cheerfully reported "Saved — 31 student rows" while deleting 28.
      // The summary path already scopes its replace by grade and the gradebook
      // path by course; this was the last one still year-wide.
      const grades = [...new Set(rows.map((r) => r.gradeLevel ?? null))]
      const knownGrades = grades.filter((g): g is string => g !== null)
      await this.prisma.assessmentResult.deleteMany({
        where: {
          schoolId,
          schoolYear: { in: years },
          testType: parsed.testType,
          source: 'upload',
          ...(grades.includes(null)
            ? knownGrades.length > 0
              ? { OR: [{ gradeLevel: { in: knownGrades } }, { gradeLevel: null }] }
              : { gradeLevel: null }
            : { gradeLevel: { in: knownGrades } }),
        },
      })
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        const created = await this.prisma.assessmentResult.createMany({ data: chunk })
        resultsCreated += created.count
      }
      for (const y of years) await this.deriveAggregates(schoolId, y, parsed.testType, imp.id)
      touchedYears = years
    }

    let aggregatesUpserted = 0
    if (parsed.scope === 'school_aggregate') {
      // A school-scoped upload of a file that NAMES schools must not silently
      // file another school's rows under this one. When the file carries names,
      // keep only the rows that are this school's; the diocesan endpoint is the
      // right door for a multi-school file, and the warning says so.
      const named = parsed.aggregates.filter((a) => a.schoolName !== null)
      let rows = parsed.aggregates
      if (named.length > 0) {
        const own = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } })
        const target = (own?.name ?? '').trim().toLowerCase()
        const mine = named.filter((a) => (a.schoolName ?? '').trim().toLowerCase() === target)
        const others = named.length - mine.length
        if (others > 0) {
          parsed.warnings.push(
            `${others} row${others === 1 ? '' : 's'} named a different school and were skipped — upload a multi-school file from the organization page.`,
          )
        }
        rows = mine
      }
      // A CORRECTED FILE REPLACES ITS SLICE. Upserting only the rows the new file
      // carries left the ingested rows of grades the correction DROPPED sitting
      // in the table — a school that removed a mis-keyed grade 6 kept it, and
      // rollUpAllGrades folded the stale cohort straight back into the
      // whole-school average. Clear this (year, test) slice's ingested rows for
      // grades the new file does not mention, then write what it does.
      const fileYears = [...new Set(rows.map((a2) => a2.schoolYear ?? year))]
      for (const y of fileYears) {
        const keep = rows.filter((a2) => (a2.schoolYear ?? year) === y).map((a2) => a2.gradeLevel)
        await this.prisma.assessmentSchoolAggregate.deleteMany({
          where: {
            schoolId,
            schoolYear: y,
            testType: parsed.testType,
            derivation: 'ingested',
            gradeLevel: { notIn: [...keep, 'all'] },
          },
        })
      }
      for (const a of rows) {
        const rowYear = a.schoolYear ?? year
        await this.upsertAggregate({
          schoolId,
          importId: imp.id,
          schoolYear: rowYear,
          testType: parsed.testType,
          gradeLevel: a.gradeLevel,
          derivation: 'ingested',
          scoreType: parsed.scoreType,
          avgComposite: a.scores[TOTAL_KEY] ?? null,
          sectionAverages: Object.fromEntries(Object.entries(a.scores).filter(([k]) => k !== TOTAL_KEY)),
          testedCount: a.testedCount,
          eligibleCount: a.eligibleCount,
        })
        aggregatesUpserted += 1
      }
      // Synthesize the whole-school row from the per-grade rows this file
      // carried. Without it a by-grade summary file leaves gradeLevel:'all'
      // empty, so the headline KPI, the rank and promoteOperational all see
      // nothing — the dashboard reads "no data" while the grades are right there.
      const rowYears = [...new Set(rows.map((a2) => a2.schoolYear ?? year))]
      for (const y of rowYears) await this.rollUpAllGrades(schoolId, y, parsed.testType)
      touchedYears = rowYears
    }

    await this.prisma.assessmentImport.update({
      where: { id: imp.id },
      data: { resultsCreated, aggregatesUpserted, studentsMatched: matched, studentsUnmatched: unmatched },
    })
    for (const y of touchedYears) await this.promoteOperational(schoolId, y)

    return { importId: imp.id, resultsCreated, aggregatesUpserted, matched, unmatched, warnings: parsed.warnings }
  }

  /** Delete one import's rows and re-derive what it touched. */
  async revert(schoolId: string, importId: string): Promise<{ deleted: number }> {
    // A DIOCESAN upload records ONE import with an organizationId and a null
    // schoolId, so a schoolId-only lookup could never find it: an org import was
    // invisible to every listing and impossible to undo through any route. A
    // school may revert an org import, but only its OWN rows come out.
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { organizationId: true },
    })
    const imp = await this.prisma.assessmentImport.findFirst({
      where: {
        id: importId,
        OR: [{ schoolId }, ...(school?.organizationId ? [{ organizationId: school.organizationId }] : [])],
      },
      select: { id: true, kind: true, yearHint: true, testTypeHint: true },
    })
    if (!imp) throw new NotFoundException('Import not found.')

    // GRADEBOOK and OBJECTIVE imports write to different tables entirely.
    // Reverting them deleted nothing at all and reported success — the Undo
    // button listed them, removed nothing, and left the row on screen.
    if (imp.kind === 'gradebook') {
      const removed = await this.prisma.gradeRecord.deleteMany({ where: { importId, schoolId } })
      return { deleted: removed.count }
    }
    if (imp.kind === 'objectives') {
      const removed = await this.prisma.assessmentObjectiveAggregate.deleteMany({ where: { importId, schoolId } })
      return { deleted: removed.count }
    }
    // Capture the affected years BEFORE deleting — afterwards there is nothing
    // left to tell us which years need re-deriving.
    // Both tables, not just the student rows: a SCHOOL-SUMMARY import creates no
    // AssessmentResult at all, so a results-only sweep found nothing and the
    // revert fell back to yearHint — which is null for a multi-year file.
    const [resultYears, aggregateYears] = await Promise.all([
      this.prisma.assessmentResult.findMany({
        where: { importId, schoolId },
        select: { schoolYear: true },
        distinct: ['schoolYear'],
      }),
      this.prisma.assessmentSchoolAggregate.findMany({
        where: { importId, schoolId },
        select: { schoolYear: true },
        distinct: ['schoolYear'],
      }),
    ])
    const affectedYears = [...new Set([...resultYears, ...aggregateYears].map((r) => r.schoolYear))]
    const [results, aggregates] = await Promise.all([
      this.prisma.assessmentResult.deleteMany({ where: { importId, schoolId } }),
      this.prisma.assessmentSchoolAggregate.deleteMany({ where: { importId, schoolId } }),
    ])
    // Re-derive every year this import touched, not just its hint: a multi-year
    // file reverted by hint alone would leave the other years' aggregates
    // describing rows that no longer exist.
    if (isTestTypeKey(imp.testTypeHint)) {
      const years = [...new Set([...(affectedYears ?? []), ...(imp.yearHint ? [imp.yearHint] : [])])]
      for (const y of years) {
        await this.deriveAggregates(schoolId, y, imp.testTypeHint, null)
        // Re-synthesize (or delete) the gradeLevel:'all' row — it has no importId
        // and would otherwise outlive the per-grade rows it was built from.
        await this.rollUpAllGrades(schoolId, y, imp.testTypeHint)
        await this.promoteOperational(schoolId, y)
      }
    }
    return { deleted: results.count + aggregates.count }
  }

  async listImports(schoolId: string) {
    // Include the DIOCESAN uploads that wrote this school's rows. They carry an
    // organizationId and no schoolId, so a schoolId-only filter hid them —
    // leaving a school able to see numbers it had no record of receiving.
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { organizationId: true },
    })
    return this.prisma.assessmentImport.findMany({
      where: {
        OR: [{ schoolId }, ...(school?.organizationId ? [{ organizationId: school.organizationId }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        scope: true,
        fileName: true,
        testTypeHint: true,
        yearHint: true,
        rowsParsed: true,
        resultsCreated: true,
        aggregatesUpserted: true,
        studentsMatched: true,
        studentsUnmatched: true,
        warnings: true,
        createdAt: true,
      },
    })
  }

  // ── Registers (role-gated: these are the ONLY paths that see a name) ───────

  async listResults(
    schoolId: string,
    q: { schoolYear?: number; testType?: string; gradeLevel?: string; unmatchedOnly?: boolean } = {},
  ) {
    // THE CAP HAS TO ANNOUNCE ITSELF, AND THE YEARS HAVE TO BE REACHABLE.
    //
    // A bare take:1000 ordered newest-first meant a school with a few years of
    // history silently lost its oldest rows off the end of the register — the
    // data was on the server, unreachable, with nothing on screen to suggest it
    // existed. Returning the TOTAL lets the page say what it is not showing, and
    // returning the YEARS ON FILE gives it the filter that reaches them.
    const where = {
      schoolId,
      ...(q.schoolYear ? { schoolYear: q.schoolYear } : {}),
      ...(q.testType ? { testType: q.testType } : {}),
      ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}),
      ...(q.unmatchedOnly ? { matchStatus: 'unmatched' } : {}),
    }
    const rows = await this.prisma.assessmentResult.findMany({
      where,
      orderBy: [{ schoolYear: 'desc' }, { gradeLevel: 'asc' }, { composite: 'desc' }],
      take: REGISTER_PAGE,
      select: {
        id: true,
        studentId: true,
        matchStatus: true,
        matchName: true,
        matchExternalId: true,
        testType: true,
        scoreType: true,
        schoolYear: true,
        gradeLevel: true,
        composite: true,
        sectionScores: true,
        benchmarksMet: true,
        student: { select: { firstName: true, lastName: true, grade: true } },
      },
    })
    const [total, years] = await Promise.all([
      this.prisma.assessmentResult.count({ where }),
      this.prisma.assessmentResult.findMany({
        where: { schoolId },
        select: { schoolYear: true },
        distinct: ['schoolYear'],
        orderBy: { schoolYear: 'desc' },
      }),
    ])
    return {
      rows: rows.map((r) => ({
        ...r,
        displayName: r.student ? `${r.student.lastName}, ${r.student.firstName}` : r.matchName,
      })),
      total,
      shown: rows.length,
      years: years.map((y) => y.schoolYear),
    }
  }

  /** Attach an unmatched row to a roster student by hand. */
  async attachResult(schoolId: string, resultId: string, studentId: string) {
    const [row, student] = await Promise.all([
      this.prisma.assessmentResult.findFirst({ where: { id: resultId, schoolId }, select: { id: true } }),
      this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } }),
    ])
    if (!row || !student) throw new NotFoundException('Result or student not found.')
    return this.prisma.assessmentResult.update({
      where: { id: resultId },
      data: { studentId, matchStatus: 'manual' },
      select: { id: true, studentId: true, matchStatus: true },
    })
  }

  /**
   * The test family a school leads with when the caller names none.
   *
   * `all[0].testType` was a findMany with no orderBy, handed through a Map that
   * preserves insertion order — so a school holding both an ACT and a TerraNova
   * got whichever row Postgres happened to return first, and its dashboard's
   * default family, score type and axis range changed between two identical
   * requests. Most-recent year wins, then the most rows, then alphabetical: a
   * total order with no ties left to chance.
   */
  private defaultTestType(rows: AssessmentRow[]): string {
    const stats = new Map<string, { latest: number; count: number }>()
    for (const r of rows) {
      const cur = stats.get(r.testType) ?? { latest: -Infinity, count: 0 }
      cur.latest = Math.max(cur.latest, r.schoolYear)
      cur.count += 1
      stats.set(r.testType, cur)
    }
    return (
      [...stats.entries()].sort(
        (a, b) => b[1].latest - a[1].latest || b[1].count - a[1].count || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? 'terranova'
    )
  }

  // ── Summaries (counts only — safe for Penny, briefing, anyone) ─────────────

  async summary(schoolId: string, q: { schoolYear?: number; testType?: string } = {}) {
    const aggregates = await this.aggregates([schoolId], q)
    const school = aggregates.filter((a) => a.gradeLevel === 'all')
    const latestYear = aggregates.length > 0 ? Math.max(...aggregates.map((a) => a.schoolYear)) : null
    const byYear = new Map<number, AssessmentRow[]>()
    for (const a of aggregates) {
      const list = byYear.get(a.schoolYear) ?? []
      list.push(a)
      byYear.set(a.schoolYear, list)
    }
    return {
      years: [...byYear.keys()].sort((a, b) => b - a),
      latestYear,
      testTypes: [...new Set(aggregates.map((a) => a.testType))],
      grades: [...new Set(aggregates.map((a) => a.gradeLevel))].filter((g) => g !== 'all'),
      schoolAverage: averageOf(school).value,
      tested: school.reduce((acc, a) => acc + (a.testedCount ?? 0), 0),
      rows: aggregates.length,
    }
  }

  // ── The dashboard ─────────────────────────────────────────────────────────

  /**
   * One payload for every academic view. Built server-side from the aggregate
   * table + the pure layer, so a school page, an org page and a print packet
   * cannot drift apart.
   */
  async dashboard(
    schoolId: string,
    q: {
      schoolYear?: number
      testType?: string
      gradeLevel?: string
      subject?: string
      cohortGrade?: string
      hidePeerNames?: boolean
    } = {},
  ) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, organizationId: true, schoolType: true, gradeLow: true, gradeHigh: true },
    })
    if (!school) throw new NotFoundException('School not found.')

    const level = schoolLevelFrom(school)
    const peerIds = await this.orgSchoolIds(school.organizationId)
    const all = await this.aggregates(peerIds, { testType: q.testType })
    // Independent of q.testType on purpose — see testTypesFor.
    const availableTestTypes = await this.testTypesFor(peerIds)
    if (all.length === 0) {
      return this.emptyDashboard(school, level)
    }

    const years = [...new Set(all.map((a) => a.schoolYear))].sort((a, b) => b - a)
    const year = q.schoolYear ?? years[0]
    const testType = (q.testType ?? this.defaultTestType(all)) as TestTypeKey
    const family = TEST_FAMILY[testType] ?? 'nrt'
    const scoreType = SCORE_TYPE_FOR_FAMILY[family]
    const subjects = [...SUBJECTS_FOR_FAMILY[family]]
    const grade = q.gradeLevel ?? 'all'

    const inScope = all.filter((a) => a.testType === testType)
    const thisYear = inScope.filter((a) => a.schoolYear === year && a.gradeLevel === grade)
    const own = thisYear.find((a) => a.schoolId === schoolId) ?? null
    const ownAllYears = inScope.filter((a) => a.schoolId === schoolId && a.gradeLevel === grade)

    const peer = peerAverage(thisYear, { excludeSchoolId: schoolId })
    const overall = compareToPeer(own?.avgComposite ?? null, peer, family, scoreType)
    const rank = rankOf(thisYear, schoolId)
    const trend = trendSeries(ownAllYears, inScope.filter((a) => a.gradeLevel === grade), { excludeSchoolId: schoolId })
    const participation = participationOf(own, thisYear, { excludeSchoolId: schoolId })

    // Objectives (norm-referenced files carry these; college exams do not).
    const objectiveRows = await this.objectives(peerIds, year, testType, q.gradeLevel)
    const standings = objectiveStandings(
      objectiveRows.filter((o) => o.schoolId === schoolId),
      objectiveRows,
      { excludeSchoolId: schoolId },
    )

    const cohortGrade = q.cohortGrade ?? null
    const cohort = cohortGrade
      ? {
          grade: cohortGrade,
          movements: cohortMovements(inScope, {
            currentYear: year,
            currentGrade: cohortGrade,
            subject: q.subject,
            family,
            scoreType,
          }),
          summary: cohortSummary(
            cohortMovements(inScope, { currentYear: year, currentGrade: cohortGrade, subject: q.subject, family, scoreType }),
          ),
        }
      : null

    const payload = {
      school: { id: school.id, name: school.name, level },
      context: {
        year,
        years,
        testType,
        family,
        scoreType,
        grade,
        grades: [...new Set(inScope.map((a) => a.gradeLevel))].filter((g) => g !== 'all').sort(),
        subjects,
        // Echoed back so the subject control reflects what the SERVER used
        // rather than what the browser last remembered — the same rule the
        // grade and year selects already follow.
        subject: q.subject ?? null,
        offeredTestTypes: testTypesForLevel(level),
        availableTestTypes,
        scoreRange: scoreRange(family, scoreType),
        nationalReference: nationalReference(scoreType),
        peerCount: peer.schools,
        weighting: peer.weighting,
      },
      kpis: {
        average: { ...overall, label: 'Average score' },
        benchmark: this.benchmarkKpi(own, thisYear, schoolId),
        participation,
        yoy: yoyChange(trend),
        rank,
      },
      schools: rankSchools(thisYear).map((r) => ({
        ...r,
        forthcoming: r.value === null && isForthcoming(inScope, r.schoolId, year, grade),
      })),
      peersAnonymous: anonymizePeers(thisYear, schoolId),
      subjects: subjectComparisons(own, thisYear, subjects, { excludeSchoolId: schoolId }),
      heatmap: gradeHeatmap(
        inScope.filter((a) => a.schoolId === schoolId && a.schoolYear === year),
        inScope.filter((a) => a.schoolYear === year),
        subjects,
        { excludeSchoolId: schoolId },
      ),
      distribution: this.safeDistribution(own),
      trend,
      trendDirection: trendDirection(trend, family, scoreType),
      movements: movements(inScope.filter((a) => a.gradeLevel === grade), {
        currentYear: year,
        subject: q.subject,
        family,
        scoreType,
      }),
      // The board-ready table: one row per school with both years, the change,
      // and the gap to each reference line — computed here so the table, the
      // charts and a printed packet can never disagree.
      table: this.comparisonTable(inScope, {
        year,
        grade,
        peerValue: peer.value,
        national: nationalReference(scoreType),
        family,
        scoreType,
      }),
      cohort,
      availableCohorts: availableCohorts(inScope),
      objectives: strengthsAndOpportunities(standings),
      // Support-flag breakdown, from the roster this school already maintains.
      // Aggregate + suppressed; a thin group never leaves the server.
      subgroups: await this.subgroupBreakdown(schoolId, year, testType),
      // The cross-domain read KYRO can do and a standalone score dashboard
      // cannot: outcomes beside the class size and the money that produced them.
      crossDomain: await this.crossDomain(peerIds, year, testType, grade, all, schoolId),
      insights: systemInsights(thisYear),
      keyInsight: buildAssessmentInsight({
        schoolName: school.name,
        family,
        scoreType,
        rank,
        overall,
        subjects: subjectComparisons(own, thisYear, subjects, { excludeSchoolId: schoolId }),
        trend: trendDirection(trend, family, scoreType),
        participation,
      }),
    }

    // "Hide peer names" is a SERVER decision or it is not a decision at all.
    // The checkbox existed only in the browser, so the payload always carried
    // every sibling school's name and the toggle merely declined to paint it —
    // one devtools tab away from the thing the control promises. Anonymising
    // here means the names genuinely never leave the server.
    // Echo the decision back so the control reflects what the SERVER did rather
    // than what the browser last remembered.
    return q.hidePeerNames
      ? { ...this.anonymizePayload(payload, schoolId), hidePeerNames: true }
      : { ...payload, hidePeerNames: false }
  }

  /**
   * Replace every peer school's name with a stable "School N" label, keeping the
   * focus school's own name. Ranked by score so the same peer carries the same
   * label across every section of one payload — otherwise School 2 in the table
   * and School 2 in the chart would be different schools.
   */
  private anonymizePayload<T>(payload: T, focusSchoolId: string): T {
    const labels = new Map<string, string>()
    let n = 0
    const labelFor = (id: string): string => {
      const existing = labels.get(id)
      if (existing) return existing
      n += 1
      const label = `School ${n}`
      labels.set(id, label)
      return label
    }
    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(walk)
      if (node === null || typeof node !== 'object') return node
      const obj = node as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) out[k] = walk(v)
      const id = typeof obj.schoolId === 'string' ? obj.schoolId : null
      if (id && id !== focusSchoolId && 'schoolName' in obj) {
        out.schoolName = labelFor(id)
        out.schoolId = null
      }
      if (id && id !== focusSchoolId && 'label' in obj && typeof obj.label === 'string') {
        out.label = labelFor(id)
        out.schoolId = null
      }
      return out
    }
    return walk(payload) as T
  }

  /** The diocesan view: every school at once, nobody anonymised (this is the
   *  superintendent's own console), plus the same helpers. */
  async orgDashboard(
    organizationId: string,
    q: { schoolYear?: number; testType?: string; gradeLevel?: string; subject?: string; cohortGrade?: string } = {},
  ) {
    const schoolIds = await this.orgSchoolIds(organizationId)
    const all = await this.aggregates(schoolIds, { testType: q.testType })
    const availableTestTypes = await this.testTypesFor(schoolIds)
    if (all.length === 0) return { schools: [], context: null, empty: true }

    const years = [...new Set(all.map((a) => a.schoolYear))].sort((a, b) => b - a)
    const year = q.schoolYear ?? years[0]
    const testType = (q.testType ?? this.defaultTestType(all)) as TestTypeKey
    const family = TEST_FAMILY[testType] ?? 'nrt'
    const scoreType = SCORE_TYPE_FOR_FAMILY[family]
    const grade = q.gradeLevel ?? 'all'
    const inScope = all.filter((a) => a.testType === testType)
    const thisYear = inScope.filter((a) => a.schoolYear === year && a.gradeLevel === grade)

    const cohortGrade = q.cohortGrade ?? null
    const moves = cohortGrade
      ? cohortMovements(inScope, { currentYear: year, currentGrade: cohortGrade, subject: q.subject, family, scoreType })
      : []

    return {
      empty: false,
      context: {
        year,
        years,
        testType,
        family,
        scoreType,
        grade,
        grades: [...new Set(inScope.map((a) => a.gradeLevel))].filter((g) => g !== 'all').sort(),
        subjects: [...SUBJECTS_FOR_FAMILY[family]],
        availableTestTypes,
        scoreRange: scoreRange(family, scoreType),
        nationalReference: nationalReference(scoreType),
      },
      average: averageOf(thisYear),
      schools: rankSchools(thisYear).map((r) => ({
        ...r,
        forthcoming: r.value === null && isForthcoming(inScope, r.schoolId, year, grade),
      })),
      byGrade: [...new Set(inScope.filter((a) => a.schoolYear === year).map((a) => a.gradeLevel))]
        .filter((g) => g !== 'all')
        .sort()
        .map((g) => ({
          grade: g,
          average: averageOf(inScope.filter((a) => a.schoolYear === year && a.gradeLevel === g)),
        })),
      movements: movements(inScope.filter((a) => a.gradeLevel === grade), {
        currentYear: year,
        subject: q.subject,
        family,
        scoreType,
      }),
      cohort: cohortGrade ? { grade: cohortGrade, movements: moves, summary: cohortSummary(moves) } : null,
      availableCohorts: availableCohorts(inScope),
      insights: systemInsights(thisYear),
    }
  }

  // ── Objective summaries (the instructional grain) ──────────────────────────

  private isObjectiveFile(file: { buffer: Buffer }): boolean {
    try {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(file.buffer)).slice(0, 20000)
      const grid = text.split('\n').map((line) => line.split(','))
      return looksLikeObjectiveFile(grid)
    } catch {
      return false
    }
  }

  private previewObjectives(
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; gradeLevel?: string },
  ): UploadPreview {
    const parsed = this.parseObjectives(file, opts)
    return {
      scope: 'school_aggregate',
      testType: parsed.testType,
      family: TEST_FAMILY[parsed.testType] ?? 'nrt',
      scoreType: 'percentile',
      years: parsed.years,
      subjects: parsed.subjects,
      rows: parsed.rows.length,
      warnings: [...parsed.warnings, 'This is an OBJECTIVE summary — it fills Strengths & Opportunities, not the score charts.'],
      sample: parsed.rows.slice(0, 5).map((r) => ({
        subject: r.subject,
        grade: r.gradeLevel,
        objective: r.objectiveLabel,
        opi: r.opi === null ? null : Math.round(r.opi),
      })),
      token: 'objective',
    }
  }

  private async commitObjectives(
    schoolId: string,
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; gradeLevel?: string; userId?: string },
  ) {
    const parsed = this.parseObjectives(file, opts)
    const year = opts.schoolYear ?? parsed.years[0] ?? null
    if (year === null) throw new BadRequestException('No school year in the file — choose one before committing.')

    const imp = await this.prisma.assessmentImport.create({
      data: {
        schoolId,
        // 'objectives', not 'upload' — revert branches on this, and an
        // objective import's rows live in a different table entirely.
        kind: 'objectives',
        scope: 'school_aggregate',
        fileName: file.originalname ?? null,
        testTypeHint: parsed.testType,
        yearHint: year,
        rowsParsed: parsed.rows.length,
        warnings: parsed.warnings,
        uploadedByUserId: opts.userId ?? null,
      },
      select: { id: true },
    })

    // THE SAME SCHOOL FILTER THE SCORE PATH APPLIES. An objective summary is
    // just as likely to arrive covering twelve schools, and the unique key has
    // no school-name component — so every school's row for one objective landed
    // on the SAME key under the uploading school, each overwriting the last, and
    // the twelfth school's mastery was published as this school's greatest
    // strength. The import happily reported "12 rows upserted" over one row.
    const namedRows = parsed.rows.filter((r) => (r as { schoolName?: string | null }).schoolName)
    let objectiveRows = parsed.rows
    if (namedRows.length > 0) {
      const own = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } })
      const target = (own?.name ?? '').trim().toLowerCase()
      const mine = namedRows.filter(
        (r) => ((r as { schoolName?: string | null }).schoolName ?? '').trim().toLowerCase() === target,
      )
      const others = namedRows.length - mine.length
      if (others > 0) {
        parsed.warnings.push(
          `${others} objective row${others === 1 ? '' : 's'} named a different school and were skipped — upload a multi-school file from the organization page.`,
        )
      }
      objectiveRows = mine
    }

    let upserted = 0
    for (const r of objectiveRows) {
      await this.prisma.assessmentObjectiveAggregate.upsert({
        where: {
          schoolId_schoolYear_testType_gradeLevel_subject_objectiveLabel: {
            schoolId,
            schoolYear: r.schoolYear ?? year,
            testType: parsed.testType,
            gradeLevel: r.gradeLevel,
            subject: r.subject,
            objectiveLabel: r.objectiveLabel,
          },
        },
        create: {
          schoolId,
          importId: imp.id,
          schoolYear: r.schoolYear ?? year,
          testType: parsed.testType,
          gradeLevel: r.gradeLevel,
          subject: r.subject,
          objectiveCode: r.objectiveCode,
          objectiveLabel: r.objectiveLabel,
          opi: r.opi,
          masteryCounts: r.masteryCounts ?? undefined,
          testedCount: r.testedCount,
        },
        update: {
          // NOT importId — an update does not transfer ownership. The row keeps
          // the import that created it, so undoing a correction cannot delete
          // rows the original import wrote. Same rule as upsertAggregate.
          objectiveCode: r.objectiveCode,
          opi: r.opi,
          masteryCounts: r.masteryCounts ?? undefined,
          testedCount: r.testedCount,
        },
      })
      upserted += 1
    }

    await this.prisma.assessmentImport.update({
      where: { id: imp.id },
      data: { aggregatesUpserted: upserted },
    })
    return {
      importId: imp.id,
      resultsCreated: 0,
      aggregatesUpserted: upserted,
      matched: 0,
      unmatched: 0,
      warnings: parsed.warnings,
    }
  }

  private parseObjectives(
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; gradeLevel?: string },
  ) {
    try {
      return parseObjectiveCsv(file.buffer, {
        testType: opts.testType,
        defaultYear: opts.schoolYear,
        defaultGrade: opts.gradeLevel,
        label: file.originalname,
      })
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
  }

  // ── Diocesan ingest (one file, every school) ───────────────────────────────

  /**
   * Preview a diocesan file: parse once, resolve each school NAME against the
   * org's schools (reusing the enrollment matcher, aliases and all), and report
   * what would land where. Nothing is written.
   */
  async orgPreview(
    organizationId: string,
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number } = {},
    resolve?: (name: string) => { schoolId: string | null; matchedName: string | null; decision: string },
  ) {
    const parsed = this.parse(file, opts)
    if (parsed.scope !== 'school_aggregate') {
      throw new BadRequestException(
        'This looks like a student-level file. Upload it from the school it belongs to, not the organization page.',
      )
    }
    const names = [...new Set(parsed.aggregates.map((a) => a.schoolName).filter((n): n is string => !!n))]
    const matches = names.map((name) => {
      const r = resolve?.(name) ?? { schoolId: null, matchedName: null, decision: 'unmatched' }
      return { sourceName: name, ...r, rows: parsed.aggregates.filter((a) => a.schoolName === name).length }
    })
    return {
      scope: parsed.scope,
      testType: parsed.testType,
      family: parsed.family,
      scoreType: parsed.scoreType,
      years: parsed.years,
      subjects: subjectsSeen(parsed),
      rows: parsed.aggregates.length,
      warnings: parsed.warnings,
      schools: matches,
      matched: matches.filter((m) => m.schoolId).length,
      unmatched: matches.filter((m) => !m.schoolId).length,
    }
  }

  /**
   * Commit a diocesan file. Rows whose school could not be resolved are counted
   * and reported rather than dropped silently — an unmatched school is a name to
   * fix, not a row to forget.
   */
  async orgCommit(
    organizationId: string,
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; userId?: string } = {},
    resolve?: (name: string) => { schoolId: string | null },
    overrides: Record<string, string> = {},
  ) {
    const parsed = this.parse(file, opts)
    if (parsed.scope !== 'school_aggregate') {
      throw new BadRequestException('Student-level files belong to a single school — upload from that school.')
    }
    const year = opts.schoolYear ?? parsed.years[0] ?? null
    if (year === null) throw new BadRequestException('No school year in the file — choose one before committing.')

    const imp = await this.prisma.assessmentImport.create({
      data: {
        organizationId,
        kind: 'upload',
        scope: 'school_aggregate',
        fileName: file.originalname ?? null,
        testTypeHint: parsed.testType,
        yearHint: year,
        rowsParsed: parsed.aggregates.length,
        warnings: parsed.warnings,
        uploadedByUserId: opts.userId ?? null,
      },
      select: { id: true },
    })

    const cache = new Map<string, string | null>()
    let upserted = 0
    let skipped = 0
    const unresolved = new Set<string>()
    const touched = new Set<string>()

    for (const a of parsed.aggregates) {
      const name = a.schoolName ?? ''
      if (!cache.has(name)) {
        const override = overrides[name] ?? null
        cache.set(name, override ?? resolve?.(name)?.schoolId ?? null)
      }
      const schoolId = cache.get(name) ?? null
      if (!schoolId) {
        skipped += 1
        if (name) unresolved.add(name)
        continue
      }
      await this.upsertAggregate({
        schoolId,
        importId: imp.id,
        schoolYear: a.schoolYear ?? year,
        testType: parsed.testType,
        gradeLevel: a.gradeLevel,
        derivation: 'ingested',
        scoreType: parsed.scoreType,
        avgComposite: a.scores[TOTAL_KEY] ?? null,
        sectionAverages: Object.fromEntries(Object.entries(a.scores).filter(([k]) => k !== TOTAL_KEY)),
        testedCount: a.testedCount,
        eligibleCount: a.eligibleCount,
      })
      upserted += 1
      touched.add(schoolId)
    }

    // Roll the whole-school row up from the per-grade rows this file carried, so
    // the dashboards have a school-level number even when the file is by grade.
    // EVERY year the file touched, not just its headline one. A diocesan export
    // carrying two years rolled up and promoted only the newest, so the prior
    // year kept whatever whole-school row it had before — the trend chart then
    // compared a fresh number with a stale one and reported a move that was an
    // artefact of the import.
    // A CORRECTED DIOCESAN FILE REPLACES ITS SLICE TOO. The school-scope path
    // clears the grades a correction dropped; the org console — the door the
    // product actually tells a diocese to use — did not, so a deleted mis-keyed
    // grade survived the re-upload and rollUpAllGrades folded it back into that
    // school's published whole-school average.
    for (const schoolId of touched) {
      // `cache` already holds every name→school decision this commit made, so
      // reuse it rather than re-resolving (which would also re-run the matcher).
      const forSchool = parsed.aggregates.filter((a) => cache.get(a.schoolName ?? '') === schoolId)
      const years = [...new Set(forSchool.map((a) => a.schoolYear ?? year))]
      for (const y of years) {
        const keep = forSchool.filter((a) => (a.schoolYear ?? year) === y).map((a) => a.gradeLevel)
        await this.prisma.assessmentSchoolAggregate.deleteMany({
          where: {
            schoolId,
            schoolYear: y,
            testType: parsed.testType,
            derivation: 'ingested',
            gradeLevel: { notIn: [...keep, 'all'] },
          },
        })
      }
    }
    const touchedYears = [...new Set(parsed.aggregates.map((a) => a.schoolYear ?? year))]
    for (const schoolId of touched) {
      for (const y of touchedYears) {
        await this.rollUpAllGrades(schoolId, y, parsed.testType)
        await this.promoteOperational(schoolId, y)
      }
    }

    await this.prisma.assessmentImport.update({
      where: { id: imp.id },
      data: { aggregatesUpserted: upserted, studentsUnmatched: skipped },
    })

    return {
      importId: imp.id,
      aggregatesUpserted: upserted,
      skipped,
      schoolsTouched: touched.size,
      unresolvedSchools: [...unresolved],
      warnings: parsed.warnings,
    }
  }

  /**
   * Synthesize the gradeLevel:'all' row from the per-grade rows — tester-weighted,
   * so the school number matches how the diocesan average is built.
   */
  private async rollUpAllGrades(schoolId: string, schoolYear: number, testType: string) {
    const rows = await this.prisma.assessmentSchoolAggregate.findMany({
      where: { schoolId, schoolYear, testType, derivation: 'ingested', gradeLevel: { not: 'all' } },
      select: { avgComposite: true, sectionAverages: true, testedCount: true, eligibleCount: true, scoreType: true },
    })
    if (rows.length === 0) {
      // NOTHING TO ROLL UP — but that is NOT the same as nothing to keep.
      //
      // A summary file with no grade column parses entirely to gradeLevel:'all',
      // so this branch is the NORMAL case for it, not an empty one. Deleting the
      // 'all' row here erased every row such a file had just written. Only a row
      // this function SYNTHESIZED may be removed, and only when its inputs are
      // gone: a synthesized row is the one with no importId, because
      // upsertAggregate stamps ingested rows with the import that produced them.
      await this.prisma.assessmentSchoolAggregate.deleteMany({
        where: { schoolId, schoolYear, testType, derivation: 'ingested', gradeLevel: 'all', importId: null },
      })
      return
    }
    let num = 0
    let den = 0
    let eligible = 0
    // A row with no tested count still deserves a vote in the average, but its
    // weight is a FALLBACK, not a headcount. Adding those 1s into `den` and then
    // publishing den as testedCount reported "3 students tested" for a school
    // that reported three GRADES and no counts at all — a fabricated number that
    // also walks straight past the small-cell floor once six grades are present.
    let counted = true
    const sections = new Map<string, { sum: number; w: number }>()
    for (const r of rows) {
      if (r.testedCount === null || r.testedCount === undefined) counted = false
      const w = r.testedCount ?? 1
      const v = r.avgComposite === null ? null : Number(r.avgComposite)
      if (v !== null) {
        num += v * w
        den += w
      }
      // Only from the grades that CONTRIBUTED to the average. Summing eligible
      // over every grade while `den` accumulates only where a composite exists
      // paired a partial numerator with a whole-school denominator, and the
      // synthesized participation rate came out understated.
      if (v !== null) eligible += r.eligibleCount ?? 0
      for (const [k, raw] of Object.entries((r.sectionAverages ?? {}) as Record<string, number>)) {
        if (typeof raw !== 'number') continue
        const cur = sections.get(k) ?? { sum: 0, w: 0 }
        cur.sum += raw * w
        cur.w += w
        sections.set(k, cur)
      }
    }
    await this.upsertAggregate({
      schoolId,
      importId: null,
      schoolYear,
      testType,
      gradeLevel: 'all',
      derivation: 'ingested',
      scoreType: rows[0].scoreType ?? 'percentile',
      avgComposite: den > 0 ? num / den : null,
      sectionAverages: Object.fromEntries([...sections].map(([k, v]) => [k, v.sum / v.w])),
      testedCount: counted && den > 0 ? den : null,
      eligibleCount: eligible > 0 ? eligible : null,
    })
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private parse(
    file: { buffer: Buffer; originalname?: string },
    opts: { testType?: string; schoolYear?: number; gradeLevel?: string },
  ): AssessmentParseResult {
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('Empty file.')
    try {
      return parseAssessmentCsv(file.buffer, {
        testType: opts.testType,
        defaultYear: opts.schoolYear,
        defaultGrade: opts.gradeLevel,
        label: file.originalname,
      })
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
  }

  private candidates(parsed: AssessmentParseResult): MatchCandidate[] {
    return parsed.students.map((s) => ({
      externalId: s.externalId,
      firstName: s.firstName,
      lastName: s.lastName,
      gradeLevel: s.gradeLevel,
    }))
  }

  private async roster(schoolId: string): Promise<RosterStudent[]> {
    return this.prisma.student.findMany({
      where: { schoolId },
      select: { id: true, firstName: true, lastName: true, grade: true, externalId: true },
    })
  }

  /**
   * Per-section benchmark determination, computed here rather than trusted.
   *
   * REQUIRES FULL COVERAGE. "Met every college-readiness benchmark" is only a
   * true statement if every section was actually scored — deciding it over the
   * two sections a file happened to include would let a student who cleared
   * English and Math count as college-ready without a Reading or Science score,
   * inflating the published attainment rate. A student without full coverage
   * falls out of BOTH the numerator and the denominator, which is what the
   * metric's contract says.
   *
   * The cut scores come from the pure layer, not a second hard-coded copy here.
   */
  private benchmarksMet(
    parsed: AssessmentParseResult,
    sections: Record<string, number>,
  ): Record<string, boolean> | undefined {
    const table = benchmarksFor(parsed.family)
    if (!table) return undefined
    const out: Record<string, boolean> = {}
    for (const [k, cut] of Object.entries(table)) {
      const v = sections[k]
      if (typeof v !== 'number') return undefined // incomplete → no determination
      out[k] = v >= cut
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  /** Recompute the school aggregate from the student rows we hold. */
  private async deriveAggregates(schoolId: string, schoolYear: number, testType: TestTypeKey, importId: string | null) {
    const rows = await this.prisma.assessmentResult.findMany({
      where: { schoolId, schoolYear, testType },
      // id / studentId / matchExternalId identify a ROW's student for the distinct
      // count below. matchName is deliberately NOT selected: a name never has to
      // enter this method, and the two columns that hold identity stay behind the
      // register routes where the rest of the module keeps them.
      select: {
        id: true,
        studentId: true,
        matchExternalId: true,
        gradeLevel: true,
        composite: true,
        sectionScores: true,
        benchmarksMet: true,
        scoreType: true,
      },
    })
    await this.prisma.assessmentSchoolAggregate.deleteMany({
      where: { schoolId, schoolYear, testType, derivation: 'derived' },
    })
    if (rows.length === 0) return

    const family = TEST_FAMILY[testType] ?? 'nrt'
    const scoreType = SCORE_TYPE_FOR_FAMILY[family]
    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      for (const key of ['all', r.gradeLevel ?? 'all']) {
        if (key === 'all' && r.gradeLevel === null) continue
        const list = groups.get(key) ?? []
        list.push(r)
        groups.set(key, list)
      }
    }
    groups.set('all', rows)

    for (const [gradeLevel, group] of groups) {
      // ONE STUDENT, ONE VOTE. The average used to be a mean over ROWS while its
      // published denominator counted distinct students, so a child listed twice
      // weighted the average twice and the two numbers described different
      // populations. Collapse to one row per student first — the newest wins,
      // which is what a corrected re-listing means.
      const byStudent = new Map<string, (typeof group)[number]>()
      for (const r of group) {
        byStudent.set(r.studentId ?? r.matchExternalId ?? `row:${r.id}`, r)
      }
      const unique = [...byStudent.values()]
      const composites = unique.map((r) => r.composite).filter((v): v is number => v !== null)
      // THE DENOMINATOR MUST DESCRIBE THE STATISTIC IT GATES.
      //
      // The average is a mean over students who actually HAVE a score; the
      // published testedCount used to be `group.length`, every row in the file.
      // The parser deliberately keeps a roster row with no score (it records an
      // issue rather than dropping the child), so uploading a 40-student grade
      // where one senior has sat the ACT produced avgComposite = that one
      // student's exact composite alongside testedCount = 40. gateAggregates
      // reads only the count, saw 40 >= MIN_CELL, suppressed nothing, and served
      // one child's score as the grade average to every viewer — then
      // promoteOperational reconstructed a score sum of avg x 40, inventing
      // scores for 39 students who never sat the exam.
      //
      // Counting DISTINCT scored students also closes the duplicate-row inflation
      // path: the same child listed twice cannot lift a cohort over the floor.
      const scoredCount = composites.length
      const sectionSums = new Map<string, { sum: number; n: number }>()
      let benchMet = 0
      let benchTested = 0
      const bands: Record<string, number> = { q1: 0, q2: 0, q3: 0, q4: 0 }
      for (const r of unique) {
        const sections = (r.sectionScores ?? {}) as Record<string, number>
        for (const [k, v] of Object.entries(sections)) {
          if (typeof v !== 'number') continue
          const cur = sectionSums.get(k) ?? { sum: 0, n: 0 }
          cur.sum += v
          cur.n += 1
          sectionSums.set(k, cur)
        }
        const bm = (r.benchmarksMet ?? null) as Record<string, boolean> | null
        if (bm && Object.keys(bm).length > 0) {
          benchTested += 1
          if (Object.values(bm).every(Boolean)) benchMet += 1
        }
        // Percentile scores band into quartiles; scale scores do not.
        if (scoreType === 'percentile' && r.composite !== null) {
          const q = r.composite <= 25 ? 'q1' : r.composite <= 50 ? 'q2' : r.composite <= 75 ? 'q3' : 'q4'
          bands[q] += 1
        }
      }
      await this.upsertAggregate({
        schoolId,
        importId,
        schoolYear,
        testType,
        gradeLevel,
        derivation: 'derived',
        scoreType,
        avgComposite: composites.length > 0 ? composites.reduce((a, b) => a + b, 0) / composites.length : null,
        // PER SUBJECT, PER DENOMINATOR. sectionAverages was written as sum/n over
        // whichever students happened to carry that column, with the count
        // discarded — so a grade of twenty-five where two students sat the
        // science section published a science average built from those two, and
        // the gate could not tell (it floors sections on the COMPOSITE count).
        // A subject below the floor is dropped here, at the only point that
        // still knows its n.
        sectionAverages: Object.fromEntries(
          [...sectionSums].filter(([, v]) => v.n >= MIN_CELL).map(([k, v]) => [k, v.sum / v.n]),
        ),
        testedCount: scoredCount > 0 ? scoredCount : null,
        // Only an ingested SUMMARY file knows how many students were eligible;
        // student rows cannot tell us who did not sit the exam.
        eligibleCount: null,
        benchmarkMetCount: benchTested > 0 ? benchMet : null,
        benchmarkTested: benchTested > 0 ? benchTested : null,
        distribution: scoreType === 'percentile' ? bands : null,
      })
    }
  }

  private async upsertAggregate(input: {
    schoolId: string
    importId: string | null
    schoolYear: number
    testType: string
    gradeLevel: string
    derivation: string
    scoreType: string
    avgComposite: number | null
    sectionAverages: Record<string, number>
    testedCount: number | null
    eligibleCount: number | null
    benchmarkMetCount?: number | null
    benchmarkTested?: number | null
    distribution?: Record<string, number> | null
  }) {
    const where = {
      schoolId_schoolYear_testType_gradeLevel_derivation: {
        schoolId: input.schoolId,
        schoolYear: input.schoolYear,
        testType: input.testType,
        gradeLevel: input.gradeLevel,
        derivation: input.derivation,
      },
    }
    // AN UPDATE DOES NOT TRANSFER OWNERSHIP. importId used to be part of the
    // update payload, so re-importing a year re-stamped rows the FIRST import
    // created — and reverting the second then deleted them outright instead of
    // leaving the first import's data standing. I watched it happen: undoing a
    // three-school diocesan upload took two schools' original grade-3 rows with
    // it. The row keeps the import that created it; only `create` sets it.
    const data = {
      scoreType: input.scoreType,
      avgComposite: input.avgComposite,
      sectionAverages: Object.keys(input.sectionAverages).length > 0 ? input.sectionAverages : undefined,
      testedCount: input.testedCount,
      eligibleCount: input.eligibleCount,
      benchmarkMetCount: input.benchmarkMetCount ?? null,
      benchmarkTestedCount: input.benchmarkTested ?? null,
      distribution: input.distribution ?? undefined,
    }
    await this.prisma.assessmentSchoolAggregate.upsert({
      where,
      create: {
        importId: input.importId,
        schoolId: input.schoolId,
        schoolYear: input.schoolYear,
        testType: input.testType,
        gradeLevel: input.gradeLevel,
        derivation: input.derivation,
        ...data,
      },
      update: data,
    })
  }

  /**
   * Thread the extensive components onto the period's operational row so the
   * four registry metrics (and therefore the scorecard, the briefing and the
   * org roll-up) light up without a second ingest path.
   */
  private async promoteOperational(schoolId: string, schoolYear: number) {
    // THROUGH THE GATE, like every other reader of this table.
    //
    // This method used to query the aggregates itself and re-implement the
    // derived-over-ingested collapse with a local pick(). That copy did not
    // carry the eligibleCount forward from the ingested row (only a summary file
    // reports who did NOT sit the exam), so the moment a school uploaded
    // student-level results the participation metric went unavailable — for
    // exactly the schools that had given us the most data. gateAggregates has
    // owned that rule since round 3; this was the last caller reimplementing it.
    //
    // NO EARLY RETURN when the aggregates are gone. Reverting an import deletes
    // the rows, and returning here would leave the promoted ACT/SAT figures on
    // the operational record forever — the scorecard would keep showing a score
    // for a school whose results were withdrawn. An empty set writes explicit
    // nulls instead, which is what "we no longer have this" looks like.
    const gated = (await this.aggregates([schoolId], { schoolYear })).filter((r) => r.gradeLevel === 'all')
    const pick = (test: string) => gated.find((r) => r.testType === test) ?? null
    const act = pick('act')
    const sat = pick('sat')
    // The FY that OWNS a spring administration ends that June 30 (the house FY is
    // Jul–Jun). Matching any period ending in the calendar year and taking the
    // latest would attach spring 2026 results to a December-2026 stub period, and
    // an interim period would silently outrank the annual one.
    const fyEnd = new Date(Date.UTC(schoolYear, 5, 30))
    const period =
      (await this.prisma.fiscalPeriod.findFirst({
        where: { schoolId, periodEndDate: fyEnd },
        orderBy: { periodType: 'asc' },
        select: { id: true },
      })) ??
      (await this.prisma.fiscalPeriod.findFirst({
        where: {
          schoolId,
          periodType: 'fy',
          periodEndDate: { gte: new Date(Date.UTC(schoolYear, 0, 1)), lte: new Date(Date.UTC(schoolYear, 11, 31)) },
        },
        orderBy: { periodEndDate: 'desc' },
        select: { id: true },
      }))
    if (!period) return

    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
    // THE FLOOR TRAVELS WITH THE PROMOTED FIGURES. A one-senior school promoted
    // actScoreSum:33 / actTestedCount:1, from which that student's exact score is
    // simply 33 ÷ 1 — served by the operational endpoint and the scorecard to
    // every role. Suppressing on the dashboard while promoting the components is
    // no suppression at all.
    const publishableAct = cohortPublishable(act?.testedCount ?? null) ? act : null
    const publishableSat = cohortPublishable(sat?.testedCount ?? null) ? sat : null
    const actAvg = num(publishableAct?.avgComposite)
    const satAvg = num(publishableSat?.avgComposite)
    // The benchmark DENOMINATOR is students with a determination, not everyone
    // tested: a student with an incomplete section set cannot be counted as
    // meeting or missing the benchmark, and folding them into the denominator
    // silently deflates the rate. `|| null` is deliberately NOT used on these —
    // a genuine 0 met (nobody cleared the bar) is a real, publishable finding
    // and must not read as "no data".
    const determinedRaw =
      (publishableAct?.benchmarkTestedCount ?? 0) + (publishableSat?.benchmarkTestedCount ?? 0)
    const determinedSum = cohortPublishable(determinedRaw) ? determinedRaw : null
    const metSum =
      determinedSum === null
        ? null
        : (publishableAct?.benchmarkMetCount ?? 0) + (publishableSat?.benchmarkMetCount ?? 0)
    const data = {
      actScoreSum:
        actAvg !== null && publishableAct?.testedCount ? Math.round(actAvg * publishableAct.testedCount) : null,
      actTestedCount: publishableAct?.testedCount ?? null,
      satScoreSum:
        satAvg !== null && publishableSat?.testedCount ? Math.round(satAvg * publishableSat.testedCount) : null,
      satTestedCount: publishableSat?.testedCount ?? null,
      benchmarkMetCount: metSum,
      benchmarkTestedCount: determinedSum,
      assessmentEligibleCount: publishableAct?.eligibleCount ?? publishableSat?.eligibleCount ?? null,
      // THE ONE FIGURE THAT SURVIVES SUMMATION. Participation's numerator has to
      // be distinct students, and max(act, sat) is only that answer WITHIN one
      // school. Roll two schools up and the org sums each column first, so an
      // all-ACT school of 200 beside an all-SAT school of 200 became max(200,
      // 200) = 200 against 400 eligible — half the real rate. Resolving the max
      // per school and summing THAT is additive and correct at every scope.
      assessmentTestedCount:
        publishableAct?.testedCount || publishableSat?.testedCount
          ? Math.max(publishableAct?.testedCount ?? 0, publishableSat?.testedCount ?? 0)
          : null,
    }
    await this.prisma.periodOperationalData.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })
  }

  /**
   * Aggregate rows as the pure layer wants them.
   *
   * The collapse and the suppression both live in `gateAggregates` — one
   * function, in the pure package, that EVERY reader of this table goes through
   * (this service, the operational promote, the briefing, the assistant). Round
   * 2 of review found five readers bypassing a service-local gate, which is what
   * a rule enforced by convention always eventually gets.
   */
  /**
   * Every test type these schools have ANY results for.
   *
   * Deliberately its own query rather than a projection of the dashboard's
   * rows: those rows are already filtered to the selected test type, so
   * deriving the picker's options from them collapsed the list to whatever was
   * currently selected. Choosing ACT rewrote the menu to ['act'] and there was
   * no longer a control anywhere on the page that could get back to TerraNova.
   *
   * A picker's options must never be a function of the picker's own value.
   */
  private async testTypesFor(schoolIds: string[]): Promise<string[]> {
    if (schoolIds.length === 0) return []
    const rows = await this.prisma.assessmentSchoolAggregate.findMany({
      where: { schoolId: { in: schoolIds } },
      select: { testType: true },
      distinct: ['testType'],
    })
    return rows.map((r) => r.testType).sort()
  }

  private async aggregates(schoolIds: string[], q: { schoolYear?: number; testType?: string } = {}): Promise<AssessmentRow[]> {
    if (schoolIds.length === 0) return []
    const rows = await this.prisma.assessmentSchoolAggregate.findMany({
      where: {
        schoolId: { in: schoolIds },
        ...(q.schoolYear ? { schoolYear: q.schoolYear } : {}),
        ...(q.testType ? { testType: q.testType } : {}),
      },
      select: {
        schoolId: true,
        schoolYear: true,
        testType: true,
        gradeLevel: true,
        derivation: true,
        scoreType: true,
        avgComposite: true,
        sectionAverages: true,
        testedCount: true,
        eligibleCount: true,
        benchmarkMetCount: true,
        benchmarkTestedCount: true,
        benchmarkRates: true,
        distribution: true,
        school: { select: { name: true } },
      },
    })
    return gateAggregates(
      rows.map((r) => ({
        schoolId: r.schoolId,
        schoolName: r.school?.name,
        schoolYear: r.schoolYear,
        testType: r.testType,
        gradeLevel: r.gradeLevel,
        derivation: r.derivation,
        scoreType: r.scoreType,
        avgComposite: r.avgComposite === null ? null : Number(r.avgComposite),
        sectionAverages: (r.sectionAverages ?? null) as Record<string, number> | null,
        testedCount: r.testedCount,
        eligibleCount: r.eligibleCount,
        benchmarkMetCount: r.benchmarkMetCount,
        benchmarkTestedCount: r.benchmarkTestedCount,
        benchmarkRates: (r.benchmarkRates ?? null) as Record<string, number> | null,
        distribution: (r.distribution ?? null) as Record<string, number> | null,
      })),
      (t) => TEST_FAMILY[t as TestTypeKey] ?? 'nrt',
      (f) => SCORE_TYPE_FOR_FAMILY[f],
    )
  }

  private async objectives(
    schoolIds: string[],
    schoolYear: number,
    testType: string,
    gradeLevel?: string,
  ): Promise<ObjectiveRow[]> {
    if (schoolIds.length === 0) return []
    const rows = await this.prisma.assessmentObjectiveAggregate.findMany({
      where: {
        schoolId: { in: schoolIds },
        schoolYear,
        testType,
        ...(gradeLevel && gradeLevel !== 'all' ? { gradeLevel } : {}),
      },
      select: {
        schoolId: true,
        schoolYear: true,
        gradeLevel: true,
        subject: true,
        objectiveLabel: true,
        objectiveCode: true,
        opi: true,
        testedCount: true,
        masteryCounts: true,
      },
      // Deterministic slice: without an orderBy, Postgres is free to return an
      // arbitrary 2000 of a large network's rows, and the focus school's own
      // objectives could be missing from its own report.
      orderBy: [{ schoolYear: 'desc' }, { subject: 'asc' }, { objectiveCode: 'asc' }, { schoolId: 'asc' }],
      take: 2000,
    })
    // THE SAME FLOOR, ON THE SAME TABLE'S SIBLING.
    //
    // A mastery profile is a FULLER disclosure than the composite the gate
    // suppresses, not a lesser one: fifteen per-objective percentages for a
    // grade of three children, and at a cohort of one every OPI is that child's
    // own mastery. gateAggregates covers assessment_school_aggregates; this
    // table needed the identical rule, failing closed on an unknown count.
    return rows
      .filter((r) => cohortPublishable(r.testedCount))
      .map((r) => ({
        ...r,
        opi: r.opi === null ? null : Number(r.opi),
        masteryCounts: (r.masteryCounts ?? null) as Record<string, number> | null,
      }))
  }

  private async orgSchoolIds(organizationId: string): Promise<string[]> {
    const schools = await this.prisma.school.findMany({ where: { organizationId }, select: { id: true } })
    return schools.map((s) => s.id)
  }

  /**
   * Scores broken down by the support flags the roster already carries (ISP,
   * 504, ELL). Student-level rows are joined to the roster, averaged, and then
   * SUPPRESSED below the five-student floor before anything is serialized — a
   * subgroup of two is a child with extra steps.
   */
  private async subgroupBreakdown(schoolId: string, schoolYear: number, testType: string) {
    const rows = await this.prisma.assessmentResult.findMany({
      where: { schoolId, schoolYear, testType, studentId: { not: null } },
      // Only the flags and the score — no name, no id beyond the join.
      select: { composite: true, student: { select: { hasIep: true, has504: true, ell: true } } },
    })
    if (rows.length === 0) return null

    const bucket = (pick: (s: { hasIep: boolean; has504: boolean; ell: boolean }) => boolean) => {
      const withFlag: number[] = []
      const without: number[] = []
      for (const r of rows) {
        if (r.composite === null || !r.student) continue
        ;(pick(r.student) ? withFlag : without).push(r.composite)
      }
      const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a2, b2) => a2 + b2, 0) / xs.length : null)

      // SUPPRESS THE PAIR, NOT EACH SIDE — and never publish the raw count.
      //
      // Suppressing only the thin side is not suppression at all. With 30 tested
      // students and 1 flagged, publishing count:1 alone discloses that exactly
      // one tested child carries that flag; publishing the complement's mean
      // then recovers that child's exact score by subtraction
      // (30·M30 − 29·M29). So when EITHER side is under the floor, both sides
      // and the count go, and the caller learns only that the split cannot be
      // shown. A subgroup breakdown of a class is worth nothing if it can be
      // inverted into one named child's result.
      const safe = withFlag.length >= MIN_CELL && without.length >= MIN_CELL
      if (!safe) {
        return {
          withFlag: { value: null, suppressed: true, count: null },
          without: { value: null, suppressed: true, count: null },
          gap: null,
        }
      }
      return {
        withFlag: { value: mean(withFlag), suppressed: false, count: withFlag.length },
        without: { value: mean(without), suppressed: false, count: without.length },
        gap: (mean(withFlag) as number) - (mean(without) as number),
      }
    }

    return {
      isp: bucket((s) => s.hasIep),
      plan504: bucket((s) => s.has504),
      ell: bucket((s) => s.ell),
      totalMatched: rows.length,
    }
  }

  /**
   * Outcome beside the two operational facts that plausibly explain it: how many
   * students each teacher carries, and what the school spends per student. This
   * is the join a standalone assessment dashboard cannot make, because it has no
   * financials — and it is deliberately presented as a RELATIONSHIP, never as a
   * cause.
   */
  private async crossDomain(
    schoolIds: string[],
    schoolYear: number,
    testType: string,
    grade: string,
    gated: AssessmentRow[],
    focusSchoolId: string,
  ) {
    if (schoolIds.length === 0) return []
    // Scores come from the ALREADY-GATED rows the dashboard built. Re-querying
    // the table here is exactly the bypass round 2 caught: it published a
    // two-tester school's mean beside its NAME, to every role, on a route the
    // dashboard believed it had suppressed.
    const scored = gated.filter(
      (r) => r.schoolYear === schoolYear && r.testType === testType && r.gradeLevel === grade && r.avgComposite !== null,
    )
    if (scored.length === 0) return []

    // ONLY THE CALLER'S OWN SCHOOL CONTRIBUTES FINANCE.
    //
    // RolesGuard proves membership at :schoolId and nothing more, so a viewer at
    // one school was receiving every sibling school's enrollment, staffing ratio
    // and cost-per-pupil — the last of those computed from that school's total
    // expenses — beside its name, from a route about test scores. Peers still
    // appear (the chart needs the cloud) but as scores under an anonymous label,
    // which is exactly how the ranked chart beside it already treats them.
    //
    // The operational read is also pinned to the SELECTED year's fiscal period
    // rather than to whichever row was written most recently; pairing a 2024
    // score with today's enrollment silently answers a different question than
    // the one the year filter asked.
    const fyEnd = new Date(Date.UTC(schoolYear, 5, 30))
    const [operational, snapshot] = await Promise.all([
      this.prisma.periodOperationalData.findFirst({
        where: {
          schoolId: focusSchoolId,
          fiscalPeriod: { periodEndDate: { lte: fyEnd } },
        },
        select: { schoolId: true, enrollment: true, teachingFte: true },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
      }),
      // BY FISCAL PERIOD, not by upload time. createdAt is when somebody pressed
      // the button — a school that re-imported last year's statements in March
      // had this year's score divided by last year's expenses, on a card headed
      // "what this score cost". The operational read beside it is already
      // period-scoped; these two must answer about the same year or neither
      // should be shown.
      this.prisma.statementSnapshot.findFirst({
        where: {
          schoolId: focusSchoolId,
          fiscalPeriod: { periodEndDate: { lte: fyEnd } },
        },
        select: { schoolId: true, payload: true },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
      }),
    ])
    const operationalRows = operational ? [operational] : []
    const snapshots = snapshot ? [snapshot] : []

    const opBySchool = new Map<string, (typeof operationalRows)[number]>()
    for (const o of operationalRows) if (!opBySchool.has(o.schoolId)) opBySchool.set(o.schoolId, o)
    const expBySchool = new Map<string, number>()
    for (const snap of snapshots) {
      const soa = (snap.payload as { soaResults?: { cy?: { totalExp?: number } } })?.soaResults?.cy
      const exp = typeof soa?.totalExp === 'number' ? soa.totalExp : null
      if (exp !== null) expBySchool.set(snap.schoolId, exp)
    }

    let peerN = 0
    return scored
      .sort((a, b) => (b.avgComposite as number) - (a.avgComposite as number))
      .map((r) => {
        const isFocus = r.schoolId === focusSchoolId
        if (!isFocus) {
          peerN += 1
          return {
            schoolId: null,
            schoolName: `School ${peerN}`,
            isFocus: false,
            score: r.avgComposite as number,
            enrollment: null,
            studentTeacherRatio: null,
            costPerPupil: null,
          }
        }
        const op = opBySchool.get(r.schoolId)
        const enrollment = op?.enrollment ?? null
        const teachingFte = op?.teachingFte === null || op?.teachingFte === undefined ? null : Number(op.teachingFte)
        const totalExp = expBySchool.get(r.schoolId) ?? null
        // THE SEMANTIC LAYER OWNS THESE TWO FORMULAS, not this file. Both already
        // exist as MetricDefs and are rendered on the scorecard, so recomputing
        // them here means two definitions of one number that agree only until
        // somebody edits one — the exact drift @finrep/analytics exists to stop.
        // Calling compute() also inherits its guards (a zero or absent
        // denominator yields null rather than Infinity).
        const cur = { totalExp: totalExp ?? 0 } as Parameters<ReturnType<typeof getMetric>['compute']>[0]
        const curOp = { enrollment, teachingFte } as Parameters<ReturnType<typeof getMetric>['compute']>[2]
        return {
          schoolId: r.schoolId,
          schoolName: r.schoolName ?? null,
          isFocus: true,
          score: r.avgComposite as number,
          enrollment,
          studentTeacherRatio:
            totalExp === null && enrollment === null
              ? null
              : (getMetric('student_teacher_ratio').compute(cur, undefined, curOp).value ?? null),
          costPerPupil: totalExp === null ? null : (getMetric('cost_per_pupil').compute(cur, undefined, curOp).value ?? null),
        }
      })
  }

  /** One row per school: this year, last year, the move, and the two gaps. */
  private comparisonTable(
    rows: AssessmentRow[],
    opts: {
      year: number
      grade: string
      peerValue: number | null
      national: number | null
      family: 'act' | 'sat' | 'nrt'
      scoreType: 'scale' | 'percentile' | 'nce'
    },
  ) {
    const inGrade = rows.filter((r) => r.gradeLevel === opts.grade)
    const ids = [...new Set(inGrade.map((r) => r.schoolId))]
    const thisYearRows = inGrade.filter((r) => r.schoolYear === opts.year)
    const ranked = rankSchools(thisYearRows)
    const peerCache = new Map<string, number | null>()
    const peerFor = (id: string): number | null => {
      if (!peerCache.has(id)) peerCache.set(id, peerAverage(thisYearRows, { excludeSchoolId: id }).value)
      return peerCache.get(id) ?? null
    }
    return ids
      .map((schoolId) => {
        const cur = inGrade.find((r) => r.schoolId === schoolId && r.schoolYear === opts.year) ?? null
        const prev = inGrade.find((r) => r.schoolId === schoolId && r.schoolYear === opts.year - 1) ?? null
        const current = cur?.avgComposite ?? null
        const prior = prev?.avgComposite ?? null
        const rankRow = ranked.find((r) => r.schoolId === schoolId)
        return {
          schoolId,
          schoolName: cur?.schoolName ?? prev?.schoolName ?? null,
          current,
          prior,
          change: current !== null && prior !== null ? current - prior : null,
          // Each row against the network EXCLUDING ITSELF — the same statistic the
          // focus row gets. opts.peerValue excludes the VIEWING school, so every
          // other row used to be compared with a benchmark that contained itself
          // and omitted the viewer: a different question per row, in one column.
          vsNetwork: current !== null && peerFor(schoolId) !== null ? current - (peerFor(schoolId) as number) : null,
          vsNational: current !== null && opts.national !== null ? current - opts.national : null,
          tested: cur?.testedCount ?? null,
          eligible: cur?.eligibleCount ?? null,
          participationRate:
            (cur?.testedCount ?? null) !== null && (cur?.eligibleCount ?? 0) > 0
              ? (cur as AssessmentRow).testedCount! / (cur as AssessmentRow).eligibleCount!
              : null,
          rank: rankRow?.rank ?? null,
          forthcoming: current === null && isForthcoming(rows, schoolId, opts.year, opts.grade),
        }
      })
      .sort((a, b) => (b.current ?? -Infinity) - (a.current ?? -Infinity))
  }

  /**
   * Achievement bands, suppressed. A band of two students is two children, and
   * the complementary rule matters as much as the primary one: hiding a single
   * thin band while publishing the total and the other three recovers it by
   * subtraction, so a second band goes with it.
   */
  private safeDistribution(own: AssessmentRow | null) {
    const slices = distributionOf(own, ACHIEVEMENT_BANDS)
    const total = slices.reduce((acc, s) => acc + (s.count ?? 0), 0)
    if (total === 0) return slices
    // The whole cohort is a small cell — nothing about its shape may be shown.
    if (total < MIN_CELL) return ACHIEVEMENT_BANDS.map((band) => ({ band, count: null, share: null, suppressed: true }))

    // THE SHARED COMPLEMENT RULE. Widening only when EXACTLY ONE band was thin
    // left the two-thin-band case exactly recoverable: 22 tested, q3=10, q4=10
    // visible, so 22 − 20 = 2 across two bands each known to be non-zero and
    // under five means q1 = 1 and q2 = 1 — one child in the bottom quartile,
    // named by arithmetic. The cohort total is published in the same payload
    // (kpis.participation.tested and table[].tested), so nulling the shares was
    // never enough on its own.
    const cover = coverHiddenSet(slices, {
      key: (sl) => sl.band,
      weights: [(sl) => sl.count ?? 0],
      hidden: (sl) => (sl.count ?? 0) > 0 && (sl.count as number) < MIN_CELL,
    })
    // No combination covers them — the shape of this cohort cannot be shown.
    if (cover === null) {
      return ACHIEVEMENT_BANDS.map((band) => ({ band, count: null, share: null, suppressed: true }))
    }
    const hidden = cover
    // AND THE SHARE HAS TO GO WITH THEM. A visible band publishes both its count
    // and its share of the whole, and count ÷ share IS the cohort total — from
    // which the hidden bands' combined size follows by subtraction. Once anything
    // is hidden, no band may carry a share; the web draws its bars from counts.
    if (hidden.size > 0) {
      return slices.map((s) =>
        hidden.has(s.band)
          ? { band: s.band, count: null, share: null, suppressed: true }
          : { ...s, share: null, suppressed: false },
      )
    }
    return slices.map((s) => ({ ...s, suppressed: false }))
  }

  private benchmarkKpi(own: AssessmentRow | null, peers: AssessmentRow[], schoolId: string) {
    // Divide by students with a DETERMINATION, never by everyone tested.
    const rate = (r: AssessmentRow | null): number | null =>
      r && r.benchmarkMetCount !== null && r.benchmarkMetCount !== undefined && (r.benchmarkTestedCount ?? 0) > 0
        ? r.benchmarkMetCount / (r.benchmarkTestedCount as number)
        : null
    const peerPool = peers.filter((p) => p.schoolId !== schoolId)
    let met = 0
    let determined = 0
    for (const p of peerPool) {
      if (p.benchmarkMetCount !== null && p.benchmarkMetCount !== undefined && (p.benchmarkTestedCount ?? 0) > 0) {
        met += p.benchmarkMetCount
        determined += p.benchmarkTestedCount as number
      }
    }
    return { value: rate(own), peer: determined > 0 ? met / determined : null }
  }

  private emptyDashboard(school: { id: string; name: string }, level: string) {
    return {
      school: { id: school.id, name: school.name, level },
      context: null,
      empty: true,
      kpis: null,
      schools: [],
      subjects: [],
      heatmap: [],
      trend: [],
      movements: [],
      cohort: null,
      availableCohorts: [],
      objectives: { strengths: [], opportunities: [] },
      keyInsight: 'No assessment results loaded yet — upload a scores file to see this school against its peers.',
    }
  }
}
