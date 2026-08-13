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
  strengthsAndOpportunities,
  subjectComparisons,
  systemInsights,
  trendDirection,
  trendSeries,
  yoyChange,
  type AssessmentRow,
  type ObjectiveRow,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  TOTAL_KEY,
  parseAssessmentCsv,
  subjectsSeen,
  type AssessmentParseResult,
} from './parsers/assessment-file.parser.js'
import { matchAll, type MatchCandidate, type RosterStudent } from './matching/student-match.js'

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
      // Replace this (year, test) slice so a corrected re-upload does not double.
      await this.prisma.assessmentResult.deleteMany({
        where: { schoolId, schoolYear: year, testType: parsed.testType, source: 'upload' },
      })
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        const created = await this.prisma.assessmentResult.createMany({ data: chunk })
        resultsCreated += created.count
      }
      await this.deriveAggregates(schoolId, year, parsed.testType, imp.id)
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
    }

    await this.prisma.assessmentImport.update({
      where: { id: imp.id },
      data: { resultsCreated, aggregatesUpserted, studentsMatched: matched, studentsUnmatched: unmatched },
    })
    await this.promoteOperational(schoolId, year)

    return { importId: imp.id, resultsCreated, aggregatesUpserted, matched, unmatched, warnings: parsed.warnings }
  }

  /** Delete one import's rows and re-derive what it touched. */
  async revert(schoolId: string, importId: string): Promise<{ deleted: number }> {
    const imp = await this.prisma.assessmentImport.findFirst({
      where: { id: importId, schoolId },
      select: { id: true, yearHint: true, testTypeHint: true },
    })
    if (!imp) throw new NotFoundException('Import not found.')
    const [results, aggregates] = await Promise.all([
      this.prisma.assessmentResult.deleteMany({ where: { importId } }),
      this.prisma.assessmentSchoolAggregate.deleteMany({ where: { importId } }),
    ])
    if (imp.yearHint && isTestTypeKey(imp.testTypeHint)) {
      await this.deriveAggregates(schoolId, imp.yearHint, imp.testTypeHint, null)
      await this.promoteOperational(schoolId, imp.yearHint)
    }
    return { deleted: results.count + aggregates.count }
  }

  async listImports(schoolId: string) {
    return this.prisma.assessmentImport.findMany({
      where: { schoolId },
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
    const rows = await this.prisma.assessmentResult.findMany({
      where: {
        schoolId,
        ...(q.schoolYear ? { schoolYear: q.schoolYear } : {}),
        ...(q.testType ? { testType: q.testType } : {}),
        ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}),
        ...(q.unmatchedOnly ? { matchStatus: 'unmatched' } : {}),
      },
      orderBy: [{ schoolYear: 'desc' }, { gradeLevel: 'asc' }, { composite: 'desc' }],
      take: 1000,
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
    return rows.map((r) => ({
      ...r,
      displayName: r.student ? `${r.student.lastName}, ${r.student.firstName}` : r.matchName,
    }))
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
    q: { schoolYear?: number; testType?: string; gradeLevel?: string; subject?: string; cohortGrade?: string } = {},
  ) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, organizationId: true, schoolType: true, gradeLow: true, gradeHigh: true },
    })
    if (!school) throw new NotFoundException('School not found.')

    const level = schoolLevelFrom(school)
    const peerIds = await this.orgSchoolIds(school.organizationId)
    const all = await this.aggregates(peerIds, { testType: q.testType })
    if (all.length === 0) {
      return this.emptyDashboard(school, level)
    }

    const years = [...new Set(all.map((a) => a.schoolYear))].sort((a, b) => b - a)
    const year = q.schoolYear ?? years[0]
    const testType = (q.testType ?? all[0].testType) as TestTypeKey
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

    return {
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
        offeredTestTypes: testTypesForLevel(level),
        availableTestTypes: [...new Set(all.map((a) => a.testType))],
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
      distribution: distributionOf(own, ACHIEVEMENT_BANDS),
      trend,
      trendDirection: trendDirection(trend, family, scoreType),
      movements: movements(inScope.filter((a) => a.gradeLevel === grade), {
        currentYear: year,
        subject: q.subject,
        family,
        scoreType,
      }),
      cohort,
      availableCohorts: availableCohorts(inScope),
      objectives: strengthsAndOpportunities(standings),
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
  }

  /** The diocesan view: every school at once, nobody anonymised (this is the
   *  superintendent's own console), plus the same helpers. */
  async orgDashboard(
    organizationId: string,
    q: { schoolYear?: number; testType?: string; gradeLevel?: string; subject?: string; cohortGrade?: string } = {},
  ) {
    const schoolIds = await this.orgSchoolIds(organizationId)
    const all = await this.aggregates(schoolIds, { testType: q.testType })
    if (all.length === 0) return { schools: [], context: null, empty: true }

    const years = [...new Set(all.map((a) => a.schoolYear))].sort((a, b) => b - a)
    const year = q.schoolYear ?? years[0]
    const testType = (q.testType ?? all[0].testType) as TestTypeKey
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
        availableTestTypes: [...new Set(all.map((a) => a.testType))],
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
    for (const schoolId of touched) await this.rollUpAllGrades(schoolId, year, parsed.testType)
    for (const schoolId of touched) await this.promoteOperational(schoolId, year)

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
    if (rows.length === 0) return
    let num = 0
    let den = 0
    let eligible = 0
    const sections = new Map<string, { sum: number; w: number }>()
    for (const r of rows) {
      const w = r.testedCount ?? 1
      const v = r.avgComposite === null ? null : Number(r.avgComposite)
      if (v !== null) {
        num += v * w
        den += w
      }
      eligible += r.eligibleCount ?? 0
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
      testedCount: den > 0 ? den : null,
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

  /** Per-section benchmark determination, computed here rather than trusted. */
  private benchmarksMet(parsed: AssessmentParseResult, sections: Record<string, number>): Record<string, boolean> | undefined {
    const table = parsed.family === 'act' ? { english: 18, math: 22, reading: 22, science: 23 } : parsed.family === 'sat' ? { erw: 480, math: 530 } : null
    if (!table) return undefined
    const out: Record<string, boolean> = {}
    for (const [k, cut] of Object.entries(table)) {
      const v = sections[k]
      if (typeof v === 'number') out[k] = v >= cut
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  /** Recompute the school aggregate from the student rows we hold. */
  private async deriveAggregates(schoolId: string, schoolYear: number, testType: TestTypeKey, importId: string | null) {
    const rows = await this.prisma.assessmentResult.findMany({
      where: { schoolId, schoolYear, testType },
      select: { gradeLevel: true, composite: true, sectionScores: true, benchmarksMet: true, scoreType: true },
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
      const composites = group.map((r) => r.composite).filter((v): v is number => v !== null)
      const sectionSums = new Map<string, { sum: number; n: number }>()
      let benchMet = 0
      let benchTested = 0
      const bands: Record<string, number> = { q1: 0, q2: 0, q3: 0, q4: 0 }
      for (const r of group) {
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
        sectionAverages: Object.fromEntries([...sectionSums].map(([k, v]) => [k, v.sum / v.n])),
        testedCount: group.length,
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
    const data = {
      importId: input.importId,
      scoreType: input.scoreType,
      avgComposite: input.avgComposite,
      sectionAverages: Object.keys(input.sectionAverages).length > 0 ? input.sectionAverages : undefined,
      testedCount: input.testedCount,
      eligibleCount: input.eligibleCount,
      benchmarkMetCount: input.benchmarkMetCount ?? null,
      distribution: input.distribution ?? undefined,
    }
    await this.prisma.assessmentSchoolAggregate.upsert({
      where,
      create: {
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
    const rows = await this.prisma.assessmentSchoolAggregate.findMany({
      where: { schoolId, schoolYear, gradeLevel: 'all' },
      select: { testType: true, derivation: true, avgComposite: true, testedCount: true, benchmarkMetCount: true, eligibleCount: true },
    })
    if (rows.length === 0) return
    const pick = (test: string) =>
      rows.find((r) => r.testType === test && r.derivation === 'derived') ?? rows.find((r) => r.testType === test) ?? null
    const act = pick('act')
    const sat = pick('sat')
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { schoolId, periodEndDate: { gte: new Date(`${schoolYear}-01-01`), lte: new Date(`${schoolYear}-12-31`) } },
      orderBy: { periodEndDate: 'desc' },
      select: { id: true },
    })
    if (!period) return

    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
    const actAvg = num(act?.avgComposite)
    const satAvg = num(sat?.avgComposite)
    const data = {
      actScoreSum: actAvg !== null && act?.testedCount ? Math.round(actAvg * act.testedCount) : null,
      actTestedCount: act?.testedCount ?? null,
      satScoreSum: satAvg !== null && sat?.testedCount ? Math.round(satAvg * sat.testedCount) : null,
      satTestedCount: sat?.testedCount ?? null,
      benchmarkMetCount: (act?.benchmarkMetCount ?? 0) + (sat?.benchmarkMetCount ?? 0) || null,
      benchmarkTestedCount: (act?.testedCount ?? 0) + (sat?.testedCount ?? 0) || null,
      assessmentEligibleCount: act?.eligibleCount ?? sat?.eligibleCount ?? null,
    }
    await this.prisma.periodOperationalData.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })
  }

  /** Aggregate rows as the pure layer wants them. Derived beats ingested. */
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
        benchmarkRates: true,
        distribution: true,
        school: { select: { name: true } },
      },
    })
    // One row per (school, year, test, grade): derived wins.
    const best = new Map<string, (typeof rows)[number]>()
    for (const r of rows) {
      const key = `${r.schoolId}|${r.schoolYear}|${r.testType}|${r.gradeLevel}`
      const cur = best.get(key)
      if (!cur || (r.derivation === 'derived' && cur.derivation !== 'derived')) best.set(key, r)
    }
    return [...best.values()].map((r) => {
      const family = TEST_FAMILY[r.testType as TestTypeKey] ?? 'nrt'
      return {
        schoolId: r.schoolId,
        schoolName: r.school?.name,
        schoolYear: r.schoolYear,
        testType: r.testType,
        family,
        scoreType: (r.scoreType as 'scale' | 'percentile' | 'nce') ?? SCORE_TYPE_FOR_FAMILY[family],
        gradeLevel: r.gradeLevel,
        avgComposite: r.avgComposite === null ? null : Number(r.avgComposite),
        sectionAverages: (r.sectionAverages ?? null) as Record<string, number> | null,
        testedCount: r.testedCount,
        eligibleCount: r.eligibleCount,
        benchmarkMetCount: r.benchmarkMetCount,
        benchmarkRates: (r.benchmarkRates ?? null) as Record<string, number> | null,
        distribution: (r.distribution ?? null) as Record<string, number> | null,
      }
    })
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
      take: 2000,
    })
    return rows.map((r) => ({
      ...r,
      opi: r.opi === null ? null : Number(r.opi),
      masteryCounts: (r.masteryCounts ?? null) as Record<string, number> | null,
    }))
  }

  private async orgSchoolIds(organizationId: string): Promise<string[]> {
    const schools = await this.prisma.school.findMany({ where: { organizationId }, select: { id: true } })
    return schools.map((s) => s.id)
  }

  private benchmarkKpi(own: AssessmentRow | null, peers: AssessmentRow[], schoolId: string) {
    const rate = (r: AssessmentRow | null): number | null =>
      r && r.benchmarkMetCount !== null && r.benchmarkMetCount !== undefined && (r.testedCount ?? 0) > 0
        ? r.benchmarkMetCount / (r.testedCount as number)
        : null
    const peerPool = peers.filter((p) => p.schoolId !== schoolId)
    let met = 0
    let tested = 0
    for (const p of peerPool) {
      if (p.benchmarkMetCount !== null && p.benchmarkMetCount !== undefined && (p.testedCount ?? 0) > 0) {
        met += p.benchmarkMetCount
        tested += p.testedCount as number
      }
    }
    return { value: rate(own), peer: tested > 0 ? met / tested : null }
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
