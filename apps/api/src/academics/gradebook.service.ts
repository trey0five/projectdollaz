// ─────────────────────────────────────────────────────────────────────────────
// GradebookService — course marks.
//
// Same FERPA shape as the assessment side: GradeRecord holds identity and is
// read only by the role-gated register; `summary` is groupBy arithmetic that
// never selects a name, so it is safe for the assistant and the briefing.
//
// `externalId` is the OneRoster result sourcedId, which makes a re-sync
// idempotent — the same mark imported twice updates one row instead of
// creating a second.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, Injectable } from '@nestjs/common'
import { gateGradebookSummary, type GradebookSummaryOutput } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { tableBytes } from '../common/upload-bytes.js'
import { looksLikeWorkbook, mainSheet, readTable } from '@finrep/ingestion'
import { parseGradebookCsv, parseGradebookGrid } from './parsers/gradebook-file.parser.js'
import { matchAll, type MatchCandidate, type RosterStudent } from './matching/student-match.js'

@Injectable()
export class GradebookService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parse a gradebook export and REPORT it — no writes. Same two-step contract as
   * the assessment upload: the reviewer sees the shape, the courses, the terms and
   * the roster-match rate before a single mark lands.
   */
  async preview(schoolId: string, file: { buffer: Buffer; originalname?: string }, opts: { schoolYear?: number; term?: string } = {}) {
    file = (await tableBytes(file)) ?? file // #52: a PDF reads as the table it printed
    const parsed = this.parse(file, opts)
    const roster = await this.roster(schoolId)
    const { summary } = matchAll(this.candidates(parsed.rows), roster)
    return {
      shape: parsed.shape,
      rows: parsed.rows.length,
      courses: parsed.courses,
      terms: parsed.terms,
      warnings: parsed.warnings,
      match: summary,
      // A sample WITHOUT names — a preview is not a reason to echo identity back.
      sample: parsed.rows.slice(0, 5).map((r) => ({
        course: r.courseName,
        term: r.term,
        grade: r.numericGrade,
        letter: r.letterGrade,
      })),
    }
  }

  /**
   * Parse AND write. Courses are upserted by name so a re-import lands on the same
   * section rather than creating a twin, and the (year, term) slice is replaced so
   * a corrected file does not double.
   */
  async commit(
    schoolId: string,
    file: { buffer: Buffer; originalname?: string },
    opts: { schoolYear?: number; term?: string; userId?: string } = {},
  ) {
    file = (await tableBytes(file)) ?? file // #52: a PDF reads as the table it printed
    const parsed = this.parse(file, opts)
    const roster = await this.roster(schoolId)
    const { decisions } = matchAll(this.candidates(parsed.rows), roster)

    const imp = await this.prisma.assessmentImport.create({
      data: {
        schoolId,
        // 'gradebook', not 'upload': revert branches on kind, and these rows
        // live in grade_records rather than the assessment tables.
        kind: 'gradebook',
        scope: 'student',
        provider: null,
        fileName: file.originalname ?? null,
        yearHint: opts.schoolYear ?? parsed.rows[0]?.schoolYear ?? null,
        rowsParsed: parsed.rows.length,
        warnings: parsed.warnings,
        uploadedByUserId: opts.userId ?? null,
      },
      select: { id: true },
    })

    // Courses first — one row per distinct name PER YEAR, reused across marks.
    const year = opts.schoolYear ?? parsed.rows[0]?.schoolYear ?? null
    const courseIdByName = new Map<string, string>()
    for (const name of parsed.courses) {
      // Looked up by name AND YEAR. Course.schoolYear is stamped from whichever
      // import created the row, so a name-only lookup attached a second year's
      // marks to the first year's course — and a caller filtering courses by
      // year then found none of them. A course is a section in a school year,
      // not a name that outlives one.
      const existing = await this.prisma.course.findFirst({
        where: { schoolId, name, ...(year !== null ? { schoolYear: year } : {}) },
        select: { id: true },
      })
      if (existing) {
        courseIdByName.set(name, existing.id)
        continue
      }
      const created = await this.prisma.course.create({
        data: {
          schoolId,
          name,
          subject: name,
          schoolYear: opts.schoolYear ?? parsed.rows.find((r) => r.courseName === name)?.schoolYear ?? null,
          teacherName: parsed.rows.find((r) => r.courseName === name)?.teacherName ?? null,
        },
        select: { id: true },
      })
      courseIdByName.set(name, created.id)
    }

    // Replace ONLY the (year, term) slices this file actually carries.
    //
    // The previous shape used conditional spreads on both keys, so a file with no
    // year header committed without an explicit year collapsed the filter to
    // { schoolId, source:'upload' } — and since this method is the only writer of
    // GradeRecord and hard-codes source:'upload', that deleted every mark the
    // school had ever imported, silently and with no revert path. A delete whose
    // scope depends on an optional field is a delete waiting to be unbounded.
    if (year === null) {
      throw new BadRequestException('No school year in the file — choose one before committing.')
    }
    const slices = [
      ...new Map(
        parsed.rows.map((r) => {
          const y = r.schoolYear ?? year
          const t = r.term ?? opts.term ?? null
          return [`${y}|${t ?? ''}`, { schoolYear: y, term: t }] as const
        }),
      ).values(),
    ]
    // REPLACE THIS FILE'S SLICE, NOT THE WHOLE TERM.
    //
    // Schools export one course, one teacher or one department at a time. Wiping
    // every uploaded mark in the (year, term) slices a file touches meant the
    // second upload silently deleted the first, and a school that loaded twelve
    // course files kept only the twelfth — with the summary card cheerfully
    // reporting the smaller number as fact. Scope the replace to the COURSES
    // this file actually carries, which is what "re-uploading a corrected file
    // does not double" was always meant to mean.
    const courseNames = [...new Set(parsed.rows.map((r) => r.courseName).filter((n): n is string => !!n))]
    // A mark parsed with NO course name has a null courseId, which
    // `course: { name: { in: … } }` can never match — those rows were never
    // replaced and doubled on every re-upload. Scope the replace to the named
    // courses OR the course-less rows, which is exactly the set this file writes.
    const hasUnnamed = parsed.rows.some((r) => !r.courseName)
    const courseScope =
      courseNames.length > 0 && hasUnnamed
        ? { OR: [{ course: { name: { in: courseNames } } }, { courseId: null }] }
        : courseNames.length > 0
          ? { course: { name: { in: courseNames } } }
          : hasUnnamed
            ? { courseId: null }
            : {}
    await this.prisma.gradeRecord.deleteMany({
      where: {
        schoolId,
        source: 'upload',
        ...courseScope,
        OR: slices.map((sl) => ({
          schoolYear: sl.schoolYear,
          ...(sl.term === null ? { term: null } : { term: sl.term }),
        })),
      },
    })

    let matched = 0
    let unmatched = 0
    const data = parsed.rows.map((r, i) => {
      const d = decisions[i]
      if (d.studentId) matched += 1
      else unmatched += 1
      return {
        schoolId,
        importId: imp.id,
        courseId: r.courseName ? (courseIdByName.get(r.courseName) ?? null) : null,
        studentId: d.studentId,
        matchStatus: d.status,
        matchExternalId: r.externalId,
        matchName: [r.lastName, r.firstName].filter(Boolean).join(', ') || r.rawName,
        schoolYear: r.schoolYear ?? year,
        term: r.term ?? opts.term ?? null,
        numericGrade: r.numericGrade,
        letterGrade: r.letterGrade,
        source: 'upload',
      }
    })

    let created = 0
    for (let i = 0; i < data.length; i += 500) {
      const res = await this.prisma.gradeRecord.createMany({ data: data.slice(i, i + 500) })
      created += res.count
    }
    await this.prisma.assessmentImport.update({
      where: { id: imp.id },
      data: { resultsCreated: created, studentsMatched: matched, studentsUnmatched: unmatched },
    })

    return {
      importId: imp.id,
      created,
      courses: courseIdByName.size,
      matched,
      unmatched,
      warnings: parsed.warnings,
    }
  }

  private parse(file: { buffer: Buffer; originalname?: string }, opts: { schoolYear?: number; term?: string }) {
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('Empty file.')
    try {
      // Excel (.xlsx/.xls) through the shared reader — the sheet with the most
      // rows — and CSV as text, so a gradebook takes what Assessment results takes.
      if (looksLikeWorkbook(file.buffer)) {
        const sheet = mainSheet(readTable(file.buffer))
        if (!sheet) throw new Error('This workbook has no sheet with a header row and data.')
        return parseGradebookGrid([sheet.header, ...sheet.rows].map((r) => r.map((c) => String(c ?? ''))), opts)
      }
      return parseGradebookCsv(file.buffer, opts)
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
  }

  private candidates(rows: Array<{ externalId: string | null; firstName: string | null; lastName: string | null; gradeLevel: string | null }>): MatchCandidate[] {
    return rows.map((r) => ({
      externalId: r.externalId,
      firstName: r.firstName,
      lastName: r.lastName,
      gradeLevel: r.gradeLevel,
    }))
  }

  private async roster(schoolId: string): Promise<RosterStudent[]> {
    return this.prisma.student.findMany({
      where: { schoolId },
      select: { id: true, firstName: true, lastName: true, grade: true, externalId: true },
    })
  }

  async listCourses(schoolId: string, schoolYear?: number) {
    return this.prisma.course.findMany({
      where: { schoolId, ...(schoolYear ? { schoolYear } : {}) },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      take: 500,
    })
  }

  /** The register — role-gated, the only path that shows a student's mark. */
  async listRecords(schoolId: string, q: { courseId?: string; schoolYear?: number; term?: string } = {}) {
    return this.prisma.gradeRecord.findMany({
      where: {
        schoolId,
        ...(q.courseId ? { courseId: q.courseId } : {}),
        ...(q.schoolYear ? { schoolYear: q.schoolYear } : {}),
        ...(q.term ? { term: q.term } : {}),
      },
      orderBy: [{ schoolYear: 'desc' }, { term: 'asc' }],
      // Same cap, same reason as the assessment register — see listResults.
      take: 500,
      select: {
        id: true,
        matchStatus: true,
        matchName: true,
        schoolYear: true,
        term: true,
        numericGrade: true,
        letterGrade: true,
        course: { select: { id: true, name: true, subject: true, gradeLevel: true } },
        student: { select: { firstName: true, lastName: true, grade: true } },
      },
    })
  }

  /**
   * COUNTS AND AVERAGES ONLY — no identity column is selected anywhere in this
   * method, which is what makes it safe to expose to the assistant.
   */
  async summary(schoolId: string, schoolYear?: number) {
    return this.summaryRaw(schoolId, schoolYear)
  }

  /**
   * The raw counts every gradebook summary is built from, floored by the ONE
   * gate in @finrep/analytics. Public so the assistant calls THIS rather than
   * running its own copy of the query — round 3 floored this method and left
   * Penny's tool re-querying Prisma, so the REST route answered "suppressed"
   * while the chattiest surface in the product answered with the number.
   *
   * The distinct-student count is the floor that matters: one student with five
   * courses is five MARKS and one child, and a floor counting marks published
   * that child's own average as the school's.
   */
  async summaryRaw(schoolId: string, schoolYear?: number): Promise<GradebookSummaryOutput> {
    const where = { schoolId, ...(schoolYear ? { schoolYear } : {}) }
    const scored = { ...where, numericGrade: { not: null } }
    const [totalMarks, courses, overall, byTermAgg, students, termStudents] = await Promise.all([
      this.prisma.gradeRecord.count({ where }),
      this.prisma.course.count({ where: { schoolId, ...(schoolYear ? { schoolYear } : {}) } }),
      this.prisma.gradeRecord.aggregate({ where: scored, _avg: { numericGrade: true }, _count: { _all: true } }),
      this.prisma.gradeRecord.groupBy({
        by: ['term'],
        where: scored,
        _count: { _all: true },
        _avg: { numericGrade: true },
      }),
      this.prisma.gradeRecord.groupBy({ by: ['studentId'], where: scored, _count: { _all: true } }),
      this.prisma.gradeRecord.groupBy({ by: ['term', 'studentId'], where: scored, _count: { _all: true } }),
    ])

    // An UNMATCHED mark has a null studentId and cannot be told apart from
    // another unmatched mark, so each counts as its own child — the cautious
    // read, which is the right direction for a privacy floor to err in.
    const distinct = (rows: Array<{ studentId: string | null; _count: { _all: number } }>): number =>
      rows.reduce((acc, r) => acc + (r.studentId === null ? r._count._all : 1), 0)

    const byTermStudents = new Map<string, typeof termStudents>()
    for (const r of termStudents) {
      const key = r.term ?? ''
      const list = byTermStudents.get(key) ?? []
      list.push(r)
      byTermStudents.set(key, list)
    }

    return gateGradebookSummary({
      totalMarks,
      courses,
      scoredCount: overall._count._all,
      studentCount: distinct(students),
      average: overall._avg.numericGrade === null ? null : Number(overall._avg.numericGrade),
      byTerm: byTermAgg.map((t) => ({
        term: t.term,
        scoredCount: t._count._all,
        studentCount: distinct(byTermStudents.get(t.term ?? '') ?? []),
        average: t._avg.numericGrade === null ? null : Number(t._avg.numericGrade),
      })),
    })
  }
}
