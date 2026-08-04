// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE 6 — what a roster upload is allowed to write to period_operational_data.
//
// The contract (packages/analytics/src/types.ts): null/absent = NOT ENTERED →
// `available:false` + `inputsMissing`; `0` is a LEGITIMATE VALUE. So writing
// `studentsOnAid: 0` because a users.csv has no aid column does not leave a gap —
// it fills the gap with a lie, and pct_students_on_aid then reports a confident
// 0% to a board. A roster file is silent about aid; silence must stay silence.
//
// This is asserted over the ACTUAL upsert payload rather than by reading the
// service, because the failure mode is a field someone adds to the payload later
// "for completeness". The allow-list below is the whole permission.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { EnrollmentService } from './enrollment.service.js'
import { StudentsService } from './students/students.service.js'
import { RosterUploadService } from './roster-upload.service.js'

const USER = { id: 'u1', email: 'head@school.test' } as unknown as User
const SCHOOL = 'school-A'

/** Every column this upload may touch. Anything else is a bug, not a preference. */
const ALLOWED = new Set([
  'schoolId',
  'fiscalPeriodId',
  'enrollment',
  'enrollmentFte',
  'enrollmentSourceProvider',
  'updatedByUserId',
  'enrollmentSupersededManual',
  'enrollmentSupersededManualFte',
  'enrollmentSupersededAt',
])

/**
 * The fields whose absence a metric reads as "not entered". A roster upload knows
 * nothing about any of them — not even enough to write a zero.
 */
const NEVER_WRITTEN = [
  'studentsOnAid',
  'financialAidTotal',
  'teachingFte',
  'totalStaffFte',
  'enrollmentPlan',
  'plannedEnrollmentByGrade',
]

function usersCsv(n: number): Buffer {
  const head = 'sourcedId,status,enabledUser,orgSourcedIds,role,username,givenName,familyName,grades'
  const grades = ['03', '05', 'KG']
  const body = Array.from(
    { length: n },
    (_, i) => `or-${i + 1},active,true,org-1,student,or-${i + 1},First${i + 1},Last${i + 1},${grades[i % 3]}`,
  )
  return Buffer.from([head, ...body].join('\n'), 'utf8')
}

function file(buf: Buffer) {
  return { buffer: buf, originalname: 'users.csv', mimetype: 'text/csv', size: buf.length }
}

function makeHarness(op: Record<string, unknown> | null = null, source: Record<string, unknown> | null = null) {
  let seq = 0
  const rows: Record<string, unknown>[] = []
  let opRow: Record<string, unknown> | null = op ? { id: 'op-1', ...op } : null
  const opUpsert = vi.fn(
    async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      opRow = opRow ? { ...opRow, ...update } : { id: 'op-1', ...create }
      return opRow
    },
  )
  const snapshots: Record<string, unknown>[] = []
  const prisma = {
    student: {
      findMany: vi.fn(async () => rows.map((r) => ({ ...r }))),
      findFirst: vi.fn(async () => null),
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
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        for (const d of data) rows.push({ id: `s-${++seq}`, ...d })
        return { count: data.length }
      }),
    },
    enrollmentSource: { findUnique: vi.fn(async () => source) },
    enrollmentSnapshot: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const snap = { id: `snap-${snapshots.length + 1}`, ...data }
        snapshots.push(snap)
        return snap
      }),
      update: vi.fn(async () => ({ id: 'snap-1' })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    periodOperationalData: {
      findUnique: vi.fn(async () => opRow),
      upsert: opUpsert,
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    ),
  }
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
  return { svc: new RosterUploadService(prisma as never, enrollment, students), opUpsert }
}

/** Every key set the upload pushed at period_operational_data, create + update. */
function payloadKeySets(
  opUpsert: ReturnType<typeof makeHarness>['opUpsert'],
): { label: string; keys: string[] }[] {
  return opUpsert.mock.calls.flatMap((call, i) => {
    const arg = call[0] as { create: Record<string, unknown>; update: Record<string, unknown> }
    return [
      { label: `call ${i} create`, keys: Object.keys(arg.create) },
      { label: `call ${i} update`, keys: Object.keys(arg.update) },
    ]
  })
}

describe('acceptance 6 — a roster upload never invents an operational figure', () => {
  for (const [name, build] of [
    ['a roster-owned promote (records were created)', () => makeHarness()],
    ['a file-owned promote (an SIS owns the school)', () => makeHarness(null, { id: 'src-1' })],
    ['a supersede of a hand-entered figure', () => makeHarness({ enrollment: 430, enrollmentSourceProvider: null })],
  ] as const) {
    it(`writes only enrollment-shaped columns — ${name}`, async () => {
      const { svc, opUpsert } = build()
      await svc.upload(USER, SCHOOL, file(usersCsv(6)))

      const sets = payloadKeySets(opUpsert)
      // A guard on the guard: an empty walk would pass every assertion below.
      expect(sets.length).toBeGreaterThan(0)
      for (const { label, keys } of sets) {
        expect(keys.length, `${label} wrote nothing`).toBeGreaterThan(0)
        for (const k of keys) {
          expect(ALLOWED.has(k), `${label} wrote unexpected column "${k}"`).toBe(true)
        }
        for (const forbidden of NEVER_WRITTEN) {
          // Not "is not zero" — is NOT PRESENT. `0` and `null` are both wrong here:
          // one is a fabricated fact, the other overwrites a real one with a gap.
          expect(keys, `${label} touched ${forbidden}`).not.toContain(forbidden)
        }
      }
    })
  }

  it('leaves a hand-entered FTE alone when the file reports none', async () => {
    // parseOneRosterCsv returns fte:null for CSV, and promote() only writes
    // enrollmentFte when the source reported one. A roster upload must not blank
    // an FTE somebody keyed in.
    const { svc, opUpsert } = makeHarness({ enrollment: 430, enrollmentFte: 425, enrollmentSourceProvider: null })
    await svc.upload(USER, SCHOOL, file(usersCsv(6)))
    const update = (opUpsert.mock.calls[0]![0] as { update: Record<string, unknown> }).update
    // Only as the SUPERSEDE BACKUP of the manual value — never as a new figure.
    expect(update).not.toHaveProperty('enrollmentFte')
    expect(update.enrollmentSupersededManualFte).toBe(425)
  })
})
