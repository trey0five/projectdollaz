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
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class GradebookService {
  constructor(private readonly prisma: PrismaService) {}

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
