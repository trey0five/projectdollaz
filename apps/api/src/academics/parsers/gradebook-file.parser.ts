// ─────────────────────────────────────────────────────────────────────────────
// Gradebook file parser — PURE, and deliberately forgiving about shape.
//
// Course-mark exports arrive in two shapes and schools rarely know which they
// have:
//   • LONG  — one row per student per course ("Student, Course, Term, Grade")
//   • WIDE  — one row per student, one COLUMN per course ("Math, English, …")
// Both are auto-detected: a recognised course column means long, otherwise every
// unclaimed column that carries marks is treated as a course.
//
// Letter grades are kept as typed AND converted to a number where the mapping is
// unambiguous, because a term average is arithmetic and "B+" is not — but the
// original letter is never discarded, so a register still shows what the teacher
// actually recorded.
// ─────────────────────────────────────────────────────────────────────────────
import { detectHeaderRow, splitName, toGrade } from './assessment-file.parser.js'

export interface ParsedGradeRow {
  rowNumber: number
  externalId: string | null
  firstName: string | null
  lastName: string | null
  rawName: string | null
  gradeLevel: string | null
  courseName: string | null
  subject: string | null
  teacherName: string | null
  term: string | null
  schoolYear: number | null
  numericGrade: number | null
  letterGrade: string | null
  issues: string[]
}

export interface GradebookParseResult {
  shape: 'long' | 'wide'
  rows: ParsedGradeRow[]
  courses: string[]
  terms: string[]
  warnings: string[]
  skipped: number
}

const ID_HEADERS = ['sourcedid', 'student id', 'studentid', 'id', 'state id', 'local id', 'external id']
const FIRST_HEADERS = ['first', 'first name', 'firstname', 'givenname', 'given name']
const LAST_HEADERS = ['last', 'last name', 'lastname', 'familyname', 'family name', 'surname']
const NAME_HEADERS = ['name', 'student', 'student name', 'full name']
const GRADE_HEADERS = ['grade level', 'gradelevel', 'year level', 'gr']
const COURSE_HEADERS = ['course', 'class', 'subject', 'course name', 'section']
const TERM_HEADERS = ['term', 'quarter', 'semester', 'marking period', 'period', 'mp']
// SPECIFIC FIRST, and the mark column is resolved LAST against columns nothing
// else claimed. "Grade Level" ends with the mark vocab's bare 'grade' via the
// startsWith rule, so a perfectly ordinary export — First, Last, Grade Level,
// Course, Term, Letter Grade — silently stored each student's grade LEVEL as
// their mark. Six letter grades averaged to 10.8 and nothing anywhere said so.
const MARK_HEADERS = [
  'letter grade',
  'final grade',
  'numeric grade',
  'mark',
  'score',
  'percent',
  'pct',
  'average',
  'final',
  'grade',
]
const TEACHER_HEADERS = ['teacher', 'instructor', 'teacher name']
const YEAR_HEADERS = ['year', 'school year', 'sy']

/** Letter → percentage midpoint. Only unambiguous letters convert. */
const LETTER_TO_NUMBER: Record<string, number> = {
  'A+': 98, A: 95, 'A-': 91,
  'B+': 88, B: 85, 'B-': 81,
  'C+': 78, C: 75, 'C-': 71,
  'D+': 68, D: 65, 'D-': 61,
  F: 55,
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function matches(header: string, vocab: string[]): boolean {
  const n = norm(header)
  return vocab.some((v) => n === v || n.startsWith(`${v} `) || n.endsWith(` ${v}`))
}

function isJunk(h: string): boolean {
  const n = norm(h)
  return n === '' || n.startsWith('unnamed') || /^\d+$/.test(n)
}

/** A mark cell: a percentage, a 0–4 GPA point, or a letter. */
export function parseMark(v: unknown): { numeric: number | null; letter: string | null } {
  const raw = String(v ?? '').trim()
  if (raw === '' || raw === '-' || raw === '—' || /^n\/?a$/i.test(raw)) return { numeric: null, letter: null }
  const letterMatch = raw.toUpperCase().match(/^([A-DF][+-]?)$/)
  if (letterMatch) {
    const letter = letterMatch[1]
    return { numeric: LETTER_TO_NUMBER[letter] ?? null, letter }
  }
  const n = Number.parseFloat(raw.replace(/[%\s]/g, ''))
  if (Number.isFinite(n)) return { numeric: n, letter: null }
  // NOT A NUMBER AND NOT A LETTER GRADE — so not a mark. This used to keep the
  // first eight characters as the "letter", which meant any text at all became
  // a grade: a Homeroom column of "B wing" / "C wing" read as B and C, and in
  // the wide shape that turned the room into a course full of grades.
  //
  // The non-letter marks schools actually use are a short, closed vocabulary,
  // and everything outside it is a cell we have no business guessing at.
  const token = raw.toUpperCase().replace(/[.\s]/g, '')
  return NON_LETTER_MARKS.has(token) ? { numeric: null, letter: token } : { numeric: null, letter: null }
}

/** Pass/fail and administrative marks — no numeric equivalent, but real marks. */
const NON_LETTER_MARKS = new Set(['P', 'F', 'S', 'U', 'N', 'I', 'INC', 'W', 'WD', 'NG', 'CR', 'NC', 'AU', 'EX', 'M'])

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else q = false
      } else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export function parseGradebookCsv(
  bytes: Uint8Array | Buffer,
  opts: { schoolYear?: number; term?: string } = {},
): GradebookParseResult {
  const text = new TextDecoder('utf-8').decode(bytes instanceof Buffer ? new Uint8Array(bytes) : bytes)
  const grid = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).map((r) => r.map((c) => String(c ?? '')))
  const headerIdx = detectHeaderRow(grid)
  if (headerIdx < 0) throw new Error('No header row found — the file does not look like a gradebook export.')

  const headers = (grid[headerIdx] ?? []).map((h) => String(h ?? ''))
  const warnings: string[] = []
  if (headerIdx > 0) warnings.push(`Skipped ${headerIdx} row${headerIdx === 1 ? '' : 's'} above the header.`)

  const idx = {
    extId: headers.findIndex((h) => matches(h, ID_HEADERS)),
    first: headers.findIndex((h) => matches(h, FIRST_HEADERS)),
    last: headers.findIndex((h) => matches(h, LAST_HEADERS)),
    // A column that names a TEACHER is not the student name column. "Teacher
    // Name" satisfies NAME_HEADERS via the endsWith(' name') branch, and if it
    // came first it supplied every mark's student — filing a whole class under
    // the teacher, who then matched no roster student and landed unmatched.
    name: headers.findIndex((h) => matches(h, NAME_HEADERS) && !matches(h, TEACHER_HEADERS) && !matches(h, ID_HEADERS)),
    gradeLevel: headers.findIndex((h) => matches(h, GRADE_HEADERS)),
    course: headers.findIndex((h) => matches(h, COURSE_HEADERS)),
    term: headers.findIndex((h) => matches(h, TERM_HEADERS)),
    teacher: headers.findIndex((h) => matches(h, TEACHER_HEADERS)),
    year: headers.findIndex((h) => matches(h, YEAR_HEADERS)),
    // Placeholder — resolved below, once every other column has been claimed.
    mark: -1,
  }

  // THE MARK COLUMN IS WHATEVER IS LEFT that looks like a mark. Every other
  // column is identified by a vocabulary far more specific than the mark's, so
  // resolving it last and skipping already-claimed indices is what keeps a
  // grade-level, a year or a student id from being scored as a grade. Within
  // the leftovers, MARK_HEADERS is ordered most-specific-first and the earlier
  // vocabulary entry wins, so an explicit "Letter Grade" beats a bare "Grade".
  const takenBeforeMark = new Set(Object.values(idx).filter((i) => i >= 0))
  let bestMark = -1
  let bestRank = Number.POSITIVE_INFINITY
  headers.forEach((h, col) => {
    if (takenBeforeMark.has(col)) return
    const rank = MARK_HEADERS.findIndex((v) => matches(h, [v]))
    if (rank >= 0 && rank < bestRank) {
      bestRank = rank
      bestMark = col
    }
  })
  idx.mark = bestMark

  // A named course column + a mark column is the long shape; otherwise wide.
  const shape: 'long' | 'wide' = idx.course >= 0 && idx.mark >= 0 ? 'long' : 'wide'
  const claimed = new Set(Object.values(idx).filter((i) => i >= 0))
  // A WIDE COLUMN HAS TO CONTAIN MARKS. "Unclaimed and not junk" is not the same
  // as "is a course": an export carrying Notes, Homeroom, Advisor or Email
  // turned each of them into a course full of free text, because parseMark's
  // letter fallback happily reads "B wing" as a B. Sample the body and keep only
  // columns where most non-empty values actually parse as a mark.
  const body = grid.slice(headerIdx + 1, headerIdx + 26)
  const looksLikeMarks = (col: number): boolean => {
    const vals = body.map((line) => String(line?.[col] ?? '').trim()).filter((v) => v !== '')
    if (vals.length === 0) return false
    const parsed = vals.filter((v) => {
      const { numeric, letter } = parseMark(v)
      return numeric !== null || letter !== null
    })
    return parsed.length / vals.length >= 0.6
  }
  const wideCols = headers
    .map((h, col) => ({ h, col }))
    .filter(({ h, col }) => !claimed.has(col) && !isJunk(h) && (shape === 'long' || looksLikeMarks(col)))

  if (shape === 'wide' && wideCols.length === 0) {
    throw new Error('No course columns found — expected a course + grade column, or one column per course.')
  }

  const rows: ParsedGradeRow[] = []
  const courses = new Set<string>()
  const terms = new Set<string>()
  let skipped = 0

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const line = grid[r] ?? []
    const cell = (i: number): string => (i >= 0 ? String(line[i] ?? '') : '')
    if (line.every((c) => String(c ?? '').trim() === '')) continue

    const rawName = idx.name >= 0 ? cell(idx.name).trim() || null : null
    let firstName = idx.first >= 0 ? cell(idx.first).trim() || null : null
    let lastName = idx.last >= 0 ? cell(idx.last).trim() || null : null
    if (!firstName && !lastName && rawName) {
      const split = splitName(rawName)
      firstName = split.first
      lastName = split.last
    }
    const externalId = cell(idx.extId).trim() || null
    if (!externalId && !lastName) { skipped++; continue }

    const gradeLevel = toGrade(cell(idx.gradeLevel))
    const yearCell = cell(idx.year)
    const yearMatch = yearCell.match(/(20\d{2})/)
    const schoolYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : (opts.schoolYear ?? null)
    const teacherName = idx.teacher >= 0 ? cell(idx.teacher).trim() || null : null
    // Read ONCE, for both shapes. The wide branch used to stamp every row with
    // opts.term even when the file carried a Term column — the column was
    // correctly excluded from the course list and then never read, so a
    // two-term wide export collapsed into one term.
    const rowTerm = (idx.term >= 0 ? cell(idx.term).trim() : '') || opts.term || null

    const emit = (courseName: string | null, markCell: string, term: string | null) => {
      const { numeric, letter } = parseMark(markCell)
      if (numeric === null && letter === null) return
      if (courseName) courses.add(courseName)
      if (term) terms.add(term)
      rows.push({
        rowNumber: r + 1,
        externalId,
        firstName,
        lastName,
        rawName,
        gradeLevel,
        courseName,
        subject: courseName,
        teacherName,
        term,
        schoolYear,
        numericGrade: numeric,
        letterGrade: letter,
        issues: [],
      })
    }

    if (shape === 'long') {
      emit(cell(idx.course).trim() || null, cell(idx.mark), rowTerm)
    } else {
      for (const { h, col } of wideCols) emit(h.trim(), cell(col), rowTerm)
    }
  }

  if (rows.length === 0) throw new Error('No usable marks found in the file.')
  if (skipped > 0) warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} had no student identifier and were skipped.`)

  return { shape, rows, courses: [...courses], terms: [...terms], warnings, skipped }
}
