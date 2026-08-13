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
import { PrismaService } from '../prisma/prisma.service.js'
import { parseGradebookCsv } from './parsers/gradebook-file.parser.js'
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
    const parsed = this.parse(file, opts)
    const roster = await this.roster(schoolId)
    const { decisions } = matchAll(this.candidates(parsed.rows), roster)

    const imp = await this.prisma.assessmentImport.create({
      data: {
        schoolId,
        kind: 'upload',
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

    // Courses first — one row per distinct name, reused across marks.
    const courseIdByName = new Map<string, string>()
    for (const name of parsed.courses) {
      const existing = await this.prisma.course.findFirst({
        where: { schoolId, name },
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

    // Replace this (year, term) slice so a corrected re-upload does not double.
    const year = opts.schoolYear ?? parsed.rows[0]?.schoolYear ?? null
    await this.prisma.gradeRecord.deleteMany({
      where: {
        schoolId,
        source: 'upload',
        ...(year !== null ? { schoolYear: year } : {}),
        ...(opts.term ? { term: opts.term } : {}),
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
      take: 1000,
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
    const where = { schoolId, ...(schoolYear ? { schoolYear } : {}) }
    const [total, byTerm, courses, marks] = await Promise.all([
      this.prisma.gradeRecord.count({ where }),
      this.prisma.gradeRecord.groupBy({ by: ['term'], where, _count: { _all: true }, _avg: { numericGrade: true } }),
      this.prisma.course.count({ where: { schoolId, ...(schoolYear ? { schoolYear } : {}) } }),
      this.prisma.gradeRecord.aggregate({ where, _avg: { numericGrade: true } }),
    ])
    return {
      total,
      courses,
      average: marks._avg.numericGrade === null ? null : Number(marks._avg.numericGrade),
      byTerm: byTerm.map((t) => ({
        term: t.term ?? 'unspecified',
        count: t._count._all,
        average: t._avg.numericGrade === null ? null : Number(t._avg.numericGrade),
      })),
    }
  }
}
