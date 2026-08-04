// ─────────────────────────────────────────────────────────────────────────────
// RosterUploadService — one upload creates the RECORDS and promotes the COUNT.
//
// The RED proof this replaces, run against the shipped EnrollmentService.upload
// with a three-student users.csv: `expected +0 to be 3` — three named students
// parsed, zero written. That is the production bug, reproduced at the unit level.
//
// WHAT IS MOCKED, AND WHY IT IS ONLY PRISMA. §7.2 allows hand-mocking the two
// neighbouring services, but the acceptance that matters here — "exactly ONE
// promote per upload" — is a claim about how EnrollmentService and StudentsService
// COMPOSE. Stub them both and the spec asserts that the orchestrator called the
// mocks it was told to call, which is a restatement of the code. So the real
// services are constructed over ONE in-memory prisma double, and the assertions
// are made where the truth is: the periodOperationalData.upsert payload. No
// @nestjs/testing, no design:paramtypes wiring assertion (esbuild does not emit
// decorator metadata under vitest, so such a spec checks nothing).
// ─────────────────────────────────────────────────────────────────────────────
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { EnrollmentService } from './enrollment.service.js'
import { StudentsService } from './students/students.service.js'
import { RosterUploadService } from './roster-upload.service.js'
import { EnrollmentController } from './enrollment.controller.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { STUDENT_IMPORT_MAX_ROWS } from './students/students.dto.js'

const USER = { id: 'u1', email: 'head@school.test' } as unknown as User
const SCHOOL = 'school-A'

// ── The upload: a real users.csv, parsed by the real parsers ─────────────────

interface CsvRow {
  id: string
  first: string
  last: string
  grade: string
  status?: string
  /** OneRoster's "can this account sign in" flag — NOT an enrollment fact. */
  enabled?: string
}

function usersCsv(rows: CsvRow[], header?: string): Buffer {
  const head = header ?? 'sourcedId,status,enabledUser,orgSourcedIds,role,username,givenName,familyName,grades'
  const body = rows.map(
    (r) =>
      `${r.id},${r.status ?? 'active'},${r.enabled ?? 'true'},org-1,student,${r.id},${r.first},${r.last},${r.grade}`,
  )
  return Buffer.from([head, ...body].join('\n'), 'utf8')
}

/** N students spread over three known grades — the 436-row shape, in miniature. */
function roster(n: number): CsvRow[] {
  const grades = ['03', '05', 'KG']
  return Array.from({ length: n }, (_, i) => ({
    id: `or-${i + 1}`,
    first: `First${i + 1}`,
    last: `Last${i + 1}`,
    grade: grades[i % grades.length]!,
  }))
}

function file(buf: Buffer) {
  return { buffer: buf, originalname: 'users.csv', mimetype: 'text/csv', size: buf.length }
}

// ── The harness: one in-memory prisma, the two real services on top ──────────

function makeHarness(opts: { source?: Record<string, unknown> | null; op?: Record<string, unknown> | null } = {}) {
  let seq = 0
  const rows: Record<string, unknown>[] = []
  let opRow: Record<string, unknown> | null = opts.op ? { id: 'op-1', ...opts.op } : null

  // Typed as the loose Prisma-ish shape the assertions read back (where + create +
  // update), so a payload assertion never needs a double cast to be expressible.
  const opUpsert = vi.fn(
    async (args: {
      where: { schoolId_fiscalPeriodId: { schoolId: string; fiscalPeriodId: string } }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => {
      opRow = opRow ? { ...opRow, ...args.update } : { id: 'op-1', ...args.create }
      return opRow
    },
  )

  const student = {
    findMany: vi.fn(async () => rows.map((r) => ({ ...r }))),
    findFirst: vi.fn(async ({ where }: { where: { id?: string } }) =>
      rows.find((r) => r.id === where.id) ?? null,
    ),
    count: vi.fn(async () => rows.length),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const stamp = new Date('2026-01-01T00:00:00.000Z')
      const row = { id: `s-${++seq}`, createdAt: stamp, updatedAt: stamp, ...data }
      rows.push(row)
      return row
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === where.id)!
      Object.assign(row, data)
      return row
    }),
    delete: vi.fn(async () => rows[0]!),
    deleteMany: vi.fn(async () => {
      const n = rows.length
      rows.length = 0
      return { count: n }
    }),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const d of data) rows.push({ id: `s-${++seq}`, ...d })
      return { count: data.length }
    }),
  }

  const snapshots: Record<string, unknown>[] = []
  const prisma = {
    student,
    fiscalPeriod: {
      // The period label the panel names. Derived from the id the periods stub
      // minted (fp-2026-06-30 → FY2026) so a promote into the WRONG year shows up
      // as the wrong label rather than as a matching pair of opaque ids.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        label: `FY${where.id.slice(3, 7)}`,
      })),
    },
    enrollmentSource: { findUnique: vi.fn(async () => opts.source ?? null) },
    enrollmentSnapshot: {
      // sourceId is honoured as IS NULL, and `provider` as an equality filter,
      // because that is what real Prisma emits — the snapshot-clobber bug was
      // invisible to a double that ignored either one.
      findFirst: vi.fn(
        async ({ where }: { where: { provider?: string; sourceId?: unknown; observedOn?: Date } }) =>
          snapshots.find(
            (s) =>
              (where.provider === undefined || s.provider === where.provider) &&
              (where.sourceId === undefined || (s.sourceId ?? null) === (where.sourceId ?? null)) &&
              (where.observedOn === undefined ||
                (s.observedOn as Date).getTime() === where.observedOn.getTime()),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const snap = { id: `snap-${snapshots.length + 1}`, ...data }
        snapshots.push(snap)
        return snap
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const snap = snapshots.find((s) => s.id === where.id)!
        Object.assign(snap, data)
        return snap
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    periodOperationalData: {
      findUnique: vi.fn(async () => opRow),
      upsert: opUpsert,
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        opRow = { ...(opRow ?? {}), ...data }
        return opRow
      }),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    ),
  }

  // Period ids are DERIVED FROM THE FY END so a promote that lands in the wrong
  // fiscal year is visible rather than collapsing onto one shared id.
  const periods = {
    resolveForImport: vi.fn(async (_s: string, fyEnd: string) => ({ period: { id: `fp-${fyEnd}` }, created: false })),
    resolveExistingForImport: vi.fn(async (_s: string, fyEnd: string) => ({ id: `fp-${fyEnd}` })),
  }
  const audit = { write: vi.fn(async () => undefined) }

  const enrollment = new EnrollmentService(
    prisma as never,
    {} as never,
    {} as never,
    periods as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  const students = new StudentsService(prisma as never, audit as never, enrollment)
  const svc = new RosterUploadService(prisma as never, enrollment, students)

  return { svc, prisma, student, opUpsert, audit, rows, snapshots, op: () => opRow }
}

// ── Acceptance 1 ─────────────────────────────────────────────────────────────

describe('acceptance 1 — N students become N records AND enrollment = N', () => {
  it('writes every student row and promotes the headcount from ONE upload', async () => {
    const { svc, rows, opUpsert } = makeHarness()
    const res = await svc.upload(USER, SCHOOL, file(usersCsv(roster(9))))

    expect(res.records).toEqual({ created: 9, updated: 0, deleted: 0, total: 9 })
    expect(rows).toHaveLength(9)
    expect(res.enrollment).toEqual({
      value: 9,
      source: 'roster',
      fiscalPeriodId: expect.stringMatching(/^fp-/),
      // The period is NAMED. "This period's enrollment is now 9" reads as a claim
      // about the period on the user's screen, which a file-dated promote need
      // not be.
      periodLabel: expect.stringMatching(/^FY\d{4}$/),
      // Does the year we wrote into hold a ledger? It answers the question behind
      // the bug report — "did this change my numbers" — which is NOT the same as
      // "which year is on my screen": the as-of date defaults to today and the
      // fiscal year runs Jul-Jun, so an August upload lands in the NEXT year,
      // which routinely has no trial balance.
      //
      // `true` HERE IS THE FAIL-OPEN PATH, and that is deliberate: this harness's
      // prisma stub has no statementSnapshot, the lookup throws, and the service
      // returns true. An unreadable check must never manufacture the alarming
      // "no finance metric changed" sentence for a school whose numbers did move.
      periodHasFinancials: true,
    })
    expect(res.promoted).toBe(true)
    // The number reported IS the number stored.
    expect(opUpsert.mock.calls.at(-1)![0].create.enrollment).toBe(9)
    expect(res.snapshot.totalEnrolled).toBe(9)
  })

  it('keeps the sourcedId as the externalId so the file can be re-uploaded', async () => {
    const { svc, rows } = makeHarness()
    await svc.upload(USER, SCHOOL, file(usersCsv(roster(3))))
    expect(rows.map((r) => r.externalId)).toEqual(['or-1', 'or-2', 'or-3'])
  })
})

// ── One writer ───────────────────────────────────────────────────────────────

describe('exactly ONE promote per upload', () => {
  it('suppresses the file promote when the roster owns it — one upsert, not two', async () => {
    const { svc, opUpsert } = makeHarness()
    const spy = vi.spyOn(EnrollmentService.prototype, 'intakeNormalized')
    await svc.upload(USER, SCHOOL, file(usersCsv(roster(4))))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![3]).toMatchObject({ promote: false, supersedeManual: true })
    // The whole flow touches periodOperationalData exactly once.
    expect(opUpsert).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('an SIS-connected school keeps the FILE as the writer (today’s behaviour)', async () => {
    const { svc, opUpsert, rows } = makeHarness({ source: { id: 'src-1', provider: 'blackbaud' } })
    const res = await svc.upload(USER, SCHOOL, file(usersCsv(roster(5))))

    // Records are still created; the SIS just keeps ownership of the headcount.
    expect(rows).toHaveLength(5)
    expect(res.enrollment).toMatchObject({ value: 5, source: 'file' })
    expect(opUpsert).toHaveBeenCalledTimes(1)
    expect(opUpsert.mock.calls[0]![0].create.enrollmentSourceProvider).toBe('oneroster_csv')
  })

  it('promotes into the FY period the FILE is dated to, not the FY of today', async () => {
    // A June file uploaded in August must count toward the year it describes.
    // Both writers resolve the period from the same observedOn or they disagree.
    const { svc, opUpsert } = makeHarness()
    const res = await svc.upload(USER, SCHOOL, file(usersCsv(roster(3))), { observedOn: '2026-06-15' })
    expect(res.enrollment!.fiscalPeriodId).toBe('fp-2026-06-30')
    expect(opUpsert.mock.calls[0]![0].where.schoolId_fiscalPeriodId.fiscalPeriodId).toBe('fp-2026-06-30')
  })
})

// ── Acceptance 3 — idempotency ───────────────────────────────────────────────

describe('acceptance 3 — re-uploading the same file changes nothing', () => {
  it('creates no duplicates and does not double-count the enrollment', async () => {
    const { svc, student, rows, opUpsert } = makeHarness()
    const buf = usersCsv(roster(6))

    const first = await svc.upload(USER, SCHOOL, file(buf))
    expect(first.records).toMatchObject({ created: 6, updated: 0 })
    const createdAfterFirst = student.create.mock.calls.length

    const second = await svc.upload(USER, SCHOOL, file(buf))
    expect(second.records).toMatchObject({ created: 0, updated: 6, total: 6 })
    expect(rows).toHaveLength(6)
    // Not one further create — every row matched on its sourcedId.
    expect(student.create.mock.calls.length).toBe(createdAfterFirst)
    // The promote RECOMPUTES a total; nothing increments.
    expect(second.enrollment!.value).toBe(6)
    expect(first.enrollment!.value).toBe(6)
    expect(opUpsert).toHaveBeenCalledTimes(2)
  })
})

// ── Acceptance 4 — a counts-only file still works exactly as before ──────────

describe('acceptance 4 — a file with no per-student detail', () => {
  const COUNTS_ONLY = Buffer.from(
    ['sourcedId,status,role,grades', 's1,active,student,03', 's2,active,student,05', 's3,active,student,KG'].join('\n'),
    'utf8',
  )

  it('counts and promotes, creates no records, and does not error', async () => {
    const { svc, student, opUpsert } = makeHarness()
    const res = await svc.upload(USER, SCHOOL, file(COUNTS_ONLY))

    expect(res.records).toBeNull()
    expect(student.create).not.toHaveBeenCalled()
    expect(student.createMany).not.toHaveBeenCalled()
    expect(res.promoted).toBe(true)
    expect(res.snapshot.totalEnrolled).toBe(3)
    expect(res.enrollment).toMatchObject({ value: 3, source: 'file' })
    expect(opUpsert).toHaveBeenCalledTimes(1)
  })

  it('still fails loudly on a structurally unusable file, with today’s message', async () => {
    const { svc } = makeHarness()
    await expect(svc.upload(USER, SCHOOL, file(Buffer.from('sourcedId,role\ns1,student\n')))).rejects.toThrow(
      /missing required column/i,
    )
    await expect(svc.upload(USER, SCHOOL, undefined)).rejects.toThrow(BadRequestException)
  })
})

// ── Decision 2 — supersede a hand-entered figure, reversibly and out loud ────

describe('decision 2 — an explicit upload supersedes a hand-entered enrollment', () => {
  it('backs the manual value up, reports it, and does NOT re-back-up on a repeat', async () => {
    // A head of school typed 430 in September (no source stamp = hand-entered).
    const { svc, opUpsert, op } = makeHarness({ op: { enrollment: 430, enrollmentFte: 425, enrollmentSourceProvider: null } })
    const buf = usersCsv(roster(9))

    const res = await svc.upload(USER, SCHOOL, file(buf))
    expect(res.superseded).toBe(true)
    expect(res.supersededManual).toBe(430)
    expect(res.enrollment!.value).toBe(9)

    const firstUpdate = opUpsert.mock.calls[0]![0].update
    expect(firstUpdate.enrollmentSupersededManual).toBe(430)
    expect(firstUpdate.enrollmentSupersededManualFte).toBe(425)
    expect(firstUpdate.enrollmentSupersededAt).toBeInstanceOf(Date)
    expect(op()!.enrollment).toBe(9)

    // A second upload must NOT overwrite the backup with the now-superseded 9 —
    // that would make "Restore my number" restore the import instead.
    await svc.upload(USER, SCHOOL, file(buf))
    const secondUpdate = opUpsert.mock.calls[1]![0].update
    expect(secondUpdate).not.toHaveProperty('enrollmentSupersededManual')
    expect(op()!.enrollmentSupersededManual).toBe(430)
  })

  it('the BACKGROUND sync after a single student edit still refuses to supersede', async () => {
    // The blast radius of Decision 2 is one call site. Editing one student's grade
    // must never touch a head of school's own number.
    const { svc, op } = makeHarness({ op: { enrollment: 430, enrollmentSourceProvider: null } })
    const students = new StudentsService(
      (svc as unknown as { prisma: unknown }).prisma as never,
      { write: vi.fn(async () => undefined) } as never,
      (svc as unknown as { enrollment: EnrollmentService }).enrollment,
    )
    await students.create(USER, SCHOOL, { firstName: 'Ada', lastName: 'Lovelace', grade: '3' } as never)
    expect(op()!.enrollment).toBe(430)
    expect(op()!.enrollmentSupersededAt ?? null).toBeNull()
  })

  it('reports superseded:false and a plain promotion when nothing was hand-entered', async () => {
    const { svc } = makeHarness()
    const res = await svc.upload(USER, SCHOOL, file(usersCsv(roster(3))))
    expect(res.superseded).toBe(false)
    expect(res.supersededManual).toBeNull()
    expect(res.promoted).toBe(true)
  })
})

// ── A file that counts NOBODY is not the number zero ─────────────────────────

describe('a zero headcount is "this file says nothing", never enrollment = 0', () => {
  // `0` is a LEGITIMATE value to the metric layer (types.ts: null = not entered),
  // so promoting one is not a gap — it is a confident, wrong number. With the
  // other operational inputs present it makes enrollment_change_yoy a -100%,
  // student_teacher_ratio a 0, and blanks the four per-pupil metrics. Every route
  // to a zero here is a file we could not read, so every route must leave the
  // period alone and say so.
  const HEADER_ONLY = Buffer.from(
    'sourcedId,status,enabledUser,orgSourcedIds,role,username,givenName,familyName,grades\n',
    'utf8',
  )

  it('a header-only file leaves a hand-entered 436 exactly where it was', async () => {
    const { svc, opUpsert, op } = makeHarness({ op: { enrollment: 436, enrollmentSourceProvider: null } })
    const res = await svc.upload(USER, SCHOOL, file(HEADER_ONLY))

    expect(op()!.enrollment).toBe(436)
    expect(op()!.enrollmentSourceProvider).toBeNull()
    expect(op()!.enrollmentSupersededManual ?? null).toBeNull()
    expect(opUpsert, 'period_operational_data must not be touched at all').not.toHaveBeenCalled()
    expect(res.promoted).toBe(false)
    expect(res.superseded).toBe(false)
    expect(res.enrollment).toBeNull()
    // …and it says so, in the slot the panel renders for a refusal.
    expect(res.reason).toMatch(/no students in this file were counted/i)
  })

  it('grade codes outside the map (US/MS) do not zero the period either', async () => {
    const { svc, opUpsert, op } = makeHarness({ op: { enrollment: 436, enrollmentSourceProvider: null } })
    const res = await svc.upload(
      USER,
      SCHOOL,
      file(
        usersCsv([
          { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: 'US' },
          { id: 'or-2', first: 'Alan', last: 'Turing', grade: 'MS' },
        ]),
      ),
    )
    expect(res.snapshot.totalEnrolled).toBe(0)
    expect(op()!.enrollment).toBe(436)
    expect(opUpsert).not.toHaveBeenCalled()
    expect(res.promoted).toBe(false)
    // The file itself IS saved — the by-grade chart and the audit row still land.
    expect(res.warnings.some((w) => /unrecognized grade code/i.test(w))).toBe(true)
  })

  it('a file of nothing but tobedeleted rows keeps the records but not the zero', async () => {
    // This one reaches the ROSTER writer: records are created (as withdrawn), and
    // the recomputed roster total is 0. The manual guard must be left in force.
    const { svc, rows, op } = makeHarness({ op: { enrollment: 436, enrollmentSourceProvider: null } })
    const res = await svc.upload(
      USER,
      SCHOOL,
      file(
        usersCsv([
          { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03', status: 'tobedeleted' },
          { id: 'or-2', first: 'Alan', last: 'Turing', grade: '05', status: 'tobedeleted' },
        ]),
      ),
    )
    expect(rows).toHaveLength(2)
    expect(res.records).toMatchObject({ created: 2 })
    expect(op()!.enrollment).toBe(436)
    expect(op()!.enrollmentSupersededManual ?? null).toBeNull()
    expect(res.promoted).toBe(false)
    expect(res.reason).toMatch(/no students in this file were counted/i)
  })

  it('a zero parse does not stamp a connector provider over a school with no figure yet', async () => {
    const { svc, opUpsert } = makeHarness()
    const res = await svc.upload(USER, SCHOOL, file(HEADER_ONLY))
    expect(opUpsert).not.toHaveBeenCalled()
    expect(res.enrollment).toBeNull()
    // The snapshot still exists for history — an empty file is a fact about the file.
    expect(res.snapshot.totalEnrolled).toBe(0)
  })
})

// ── One file, ONE headcount ──────────────────────────────────────────────────

describe('the number reported is the number stored — even with enabledUser=false', () => {
  it('pupils with no portal login are enrolled, not withdrawn', async () => {
    // OneRoster's enabledUser means "can this account sign in". Lower-school
    // pupils with no login are routinely exported false. Withdrawing them here
    // while the frozen aggregate counted them made ONE upload produce TWO
    // headcounts, and the divergent one owned the finance denominator.
    const { svc, rows } = makeHarness()
    const res = await svc.upload(
      USER,
      SCHOOL,
      file(
        usersCsv([
          { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03' },
          { id: 'or-2', first: 'Ben', last: 'Peck', grade: '05', enabled: 'false' },
          { id: 'or-3', first: 'Cy', last: 'Ford', grade: 'KG', enabled: 'false' },
        ]),
      ),
    )
    expect(res.snapshot.totalEnrolled).toBe(3)
    expect(res.enrollment!.value).toBe(3)
    expect(res.enrollment!.value).toBe(res.snapshot.totalEnrolled)
    expect(rows.every((r) => r.status === 'enrolled')).toBe(true)
  })
})

// ── A messy id must not cost the whole upload ────────────────────────────────

describe('a repeated sourcedId is skipped, not fatal', () => {
  it('imports the rest of the file, promotes, and says what was dropped', async () => {
    // StudentsService.importCommit 400s on a duplicate externalId BEFORE any
    // write, and it runs before the snapshot — so one duplicated row used to end
    // the upload with nothing at all: no records, no counts, no warning. That is
    // the same "I did a thing and nothing happened" the branch exists to fix.
    const { svc, rows, op } = makeHarness()
    const res = await svc.upload(
      USER,
      SCHOOL,
      file(
        usersCsv([
          { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03' },
          { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03' },
          { id: 'or-2', first: 'Alan', last: 'Turing', grade: '05' },
        ]),
      ),
    )
    expect(rows).toHaveLength(2)
    expect(res.records).toMatchObject({ created: 2, total: 2 })
    expect(res.promoted).toBe(true)
    expect(op()!.enrollment).toBe(2)
    expect(res.warnings.some((w) => /1 row\(s\) skipped: the same student id/i.test(w))).toBe(true)
    // FERPA: counts, never names.
    for (const w of res.warnings) expect(w).not.toMatch(/Ada|Lovelace|or-1/)
  })
})

// ── Replace must not silently drop students the file NAMES ───────────────────

describe('replace refuses rather than deleting students it cannot re-create', () => {
  it('stops before the delete when any row is unreadable, and writes nothing', async () => {
    const { svc, student, opUpsert } = makeHarness()
    const csv = usersCsv([
      { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03' },
      { id: 'or-2', first: 'Jordan', last: 'Smith', grade: '99' }, // unmapped → dropped
    ])
    await expect(svc.upload(USER, SCHOOL, file(csv), { mode: 'replace' })).rejects.toThrow(
      /Replace was not applied/i,
    )
    expect(student.deleteMany).not.toHaveBeenCalled()
    expect(student.createMany).not.toHaveBeenCalled()
    expect(opUpsert).not.toHaveBeenCalled()
  })

  it('a clean file still replaces, and MERGE is never blocked', async () => {
    const { svc, rows } = makeHarness()
    const clean = usersCsv(roster(3))
    await svc.upload(USER, SCHOOL, file(clean), { mode: 'replace' })
    expect(rows).toHaveLength(3)

    const messy = usersCsv([
      { id: 'or-9', first: 'Ada', last: 'Lovelace', grade: '03' },
      { id: 'or-8', first: 'Jordan', last: 'Smith', grade: '99' },
    ])
    const res = await svc.upload(USER, SCHOOL, file(messy)) // merge
    expect(res.records).toMatchObject({ created: 1 })
  })
})

// ── Two same-day snapshots, one per writer — and no third ────────────────────

describe('the file snapshot does not clobber the roster snapshot', () => {
  it('keeps one row per provider for the observed date, and a later edit adds none', async () => {
    const { svc, snapshots, prisma } = makeHarness()
    await svc.upload(USER, SCHOOL, file(usersCsv(roster(6))), { observedOn: '2026-06-15' })

    const providers = snapshots.map((s) => s.provider).sort()
    expect(providers, 'the file snapshot overwrote the roster snapshot').toEqual([
      'oneroster_csv',
      'roster',
    ])
    const roster_ = snapshots.find((s) => s.provider === 'roster')!
    expect(roster_.totalEnrolled).toBe(6)

    // A student edited the same day must UPDATE the roster row, not insert a
    // second sourceId-NULL row for that date (NULLs are distinct in PG, so the
    // unique would not have caught it).
    const students = new StudentsService(
      prisma as never,
      { write: vi.fn(async () => undefined) } as never,
      (svc as unknown as { enrollment: EnrollmentService }).enrollment,
    )
    await students.syncRosterSnapshot(USER, SCHOOL, { observedOn: '2026-06-15' })
    expect(snapshots).toHaveLength(2)
  })
})

// ── The row ceiling ──────────────────────────────────────────────────────────

describe('the import-row ceiling degrades to counts, it does not fail', () => {
  it('over the ceiling: no records, still promoted, and it says why', async () => {
    const { svc, student, opUpsert } = makeHarness()
    const n = STUDENT_IMPORT_MAX_ROWS + 1
    const res = await svc.upload(USER, SCHOOL, file(usersCsv(roster(n))))

    expect(res.records).toBeNull()
    expect(student.create).not.toHaveBeenCalled()
    expect(student.createMany).not.toHaveBeenCalled()
    expect(res.promoted).toBe(true)
    expect(res.enrollment).toMatchObject({ value: n, source: 'file' })
    expect(res.warnings.some((w) => w.includes(`${STUDENT_IMPORT_MAX_ROWS}-row import ceiling`))).toBe(true)
    expect(opUpsert).toHaveBeenCalledTimes(1)
  })
})

// ── Skipped rows: aggregate warnings, never a name ───────────────────────────

describe('unimportable rows are counted, never named', () => {
  it('skips an unmapped grade and a blank name and warns in aggregate only', async () => {
    const { svc, rows } = makeHarness()
    const csv = usersCsv([
      { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03' },
      { id: 'or-2', first: 'Jordan', last: 'Smith', grade: '99' },
      { id: 'or-3', first: '', last: 'Nameless', grade: '05' },
    ])
    const res = await svc.upload(USER, SCHOOL, file(csv))

    expect(rows).toHaveLength(1)
    expect(res.records).toMatchObject({ created: 1, total: 1 })
    expect(res.warnings.some((w) => /1 row\(s\) skipped: unmapped grade/.test(w))).toBe(true)
    expect(res.warnings.some((w) => /1 row\(s\) skipped: missing name/.test(w))).toBe(true)
    // FERPA: a warning is rendered in a browser and pasted into support tickets.
    for (const w of res.warnings) {
      expect(w).not.toMatch(/Jordan|Smith|Nameless|Lovelace/)
    }
  })

  it('the whole response carries no name, birth date or externalId', async () => {
    const { svc } = makeHarness()
    const res = await svc.upload(USER, SCHOOL, file(usersCsv(roster(3))))
    const json = JSON.stringify(res)
    expect(json).not.toMatch(/First1|Last1|or-1/)
    expect(json).not.toMatch(/firstName|lastName|birthDate|externalId/)
  })

  it('a withdrawn (tobedeleted) row becomes a withdrawn RECORD, not a headcount', async () => {
    const { svc, rows } = makeHarness()
    const csv = usersCsv([
      { id: 'or-1', first: 'Ada', last: 'Lovelace', grade: '03' },
      { id: 'or-2', first: 'Alan', last: 'Turing', grade: '05', status: 'tobedeleted' },
    ])
    const res = await svc.upload(USER, SCHOOL, file(csv))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.status).sort()).toEqual(['enrolled', 'withdrawn'])
    // Both the file aggregate and the roster rollup count the enrolled one only.
    expect(res.snapshot.totalEnrolled).toBe(1)
    expect(res.enrollment!.value).toBe(1)
  })
})

// ── mode: replace ────────────────────────────────────────────────────────────

describe('mode', () => {
  it('defaults to merge and forwards an explicit replace to the register importer', async () => {
    const spy = vi.spyOn(StudentsService.prototype, 'importCommit')
    const { svc } = makeHarness()
    await svc.upload(USER, SCHOOL, file(usersCsv(roster(2))))
    expect(spy.mock.calls[0]![2]).toBe('merge')
    await svc.upload(USER, SCHOOL, file(usersCsv(roster(2))), { mode: 'replace' })
    expect(spy.mock.calls[1]![2]).toBe('replace')
    expect(spy.mock.calls[1]![4]).toMatchObject({ supersedeManual: true })
    spy.mockRestore()
  })
})

// ── Acceptance 8 — the role gate, asserted on the decorator ──────────────────

describe('acceptance 8 — a viewer cannot create student records through this path', () => {
  it('POST upload is owner/accountant only', () => {
    const proto = EnrollmentController.prototype as unknown as Record<string, object>
    const roles = Reflect.getMetadata('roles', proto.upload) as string[]
    expect(roles).toEqual(['owner', 'accountant'])
    expect(roles).not.toContain('viewer')
  })

  it('the controller still carries all three guards and the enrollment module gate', () => {
    const guards = (Reflect.getMetadata('__guards__', EnrollmentController) as unknown[]) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)
    expect(guards).toContain(EntitlementGuard)

    const keys = Reflect.getMetadataKeys(EnrollmentController)
    const moduleKey = keys.find((k) => String(k).toLowerCase().includes('module'))
    expect(moduleKey, 'no @RequiresModule metadata on EnrollmentController').toBeDefined()
    expect(Reflect.getMetadata(moduleKey as string, EnrollmentController)).toEqual(['enrollment'])
  })

  it('EnrollmentModule PROVIDES the orchestrator and does not export it', async () => {
    // A provider the controller injects but the module never declares is an
    // UnknownDependenciesException on BOOT — a container that never starts, and a
    // failure no functional spec here can see. Not exported, either: nothing
    // outside this module should be able to reach a second writer for
    // periodOperationalData.enrollment.
    const { EnrollmentModule } = await import('./enrollment.module.js')
    const providers = (Reflect.getMetadata('providers', EnrollmentModule) as unknown[]) ?? []
    expect(providers).toContain(RosterUploadService)
    const exports_ = (Reflect.getMetadata('exports', EnrollmentModule) as unknown[]) ?? []
    expect(exports_).not.toContain(RosterUploadService)
  })

  it('the upload route delegates to the orchestrator, file field and all', async () => {
    const rosterUpload = { upload: vi.fn(async () => ({ records: null })) }
    const c = new EnrollmentController({} as never, rosterUpload as never)
    const f = file(usersCsv(roster(1)))
    await c.upload(SCHOOL, f, { observedOn: '2026-06-15', mode: 'replace' }, USER)
    expect(rosterUpload.upload).toHaveBeenCalledWith(USER, SCHOOL, f, {
      observedOn: '2026-06-15',
      mode: 'replace',
    })
  })
})
