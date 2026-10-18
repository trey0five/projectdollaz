import { describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { StudentsService } from './students.service.js'
import { EnrollmentService } from '../enrollment.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// StudentsService — filters/pagination (grade sorts by GRADE_KEYS index, not
// text), FERPA-safe aggregation semantics (filtered counts vs UNFILTERED kpis,
// null-demographic omission), stateless import preview (ZERO writes) + commit
// (merge idempotency, '' externalId normalization, replace swap), and the
// roster→snapshot coexistence switching (per-day upsert, SIS-always-wins).
// Prisma/Audit/EnrollmentService are hand-mocked — no DB, no Nest boot.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u1', email: 'head@school.test' } as unknown as User
const SCHOOL = 'school-A'

function studentRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: SCHOOL,
    firstName: 'Ada',
    lastName: 'Lovelace',
    grade: '3',
    gender: null,
    race: null,
    ethnicity: null,
    birthDate: null,
    status: 'enrolled',
    enrolledOn: null,
    withdrawnOn: null,
    hasIep: false,
    has504: false,
    ell: false,
    notes: null,
    externalId: null,
    createdByUserId: 'u1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(over: {
  students?: ReturnType<typeof studentRow>[]
  source?: Record<string, unknown> | null
  existingSnapshot?: Record<string, unknown> | null
} = {}) {
  const students = over.students ?? []
  let seq = 0
  type QueryArgs = { where?: Record<string, unknown>; select?: Record<string, boolean>; orderBy?: unknown; skip?: number; take?: number }
  const student = {
    findMany: vi.fn(async (_args?: QueryArgs) => students),
    findFirst: vi.fn(async (_args?: QueryArgs) => students[0] ?? null),
    count: vi.fn(async (_args?: QueryArgs) => students.length),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => studentRow({ ...data, id: `new-${++seq}` })),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => studentRow({ ...data, id: where.id })),
    delete: vi.fn(async () => studentRow()),
    deleteMany: vi.fn(async () => ({ count: students.length })),
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
  }
  const enrollmentSource = { findUnique: vi.fn(async () => over.source ?? null) }
  const enrollmentSnapshot = {
    findFirst: vi.fn(async () => over.existingSnapshot ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'snap-1', ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'snap-1', ...data })),
  }
  // Deleting a student must scrub the name off their scores and marks (see
  // student-delete-residue.spec.ts), so the double has to carry those two
  // tables — without them the service throws before it reaches the delete.
  const assessmentResult = { updateMany: vi.fn(async () => ({ count: 0 })) }
  const gradeRecord = { updateMany: vi.fn(async () => ({ count: 0 })) }
  const prisma = {
    student,
    assessmentResult,
    gradeRecord,
    enrollmentSource,
    enrollmentSnapshot,
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    ),
  }
  const audit = { write: vi.fn(async (_entry: Record<string, unknown>) => undefined) }
  const enrollment = {
    promoteRoster: vi.fn(async (_actor: unknown, _schoolId: string, _normalized: Record<string, unknown>) => ({
      fiscalPeriodId: 'fp-1',
      promoted: true,
    })),
  }
  const svc = new StudentsService(prisma as never, audit as never, enrollment as never)
  return { svc, prisma, student, assessmentResult, gradeRecord, enrollmentSource, enrollmentSnapshot, audit, enrollment }
}

// ── Delete: the name must not survive on the scores ──────────────────────────

describe('StudentsService.remove — the identity goes, the history stays', () => {
  it('clears matchName and matchExternalId off the scores in the same transaction', async () => {
    const { svc, prisma, assessmentResult, gradeRecord } = makeService({ students: [studentRow({ id: 's-1' })] })
    await svc.remove(USER, SCHOOL, 's-1')

    for (const table of [assessmentResult, gradeRecord]) {
      expect(table.updateMany).toHaveBeenCalledTimes(1)
      const call = table.updateMany.mock.calls[0] as unknown as Array<{
        where: Record<string, unknown>
        data: Record<string, unknown>
      }>
      const { where, data } = call[0]
      expect(where).toEqual({ studentId: 's-1' })
      expect(data.matchName).toBeNull()
      expect(data.matchExternalId).toBeNull()
    }
    // All-or-nothing: a scrub without the delete, or a delete without the
    // scrub, are each worse than neither.
    expect(prisma.$transaction).toHaveBeenCalled()
  })
})

// ── Register list: filters + pagination + grade sort ─────────────────────────

describe('StudentsService.list — filters + pagination', () => {
  it('builds the WHERE with q OR-names, flags OR, and ageBand unknown → birthDate null', async () => {
    const { svc, student } = makeService()
    await svc.list(SCHOOL, {
      q: 'lo',
      grade: ['K', '1'],
      status: ['enrolled'],
      flags: ['iep', 'ell'],
      ageBand: ['unknown'],
    } as never)
    const where = student.findMany.mock.calls[0]![0]!.where as Record<string, unknown>
    expect(where.schoolId).toBe(SCHOOL)
    const and = where.AND as Record<string, unknown>[]
    expect(and).toContainEqual({
      OR: [
        { firstName: { contains: 'lo', mode: 'insensitive' } },
        { lastName: { contains: 'lo', mode: 'insensitive' } },
      ],
    })
    expect(and).toContainEqual({ grade: { in: ['K', '1'] } })
    expect(and).toContainEqual({ status: { in: ['enrolled'] } })
    // Flags = OR semantics on the mapped boolean columns.
    expect(and).toContainEqual({ OR: [{ hasIep: true }, { ell: true }] })
    // unknown age band = birthDate IS NULL (or a legacy future birthDate — the
    // aggregate derivation classifies negative ages as 'unknown' too).
    expect(and).toContainEqual({
      OR: [{ OR: [{ birthDate: null }, { birthDate: { gt: expect.any(Date) } }] }],
    })
  })

  it('translates a bounded age band into a birthDate range (lte/gt)', async () => {
    const { svc, student } = makeService()
    await svc.list(SCHOOL, { ageBand: ['5to10'] } as never)
    const and = (student.findMany.mock.calls[0]![0]!.where as { AND: { OR: { birthDate: Record<string, Date> }[] }[] }).AND
    const range = and[0]!.OR[0]!.birthDate
    expect(range.lte).toBeInstanceOf(Date)
    expect(range.gt).toBeInstanceOf(Date)
    // 5to10 at asOf: born ≤ asOf−5y and > asOf−11y (6-year window).
    expect(range.lte!.getTime() - range.gt!.getTime()).toBeGreaterThan(5.9 * 365.25 * 24 * 3600 * 1000)
  })

  it('sort=grade orders PK3→12 numerically in JS (not text) and slices the page', async () => {
    const rows = ['10', '2', 'K', 'PK3', '12'].map((g, i) => studentRow({ id: `s${i}`, grade: g }))
    const { svc, student } = makeService({ students: rows })
    const res = await svc.list(SCHOOL, { sort: 'grade', page: 1, pageSize: 3 } as never)
    expect(res.items.map((i) => i.grade)).toEqual(['PK3', 'K', '2'])
    expect(res.total).toBe(5)
    expect(res.page).toBe(1)
    // The grade path fetches the whole filtered set (no skip/take in the query).
    expect(student.findMany.mock.calls[0]![0]).not.toHaveProperty('skip')
    const page2 = await svc.list(SCHOOL, { sort: 'grade', page: 2, pageSize: 3 } as never)
    expect(page2.items.map((i) => i.grade)).toEqual(['10', '12'])
  })

  it('non-grade sorts run DB-side with skip/take and a filtered count', async () => {
    const { svc, student } = makeService({ students: [studentRow()] })
    const res = await svc.list(SCHOOL, { sort: 'lastName', dir: 'desc', page: 3, pageSize: 10 } as never)
    const args = student.findMany.mock.calls[0]![0]!
    expect(args.orderBy).toEqual([{ lastName: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }])
    expect(args.skip).toBe(20)
    expect(args.take).toBe(10)
    expect(student.count).toHaveBeenCalledWith({ where: args.where })
    expect(res.pageSize).toBe(10)
  })

  it('derives age/ageBand on items and never stores them', async () => {
    const nineYearsAgo = new Date()
    nineYearsAgo.setUTCFullYear(nineYearsAgo.getUTCFullYear() - 9)
    nineYearsAgo.setUTCDate(nineYearsAgo.getUTCDate() - 1)
    const { svc } = makeService({ students: [studentRow({ birthDate: nineYearsAgo })] })
    const res = await svc.list(SCHOOL, {} as never)
    expect(res.items[0]!.age).toBe(9)
    expect(res.items[0]!.ageBand).toBe('5to10')
    const noBirth = await makeService({ students: [studentRow()] }).svc.list(SCHOOL, {} as never)
    expect(noBirth.items[0]!.age).toBeNull()
    expect(noBirth.items[0]!.ageBand).toBe('unknown')
  })
})

// ── CRUD rules + FERPA audit ─────────────────────────────────────────────────

describe('StudentsService — CRUD rules + FERPA-safe audit', () => {
  it('400s when withdrawnOn is set with a non-terminal status', async () => {
    const { svc } = makeService()
    await expect(
      svc.create(USER, SCHOOL, { firstName: 'A', lastName: 'B', grade: 'K', withdrawnOn: '2026-01-01' } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('allows withdrawnOn with status graduated', async () => {
    const { svc } = makeService()
    await expect(
      svc.create(USER, SCHOOL, {
        firstName: 'A',
        lastName: 'B',
        grade: '12',
        status: 'graduated',
        withdrawnOn: '2026-06-01',
      } as never),
    ).resolves.toMatchObject({ status: 'graduated' })
  })

  it('400s on a future birthDate (typo guard)', async () => {
    const { svc } = makeService()
    await expect(
      svc.create(USER, SCHOOL, { firstName: 'A', lastName: 'B', grade: 'K', birthDate: '2093-01-01' } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("normalizes externalId '' to null on create", async () => {
    const { svc, student } = makeService()
    await svc.create(USER, SCHOOL, { firstName: 'A', lastName: 'B', grade: 'K', externalId: '  ' } as never)
    expect(student.create.mock.calls[0]![0]!.data.externalId).toBeNull()
  })

  it('audit rows carry ids/counts ONLY — never a name', async () => {
    const { svc, audit } = makeService()
    await svc.create(USER, SCHOOL, { firstName: 'Ada', lastName: 'Lovelace', grade: 'K' } as never)
    await svc.batch(USER, SCHOOL, [{ firstName: 'Grace', lastName: 'Hopper', grade: '1' }] as never)
    for (const call of audit.write.mock.calls) {
      const entry = JSON.stringify(call[0])
      expect(entry).not.toMatch(/Ada|Lovelace|Grace|Hopper/)
    }
    expect(audit.write.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual([
      'enrollment.student.created',
      'enrollment.student.batch_created',
    ])
  })
})

// ── Aggregation semantics ────────────────────────────────────────────────────

describe('StudentsService.aggregate — FERPA-safe counts', () => {
  function makeAggService(filtered: ReturnType<typeof studentRow>[], all: ReturnType<typeof studentRow>[]) {
    const base = makeService()
    // The whole-roster query is the only one that selects enrolledOn (the kpis
    // need it); every other read — the request and its suppression bases — is
    // a filtered one.
    base.student.findMany.mockImplementation(async (args?: { select?: Record<string, boolean> }) =>
      args?.select?.enrolledOn ? all : filtered,
    )
    return base
  }

  it('counts.* are over the FILTERED set; kpis + total over the UNFILTERED roster', async () => {
    const eightYearsAgo = new Date()
    eightYearsAgo.setUTCFullYear(eightYearsAgo.getUTCFullYear() - 8)
    const filtered = [
      studentRow({ grade: 'K', gender: 'female', race: 'white', ethnicity: 'nonHispanic', birthDate: eightYearsAgo, hasIep: true }),
      studentRow({ grade: 'K', gender: null, race: null, ethnicity: null }), // not recorded → omitted
    ]
    const all = [
      ...filtered,
      studentRow({ status: 'waitlist' }),
      studentRow({ status: 'withdrawn', ell: true }),
      studentRow({ status: 'enrolled', ell: true, enrolledOn: new Date() }),
    ]
    const { svc } = makeAggService(filtered, all)
    const res = await svc.aggregate(SCHOOL, {} as never)

    expect(res.source).toBe('roster')
    expect(res.total).toBe(5)
    expect(res.filteredTotal).toBe(2)
    expect(res.counts.grade).toEqual({ K: 2 })
    // Null gender/race/ethnicity omitted from counts.
    expect(res.counts.gender).toEqual({ female: 1 })
    expect(res.counts.race).toEqual({ white: 1 })
    expect(res.counts.ethnicity).toEqual({ nonHispanic: 1 })
    expect(res.counts.ageBand['5to10']).toBe(1)
    expect(res.counts.ageBand.unknown).toBe(1)
    expect(res.counts.flags).toEqual({ iep: 1, plan504: 0, ell: 0, any: 1 })
    // KPIs are UNFILTERED: 3 enrolled, 1 waitlist; flagged counts ENROLLED flags
    // only (the withdrawn ELL student is excluded); newThisYear ≥ FY Jul 1.
    expect(res.kpis).toEqual({ enrolled: 3, waitlist: 1, flagged: 2, newThisYear: 1 })
    // The suppression basis is ALWAYS attached (the public gate fails closed
    // without it): the whole roster split by status, the request's own rows.
    expect(res.suppressionBasis?.roster.enrolled.n).toBe(3)
    expect(res.suppressionBasis?.roster.withdrawn.flags.ell).toBe(1)
    expect(res.suppressionBasis?.base.enrolled.n).toBe(2)
    expect(res.suppressionBasis?.statusSelection).toBeNull()
    // Round 5: the whole register as the no-name projection the joint tables
    // cross-tabulate (never published), and no name search on this request.
    expect(res.suppressionBasis?.rosterRows).toHaveLength(5)
    expect(Object.keys(res.suppressionBasis!.rosterRows![0]).sort()).toEqual(
      ['ageBand', 'ell', 'ethnicity', 'gender', 'grade', 'has504', 'hasIep', 'race', 'status'].sort(),
    )
    expect(res.suppressionBasis?.nameSearch).toBe(false)
  })

  it('a name search is flagged on the basis (the gate withholds every figure that follows a name)', async () => {
    const { svc } = makeAggService([studentRow()], [studentRow(), studentRow()])
    const res = await svc.aggregate(SCHOOL, { q: 'smi' } as never)
    expect(res.suppressionBasis?.nameSearch).toBe(true)
    const blank = await svc.aggregate(SCHOOL, { q: '   ' } as never)
    expect(blank.suppressionBasis?.nameSearch).toBe(false)
  })

  it('a filtered request fetches its bases with the SAME where-builder: minus status, minus each filter, minus each extra value', async () => {
    const { svc, student } = makeAggService([studentRow()], [studentRow()]) as unknown as {
      svc: StudentsService
      student: { findMany: { mock: { calls: [{ where: Record<string, unknown> }][] } } }
    }
    await svc.aggregate(SCHOOL, { status: ['enrolled'], race: ['white', 'black'], flags: ['iep'] } as never)
    const wheres = student.findMany.mock.calls.map((c) => JSON.stringify(c[0].where))
    // request, roster, minus-status, minus-race, minus-flags, race−white, race−black
    expect(wheres).toHaveLength(7)
    expect(wheres.filter((w) => w.includes('"status"'))).toHaveLength(1) // only the request keeps status
    expect(wheres.some((w) => w.includes('"black"') && !w.includes('"white"'))).toBe(true)
    expect(wheres.some((w) => w.includes('"white"') && !w.includes('"black"'))).toBe(true)
  })

  it('never returns a name field anywhere in the payload', async () => {
    const { svc } = makeAggService([studentRow()], [studentRow()])
    const res = await svc.aggregate(SCHOOL, {} as never)
    expect(JSON.stringify(res)).not.toMatch(/firstName|lastName|Ada|Lovelace/)
  })
})

// ── Import preview (stateless) + commit ──────────────────────────────────────

describe('StudentsService import — stateless preview, transactional commit', () => {
  const csv = (rows: string[]): { buffer: Buffer; size: number } => {
    const buffer = Buffer.from(rows.join('\n'), 'utf8')
    return { buffer, size: buffer.length }
  }

  it('preview matches by externalId (update/unchanged), name+birthDate fallback, and NEVER writes', async () => {
    const existing = [
      studentRow({ id: 'e1', firstName: 'Ada', lastName: 'Lovelace', grade: '3', externalId: 'S-1' }),
      studentRow({ id: 'e2', firstName: 'Grace', lastName: 'Hopper', grade: '5', externalId: null }),
    ]
    const { svc, student } = makeService({ students: existing })
    const res = await svc.importPreview(
      SCHOOL,
      csv([
        'firstName,lastName,grade,externalId',
        'Ada,Lovelace,4,S-1', // externalId match, grade changed → update
        'Grace,Hopper,5,', // (lastName, firstName, birthDate) match, identical → unchanged
        'New,Kid,1,S-9', // no match → new
        'Bad,Grade,Kinder,', // unmapped grade → skipped
      ]),
    )
    expect(res.shape).toBe('simple')
    expect(res.summary).toEqual({ new: 1, update: 1, unchanged: 1, skipped: 1 })
    const actions = Object.fromEntries(res.rows.map((r) => [`${r.student.firstName}`, r]))
    expect(actions['Ada']!.action).toBe('update')
    expect(actions['Ada']!.existingId).toBe('e1')
    expect(actions['Grace']!.action).toBe('unchanged')
    expect(actions['Grace']!.existingId).toBe('e2')
    expect(actions['New']!.action).toBe('new')
    expect(actions['Bad']!.action).toBe('skipped')
    // ZERO DB writes on preview.
    expect(student.create).not.toHaveBeenCalled()
    expect(student.update).not.toHaveBeenCalled()
    expect(student.deleteMany).not.toHaveBeenCalled()
  })

  it('commit merge upserts by externalId (idempotent re-import) and creates the rest', async () => {
    const existing = [studentRow({ id: 'e1', externalId: 'S-1' })]
    const { svc, student } = makeService({ students: existing })
    student.findMany.mockResolvedValueOnce(existing) // the externalId prefetch
    const res = await svc.importCommit(USER, SCHOOL, 'merge', [
      { firstName: 'Ada', lastName: 'Lovelace', grade: '4', externalId: 'S-1' },
      { firstName: 'New', lastName: 'Kid', grade: '1', externalId: 'S-9' },
      { firstName: 'No', lastName: 'Ext', grade: '2', externalId: '' },
    ] as never)
    expect(res.created).toBe(2)
    expect(res.updated).toBe(1)
    expect(res.deleted).toBe(0)
    expect(student.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1' } }))
    // '' externalId is normalized to null (unique-index gotcha).
    const createdNoExt = student.create.mock.calls.find(
      (c) => (c[0]!.data as { firstName: string }).firstName === 'No',
    )!
    expect((createdNoExt[0]!.data as { externalId: unknown }).externalId).toBeNull()
  })

  it('commit merge matches rows WITHOUT externalId by (lastName, firstName, birthDate) — no duplicates on re-import', async () => {
    const existing = [
      studentRow({ id: 'e1', firstName: 'Ada', lastName: 'Lovelace', grade: '3', externalId: null, birthDate: new Date('2017-04-02') }),
      studentRow({ id: 'e2', firstName: 'Grace', lastName: 'Hopper', grade: '5', externalId: null }),
    ]
    const { svc, student } = makeService({ students: existing })
    student.findMany.mockResolvedValueOnce(existing) // the match prefetch
    const res = await svc.importCommit(USER, SCHOOL, 'merge', [
      { firstName: 'ada', lastName: 'LOVELACE', grade: '4', birthDate: '2017-04-02' }, // case-insensitive fallback → update
      { firstName: 'Grace', lastName: 'Hopper', grade: '5' }, // fallback with null birthDate → update
      { firstName: 'New', lastName: 'Kid', grade: '1' }, // no match → create
    ] as never)
    expect(res.updated).toBe(2)
    expect(res.created).toBe(1)
    expect(student.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1' } }))
    expect(student.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e2' } }))
  })

  it('commit replace deletes the whole roster then inserts, all in one transaction', async () => {
    const { svc, prisma, student } = makeService({ students: [studentRow(), studentRow({ id: 's2' })] })
    student.count.mockResolvedValue(1)
    const res = await svc.importCommit(USER, SCHOOL, 'replace', [
      { firstName: 'Only', lastName: 'Kid', grade: 'K' },
    ] as never)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(student.deleteMany).toHaveBeenCalledWith({ where: { schoolId: SCHOOL } })
    expect(student.createMany).toHaveBeenCalled()
    expect(res).toMatchObject({ created: 1, deleted: 2, updated: 0 })
  })

  it('400s on a duplicate externalId inside the payload', async () => {
    const { svc } = makeService()
    await expect(
      svc.importCommit(USER, SCHOOL, 'merge', [
        { firstName: 'A', lastName: 'B', grade: 'K', externalId: 'DUP' },
        { firstName: 'C', lastName: 'D', grade: '1', externalId: 'DUP' },
      ] as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

// ── Roster→snapshot coexistence (auto-sync + switching) ──────────────────────

describe('StudentsService.syncRosterSnapshot — per-day upsert + SIS-always-wins', () => {
  it('does nothing when an SIS source exists (sis mode)', async () => {
    const { svc, enrollment, enrollmentSnapshot } = makeService({
      students: [studentRow()],
      source: { id: 'src-1', provider: 'blackbaud' },
    })
    await svc.syncRosterSnapshot(USER, SCHOOL)
    expect(enrollment.promoteRoster).not.toHaveBeenCalled()
    expect(enrollmentSnapshot.create).not.toHaveBeenCalled()
    expect(enrollmentSnapshot.update).not.toHaveBeenCalled()
  })

  it('does nothing when the roster is empty (snapshot history stays)', async () => {
    const { svc, enrollment, enrollmentSnapshot } = makeService({ students: [] })
    await svc.syncRosterSnapshot(USER, SCHOOL)
    expect(enrollment.promoteRoster).not.toHaveBeenCalled()
    expect(enrollmentSnapshot.create).not.toHaveBeenCalled()
  })

  it('zeroes out a same-day roster snapshot when the LAST student is deleted (no phantom headcount)', async () => {
    const { svc, enrollment, enrollmentSnapshot } = makeService({
      students: [],
      existingSnapshot: { id: 'snap-today', provider: 'roster' },
    })
    await svc.syncRosterSnapshot(USER, SCHOOL)
    const normalized = enrollment.promoteRoster.mock.calls[0]![2] as { totalEnrolled: number; byGrade: object }
    expect(normalized.totalEnrolled).toBe(0)
    expect(normalized.byGrade).toEqual({})
    expect(enrollmentSnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalEnrolled: 0 }) }),
    )
    expect(enrollmentSnapshot.create).not.toHaveBeenCalled()
  })

  it('creates ONE provider:roster snapshot for today (enrolled-only counts) and promotes', async () => {
    const { svc, enrollment, enrollmentSnapshot } = makeService({
      students: [
        studentRow({ grade: 'K', status: 'enrolled' }),
        studentRow({ id: 's2', grade: 'K', status: 'enrolled', gender: 'female' }),
        studentRow({ id: 's3', grade: '1', status: 'waitlist' }),
      ],
    })
    await svc.syncRosterSnapshot(USER, SCHOOL)
    const normalized = enrollment.promoteRoster.mock.calls[0]![2] as {
      provider: string
      totalEnrolled: number
      byGrade: Record<string, number>
      byStatus: Record<string, number>
    }
    expect(normalized.provider).toBe('roster')
    expect(normalized.totalEnrolled).toBe(2) // waitlist excluded
    expect(normalized.byGrade).toEqual({ K: 2 })
    expect(normalized.byStatus).toEqual({ enrolled: 2, waitlist: 1, withdrawn: 0, graduated: 0 })
    // findFirst keyed by provider (NOT a Prisma upsert — NULL sourceId is distinct in PG).
    expect(enrollmentSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ provider: 'roster' }) }),
    )
    const created = enrollmentSnapshot.create.mock.calls[0]![0]!.data as Record<string, unknown>
    expect(created.provider).toBe('roster')
    expect(created.sourceId).toBeNull()
    expect(created.fiscalPeriodId).toBe('fp-1')
    expect(JSON.stringify(created)).not.toMatch(/Ada|Lovelace/) // aggregate only, no names
  })

  it('updates (not duplicates) the same-day roster snapshot on a second mutation', async () => {
    const { svc, enrollmentSnapshot } = makeService({
      students: [studentRow()],
      existingSnapshot: { id: 'snap-today', provider: 'roster' },
    })
    await svc.syncRosterSnapshot(USER, SCHOOL)
    expect(enrollmentSnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'snap-today' } }),
    )
    expect(enrollmentSnapshot.create).not.toHaveBeenCalled()
  })

  it('promote-snapshot backfills a dated snapshot and audits counts only', async () => {
    const { svc, audit, enrollmentSnapshot } = makeService({ students: [studentRow()] })
    const res = await svc.promoteSnapshot(USER, SCHOOL, '2026-05-01')
    expect(res).toEqual({ promoted: true, observedOn: '2026-05-01', totalEnrolled: 1 })
    expect((enrollmentSnapshot.create.mock.calls[0]![0]!.data as { observedOn: Date }).observedOn).toEqual(
      new Date('2026-05-01'),
    )
    const entry = audit.write.mock.calls.find(
      (c) => (c[0] as { action: string }).action === 'enrollment.roster.promoted',
    )!
    expect(JSON.stringify(entry[0])).not.toMatch(/Ada|Lovelace/)
  })

  it('promote-snapshot 400s in sis mode and on an empty roster', async () => {
    const sis = makeService({ students: [studentRow()], source: { id: 'src-1' } })
    await expect(sis.svc.promoteSnapshot(USER, SCHOOL)).rejects.toBeInstanceOf(BadRequestException)
    const empty = makeService({ students: [] })
    await expect(empty.svc.promoteSnapshot(USER, SCHOOL)).rejects.toBeInstanceOf(BadRequestException)
  })
})

// ── EnrollmentService coexistence switching (status/summary/demographics) ────

function makeEnrollmentService(over: {
  students?: ReturnType<typeof studentRow>[]
  source?: Record<string, unknown> | null
  snapshot?: Record<string, unknown> | null
  op?: Record<string, unknown> | null
} = {}) {
  const students = over.students ?? []
  const prisma = {
    student: {
      count: vi.fn(async () => students.length),
      findMany: vi.fn(async () => students),
    },
    enrollmentSource: { findUnique: vi.fn(async () => over.source ?? null) },
    enrollmentSnapshot: {
      findFirst: vi.fn(async () => over.snapshot ?? null),
    },
    periodOperationalData: { findUnique: vi.fn(async () => over.op ?? null) },
    periodBudget: { findUnique: vi.fn(async () => null) },
  }
  const periods = {
    resolveForImport: vi.fn(async () => ({ period: { id: 'fp-1' }, created: false })),
    resolveExistingForImport: vi.fn(async () => ({ id: 'fp-1' })),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const client = { isConfigured: () => false }
  const svc = new EnrollmentService(
    prisma as never,
    {} as never,
    client as never,
    periods as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { svc, prisma, periods }
}

describe('EnrollmentService — rosterMode + live-roster switching', () => {
  it('status: sis when a source exists (even with students); roster when students only; none otherwise', async () => {
    const sis = makeEnrollmentService({ students: [studentRow()], source: { id: 'src-1', provider: 'blackbaud', environment: 'sandbox', lastSyncedAt: null } })
    expect((await sis.svc.status(SCHOOL)).rosterMode).toBe('sis')
    const roster = makeEnrollmentService({ students: [studentRow()] })
    const rs = await roster.svc.status(SCHOOL)
    expect(rs.rosterMode).toBe('roster')
    expect(rs.studentCount).toBe(1)
    const none = makeEnrollmentService()
    expect((await none.svc.status(SCHOOL)).rosterMode).toBe('none')
  })

  it('summary: roster mode computes live enrolled-only numbers + vsPlan via the existing plan path', async () => {
    const { svc } = makeEnrollmentService({
      students: [
        studentRow({ grade: 'K', status: 'enrolled' }),
        studentRow({ id: 's2', grade: '1', status: 'enrolled' }),
        studentRow({ id: 's3', grade: '1', status: 'withdrawn' }),
      ],
      op: {
        plannedEnrollmentByGrade: { K: 2, '1': 2 },
        enrollmentSupersededAt: null,
        enrollmentSupersededManual: null,
        enrollmentSupersededManualFte: null,
      },
    })
    const res = await svc.summary(SCHOOL)
    expect(res.source).toBe('roster')
    expect(res.provider).toBe('roster')
    expect(res.latest!.totalEnrolled).toBe(2) // withdrawn excluded
    expect(res.latest!.byGrade).toEqual({ K: 1, '1': 1 })
    expect(res.vsPlan).toEqual({ planTotal: 4, gap: -2, gapPct: -0.5 })
  })

  it('summary/demographics: a HISTORICAL periodId falls through to the snapshot branch (live roster answers only current-FY/unscoped)', async () => {
    const { svc, prisma } = makeEnrollmentService({
      students: [studentRow({ grade: 'K', status: 'enrolled' })],
      snapshot: {
        id: 'snap-old',
        observedOn: new Date('2025-10-01'),
        totalEnrolled: 180,
        byGrade: { K: 180 },
        byDemographics: {},
        provider: 'roster',
        fiscalPeriodId: 'fp-old',
      },
    })
    // Historical period (≠ the mocked current 'fp-1') → snapshot branch.
    const res = await svc.summary(SCHOOL, 'fp-old')
    expect(res.source).toBe('snapshot')
    expect(res.latest!.totalEnrolled).toBe(180)
    expect(prisma.student.findMany).not.toHaveBeenCalled()
    const demo = await svc.demographics(SCHOOL, 'fp-old')
    expect(demo!.source).toBe('snapshot')
    // The CURRENT period id still takes the live-roster path.
    const current = await svc.summary(SCHOOL, 'fp-1')
    expect(current.source).toBe('roster')
    expect(current.latest!.totalEnrolled).toBe(1)
  })

  it('summary: an SIS-connected school stays on the snapshot branch (source: snapshot)', async () => {
    const { svc, prisma } = makeEnrollmentService({
      students: [studentRow()], // students exist but the SIS wins
      source: { id: 'src-1', provider: 'blackbaud' },
      snapshot: {
        id: 'snap-1',
        observedOn: new Date('2026-03-01'),
        totalEnrolled: 300,
        byGrade: { K: 300 },
        provider: 'blackbaud',
        fiscalPeriodId: null,
      },
    })
    const res = await svc.summary(SCHOOL)
    expect(res.source).toBe('snapshot')
    expect(res.latest!.totalEnrolled).toBe(300)
    // The roster branch never queried students in sis mode.
    expect(prisma.student.findMany).not.toHaveBeenCalled()
  })

  it('★ demographics: an SIS-connected school WITH a roster counts the roster — one population with students/aggregate (privacy review round 6)', async () => {
    // The headcount stays the SIS snapshot (summary(), above). Demographics do
    // not: the roster aggregate publishes the Student rows' race/gender beside
    // them, and a snapshot that differs by a few students hands a small cell
    // back by subtraction.
    const { svc } = makeEnrollmentService({
      students: [
        studentRow({ gender: 'female', race: 'white' }),
        studentRow({ id: 's2', gender: 'male', race: 'asian' }),
      ],
      source: { id: 'src-1', provider: 'blackbaud' },
      snapshot: {
        id: 'snap-1',
        observedOn: new Date('2026-03-01'),
        totalEnrolled: 300,
        byGrade: { K: 300 },
        byDemographics: { race: { white: 297, asian: 3 } },
        provider: 'blackbaud',
        fiscalPeriodId: null,
      },
    })
    const demo = await svc.demographics(SCHOOL)
    expect(demo!.source).toBe('roster')
    expect(demo!.totalEnrolled).toBe(2)
    expect(demo!.race!.counts).toEqual({ white: 1, asian: 1 })
    expect((await svc.summary(SCHOOL)).source).toBe('snapshot')
  })

  it('demographics: roster mode returns canonical counts+shares over enrolled students', async () => {
    const { svc } = makeEnrollmentService({
      students: [
        studentRow({ gender: 'female', race: 'white', ethnicity: 'nonHispanic' }),
        studentRow({ id: 's2', gender: 'male', race: 'black' }),
        studentRow({ id: 's3', gender: 'female', status: 'withdrawn' }), // excluded
      ],
    })
    const res = await svc.demographics(SCHOOL)
    expect(res!.source).toBe('roster')
    expect(res!.provider).toBe('roster')
    expect(res!.totalEnrolled).toBe(2)
    expect(res!.gender!.counts).toEqual({ female: 1, male: 1 })
    expect(res!.gender!.shares.female).toBeCloseTo(0.5)
    expect(res!.race!.counts).toEqual({ white: 1, black: 1 })
    expect(res!.race!.diversityIndex).toBeCloseTo(0.5)
    // Ethnicity recorded on only one student → counts just that one.
    expect(res!.ethnicity!.counts).toEqual({ nonHispanic: 1 })
    expect(JSON.stringify(res)).not.toMatch(/Ada|Lovelace/)
  })

  it('demographics: null (no snapshot) for a school with neither SIS data nor students', async () => {
    const { svc } = makeEnrollmentService()
    expect(await svc.demographics(SCHOOL)).toBeNull()
  })
})
