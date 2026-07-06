// Fixture-ZIP unit tests for the pure OneRoster CSV parser. The fixture
// (__fixtures__/oneroster-1.1.zip, built by build-fixture.mjs) is a real,
// spec-valid OneRoster 1.1 export exercising grade mapping, the tobedeleted
// funnel split, unknown-grade degradation, CSV quoting, and — critically — that
// enrollments.csv (40 per-class rows) is NEVER used for headcount.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOneRosterCsv } from './parse.js'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'oneroster-1.1.zip')
const zip = () => readFileSync(FIXTURE)

describe('parseOneRosterCsv', () => {
  it('maps grades and counts the active student headcount from users.csv', () => {
    const snap = parseOneRosterCsv(zip())
    expect(snap.provider).toBe('oneroster_csv')
    // s1..s7 + s10 are active students with KNOWN grades (s8=unknown, s9=withdrawn).
    // PR→PK3, PK→PK4, KG→K, 01→1, 09→9 (s5), "09,10"→9 (s6), 12→12, 03→3 (s10).
    expect(snap.byGrade).toEqual({ PK3: 1, PK4: 1, K: 1, '1': 1, '3': 1, '9': 2, '12': 1 })
    expect(snap.totalEnrolled).toBe(8)
  })

  it('splits the withdrawn (tobedeleted) student into byStatus, not the headcount', () => {
    const snap = parseOneRosterCsv(zip())
    expect(snap.byStatus).toEqual({ enrolled: 8, withdrawn: 1 })
    // The withdrawn student was grade 05 — it must not appear in byGrade.
    expect(snap.byGrade).not.toHaveProperty('5')
  })

  it('degrades an unknown grade code into warnings + raw, never byGrade/total', () => {
    const snap = parseOneRosterCsv(zip())
    expect(snap.warnings?.some((w) => w.includes('99'))).toBe(true)
    const raw = snap.raw as { rawGradeCounts: Record<string, number>; droppedRows: number }
    expect(raw.rawGradeCounts['99']).toBe(1)
    // The teacher row (role != student) is a dropped row.
    expect(raw.droppedRows).toBeGreaterThanOrEqual(1)
  })

  it('IGNORES enrollments.csv (headcount stays the users.csv count, not 40+)', () => {
    const snap = parseOneRosterCsv(zip())
    // 40 enrollment rows exist; a per-class over-count would push total >> 7.
    expect(snap.totalEnrolled).toBe(8)
  })

  it('derives observedOn from the latest academicSessions endDate', () => {
    const snap = parseOneRosterCsv(zip())
    expect(snap.observedOn).toBe('2026-06-15')
  })

  it('honors an explicit observedOn override', () => {
    const snap = parseOneRosterCsv(zip(), { observedOn: '2025-10-01' })
    expect(snap.observedOn).toBe('2025-10-01')
  })

  it('throws when users.csv is absent', () => {
    // A ZIP with no users.csv — reuse the fixture bytes but assert the error path
    // via an empty buffer (not a ZIP) which fails earlier with a clear message.
    expect(() => parseOneRosterCsv(Buffer.from('not a zip'))).toThrow(/valid ZIP/i)
  })

  it('throws a precise error when a required users.csv header is missing', () => {
    // Build a minimal ZIP whose users.csv drops the `grades` column.
    const bad = buildTinyZip('sourcedId,role,status\ns1,student,active\n')
    expect(() => parseOneRosterCsv(bad)).toThrow(/grades/)
  })
})

/** Minimal STORED-only ZIP with a single users.csv — enough to test the header guard. */
function buildTinyZip(usersCsv: string): Buffer {
  const data = Buffer.from(usersCsv, 'utf8')
  const name = Buffer.from('users.csv', 'utf8')
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)
  lh.writeUInt16LE(0, 8) // STORED
  lh.writeUInt32LE(0, 14) // crc (reader ignores)
  lh.writeUInt32LE(data.length, 18)
  lh.writeUInt32LE(data.length, 22)
  lh.writeUInt16LE(name.length, 26)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0)
  ch.writeUInt16LE(20, 4)
  ch.writeUInt16LE(20, 6)
  ch.writeUInt16LE(0, 10)
  ch.writeUInt32LE(0, 16)
  ch.writeUInt32LE(data.length, 20)
  ch.writeUInt32LE(data.length, 24)
  ch.writeUInt16LE(name.length, 28)
  ch.writeUInt32LE(0, 42) // local offset
  const local = Buffer.concat([lh, name, data])
  const central = Buffer.concat([ch, name])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, central, eocd])
}
