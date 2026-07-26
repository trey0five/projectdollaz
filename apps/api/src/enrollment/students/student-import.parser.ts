// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Student roster CSV import parser. PURE (Buffers in, candidate rows
// out; no I/O, no Prisma) so it unit-tests directly, mirroring the ingestion
// OneRoster parser's philosophy: throw ONLY on a structurally unusable file
// (unrecognizable headers / empty), degrade everything softer (unmapped grade,
// bad date) into per-row `issues` + file-level `warnings` so a mostly-good file
// still previews. CSV ONLY this phase (the ZIP reader is locked inside
// packages/ingestion and unexported — that package is NOT edited; we import only
// its already-exported ONEROSTER_GRADE_MAP).
//
// Two auto-detected shapes:
//   • OneRoster users.csv (sourcedId/givenName/familyName/role/grades/status…)
//     + an optional demographics.csv joined by sourcedId, and
//   • a simple flat CSV (firstName,lastName,grade[,gender,race,ethnicity,
//     birthDate,status,enrolledOn,withdrawnOn,iep,504,ell,notes,externalId]).
// ─────────────────────────────────────────────────────────────────────────────
import {
  GRADE_KEYS,
  STUDENT_STATUS_KEYS,
  demographicKeyFromLabel,
  type EthnicityKey,
  type GenderKey,
  type GradeKey,
  type RaceKey,
  type StudentStatusKey,
} from '@finrep/analytics'
import { ONEROSTER_GRADE_MAP } from '@finrep/ingestion/oneroster'

/** A candidate roster row in CreateStudentDto shape (grade kept raw when unmapped
 *  so the preview can SHOW what was in the file next to its skip issue). */
export interface StudentCandidate {
  firstName: string
  lastName: string
  grade: string
  gender?: GenderKey | null
  race?: RaceKey | null
  ethnicity?: EthnicityKey | null
  birthDate?: string | null
  status?: StudentStatusKey
  enrolledOn?: string | null
  withdrawnOn?: string | null
  hasIep?: boolean
  has504?: boolean
  ell?: boolean
  notes?: string | null
  externalId?: string | null
}

export interface ParsedImportRow {
  /** 1-based data row number in the source file (header = row 1). */
  row: number
  student: StudentCandidate
  /** Non-empty issues ⇒ the row is not importable as-is (service marks it skipped). */
  issues: string[]
}

export interface ParsedStudentImport {
  shape: 'oneroster' | 'simple'
  rows: ParsedImportRow[]
  warnings: string[]
}

// ── CSV plumbing (local copy — the ingestion parseCsv is unexported) ──────────

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

/** Lowercased, whitespace/underscore-stripped header token for matching. */
function headerKey(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, '')
}

function parseTable(buf: Buffer): { header: string[]; rows: string[][] } {
  const parsed = parseCsv(buf.toString('utf8'))
  if (parsed.length === 0) throw new Error('The CSV file is empty.')
  const header = parsed[0]!.map((h, i) => headerKey(i === 0 ? stripBom(h) : h))
  const rows = parsed
    .slice(1)
    .filter((cells) => !(cells.length === 1 && cells[0]!.trim() === ''))
  return { header, rows }
}

// ── Cell coercions ────────────────────────────────────────────────────────────

/** Boolean cells accept true/false/yes/no/1/0/x (case-insensitive; blank = false). */
function parseBool(cell: string | undefined): boolean {
  const s = (cell ?? '').trim().toLowerCase()
  return s === 'true' || s === 'yes' || s === '1' || s === 'x'
}

/** ISO yyyy-mm-dd prefix (tolerates a time suffix); null when blank/invalid. */
function parseIsoDate(cell: string | undefined): { value: string | null; ok: boolean } {
  const s = (cell ?? '').trim()
  if (!s) return { value: null, ok: true }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? { value: m[1]!, ok: true } : { value: null, ok: false }
}

/** Map a raw grade cell → canonical GradeKey (GRADE_KEYS direct, case-insensitive,
 *  or an ONEROSTER_GRADE_MAP code). Null when unmapped. */
export function normalizeGrade(raw: string): GradeKey | null {
  const s = raw.trim()
  if (!s) return null
  const upper = s.toUpperCase()
  if ((GRADE_KEYS as readonly string[]).includes(upper)) return upper as GradeKey
  return ONEROSTER_GRADE_MAP[s] ?? ONEROSTER_GRADE_MAP[upper] ?? null
}

/** Resolve a demographic cell to a key of the wanted dimension. Accepts the
 *  canonical key directly (case-insensitive) or a verbose label. */
function resolveDim(
  cell: string | undefined,
  dim: 'gender' | 'race' | 'ethnicity',
  keys: readonly string[],
): { key: string | null; ok: boolean } {
  const s = (cell ?? '').trim()
  if (!s) return { key: null, ok: true }
  const direct = keys.find((k) => k.toLowerCase() === s.toLowerCase())
  if (direct) return { key: direct, ok: true }
  const hit = demographicKeyFromLabel(s)
  if (hit && hit.dim === dim) return { key: hit.key, ok: true }
  return { key: null, ok: false }
}

// ── OneRoster demographics.csv join ──────────────────────────────────────────

interface DemographicJoinRow {
  birthDate: string | null
  gender: GenderKey | null
  race: RaceKey | null
  ethnicity: EthnicityKey | null
}

/** OneRoster demographics.csv race boolean column → canonical RaceKey. AIAN folds
 *  to twoOrMore, matching demographicKeyFromLabel (no aian key in the vocab). */
const ONEROSTER_RACE_COLUMNS: Record<string, RaceKey> = {
  americanindianoralaskanative: 'twoOrMore',
  asian: 'asian',
  blackorafricanamerican: 'black',
  nativehawaiianorotherpacificislander: 'nhpi',
  white: 'white',
  demographicracetwoormoreraces: 'twoOrMore',
}

function parseOneRosterDemographics(buf: Buffer, warnings: string[]): Map<string, DemographicJoinRow> {
  const out = new Map<string, DemographicJoinRow>()
  let header: string[]
  let rows: string[][]
  try {
    ;({ header, rows } = parseTable(buf))
  } catch {
    warnings.push('demographics.csv could not be parsed — demographic fields were skipped.')
    return out
  }
  const iId = header.indexOf('sourcedid')
  if (iId < 0) {
    warnings.push('demographics.csv has no sourcedId column — demographic fields were skipped.')
    return out
  }
  const iBirth = header.indexOf('birthdate')
  const iSex = header.indexOf('sex')
  const iHispanic = header.indexOf('hispanicorlatinoethnicity')
  const raceCols = Object.entries(ONEROSTER_RACE_COLUMNS)
    .map(([col, key]) => ({ i: header.indexOf(col), key }))
    .filter((c) => c.i >= 0)

  for (const cells of rows) {
    const id = (cells[iId] ?? '').trim()
    if (!id) continue
    const birth = iBirth >= 0 ? parseIsoDate(cells[iBirth]).value : null
    let gender: GenderKey | null = null
    if (iSex >= 0) {
      const hit = demographicKeyFromLabel((cells[iSex] ?? '').trim())
      if (hit && hit.dim === 'gender') gender = hit.key as GenderKey
    }
    const raceKeys = new Set<RaceKey>()
    for (const { i, key } of raceCols) {
      if (parseBool(cells[i])) raceKeys.add(key)
    }
    const race: RaceKey | null =
      raceKeys.size > 1 ? 'twoOrMore' : raceKeys.size === 1 ? [...raceKeys][0]! : null
    let ethnicity: EthnicityKey | null = null
    if (iHispanic >= 0) {
      const s = (cells[iHispanic] ?? '').trim().toLowerCase()
      if (s === 'true' || s === 'yes' || s === '1') ethnicity = 'hispanic'
      else if (s === 'false' || s === 'no' || s === '0') ethnicity = 'nonHispanic'
    }
    out.set(id, { birthDate: birth, gender, race, ethnicity })
  }
  return out
}

// ── Shapes ────────────────────────────────────────────────────────────────────

function parseOneRosterUsers(
  header: string[],
  rows: string[][],
  demographics: Map<string, DemographicJoinRow>,
  warnings: string[],
): ParsedImportRow[] {
  const col = (name: string) => header.indexOf(name)
  const iId = col('sourcedid')
  const iGiven = col('givenname')
  const iFamily = col('familyname')
  const iRole = col('role')
  const iGrades = col('grades')
  const iStatus = col('status')
  const iEnabled = col('enableduser')
  const out: ParsedImportRow[] = []

  rows.forEach((cells, idx) => {
    const rowNum = idx + 2 // 1-based + header
    const role = (cells[iRole] ?? '').trim().toLowerCase()
    if (role !== 'student') return // teachers/admins are silently dropped (not skipped rows)

    const issues: string[] = []
    const firstName = iGiven >= 0 ? (cells[iGiven] ?? '').trim() : ''
    const lastName = iFamily >= 0 ? (cells[iFamily] ?? '').trim() : ''
    if (!firstName || !lastName) {
      issues.push(`row ${rowNum}: missing givenName/familyName`)
    }
    const externalId = (cells[iId] ?? '').trim() || null

    // Withdrawn detection — mirrors the ingestion tobedeleted/disabled convention.
    const status = (cells[iStatus] ?? '').trim().toLowerCase()
    const disabled = iEnabled >= 0 && (cells[iEnabled] ?? '').trim().toLowerCase() === 'false'
    const withdrawn = status === 'tobedeleted' || disabled

    const gradesRaw = iGrades >= 0 ? (cells[iGrades] ?? '').trim() : ''
    const firstToken = gradesRaw.split(',')[0]!.trim()
    const grade = normalizeGrade(firstToken)
    if (!grade) {
      const msg = `row ${rowNum}: unmapped grade '${firstToken || '(blank)'}' — skipped`
      issues.push(msg)
      warnings.push(msg)
    }

    const demo = externalId ? demographics.get(externalId) : undefined
    // Future birthDate (from the demographics join) = typo — flag like the simple shape.
    if (demo?.birthDate && demo.birthDate > new Date().toISOString().slice(0, 10)) {
      issues.push(`row ${rowNum}: birthDate '${demo.birthDate}' is in the future`)
    }
    out.push({
      row: rowNum,
      student: {
        firstName,
        lastName,
        grade: grade ?? firstToken,
        gender: demo?.gender ?? null,
        race: demo?.race ?? null,
        ethnicity: demo?.ethnicity ?? null,
        birthDate: demo?.birthDate ?? null,
        status: withdrawn ? 'withdrawn' : 'enrolled',
        enrolledOn: null,
        withdrawnOn: null,
        hasIep: false,
        has504: false,
        ell: false,
        notes: null,
        externalId,
      },
      issues,
    })
  })
  return out
}

function parseSimple(header: string[], rows: string[][], warnings: string[]): ParsedImportRow[] {
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const iFirst = col('firstname')
  const iLast = col('lastname')
  const iGrade = col('grade')
  const iGender = col('gender', 'sex')
  const iRace = col('race')
  const iEth = col('ethnicity')
  const iBirth = col('birthdate', 'dob')
  const iStatus = col('status')
  const iEnrolled = col('enrolledon', 'enrolled')
  const iWithdrawn = col('withdrawnon', 'withdrawn')
  const iIep = col('iep', 'hasiep')
  const i504 = col('504', 'plan504', 'has504')
  const iEll = col('ell')
  const iNotes = col('notes')
  const iExt = col('externalid', 'sourcedid')

  const out: ParsedImportRow[] = []
  rows.forEach((cells, idx) => {
    const rowNum = idx + 2
    const issues: string[] = []
    const firstName = (cells[iFirst] ?? '').trim()
    const lastName = (cells[iLast] ?? '').trim()
    if (!firstName || !lastName) issues.push(`row ${rowNum}: missing firstName/lastName`)

    const gradeRaw = iGrade >= 0 ? (cells[iGrade] ?? '').trim() : ''
    const grade = normalizeGrade(gradeRaw)
    if (!grade) {
      const msg = `row ${rowNum}: unmapped grade '${gradeRaw || '(blank)'}' — skipped`
      issues.push(msg)
      warnings.push(msg)
    }

    const gender = resolveDim(iGender >= 0 ? cells[iGender] : undefined, 'gender', ['female', 'male', 'unknown'])
    if (!gender.ok) issues.push(`row ${rowNum}: unrecognized gender '${(cells[iGender] ?? '').trim()}'`)
    const race = resolveDim(iRace >= 0 ? cells[iRace] : undefined, 'race', [
      'asian', 'black', 'hispanicLatino', 'mena', 'nhpi', 'twoOrMore', 'white',
    ])
    if (!race.ok) warnings.push(`row ${rowNum}: unrecognized race '${(cells[iRace] ?? '').trim()}' — left unset`)
    const ethnicity = resolveDim(iEth >= 0 ? cells[iEth] : undefined, 'ethnicity', ['hispanic', 'nonHispanic'])
    if (!ethnicity.ok) warnings.push(`row ${rowNum}: unrecognized ethnicity '${(cells[iEth] ?? '').trim()}' — left unset`)

    const birth = parseIsoDate(iBirth >= 0 ? cells[iBirth] : undefined)
    if (!birth.ok) issues.push(`row ${rowNum}: invalid birthDate '${(cells[iBirth] ?? '').trim()}' (expected YYYY-MM-DD)`)
    // Future birthDate = typo — flag here so the commit-side guard never 400s a whole batch.
    if (birth.value && birth.value > new Date().toISOString().slice(0, 10)) {
      issues.push(`row ${rowNum}: birthDate '${birth.value}' is in the future`)
    }
    const enrolled = parseIsoDate(iEnrolled >= 0 ? cells[iEnrolled] : undefined)
    if (!enrolled.ok) issues.push(`row ${rowNum}: invalid enrolledOn (expected YYYY-MM-DD)`)
    const withdrawnOn = parseIsoDate(iWithdrawn >= 0 ? cells[iWithdrawn] : undefined)
    if (!withdrawnOn.ok) issues.push(`row ${rowNum}: invalid withdrawnOn (expected YYYY-MM-DD)`)

    let status: StudentStatusKey = 'enrolled'
    const statusRaw = iStatus >= 0 ? (cells[iStatus] ?? '').trim().toLowerCase() : ''
    if (statusRaw) {
      if ((STUDENT_STATUS_KEYS as readonly string[]).includes(statusRaw)) {
        status = statusRaw as StudentStatusKey
      } else {
        issues.push(`row ${rowNum}: unknown status '${statusRaw}'`)
      }
    }
    // Cross-field fix-up: a withdrawal date with no explicit terminal status reads
    // as withdrawn (the commit-side rule requires withdrawn/graduated).
    if (withdrawnOn.value && status !== 'withdrawn' && status !== 'graduated') status = 'withdrawn'

    out.push({
      row: rowNum,
      student: {
        firstName,
        lastName,
        grade: grade ?? gradeRaw,
        gender: (gender.key as GenderKey | null) ?? null,
        race: (race.key as RaceKey | null) ?? null,
        ethnicity: (ethnicity.key as EthnicityKey | null) ?? null,
        birthDate: birth.value,
        status,
        enrolledOn: enrolled.value,
        withdrawnOn: withdrawnOn.value,
        hasIep: iIep >= 0 ? parseBool(cells[iIep]) : false,
        has504: i504 >= 0 ? parseBool(cells[i504]) : false,
        ell: iEll >= 0 ? parseBool(cells[iEll]) : false,
        notes: iNotes >= 0 ? (cells[iNotes] ?? '').trim() || null : null,
        externalId: iExt >= 0 ? (cells[iExt] ?? '').trim() || null : null,
      },
      issues,
    })
  })
  return out
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Parse a roster CSV (auto-detected OneRoster users.csv vs simple flat shape)
 * plus an optional OneRoster demographics.csv into candidate rows.
 *
 * @throws only when the file is empty or matches neither shape's headers.
 */
export function parseStudentImport(file: Buffer, demographicsFile?: Buffer): ParsedStudentImport {
  const { header, rows } = parseTable(file)
  const warnings: string[] = []

  const isOneRoster = header.includes('sourcedid') && header.includes('role')
  const isSimple = header.includes('firstname') && header.includes('lastname')

  if (isOneRoster) {
    const demographics = demographicsFile
      ? parseOneRosterDemographics(demographicsFile, warnings)
      : new Map<string, DemographicJoinRow>()
    if (header.indexOf('grades') < 0) {
      throw new Error('OneRoster users.csv is missing the required grades column.')
    }
    return { shape: 'oneroster', rows: parseOneRosterUsers(header, rows, demographics, warnings), warnings }
  }
  if (isSimple) {
    if (header.indexOf('grade') < 0) {
      throw new Error('The roster CSV is missing the required grade column.')
    }
    return { shape: 'simple', rows: parseSimple(header, rows, warnings), warnings }
  }
  throw new Error(
    'Unrecognized roster CSV. Expected OneRoster users.csv headers (sourcedId, givenName, familyName, role, grades) ' +
      'or a simple roster (firstName, lastName, grade, …).',
  )
}
