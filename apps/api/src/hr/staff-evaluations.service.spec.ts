import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { StaffEvaluationsService } from './staff-evaluations.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — StaffEvaluationsService.
//
// TENANT ISOLATION, the staff-group gate, the ONE overdue predicate (§3.1, pinned
// clause for clause below) and the COUNTS-ONLY summary. Prisma + Audit are
// hand-mocked (no DB, no Nest boot) — the house pattern for every register service.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-02T12:00:00.000Z')
const TODAY = '2026-08-02'

function evalRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    schoolId: 'school-A',
    personId: 'p1',
    cycleLabel: '2025-26 annual cycle',
    dueDate: new Date('2026-06-30T00:00:00.000Z'),
    completedDate: null,
    evaluatorName: null,
    status: 'scheduled',
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date('2025-09-01T00:00:00.000Z'),
    updatedAt: new Date('2025-09-01T00:00:00.000Z'),
    person: { name: 'Dana Reyes', title: 'Business Manager' },
    ...over,
  }
}

function makeService(
  over: { evaluation?: Record<string, unknown>; person?: Record<string, unknown> } = {},
) {
  // The `_args` parameters are load-bearing for TYPES, not for behaviour: vitest
  // infers `mock.calls` from the mock's signature, and a zero-arg mock gives an
  // empty tuple that `calls[0][0]` cannot index. Several assertions below read the
  // arguments the service passed, which is the point.
  const staffEvaluation = {
    findMany: vi.fn(async (_args?: Record<string, unknown>) => [] as Record<string, unknown>[]),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => evalRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => evalRow(data)),
    delete: vi.fn(async () => evalRow()),
    ...over.evaluation,
  }
  const governancePerson = {
    findFirst: vi.fn(async () => ({ id: 'p1', groups: ['staff'] })),
    ...over.person,
  }
  const prisma = { staffEvaluation, governancePerson }
  const audit = { write: vi.fn(async (_entry: Record<string, unknown>) => undefined) }
  const svc = new StaffEvaluationsService(prisma as never, audit as never)
  return { svc, staffEvaluation, governancePerson, audit }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE OVERDUE PREDICATE — the whole phase's arithmetic rests on these four clauses.
// ─────────────────────────────────────────────────────────────────────────────
describe('StaffEvaluationsService — the overdue predicate (§3.1, clause for clause)', () => {
  const cases: [string, Record<string, unknown>, boolean][] = [
    [
      'past due, not completed, status scheduled → OVERDUE',
      { dueDate: new Date('2026-06-30T00:00:00.000Z'), status: 'scheduled' },
      true,
    ],
    [
      'past due, but completedDate is set → NOT overdue (completedDate WINS over status)',
      {
        dueDate: new Date('2026-06-30T00:00:00.000Z'),
        status: 'scheduled',
        completedDate: new Date('2026-06-20T00:00:00.000Z'),
      },
      false,
    ],
    [
      "past due, status 'completed' with no date → NOT overdue",
      { dueDate: new Date('2026-06-30T00:00:00.000Z'), status: 'completed' },
      false,
    ],
    [
      "past due, status 'waived' → NOT overdue",
      { dueDate: new Date('2026-06-30T00:00:00.000Z'), status: 'waived' },
      false,
    ],
    [
      'due TODAY → NOT overdue (the comparison is strict <)',
      { dueDate: new Date(`${TODAY}T00:00:00.000Z`), status: 'scheduled' },
      false,
    ],
    [
      'due tomorrow → NOT overdue',
      { dueDate: new Date('2026-08-03T00:00:00.000Z'), status: 'scheduled' },
      false,
    ],
    [
      "past due, status 'in_progress' → OVERDUE (started is not finished)",
      { dueDate: new Date('2026-06-30T00:00:00.000Z'), status: 'in_progress' },
      true,
    ],
  ]

  for (const [name, over, expected] of cases) {
    it(name, async () => {
      const { svc } = makeService({
        evaluation: { findMany: vi.fn(async () => [evalRow(over)]) },
      })
      const res = await svc.list('school-A', {}, NOW)
      expect(res.evaluations[0].isOverdue).toBe(expected)
      expect(res.summary.overdue).toBe(expected ? 1 : 0)
    })
  }

  it('daysOverdue counts whole days past the due date, and is null when not overdue', async () => {
    const { svc } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          evalRow({ id: 'late', dueDate: new Date('2026-06-30T00:00:00.000Z') }),
          evalRow({ id: 'fine', dueDate: new Date('2026-09-30T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.list('school-A', {}, NOW)
    // 2026-06-30 → 2026-08-02 is 33 days.
    expect(res.evaluations.find((e) => e.id === 'late')!.daysOverdue).toBe(33)
    expect(res.evaluations.find((e) => e.id === 'fine')!.daysOverdue).toBeNull()
    expect(res.summary.oldestOverdueDays).toBe(33)
  })

  it('oldestOverdueDays is 0 — not null — when nothing is overdue', async () => {
    const { svc } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [evalRow({ dueDate: new Date('2026-09-30T00:00:00.000Z') })]),
      },
    })
    const res = await svc.list('school-A', {}, NOW)
    expect(res.summary.overdue).toBe(0)
    expect(res.summary.oldestOverdueDays).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE PII CONTRACT — two shapes and only two.
// ─────────────────────────────────────────────────────────────────────────────
describe('StaffEvaluationsService — summary is COUNTS ONLY', () => {
  it('selects exactly {dueDate, completedDate, status} and returns no identity of any kind', async () => {
    const { svc, staffEvaluation } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          { dueDate: new Date('2026-06-30T00:00:00.000Z'), completedDate: null, status: 'scheduled' },
          { dueDate: new Date('2026-05-01T00:00:00.000Z'), completedDate: null, status: 'in_progress' },
          {
            dueDate: new Date('2026-03-01T00:00:00.000Z'),
            completedDate: new Date('2026-02-28T00:00:00.000Z'),
            status: 'completed',
          },
          { dueDate: new Date('2026-01-01T00:00:00.000Z'), completedDate: null, status: 'waived' },
        ]),
      },
    })
    const summary = await svc.summary('school-A', NOW)
    expect(staffEvaluation.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-A' },
      select: { dueDate: true, completedDate: true, status: true },
    })
    expect(summary).toEqual({
      total: 4,
      overdue: 2,
      // 2026-05-01 → 2026-08-02 = 93 days, the older of the two overdue rows.
      oldestOverdueDays: 93,
      byStatus: { scheduled: 1, in_progress: 1, completed: 1, waived: 1 },
      completedLast12m: 1,
    })
    // The mechanical version of the contract: no key on this object can carry a name.
    expect(Object.keys(summary).sort()).toEqual([
      'byStatus',
      'completedLast12m',
      'oldestOverdueDays',
      'overdue',
      'total',
    ])
    expect(JSON.stringify(summary)).not.toContain('Dana')
  })

  it('completedLast12m counts only completions inside the last twelve months', async () => {
    const { svc } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          // Exactly on the cutoff (2025-08-02) — inclusive.
          { dueDate: new Date('2025-08-02T00:00:00.000Z'), completedDate: new Date('2025-08-02T00:00:00.000Z'), status: 'completed' },
          // One day before the cutoff — excluded.
          { dueDate: new Date('2025-08-01T00:00:00.000Z'), completedDate: new Date('2025-08-01T00:00:00.000Z'), status: 'completed' },
          { dueDate: new Date('2026-07-01T00:00:00.000Z'), completedDate: new Date('2026-07-01T00:00:00.000Z'), status: 'completed' },
          { dueDate: new Date('2026-07-01T00:00:00.000Z'), completedDate: null, status: 'scheduled' },
        ]),
      },
    })
    expect((await svc.summary('school-A', NOW)).completedLast12m).toBe(2)
  })

  it('a status outside the vocabulary is counted in total but files under NO bucket', async () => {
    const { svc } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          { dueDate: new Date('2026-01-01T00:00:00.000Z'), completedDate: null, status: 'deferred_forever' },
        ]),
      },
    })
    const summary = await svc.summary('school-A', NOW)
    expect(summary.total).toBe(1)
    // …and it is still overdue: an unknown status is not 'completed' or 'waived'.
    expect(summary.overdue).toBe(1)
    expect(summary.byStatus).toEqual({ scheduled: 0, in_progress: 0, completed: 0, waived: 0 })
  })

  it('list summary is computed over the FULL register, never over the DB-filtered page', async () => {
    const { svc, staffEvaluation } = makeService({
      evaluation: {
        findMany: vi
          .fn()
          // 1st call: the filtered page.
          .mockImplementationOnce(async () => [evalRow({ id: 'late' })])
          // 2nd call: the whole register (three rows, one overdue).
          .mockImplementationOnce(async () => [
            { dueDate: new Date('2026-06-30T00:00:00.000Z'), completedDate: null, status: 'scheduled' },
            { dueDate: new Date('2026-12-01T00:00:00.000Z'), completedDate: null, status: 'scheduled' },
            { dueDate: new Date('2026-12-01T00:00:00.000Z'), completedDate: null, status: 'scheduled' },
          ]),
      },
    })
    const res = await svc.list('school-A', { status: 'scheduled' }, NOW)
    expect(res.evaluations).toHaveLength(1)
    expect(res.summary.total).toBe(3) // NOT 1 — a KPI must not move when you type in a filter
    expect(staffEvaluation.findMany).toHaveBeenCalledTimes(2)
  })

  it('an UNFILTERED list issues ONE query — the page already IS the register', async () => {
    const { svc, staffEvaluation } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          evalRow({ id: 'late', dueDate: new Date('2026-06-30T00:00:00.000Z') }),
          evalRow({ id: 'fine', dueDate: new Date('2026-12-01T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.list('school-A', {}, NOW)
    expect(staffEvaluation.findMany).toHaveBeenCalledTimes(1)
    expect(res.summary.total).toBe(2)
    expect(res.summary.overdue).toBe(1)
  })

  it("`overdue` alone does NOT narrow the DB read, so the summary still spans the register", async () => {
    // overdue is applied in memory (the predicate reads the clock and the
    // completedDate-wins rule), so the single query already returned everything.
    const { svc, staffEvaluation } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          evalRow({ id: 'late', dueDate: new Date('2026-06-30T00:00:00.000Z') }),
          evalRow({ id: 'fine', dueDate: new Date('2026-12-01T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.list('school-A', { overdue: 'true' }, NOW)
    expect(staffEvaluation.findMany).toHaveBeenCalledTimes(1)
    expect(staffEvaluation.findMany.mock.calls[0][0]!.where).toEqual({ schoolId: 'school-A' })
    expect(res.evaluations.map((e) => e.id)).toEqual(['late'])
    expect(res.summary.total).toBe(2) // the register, not the page
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE STAFF-GROUP GATE — no second person table, and not just any person.
// ─────────────────────────────────────────────────────────────────────────────
describe('StaffEvaluationsService — the personId gate', () => {
  it('create resolves the person scoped to {id, schoolId} — a foreign person 400s', async () => {
    const { svc, staffEvaluation, governancePerson } = makeService({
      person: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.create('school-A', { personId: 'p-of-B', cycleLabel: 'c', dueDate: '2026-06-30' }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(governancePerson.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-of-B', schoolId: 'school-A' },
      select: { id: true, groups: true },
    })
    expect(staffEvaluation.create).not.toHaveBeenCalled()
  })

  it("create 400s when the person is not in the 'staff' group, and names the reason", async () => {
    const { svc, staffEvaluation } = makeService({
      person: { findFirst: vi.fn(async () => ({ id: 'p1', groups: ['board'] })) },
    })
    await expect(
      svc.create('school-A', { personId: 'p1', cycleLabel: 'c', dueDate: '2026-06-30' }, 'u'),
    ).rejects.toThrow(/staff/)
    expect(staffEvaluation.create).not.toHaveBeenCalled()
  })

  it('create accepts a person carrying staff among several groups', async () => {
    const { svc, staffEvaluation } = makeService({
      person: { findFirst: vi.fn(async () => ({ id: 'p1', groups: ['finance_team', 'staff'] })) },
    })
    await svc.create(
      'school-A',
      { personId: 'p1', cycleLabel: '2025-26', dueDate: '2026-06-30' },
      'user-1',
      NOW,
    )
    const data = staffEvaluation.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.personId).toBe('p1')
    expect(data.status).toBe('scheduled') // default applied
    expect(data.dueDate).toEqual(new Date('2026-06-30T00:00:00.000Z')) // UTC midnight
  })

  it('an early evaluation is legal: completedDate may precede dueDate, no error', async () => {
    const { svc, staffEvaluation } = makeService({})
    await svc.create(
      'school-A',
      {
        personId: 'p1',
        cycleLabel: '2025-26',
        dueDate: '2026-06-30',
        completedDate: '2026-05-01',
        status: 'completed',
      },
      'user-1',
      NOW,
    )
    const data = staffEvaluation.create.mock.calls[0][0].data
    expect(data.completedDate).toEqual(new Date('2026-05-01T00:00:00.000Z'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TENANT ISOLATION — the house discipline, identical to FacilitiesService.
// ─────────────────────────────────────────────────────────────────────────────
describe('StaffEvaluationsService — tenant isolation (findFirst {id, schoolId})', () => {
  it('get: a foreign evaluationId → NotFoundException', async () => {
    const { svc } = makeService({ evaluation: { findFirst: vi.fn(async () => null) } })
    await expect(svc.get('school-B', 'e-of-A')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('update: a foreign evaluationId → NotFoundException, never mutates', async () => {
    const { svc, staffEvaluation } = makeService({
      evaluation: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.update('school-B', 'e-of-A', { cycleLabel: 'hijack' }, 'u'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(staffEvaluation.update).not.toHaveBeenCalled()
  })

  it('remove: a foreign evaluationId → NotFoundException, never deletes', async () => {
    const { svc, staffEvaluation } = makeService({
      evaluation: { findFirst: vi.fn(async () => null) },
    })
    await expect(svc.remove('school-B', 'e-of-A', 'u')).rejects.toBeInstanceOf(NotFoundException)
    expect(staffEvaluation.delete).not.toHaveBeenCalled()
  })

  it('every mutation resolves through {id, schoolId} and writes an audit entry with no PII', async () => {
    const { svc, staffEvaluation, audit } = makeService({
      evaluation: { findFirst: vi.fn(async () => evalRow({ id: 'e1' })) },
    })
    await svc.update('school-A', 'e1', { status: 'completed' }, 'user-1', NOW)
    expect(staffEvaluation.findFirst).toHaveBeenCalledWith({
      where: { id: 'e1', schoolId: 'school-A' },
      include: { person: { select: { name: true, title: true } } },
    })
    const entry = audit.write.mock.calls[0][0]
    expect(entry.action).toBe('hr.staff_evaluation.updated')
    expect(JSON.stringify(entry)).not.toContain('Dana')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MERGE-PICK + the deliberately absent personId.
// ─────────────────────────────────────────────────────────────────────────────
describe('StaffEvaluationsService — update semantics', () => {
  it('omitted keeps, explicit null clears, and personId is NEVER written', async () => {
    const { svc, staffEvaluation } = makeService({
      evaluation: {
        findFirst: vi.fn(async () =>
          evalRow({ id: 'e1', evaluatorName: 'Head of School', notes: 'keep me' }),
        ),
      },
    })
    await svc.update('school-A', 'e1', { evaluatorName: null }, 'user-1', NOW)
    const data = staffEvaluation.update.mock.calls[0][0].data
    expect(data.evaluatorName).toBeNull() // cleared
    expect(data.notes).toBe('keep me') // untouched
    expect(data.cycleLabel).toBe('2025-26 annual cycle') // untouched
    // Re-pointing an evaluation at a different person is a delete plus a create.
    expect('personId' in data).toBe(false)
    expect(data.updatedByUserId).toBe('user-1')
    expect('createdByUserId' in data).toBe(false) // provenance is never overwritten
  })

  it('an explicit null on a NOT NULL column is a 400, not a 500', async () => {
    // @IsOptional() skips validation for BOTH undefined AND null — that is what
    // makes `{"notes": null}` clear a nullable field. The same semantics let
    // `{"dueDate": null}` through the pipe, and without this guard it would reach
    // Prisma and surface as a NOT NULL violation, i.e. a 500 for a malformed
    // request. cycleLabel / dueDate / status have no null form.
    for (const field of ['cycleLabel', 'dueDate', 'status']) {
      const { svc, staffEvaluation } = makeService({
        evaluation: { findFirst: vi.fn(async () => evalRow({ id: 'e1' })) },
      })
      await expect(
        svc.update('school-A', 'e1', { [field]: null } as never, 'u', NOW),
        field,
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(staffEvaluation.update, field).not.toHaveBeenCalled()
    }
  })

  it('an explicit null on a NULLABLE column still CLEARS it', async () => {
    for (const field of ['completedDate', 'evaluatorName', 'notes']) {
      const { svc, staffEvaluation } = makeService({
        evaluation: { findFirst: vi.fn(async () => evalRow({ id: 'e1' })) },
      })
      await svc.update('school-A', 'e1', { [field]: null } as never, 'u', NOW)
      expect(staffEvaluation.update.mock.calls[0][0].data[field], field).toBeNull()
    }
  })

  it("setting completedDate makes the row stop being overdue on the very next read", async () => {
    const { svc } = makeService({
      evaluation: {
        findFirst: vi.fn(async () => evalRow({ id: 'e1' })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
          evalRow({ ...data, id: 'e1' }),
        ),
      },
    })
    const { evaluation } = await svc.update(
      'school-A',
      'e1',
      { completedDate: '2026-07-15' },
      'user-1',
      NOW,
    )
    expect(evaluation.completedDate).toBe('2026-07-15')
    expect(evaluation.isOverdue).toBe(false)
    expect(evaluation.daysOverdue).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LIST FILTERS + DETERMINISM.
// ─────────────────────────────────────────────────────────────────────────────
describe('StaffEvaluationsService — list filters and ordering', () => {
  it('status / personId / cycleLabel go to the DB where-clause', async () => {
    const { svc, staffEvaluation } = makeService({})
    await svc.list(
      'school-A',
      { status: 'scheduled', personId: 'p1', cycleLabel: '2025-26 annual cycle' },
      NOW,
    )
    expect(staffEvaluation.findMany.mock.calls[0][0]!.where).toEqual({
      schoolId: 'school-A',
      status: 'scheduled',
      personId: 'p1',
      cycleLabel: { equals: '2025-26 annual cycle', mode: 'insensitive' },
    })
  })

  it('overdue is filtered in memory, both ways', async () => {
    const rows = [
      evalRow({ id: 'late', dueDate: new Date('2026-06-30T00:00:00.000Z') }),
      evalRow({ id: 'fine', dueDate: new Date('2026-12-31T00:00:00.000Z') }),
    ]
    const on = makeService({ evaluation: { findMany: vi.fn(async () => rows) } })
    expect((await on.svc.list('school-A', { overdue: 'true' }, NOW)).evaluations.map((e) => e.id)).toEqual(['late'])
    const off = makeService({ evaluation: { findMany: vi.fn(async () => rows) } })
    expect((await off.svc.list('school-A', { overdue: 'false' }, NOW)).evaluations.map((e) => e.id)).toEqual(['fine'])
  })

  it('orders overdue first, then dueDate ascending, then id — never Postgres order', async () => {
    const { svc } = makeService({
      evaluation: {
        findMany: vi.fn(async () => [
          evalRow({ id: 'z-future', dueDate: new Date('2026-12-01T00:00:00.000Z') }),
          evalRow({ id: 'b-late', dueDate: new Date('2026-05-01T00:00:00.000Z') }),
          evalRow({ id: 'a-later', dueDate: new Date('2026-12-01T00:00:00.000Z') }),
          evalRow({ id: 'a-latest', dueDate: new Date('2026-01-01T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.list('school-A', {}, NOW)
    expect(res.evaluations.map((e) => e.id)).toEqual(['a-latest', 'b-late', 'a-later', 'z-future'])
  })

  it('the register shape carries the person, and only the register shape does', async () => {
    const { svc } = makeService({ evaluation: { findMany: vi.fn(async () => [evalRow()]) } })
    const res = await svc.list('school-A', {}, NOW)
    expect(res.evaluations[0].personName).toBe('Dana Reyes')
    expect(res.evaluations[0].personTitle).toBe('Business Manager')
    // …and the summary riding alongside it still carries none of that.
    expect(JSON.stringify(res.summary)).not.toContain('Dana')
  })
})
