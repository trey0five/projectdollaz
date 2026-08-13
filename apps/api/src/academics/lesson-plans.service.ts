// ─────────────────────────────────────────────────────────────────────────────
// LessonPlansService — the classroom register.
//
// A standing school-scoped list (no fiscal period): a lesson plan belongs to a
// week and a teacher, not to a financial year. Deliberately small — a register
// teachers keep current beats a workflow nobody finishes.
//
// Summary reads are groupBy counts with NO identity column selected, so the
// assistant and the briefing can report coverage ("4 plans still in draft this
// week") without ever naming a teacher.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class LessonPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, q: { status?: string; subject?: string; gradeLevel?: string } = {}) {
    return this.prisma.lessonPlan.findMany({
      where: {
        schoolId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.subject ? { subject: q.subject } : {}),
        ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}),
      },
      orderBy: [{ weekOf: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })
  }

  async create(schoolId: string, body: Record<string, unknown>, userId?: string) {
    return this.prisma.lessonPlan.create({
      data: {
        schoolId,
        title: String(body.title),
        subject: (body.subject as string) ?? null,
        gradeLevel: (body.gradeLevel as string) ?? null,
        teacherName: (body.teacherName as string) ?? null,
        status: (body.status as string) ?? 'draft',
        plannedOn: body.plannedOn ? new Date(String(body.plannedOn)) : null,
        weekOf: body.weekOf ? new Date(String(body.weekOf)) : null,
        notes: (body.notes as string) ?? null,
        createdByUserId: userId ?? null,
      },
    })
  }

  async update(schoolId: string, id: string, body: Record<string, unknown>) {
    const found = await this.prisma.lessonPlan.findFirst({ where: { id, schoolId }, select: { id: true } })
    if (!found) throw new NotFoundException('Lesson plan not found.')
    const data: Record<string, unknown> = {}
    for (const k of ['title', 'subject', 'gradeLevel', 'teacherName', 'status', 'notes'] as const) {
      if (body[k] !== undefined) data[k] = body[k]
    }
    for (const k of ['plannedOn', 'weekOf'] as const) {
      if (body[k] !== undefined) data[k] = body[k] ? new Date(String(body[k])) : null
    }
    return this.prisma.lessonPlan.update({ where: { id }, data })
  }

  async remove(schoolId: string, id: string) {
    const found = await this.prisma.lessonPlan.findFirst({ where: { id, schoolId }, select: { id: true } })
    if (!found) throw new NotFoundException('Lesson plan not found.')
    await this.prisma.lessonPlan.delete({ where: { id } })
    return { deleted: true }
  }

  /** COUNTS ONLY — the shape the assistant and briefing read. */
  async summary(schoolId: string) {
    const [byStatus, bySubject, total] = await Promise.all([
      this.prisma.lessonPlan.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
      this.prisma.lessonPlan.groupBy({ by: ['subject'], where: { schoolId }, _count: { _all: true } }),
      this.prisma.lessonPlan.count({ where: { schoolId } }),
    ])
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      bySubject: Object.fromEntries(bySubject.map((r) => [r.subject ?? 'unspecified', r._count._all])),
    }
  }
}
