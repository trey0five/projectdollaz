// ─────────────────────────────────────────────────────────────────────────────
// matchColumns — a schema says what it wants ("first name", "grade"); the file
// says what it has ("Student First", "Gr."). Match by meaning, not spelling:
//   1. exact, after normalizing case / spaces / punctuation ("First_Name" = "first name");
//   2. one contains the other ("student first name" ⊃ "first name");
//   3. a small edit distance for typos ("Birthdate" ~ "Birth date" ~ "Birthdat").
// A column is used once; fields are tried in schema order, so put the specific
// ones ("last name") before the generic ones ("name"). Nothing here throws — a
// missing field is reported, and the caller decides whether to ask.
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldSpec {
  key: string
  /** Shown to people ("Last name"). Also used as a synonym. */
  label: string
  /** Header spellings that mean this field. Compared normalized. */
  synonyms: readonly string[]
  required?: boolean
}

export type MatchHow = 'exact' | 'contains' | 'fuzzy' | 'chosen'

export interface ColumnMatch {
  key: string
  column: number
  header: string
  how: MatchHow
}

export interface ColumnMatches {
  /** field key → column index (only matched fields). */
  mapping: Record<string, number>
  matches: ColumnMatch[]
  /** Required fields with no column. */
  missing: FieldSpec[]
  /** Column indexes no field claimed. */
  unmapped: number[]
}

/** "Student_First-Name " → "studentfirstname". */
export function normalizeHeader(h: string): string {
  return (h ?? '')
    .toLowerCase()
    .replace(/[‘’'"`.]/g, '')
    .replace(/[^a-z0-9#]+/g, '')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

function fuzzyEqual(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false
  const tolerance = Math.max(a.length, b.length) >= 8 ? 2 : 1
  return Math.abs(a.length - b.length) <= tolerance && levenshtein(a, b) <= tolerance
}

/** A person's picks from the mapping popup: field key → column index (−1 / null = "no column"). */
export type ColumnOverride = Record<string, number | null>

export function matchColumns(header: readonly string[], fields: readonly FieldSpec[], override?: ColumnOverride | null): ColumnMatches {
  const norm = header.map(normalizeHeader)
  const taken = new Set<number>()
  const mapping: Record<string, number> = {}
  const matches: ColumnMatch[] = []
  const chosenOff = new Set<string>()

  // Pass 0 — what the person chose wins outright, and a column they chose is
  // never also guessed for another field; a field they set to "none" stays empty.
  for (const f of fields) {
    const pick = override?.[f.key]
    if (pick === undefined) continue
    if (pick === null || pick < 0 || pick >= header.length) {
      chosenOff.add(f.key)
      continue
    }
    if (taken.has(pick)) continue
    taken.add(pick)
    mapping[f.key] = pick
    matches.push({ key: f.key, column: pick, header: header[pick] ?? '', how: 'chosen' })
  }

  const claim = (f: FieldSpec, col: number, how: MatchHow) => {
    taken.add(col)
    mapping[f.key] = col
    matches.push({ key: f.key, column: col, header: header[col] ?? '', how })
  }
  const names = (f: FieldSpec) =>
    Array.from(new Set([f.key, f.label, ...f.synonyms].map(normalizeHeader).filter(Boolean)))

  // Pass 1 — exact. Every field gets its exact match before any fuzzy pass runs,
  // so "last name" can never be stolen by a field whose fuzzy guess came first.
  for (const f of fields) {
    if (f.key in mapping || chosenOff.has(f.key)) continue
    const want = names(f)
    const col = norm.findIndex((h, i) => !taken.has(i) && h !== '' && want.includes(h))
    if (col >= 0) claim(f, col, 'exact')
  }
  // Pass 2 — containment (the longer of the two must be ≥ 4 chars so "id" ⊂ "paid" can't match).
  for (const f of fields) {
    if (f.key in mapping || chosenOff.has(f.key)) continue
    const want = names(f).filter((n) => n.length >= 3)
    const col = norm.findIndex(
      (h, i) =>
        !taken.has(i) &&
        h.length >= 4 &&
        want.some((n) => (h.includes(n) && n.length >= 3 && h.length - n.length <= 12) || (n.includes(h) && h.length >= 4)),
    )
    if (col >= 0) claim(f, col, 'contains')
  }
  // Pass 3 — typos.
  for (const f of fields) {
    if (f.key in mapping || chosenOff.has(f.key)) continue
    const want = names(f)
    const col = norm.findIndex((h, i) => !taken.has(i) && want.some((n) => fuzzyEqual(h, n)))
    if (col >= 0) claim(f, col, 'fuzzy')
  }

  const missing = fields.filter((f) => f.required && !(f.key in mapping))
  const unmapped = header.map((_, i) => i).filter((i) => !taken.has(i) && (header[i] ?? '').trim() !== '')
  return { mapping, matches, missing, unmapped }
}

/** Read one field from a row through the mapping ('' when absent). */
export function cell(row: readonly string[], mapping: Record<string, number>, key: string): string {
  const i = mapping[key]
  return i == null ? '' : (row[i] ?? '').trim()
}

/** "Student, Gr, Homeroom, Email" — for a message that says what we saw. */
export function describeHeader(header: readonly string[], max = 8): string {
  const seen = header.filter((h) => h.trim() !== '')
  const shown = seen.slice(0, max).map((h) => `“${h.trim()}”`)
  return seen.length > max ? `${shown.join(', ')} and ${seen.length - max} more` : shown.join(', ')
}
