// ─────────────────────────────────────────────────────────────────────────────
// THE FIRST BEHAVIORAL ADAPTER TESTS. Hand-off: "FACTS/Veracross/OneRoster-REST
// identity mapping unverified against a live tenant."
//
// It can never be verified live — those connectors are config-gated dark, and
// their own comments say the fields are "mapped defensively from the documented
// shape rather than verified against a live tenant". Until this file, that
// mapping was asserted by NOTHING (Blackbaud's only by regexes over its own
// source): a typo like `s.first_name` in the camelCase FACTS adapter would have
// passed every test in the repo, and a school connecting FACTS would sync a
// roster of nameless rows — the exact counted-but-empty state we just built a
// diagnosis card for.
//
// So each provider gets its DOCUMENTED sample envelope, fed through a stubbed
// `globalThis.fetch`, with the produced RawStudentRow[] asserted field by field.
// NEW PATTERN, deliberately: nothing in apps/api stubbed fetch before this.
// The two candidate existing files each scope themselves away from it —
// enrollment.normalize.spec.ts is "the pure normalizer below the adapter seam",
// sync-creates-records.spec.ts is source-text-only by stated method.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnrollmentSource } from '@finrep/db'
import { EnrollmentClient } from '../enrollment.client.js'
import { BlackbaudAdapter } from './blackbaud.adapter.js'
import { FactsAdapter } from './facts.adapter.js'
import { VeracrossAdapter } from './veracross.adapter.js'
import { OneRosterApiAdapter } from './oneroster-api.adapter.js'

const CONFIG = { get: () => 'configured' } as never

/** A loose per-school source row; adapters read only a handful of fields. */
const SOURCE = {
  baseUrl: 'https://sis.example.test',
  subscriptionKey: 'sub-key',
  apiKeySecret: 'secret',
  accessToken: 'token-abc',
  externalOrgId: null,
  clientId: 'client-id',
} as unknown as EnrollmentSource

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

/** Routes stubbed fetch by URL substring — token endpoints vs data endpoints. */
function stubFetch(routes: Array<[string, unknown]>) {
  const calls: string[] = []
  const fn = vi.fn(async (input: unknown) => {
    const url = String(input)
    calls.push(url)
    for (const [needle, body] of routes) {
      if (url.includes(needle)) return json(body)
    }
    throw new Error(`unrouted fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('Blackbaud — {value:[…]}, the one live-verified provider, now pinned behaviorally', () => {
  it('maps identity, walks the 3-level grade fallback, and keeps the LEGAL name', async () => {
    stubFetch([
      [
        '/school/v1/users',
        {
          value: [
            {
              id: 12345, // NUMBER — must stringify, never leak a number into externalId
              first_name: 'Maria',
              preferred_name: 'Mia', // present, and must LOSE: preferred names drift
              last_name: 'Martinez',
              birth_date: '2011-04-02T00:00:00-05:00', // ISO-truncates to the date
              grade_level: 'Grade 9',
              status: 'active',
            },
            {
              id: 'STU-2',
              first_name: 'Ben',
              last_name: 'Okafor',
              student_info: { grade_level: '10' }, // level 2 of the fallback
              birth_date: 'not-a-date', // unreadable → null, never a guess
            },
            {
              id: 'STU-3',
              first_name: 'Ada',
              last_name: 'Nowak',
              student_info: { grade: '11' }, // level 3
            },
            { id: 'STU-4', first_name: 'Dan', last_name: 'Reyes', grade: '12' }, // level 4
          ],
        },
      ],
    ])
    const adapter = new BlackbaudAdapter(new EnrollmentClient(CONFIG))
    const { rows, snapshot } = await adapter.fetch(SOURCE, '2026-08-01')
    expect(rows).toEqual([
      {
        grade: 'Grade 9',
        status: 'active',
        externalId: '12345',
        firstName: 'Maria',
        lastName: 'Martinez',
        birthDate: '2011-04-02',
      },
      {
        grade: '10',
        status: null,
        externalId: 'STU-2',
        firstName: 'Ben',
        lastName: 'Okafor',
        birthDate: null,
      },
      { grade: '11', status: null, externalId: 'STU-3', firstName: 'Ada', lastName: 'Nowak', birthDate: null },
      { grade: '12', status: null, externalId: 'STU-4', firstName: 'Dan', lastName: 'Reyes', birthDate: null },
    ])
    // The snapshot is built FROM those rows — one source of truth, no drift.
    expect(snapshot.totalEnrolled).toBe(4)
    expect(snapshot.byGrade).toMatchObject({ '9': 1, '10': 1, '11': 1, '12': 1 })
  })
})

describe('FACTS — {students:[…]}, camelCase', () => {
  it('studentId wins over id; id is the fallback; gradeLevel ?? grade; status ?? enrollmentStatus', async () => {
    stubFetch([
      [
        '/school/v1/students',
        {
          students: [
            {
              studentId: 9001, // numeric → stringified
              id: 'ignored-when-studentId-present',
              firstName: 'Eve',
              lastName: 'Larsen',
              birthDate: '2012-09-15',
              gradeLevel: '8',
              status: 'Active',
            },
            {
              id: 'F-2',
              firstName: 'Finn',
              lastName: 'Murray',
              grade: '7', // gradeLevel absent → grade
              enrollmentStatus: 'Withdrawn', // status absent → enrollmentStatus
            },
          ],
        },
      ],
    ])
    const { rows } = await new FactsAdapter(CONFIG).fetch(SOURCE)
    expect(rows).toEqual([
      {
        grade: '8',
        status: 'Active',
        externalId: '9001',
        firstName: 'Eve',
        lastName: 'Larsen',
        birthDate: '2012-09-15',
      },
      {
        grade: '7',
        status: 'Withdrawn',
        externalId: 'F-2',
        firstName: 'Finn',
        lastName: 'Murray',
        birthDate: null,
      },
    ])
  })
})

describe('Veracross — {data:[…]}, snake_case, OAuth first', () => {
  it('person_pk wins over id; birth_date ISO-truncates; token flows before students', async () => {
    const { calls } = stubFetch([
      ['/oauth/token', { access_token: 'vc-token' }],
      [
        '/v3/students',
        {
          data: [
            {
              person_pk: 555,
              id: 'shadowed',
              first_name: 'Clara',
              last_name: 'Nowak',
              birth_date: '2013-01-20T00:00:00Z',
              grade_level: '6',
              enrollment_status: 'active',
            },
            { id: 'V-2', first_name: 'Noah', last_name: 'Quinn', grade: '5' },
          ],
        },
      ],
    ])
    const { rows } = await new VeracrossAdapter(CONFIG).fetch(SOURCE)
    expect(calls[0]).toContain('/oauth/token')
    expect(rows).toEqual([
      {
        grade: '6',
        status: 'active',
        externalId: '555',
        firstName: 'Clara',
        lastName: 'Nowak',
        birthDate: '2013-01-20',
      },
      { grade: '5', status: null, externalId: 'V-2', firstName: 'Noah', lastName: 'Quinn', birthDate: null },
    ])
  })
})

describe('OneRoster REST — {users:[…]}, role-filtered', () => {
  it('drops non-students, takes grades[0], maps sourcedId/givenName/familyName, never a birthDate', async () => {
    stubFetch([
      ['/token', { access_token: 'or-token' }],
      [
        '/ims/oneroster',
        {
          users: [
            { sourcedId: 'S-1', role: 'student', givenName: 'Ada', familyName: 'Byron', grades: ['09', '10'], status: 'active' },
            { sourcedId: 'T-1', role: 'teacher', givenName: 'Alan', familyName: 'Turing', grades: ['09'] },
            { sourcedId: 'S-2', role: 'STUDENT', givenName: 'Grace', familyName: 'Hopper', grades: ['12'], status: 'tobedeleted' },
          ],
        },
      ],
    ])
    const { rows, snapshot } = await new OneRosterApiAdapter(CONFIG).fetch(SOURCE)
    expect(rows).toEqual([
      { grade: '09', status: 'active', externalId: 'S-1', firstName: 'Ada', lastName: 'Byron' },
      { grade: '12', status: 'tobedeleted', externalId: 'S-2', firstName: 'Grace', lastName: 'Hopper' },
    ])
    // The per-provider withdrawnStatuses override — previously covered by nothing:
    // tobedeleted lands in withdrawn, NOT the headcount.
    expect(snapshot.totalEnrolled).toBe(1)
    expect(snapshot.byStatus?.withdrawn ?? 0).toBeGreaterThanOrEqual(1)
  })
})

describe('identity stays OPTIONAL — the counts-only property', () => {
  it('a provider returning no identity fields still produces today’s headcount', async () => {
    // The widening that added identity must never have made it required: a
    // deployment whose provider omits names keeps its counts-only sync exactly.
    stubFetch([
      ['/school/v1/students', { students: [{ gradeLevel: '3' }, { gradeLevel: '4', status: 'active' }] }],
    ])
    const { rows, snapshot } = await new FactsAdapter(CONFIG).fetch(SOURCE)
    expect(snapshot.totalEnrolled).toBe(2)
    for (const r of rows) {
      expect(r.externalId).toBeNull()
      expect(r.firstName).toBeNull()
      expect(r.lastName).toBeNull()
    }
  })
})
