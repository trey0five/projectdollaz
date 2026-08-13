// ─────────────────────────────────────────────────────────────────────────────
// Assessment file parser — PURE (bytes in, candidate rows out; no I/O, no
// Prisma), so the messy-file handling unit-tests directly.
//
// REAL FILES ARE MESSY, and this parser is written against the ones schools
// actually send rather than a format we wish they used:
//   • a title row above the headers ("Diocese of … TerraNova 2026")
//   • blank spacer rows and trailing note rows
//   • columns exported as "Unnamed: 3" by a spreadsheet round-trip
//   • header spellings that vary by publisher ("Composite" / "Total Battery" /
//     "NPR" / "Nat'l %ile")
//   • one sheet per subject, or one column per subject, or one row per subject
//
// Failure philosophy matches the roster parser: throw ONLY on a structurally
// unusable file; degrade everything else into per-row `issues` and file-level
// `warnings`, so a mostly-good file still previews and the reviewer can see
// exactly which rows were dropped and why.
//
// TWO SHAPES, AUTO-DETECTED:
//   • SCHOOL AGGREGATE — one row per school (× grade × subject), the diocesan
//     summary file. No student identity anywhere in it.
//   • STUDENT — one row per student, with a name and/or an id.
// The shape is decided by whether a student-identity column is present, because
// that is the fact that actually changes what we may store.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ACT_SECTION_KEYS,
  NRT_SUBJECT_KEYS,
  SAT_SECTION_KEYS,
  SCORE_TYPE_FOR_FAMILY,
  SUBJECTS_FOR_FAMILY,
  TEST_FAMILY,
  isTestTypeKey,
  type ScoreTypeKey,
  type TestFamily,
  type TestTypeKey,
} from '@finrep/db'

export type ParsedScope = 'student' | 'school_aggregate'

export interface ParsedAggregateRow {
  rowNumber: number
  schoolName: string | null
  schoolYear: number | null
  gradeLevel: string
  /** Subject → score. The headline (composite/total) lands under '__total__'. */
  scores: Record<string, number>
  testedCount: number | null
  eligibleCount: number | null
  issues: string[]
}

export interface ParsedStudentRow {
  rowNumber: number
  externalId: string | null
  firstName: string | null
  lastName: string | null
  rawName: string | null
  gradeLevel: string | null
  schoolYear: number | null
  composite: number | null
  sectionScores: Record<string, number>
  issues: string[]
}

export interface AssessmentParseResult {
  scope: ParsedScope
  testType: TestTypeKey
  family: TestFamily
  scoreType: ScoreTypeKey
  /** Years seen in the file, most recent first. */
  years: number[]
  aggregates: ParsedAggregateRow[]
  students: ParsedStudentRow[]
  warnings: string[]
  /** Rows the parser could not use at all (bad/blank/duplicate header rows). */
  skipped: number
}

export const TOTAL_KEY = '__total__'

// ── header vocabulary ────────────────────────────────────────────────────────

const SCHOOL_HEADERS = ['school', 'school name', 'site', 'campus', 'building']
const YEAR_HEADERS = ['year', 'school year', 'testing year', 'test year', 'admin year', 'spring']
const GRADE_HEADERS = ['grade', 'grade level', 'gradelevel', 'gr', 'grd']
const TESTED_HEADERS = ['tested', 'students tested', 'n tested', 'count', 'n', '# tested', 'number tested']
const ELIGIBLE_HEADERS = ['eligible', 'enrolled', 'students eligible', 'n eligible', 'cohort']
const ID_HEADERS = ['sourcedid', 'student id', 'studentid', 'id', 'state id', 'local id', 'external id']
const FIRST_HEADERS = ['first', 'first name', 'firstname', 'givenname', 'given name']
const LAST_HEADERS = ['last', 'last name', 'lastname', 'familyname', 'family name', 'surname']
const NAME_HEADERS = ['name', 'student', 'student name', 'full name']

/** Headline-score spellings, by family. */
const TOTAL_HEADERS = [
  'composite',
  'act composite',
  'total',
  'total battery',
  'battery',
  'total score',
  'sat total',
  'overall',
  'npr',
  'national percentile',
  "nat'l %ile",
  'national %ile',
  'mean npr',
]

/** Subject spellings → canonical subject key. Ordered so longer, more specific
 *  phrases match before their substrings. */
const SUBJECT_SYNONYMS: Array<[string[], string]> = [
  [['english language arts', 'language arts', 'ela'], 'reading'],
  [['reading', 'read'], 'reading'],
  [['evidence-based reading and writing', 'reading and writing', 'erw', 'ebrw'], 'erw'],
  [['mathematics', 'math'], 'math'],
  [['language', 'lang'], 'language'],
  [['science', 'sci'], 'science'],
  [['social studies', 'socialstudies', 'social science'], 'socialStudies'],
  [['english'], 'english'],
]

function norm(s: unknown): string {
  return String(s ?? '')
    .replace(/ /g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** A spreadsheet round-trip turns empty headers into "Unnamed: 3" — those are
 *  not headers, they are holes. */
function isJunkHeader(h: string): boolean {
  const n = norm(h)
  return n === '' || n.startsWith('unnamed') || /^column\s*\d+$/.test(n) || /^\d+$/.test(n)
}

function matchHeader(header: string, vocab: string[]): boolean {
  const n = norm(header)
  return vocab.some((v) => n === v || n.startsWith(`${v} `) || n.endsWith(` ${v}`))
}

/** Canonical subject for a header, or null when it is not a subject column. */
export function subjectFromHeader(header: string): string | null {
  const n = norm(header)
  if (n === '') return null
  for (const [spellings, key] of SUBJECT_SYNONYMS) {
    for (const sp of spellings) {
      if (n === sp || n.includes(sp)) return key
    }
  }
  return null
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/[,%$]/g, '')
  if (s === '' || s === '-' || s === '—' || norm(s) === 'n/a' || norm(s) === 'na') return null
  // "forthcoming"/"pending" is a promise, not a score — never a zero.
  if (/forthcom|pending|tbd|not (yet )?(available|reported)/i.test(s)) return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function toYear(v: unknown): number | null {
  const s = String(v ?? '').trim()
  // "2025-26" / "2025/26" → the spring year, which is how results are labelled.
  const span = s.match(/^(\d{4})\s*[-/]\s*(\d{2,4})$/)
  if (span) {
    const start = Number.parseInt(span[1], 10)
    return Number.isFinite(start) ? start + 1 : null
  }
  const m = s.match(/(20\d{2})/)
  if (m) return Number.parseInt(m[1], 10)
  return null
}

/** Normalize a grade cell to the house GradeKey vocabulary. */
export function toGrade(v: unknown): string | null {
  const s = norm(v)
  if (s === '') return null
  if (/^(all|total|overall|school)$/.test(s)) return 'all'
  if (/^(k|kg|kdg|kindergarten)$/.test(s)) return 'K'
  if (/^pk\s*3$|^pre-?k\s*3$/.test(s)) return 'PK3'
  if (/^pk\s*4$|^pre-?k\s*4?$|^pre-?k$/.test(s)) return 'PK4'
  const m = s.match(/(\d{1,2})/)
  if (m) {
    const n = Number.parseInt(m[1], 10)
    if (n >= 1 && n <= 12) return String(n)
  }
  return null
}

// ── CSV plumbing (the ingestion parseCsv is unexported; same dialect) ─────────

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
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Find the header row. Publishers put a title (and often a subtitle and a blank)
 * above it, so the header is not row 1 — it is the first row that looks like
 * labels rather than data: several non-junk cells, at least one of which is a
 * vocabulary word we recognize.
 */
export function detectHeaderRow(grid: string[][]): number {
  const limit = Math.min(grid.length, 25)
  let best = -1
  let bestScore = 0
  for (let i = 0; i < limit; i++) {
    const row = grid[i] ?? []
    const cells = row.map((c) => String(c ?? ''))
    const named = cells.filter((c) => !isJunkHeader(c))
    if (named.length < 2) continue
    let score = 0
    for (const c of named) {
      if (matchHeader(c, SCHOOL_HEADERS)) score += 3
      if (matchHeader(c, GRADE_HEADERS)) score += 3
      if (matchHeader(c, YEAR_HEADERS)) score += 2
      if (matchHeader(c, TOTAL_HEADERS)) score += 3
      if (subjectFromHeader(c)) score += 2
      if (matchHeader(c, ID_HEADERS) || matchHeader(c, LAST_HEADERS) || matchHeader(c, NAME_HEADERS)) score += 3
    }
    // A row of pure numbers is data, not a header, however many cells it has.
    const numeric = named.filter((c) => toNumber(c) !== null).length
    if (numeric > named.length / 2) score = 0
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return bestScore > 0 ? best : -1
}

export interface ParseOptions {
  /** Caller's declared test type; the parser trusts it over guessing. */
  testType?: string
  /** Fallback year when the file carries none (e.g. named in the file name). */
  defaultYear?: number
  /** Fallback grade when a per-sheet grade is known from context. */
  defaultGrade?: string
  /** Sheet/section label, used only in warnings. */
  label?: string
}

/**
 * Parse one CSV/TSV text buffer into assessment candidates.
 * Throws only when the file has no usable header row at all.
 */
export function parseAssessmentCsv(bytes: Uint8Array | Buffer, opts: ParseOptions = {}): AssessmentParseResult {
  const text = stripBom(new TextDecoder('utf-8').decode(bytes))
  const grid = parseCsv(text).map((r) => r.map((c) => String(c ?? '')))
  return parseAssessmentGrid(grid, opts)
}

/**
 * The real worker: a rectangular grid of strings in, candidates out. Shared by
 * the CSV path and by any caller that already has a sheet as a grid.
 */
export function parseAssessmentGrid(grid: string[][], opts: ParseOptions = {}): AssessmentParseResult {
  const warnings: string[] = []
  const headerIdx = detectHeaderRow(grid)
  if (headerIdx < 0) {
    throw new Error('No header row found — the file does not look like an assessment export.')
  }
  if (headerIdx > 0) {
    warnings.push(`Skipped ${headerIdx} row${headerIdx === 1 ? '' : 's'} above the header (title/notes).`)
  }

  const headers = (grid[headerIdx] ?? []).map((h) => String(h ?? ''))
  const testType: TestTypeKey = isTestTypeKey(opts.testType) ? opts.testType : guessTestType(headers, opts.label)
  const family = TEST_FAMILY[testType]
  const scoreType = SCORE_TYPE_FOR_FAMILY[family]

  // Column roles
  const idx = {
    school: headers.findIndex((h) => matchHeader(h, SCHOOL_HEADERS)),
    year: headers.findIndex((h) => matchHeader(h, YEAR_HEADERS)),
    grade: headers.findIndex((h) => matchHeader(h, GRADE_HEADERS)),
    tested: headers.findIndex((h) => matchHeader(h, TESTED_HEADERS)),
    eligible: headers.findIndex((h) => matchHeader(h, ELIGIBLE_HEADERS)),
    extId: headers.findIndex((h) => matchHeader(h, ID_HEADERS)),
    first: headers.findIndex((h) => matchHeader(h, FIRST_HEADERS)),
    last: headers.findIndex((h) => matchHeader(h, LAST_HEADERS)),
    name: headers.findIndex((h) => matchHeader(h, NAME_HEADERS)),
    total: headers.findIndex((h) => matchHeader(h, TOTAL_HEADERS)),
  }

  // Subject columns — everything that names a subject and is not already a role.
  const claimed = new Set(Object.values(idx).filter((i) => i >= 0))
  const subjectCols: Array<{ col: number; subject: string }> = []
  headers.forEach((h, col) => {
    if (claimed.has(col) || isJunkHeader(h)) return
    const subject = subjectFromHeader(h)
    if (subject) subjectCols.push({ col, subject })
  })

  // The shape question: is there a student in this file?
  const hasIdentity = idx.extId >= 0 || idx.last >= 0 || idx.name >= 0
  const scope: ParsedScope = hasIdentity ? 'student' : 'school_aggregate'

  if (idx.total < 0 && subjectCols.length === 0) {
    throw new Error('No score columns found — expected a composite/total column or subject columns.')
  }

  const aggregates: ParsedAggregateRow[] = []
  const students: ParsedStudentRow[] = []
  const years = new Set<number>()
  let skipped = 0

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const rowNumber = r + 1
    const cell = (i: number): string => (i >= 0 ? String(row[i] ?? '') : '')

    // A row with nothing in it, or a trailing note row, is not a data row.
    const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '').length
    if (nonEmpty === 0) continue
    const scoresPresent =
      toNumber(cell(idx.total)) !== null || subjectCols.some((sc) => toNumber(cell(sc.col)) !== null)
    if (!scoresPresent && nonEmpty <= 2) {
      skipped++
      continue
    }

    const issues: string[] = []
    const year = toYear(cell(idx.year)) ?? opts.defaultYear ?? null
    if (year !== null) years.add(year)
    const grade = toGrade(cell(idx.grade)) ?? opts.defaultGrade ?? 'all'

    if (scope === 'student') {
      const composite = toNumber(cell(idx.total))
      const sectionScores: Record<string, number> = {}
      for (const sc of subjectCols) {
        const v = toNumber(cell(sc.col))
        if (v !== null) sectionScores[sc.subject] = v
      }
      const rawName = idx.name >= 0 ? cell(idx.name).trim() || null : null
      let firstName = idx.first >= 0 ? cell(idx.first).trim() || null : null
      let lastName = idx.last >= 0 ? cell(idx.last).trim() || null : null
      if (!firstName && !lastName && rawName) {
        const split = splitName(rawName)
        firstName = split.first
        lastName = split.last
      }
      if (composite === null && Object.keys(sectionScores).length === 0) {
        issues.push('No score on this row.')
      }
      if (!firstName && !lastName && !cell(idx.extId).trim()) {
        issues.push('No student identifier on this row.')
      }
      students.push({
        rowNumber,
        externalId: cell(idx.extId).trim() || null,
        firstName,
        lastName,
        rawName,
        gradeLevel: grade === 'all' ? null : grade,
        schoolYear: year,
        composite,
        sectionScores,
        issues,
      })
    } else {
      const scores: Record<string, number> = {}
      const total = toNumber(cell(idx.total))
      if (total !== null) scores[TOTAL_KEY] = total
      for (const sc of subjectCols) {
        const v = toNumber(cell(sc.col))
        if (v !== null) scores[sc.subject] = v
      }
      if (Object.keys(scores).length === 0) {
        skipped++
        continue
      }
      const schoolName = idx.school >= 0 ? cell(idx.school).trim() || null : null
      if (!schoolName && idx.school >= 0) issues.push('No school name on this row.')
      aggregates.push({
        rowNumber,
        schoolName,
        schoolYear: year,
        gradeLevel: grade,
        scores,
        testedCount: toNumber(cell(idx.tested)),
        eligibleCount: toNumber(cell(idx.eligible)),
        issues,
      })
    }
  }

  if (years.size === 0 && opts.defaultYear === undefined) {
    warnings.push('No year column found — set the year when you commit this file.')
  }
  if (skipped > 0) {
    warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} had no usable score and were skipped.`)
  }
  const knownSubjects = new Set(SUBJECTS_FOR_FAMILY[family])
  const strays = subjectCols.map((s) => s.subject).filter((s) => !knownSubjects.has(s))
  if (strays.length > 0) {
    warnings.push(`Subjects not typical for ${testType}: ${[...new Set(strays)].join(', ')}.`)
  }

  return {
    scope,
    testType,
    family,
    scoreType,
    years: [...years].sort((a, b) => b - a),
    aggregates,
    students,
    warnings,
    skipped,
  }
}

/** "Last, First" and "First Last" both appear; neither is worth a config flag. */
export function splitName(raw: string): { first: string | null; last: string | null } {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s === '') return { first: null, last: null }
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2)
    return { first: (first ?? '').trim() || null, last: last.trim() || null }
  }
  const parts = s.split(' ')
  if (parts.length === 1) return { first: null, last: parts[0] }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

/**
 * Best-effort test type from the headers and a sheet/file label. The caller's
 * declared type always wins; this only saves a step when a file names itself.
 */
export function guessTestType(headers: string[], label?: string): TestTypeKey {
  const hay = norm([...(headers ?? []), label ?? ''].join(' '))
  if (hay.includes('terranova') || hay.includes('terra nova')) return 'terranova'
  if (hay.includes('iowa')) return 'iowa'
  if (hay.includes('nwea') || /\bmap\b/.test(hay)) return 'map'
  if (hay.includes('psat')) return 'psat_nmsqt'
  if (hay.includes('preact') || hay.includes('pre-act')) return 'preact'
  if (hay.includes('sat') || hay.includes('erw') || hay.includes('ebrw')) return 'sat'
  if (hay.includes('act') || hay.includes('composite')) return 'act'
  // Percentile vocabulary without an exam name means a norm-referenced test.
  if (hay.includes('npr') || hay.includes('percentile') || hay.includes('battery')) return 'terranova'
  return 'act'
}

/** Subjects actually present across the parsed rows, in family order. */
export function subjectsSeen(result: AssessmentParseResult): string[] {
  const seen = new Set<string>()
  for (const a of result.aggregates) for (const k of Object.keys(a.scores)) if (k !== TOTAL_KEY) seen.add(k)
  for (const s of result.students) for (const k of Object.keys(s.sectionScores)) seen.add(k)
  const order = [...SUBJECTS_FOR_FAMILY[result.family], ...ACT_SECTION_KEYS, ...SAT_SECTION_KEYS, ...NRT_SUBJECT_KEYS]
  return [...seen].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}
