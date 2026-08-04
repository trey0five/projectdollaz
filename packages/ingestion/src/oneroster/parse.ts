// ─────────────────────────────────────────────────────────────────────────────
// OneRoster 1.1 / 1.2 CSV bulk-file parser — the ONE universal, verifiable path
// to a normalized enrollment snapshot (every SIS can export a OneRoster ZIP).
//
// Headcount comes from users.csv (role=student), NEVER enrollments.csv: an
// `enrollments` row is a student↔class link, so a student in 6 classes appears 6
// times — using it over-counts headcount 5–7×. This parser is PURE (Buffer in,
// snapshot out; no I/O, no Prisma) so it unit-tests against a fixture ZIP and runs
// identically in the API. It throws ONLY on a structurally unusable file (missing
// users.csv or missing required header) — everything softer (unknown grade codes)
// is degraded into `warnings` + `raw` so a mostly-good export still imports.
// ─────────────────────────────────────────────────────────────────────────────
import { inflateRawSync } from 'node:zlib'
import type { GradeKey } from '@finrep/analytics'
import type { NormalizedEnrollmentSnapshot } from '@finrep/db'
import { ONEROSTER_GRADE_MAP } from './grades.js'

/** users.csv columns we require by EXACT (case-sensitive) name — OneRoster spec casing. */
const REQUIRED_USER_HEADERS = ['sourcedId', 'role', 'status', 'grades'] as const

/**
 * Minimal synchronous ZIP reader — extracts entries by name from an in-memory
 * Buffer. Handles STORED (method 0) and DEFLATE (method 8), which is everything a
 * SIS bulk export emits. Reads the CENTRAL DIRECTORY (authoritative sizes even
 * when a local header defers them to a streaming data descriptor), then slices
 * each entry's data out of its local header. Dependency-free + sync so the parser
 * keeps its pure, synchronous signature (jszip is async-only).
 */
function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const EOCD_SIG = 0x06054b50
  const CEN_SIG = 0x02014b50
  // Scan backwards for the End Of Central Directory record (its comment is
  // usually empty, so it sits ~22 bytes from the end, but we tolerate a comment).
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Uploaded file is not a valid ZIP archive.')
  const cdCount = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16) // central-directory start offset
  for (let n = 0; n < cdCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    // The local header's name/extra lengths can differ from the central copy, so
    // read them fresh to find where the compressed data actually starts.
    const lhNameLen = buf.readUInt16LE(localOff + 26)
    const lhExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    try {
      out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))
    } catch {
      // A single corrupt entry must not sink the archive; skip it. A missing
      // users.csv surfaces as the precise error below.
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** Parse CSV text into rows of string cells (RFC-4180-ish: quotes, "" escapes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // ignore — the \n branch closes the line
    } else {
      field += ch
    }
  }
  // Flush a trailing line with no terminating newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Strip a UTF-8 BOM some exporters prepend to the first cell. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/** Look an entry up case-insensitively on filename (exporters vary on casing/paths). */
function findEntry(entries: Map<string, Buffer>, base: string): Buffer | undefined {
  const want = base.toLowerCase()
  for (const [name, buf] of entries) {
    const leaf = name.split('/').pop()?.toLowerCase()
    if (leaf === want) return buf
  }
  return undefined
}

/** Today as ISO yyyy-mm-dd (UTC) — the observedOn fallback when nothing else dates the file. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface ParseOneRosterOptions {
  /** Override the as-of date (ISO yyyy-mm-dd). Otherwise derived from academicSessions/today. */
  observedOn?: string
}

/**
 * The one users.csv read every OneRoster parse starts from: ZIP entry lookup, CSV
 * parse, BOM strip, header index and the required-header check.
 *
 * Extracted so the aggregate headcount parser and the per-student row parser share
 * a SINGLE reader. Byte-identity between them is then structural — there is one
 * reader, not two that were carefully kept in sync — and the three throw sites
 * (not a ZIP / no users.csv / missing required header) raise ONE set of messages.
 */
interface UsersTable {
  /** Every archive entry, so a caller can reach academicSessions.csv without re-reading the ZIP. */
  entries: Map<string, Buffer>
  /** Raw CSV cells, row 0 being the header. */
  rows: string[][]
  /** Trimmed, BOM-stripped header cells. */
  header: string[]
  /** Column index by EXACT header name, or -1. */
  colOf: (name: string) => number
}

function readUsersTable(zip: Buffer): UsersTable {
  const entries = readZipEntries(zip)

  const usersBuf = findEntry(entries, 'users.csv')
  if (!usersBuf) {
    throw new Error('OneRoster export is missing users.csv (the roster headcount source).')
  }
  const rows = parseCsv(usersBuf.toString('utf8'))
  if (rows.length === 0) {
    throw new Error('users.csv is empty.')
  }
  const header = rows[0]!.map((h, i) => (i === 0 ? stripBom(h) : h).trim())
  const colOf = (name: string) => header.indexOf(name)
  const missing = REQUIRED_USER_HEADERS.filter((h) => colOf(h) < 0)
  if (missing.length > 0) {
    throw new Error(
      `users.csv is missing required column(s): ${missing.join(', ')}. ` +
        `Expected OneRoster headers ${REQUIRED_USER_HEADERS.join(', ')}.`,
    )
  }
  return { entries, rows, header, colOf }
}

/**
 * Walk the data rows (everything after the header), skipping the blank filler line
 * a trailing newline produces. Shared so neither parser can drift on what counts
 * as a row — a blank line is NOT a dropped row in either.
 */
function* dataRows(rows: string[][]): Generator<string[]> {
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!
    // A blank trailing line parses to [''] — ignore it, don't count as dropped.
    if (cells.length === 1 && cells[0]!.trim() === '') continue
    yield cells
  }
}

/** The `grades` cell can be multi-value ("09,10"); the FIRST token is the student's grade. */
function firstGradeToken(cells: string[], iGrades: number): string {
  return (cells[iGrades] ?? '').trim().split(',')[0]!.trim()
}

/**
 * Parse a OneRoster bulk-CSV ZIP into a normalized enrollment snapshot.
 *
 * OUTPUT IS FROZEN. This runs in production behind the enrollment upload; its
 * byGrade/totalEnrolled feed the dashboard, the accreditation signals and every
 * enrollment-dependent metric. Retaining per-student rows for the roster importer
 * is a SEPARATE export (parseOneRosterStudents) precisely so this cannot move.
 *
 * @throws if users.csv is absent or is missing a required header — the only two
 *         states we cannot recover from (everything else degrades to warnings).
 */
export function parseOneRosterCsv(
  zip: Buffer,
  opts: ParseOneRosterOptions = {},
): NormalizedEnrollmentSnapshot {
  const { entries, rows, header, colOf } = readUsersTable(zip)
  const iRole = colOf('role')
  const iStatus = colOf('status')
  const iGrades = colOf('grades')

  const byGrade: Partial<Record<GradeKey, number>> = {}
  const rawGradeCounts: Record<string, number> = {}
  const warnings: string[] = []
  const unknownGrades = new Set<string>()
  let totalEnrolled = 0
  let withdrawn = 0
  let droppedRows = 0

  for (const cells of dataRows(rows)) {
    const role = (cells[iRole] ?? '').trim().toLowerCase()
    if (role !== 'student') {
      droppedRows++
      continue
    }
    const status = (cells[iStatus] ?? '').trim().toLowerCase()
    // A withdrawn (tobedeleted) student is counted in the funnel but NOT in the
    // active headcount / byGrade.
    if (status === 'tobedeleted') {
      withdrawn++
      continue
    }

    const firstToken = firstGradeToken(cells, iGrades)
    rawGradeCounts[firstToken || '(blank)'] = (rawGradeCounts[firstToken || '(blank)'] ?? 0) + 1

    const mapped = ONEROSTER_GRADE_MAP[firstToken]
    if (!mapped) {
      unknownGrades.add(firstToken || '(blank)')
      continue // unknown grade → raw only, never byGrade/total
    }
    byGrade[mapped] = (byGrade[mapped] ?? 0) + 1
    totalEnrolled++
  }

  if (unknownGrades.size > 0) {
    warnings.push(
      `Unrecognized grade code(s) not counted in the headcount: ${[...unknownGrades]
        .sort()
        .join(', ')}.`,
    )
  }

  const observedOn = opts.observedOn ?? latestSessionEndDate(entries) ?? todayIso()

  return {
    observedOn,
    provider: 'oneroster_csv',
    totalEnrolled,
    byGrade,
    byStatus: { enrolled: totalEnrolled, withdrawn },
    fte: null,
    warnings,
    // Persisted to EnrollmentSnapshot.raw for auditability (not part of the API response).
    raw: { rawGradeCounts, droppedRows, header },
  }
}

/**
 * One retained student row from users.csv — the raw material the roster IMPORTER
 * turns into Student records. Deliberately NOT part of NormalizedEnrollmentSnapshot:
 * that shape flows into `intakeNormalized` and lands in `enrollment_snapshots`, and
 * a name-bearing field on it would be one careless spread away from persisting PII
 * into an aggregate table FERPA-safe consumers read.
 */
export interface OneRosterStudentRow {
  /** OneRoster sourcedId — the idempotency key. null when the cell is blank. */
  sourcedId: string | null
  givenName: string
  familyName: string
  /** The FIRST grades token exactly as it appeared in the file (unmapped). */
  gradeRaw: string
  /** Canonical GradeKey via ONEROSTER_GRADE_MAP, or null when unmapped. */
  grade: GradeKey | null
  /**
   * status=tobedeleted — and NOTHING ELSE. This is the frozen aggregate parser's
   * definition of "not in the headcount", verbatim (`parseOneRosterCsv` skips a
   * row only on `status === 'tobedeleted'`), and the two readers must agree.
   *
   * `enabledUser` was considered and is DELIBERATELY IGNORED: in OneRoster it
   * means "can this account sign in", not "is this pupil enrolled", and lower-
   * school pupils with no portal login are routinely exported `enabledUser=false`.
   * Honouring it here made a roster-owned promote count only the login-enabled
   * subset while the very same response reported the file's full total — one
   * upload, two headcounts. It cannot be honoured on the other side either: that
   * output is frozen (it feeds the dashboard, the accreditation signals and every
   * enrollment-dependent metric), so this side is the one that yields.
   */
  withdrawn: boolean
}

/**
 * Retain the per-student rows of the SAME users.csv `parseOneRosterCsv` counts.
 *
 * Pure (Buffer in, data out) and additive: it reads through the shared users.csv
 * reader and does not touch the aggregate snapshot in any way. The two are called
 * back-to-back on one upload so a head of school gets records AND a headcount from
 * a single act.
 *
 * REPORTS, DOES NOT FILTER. Rows with a blank name or an unmapped grade come back
 * with the blank/`null` preserved — deciding they are unimportable, and warning
 * about it in aggregate (never by name), is the API layer's job.
 *
 * @returns `[]` when users.csv carries NEITHER `givenName` NOR `familyName` — a
 *          counts-only export stays a counts-only export: no records, and no error.
 * @throws  ONLY where `parseOneRosterCsv` already throws, with the same messages
 *          (not a ZIP / no users.csv / missing required header).
 */
export function parseOneRosterStudents(
  zip: Buffer,
  // Accepted so both parsers take one options object at the shared call site.
  // observedOn dates the SNAPSHOT, not a student, so it has no effect on rows.
  _opts: ParseOneRosterOptions = {},
): OneRosterStudentRow[] {
  const { rows, colOf } = readUsersTable(zip)

  const iGiven = colOf('givenName')
  const iFamily = colOf('familyName')
  // No per-student detail at all → nothing to import. Not an error: this is the
  // shape of a legitimate counts-only SIS export.
  if (iGiven < 0 && iFamily < 0) return []

  const iSourcedId = colOf('sourcedId')
  const iRole = colOf('role')
  const iStatus = colOf('status')
  const iGrades = colOf('grades')

  const out: OneRosterStudentRow[] = []
  for (const cells of dataRows(rows)) {
    // Non-students are dropped here exactly as the aggregate parser drops them.
    if ((cells[iRole] ?? '').trim().toLowerCase() !== 'student') continue

    const status = (cells[iStatus] ?? '').trim().toLowerCase()
    const sourcedId = (cells[iSourcedId] ?? '').trim()
    const gradeRaw = firstGradeToken(cells, iGrades)
    const mapped: GradeKey | undefined = ONEROSTER_GRADE_MAP[gradeRaw]

    out.push({
      sourcedId: sourcedId === '' ? null : sourcedId,
      givenName: iGiven < 0 ? '' : (cells[iGiven] ?? '').trim(),
      familyName: iFamily < 0 ? '' : (cells[iFamily] ?? '').trim(),
      gradeRaw,
      grade: mapped ?? null,
      // The frozen aggregate's rule, verbatim — see OneRosterStudentRow.withdrawn.
      withdrawn: status === 'tobedeleted',
    })
  }
  return out
}

/**
 * The latest `endDate` across academicSessions.csv (the term/year end) — a good
 * "as of" date for a roster snapshot. Optional file; returns null when absent or
 * unparseable so the caller falls back to today.
 */
function latestSessionEndDate(entries: Map<string, Buffer>): string | null {
  const buf = findEntry(entries, 'academicSessions.csv')
  if (!buf) return null
  const rows = parseCsv(buf.toString('utf8'))
  if (rows.length < 2) return null
  const header = rows[0]!.map((h, i) => (i === 0 ? stripBom(h) : h).trim())
  const iEnd = header.indexOf('endDate')
  if (iEnd < 0) return null
  let latest: string | null = null
  for (let r = 1; r < rows.length; r++) {
    const raw = (rows[r]![iEnd] ?? '').trim()
    // Accept ISO yyyy-mm-dd (optionally with a time suffix); ignore anything else.
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
    if (!m) continue
    const d = m[1]!
    if (latest === null || d > latest) latest = d
  }
  return latest
}
