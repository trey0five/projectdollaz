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
 * Parse a OneRoster bulk-CSV ZIP into a normalized enrollment snapshot.
 *
 * @throws if users.csv is absent or is missing a required header — the only two
 *         states we cannot recover from (everything else degrades to warnings).
 */
export function parseOneRosterCsv(
  zip: Buffer,
  opts: ParseOneRosterOptions = {},
): NormalizedEnrollmentSnapshot {
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

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!
    // A blank trailing line parses to [''] — ignore it, don't count as dropped.
    if (cells.length === 1 && cells[0]!.trim() === '') continue

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

    // grades can be a multi-value field ("09,10"); the first token is the student's grade.
    const gradesRaw = (cells[iGrades] ?? '').trim()
    const firstToken = gradesRaw.split(',')[0]!.trim()
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
