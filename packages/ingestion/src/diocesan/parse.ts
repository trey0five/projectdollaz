// ─────────────────────────────────────────────────────────────────────────────
// Multi-school diocesan enrollment parser — turns ONE org file (all schools at
// once) into a list of per-school NormalizedDiocesanRow. SERVER-ONLY (uses xlsx);
// kept off the browser barrel (the vite gotcha) — the API imports it, web never.
//
// Auto-detects the two real source shapes from the header row and NEVER throws
// (OneRoster semantics: a structurally unusable file degrades to empty rows + a
// file-level warning; an unknown grade column / demographic label degrades to a
// per-row warning). FY resolution (Jul–Jun) happens downstream in the API's
// intakeNormalized, not here.
//
//   Shape 1 — Admissions dashboard: {School Name, New, Returning, Total} per row.
//   Shape 2 — Enrollment details. TWO real physical layouts:
//     2a FLAT  — {School Name, <grade cols>, <demographic cols>, as-of} per row.
//     2b BLOCK — one per-school BLOCK stacked down the sheet: a header row (col 0 =
//                SCHOOL NAME, remaining cols = grade labels + Total), then section
//                groups ("Gender"/"Ethnicity"/"Race") whose labeled data rows carry
//                per-grade counts, then a "Total" row. byGrade + totalEnrolled come
//                from the block's Total row; each demographic ROW LABEL folds into
//                byDemographics under its current section. Detected by the presence
//                of a Gender/Ethnicity/Race section-header row; else we parse flat.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import {
  demographicKeyFromLabel,
  GRADE_KEYS,
  type DemographicBreakdown,
  type EthnicityKey,
  type GenderKey,
  type GradeKey,
  type RaceKey,
} from '@finrep/analytics'
import type { DiocesanParseResult, NormalizedDiocesanRow } from '@finrep/db'

export interface ParseDiocesanOptions {
  /** Override the as-of date (ISO yyyy-mm-dd); otherwise parsed from the file. */
  observedOn?: string
}

const clean = (v: unknown): string => String(v ?? '').trim()
const lc = (v: unknown): string => clean(v).toLowerCase()

/** A count cell → non-negative integer (blank / non-numeric → 0). */
function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/**
 * Column header → canonical GradeKey. Handles zero-padded numerics ('01'→'1'),
 * 'K'/'KG', 'PK3'/'PK4' (verbatim), skips 'Total' (→ null), and returns null for an
 * unknown column so the caller can warn.
 */
export function gradeKeyFromColumn(header: string | null | undefined): GradeKey | null {
  const raw = clean(header)
  if (!raw) return null
  const up = raw.toUpperCase().replace(/\s+/g, '')
  if (up === 'TOTAL') return null
  // Direct GradeKey (PK3, PK4, K, 1..12).
  if ((GRADE_KEYS as readonly string[]).includes(up)) return up as GradeKey
  // PreK tiers.
  if (/^(PK3|PREK3|PK-?3|PRE-?K3)$/.test(up)) return 'PK3'
  if (/^(PK4|PREK4|PK-?4|PRE-?K4|VPK|TK)$/.test(up)) return 'PK4'
  // Kindergarten.
  if (up === 'K' || up === 'KG' || up === 'KINDER' || up === 'KINDERGARTEN') return 'K'
  // Zero-padded / bare numerics 1..12.
  const m = /^0*(\d{1,2})$/.exec(up)
  if (m) {
    const n = Number(m[1])
    if (n >= 1 && n <= 12) return String(n) as GradeKey
  }
  return null
}

/** Does a header look like an (unrecognized) grade column, so we should warn? */
function looksLikeGradeColumn(header: string): boolean {
  const up = header.toUpperCase().replace(/\s+/g, '')
  return /^(PK|PRE|K|G|GR|GRADE|\d)/.test(up)
}

/** Parse a US-style MM/DD/YYYY (or ISO yyyy-mm-dd) date string → ISO yyyy-mm-dd. */
function toIsoDate(raw: string): string | null {
  const s = clean(raw)
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (us) {
    const mm = us[1]!.padStart(2, '0')
    const dd = us[2]!.padStart(2, '0')
    return `${us[3]}-${mm}-${dd}`
  }
  return null
}

/** Scan every cell for an "as of MM/DD/YYYY" (or bare date) and return the ISO date. */
function findObservedOn(grid: string[][]): string | null {
  for (const row of grid) {
    for (const cell of row) {
      const s = clean(cell)
      if (/as of/i.test(s)) {
        const iso = toIsoDate(s)
        if (iso) return iso
      }
    }
  }
  // Fallback: any bare date cell.
  for (const row of grid) {
    for (const cell of row) {
      const iso = toIsoDate(clean(cell))
      if (iso) return iso
    }
  }
  return null
}

interface ColumnMap {
  schoolNameCol: number
  totalCol: number
  newCol: number
  returningCol: number
  gradeCols: { idx: number; key: GradeKey }[]
  demoCols: { idx: number; dim: 'gender' | 'ethnicity' | 'race'; key: string }[]
  unknownGradeHeaders: string[]
}

/** Classify a header row into named columns. */
function classifyHeader(header: string[]): ColumnMap {
  const map: ColumnMap = {
    schoolNameCol: -1,
    totalCol: -1,
    newCol: -1,
    returningCol: -1,
    gradeCols: [],
    demoCols: [],
    unknownGradeHeaders: [],
  }
  header.forEach((raw, idx) => {
    const h = clean(raw)
    const low = h.toLowerCase()
    if (!h) return
    if (map.schoolNameCol < 0 && /(school|name)/.test(low) && gradeKeyFromColumn(h) == null) {
      map.schoolNameCol = idx
      return
    }
    if (low === 'total' || low === 'total enrolled' || low === 'grand total') {
      if (map.totalCol < 0) map.totalCol = idx
      return
    }
    if (low === 'new' || low === 'new students') {
      map.newCol = idx
      return
    }
    if (/^(returning|ret|returners)/.test(low)) {
      map.returningCol = idx
      return
    }
    const gk = gradeKeyFromColumn(h)
    if (gk) {
      map.gradeCols.push({ idx, key: gk })
      return
    }
    const demo = demographicKeyFromLabel(h)
    if (demo) {
      map.demoCols.push({ idx, dim: demo.dim, key: demo.key })
      return
    }
    if (looksLikeGradeColumn(h)) map.unknownGradeHeaders.push(h)
  })
  return map
}

/** The first row (within the first few) that classifies as a usable header. */
function findHeaderRow(grid: string[][]): { rowIdx: number; map: ColumnMap } | null {
  const limit = Math.min(grid.length, 12)
  for (let r = 0; r < limit; r++) {
    const map = classifyHeader(grid[r]!)
    const usable =
      map.gradeCols.length > 0 ||
      (map.newCol >= 0 && map.returningCol >= 0) ||
      (map.schoolNameCol >= 0 && (map.totalCol >= 0 || map.demoCols.length > 0))
    if (usable) return { rowIdx: r, map }
  }
  return null
}

/** Set a nested demographic count, creating the dimension bucket on first write. */
function addDemo(bd: DemographicBreakdown, dim: 'gender' | 'ethnicity' | 'race', key: string, count: number): void {
  if (count <= 0) return
  if (dim === 'gender') {
    bd.gender ??= {}
    bd.gender[key as GenderKey] = (bd.gender[key as GenderKey] ?? 0) + count
  } else if (dim === 'ethnicity') {
    bd.ethnicity ??= {}
    bd.ethnicity[key as EthnicityKey] = (bd.ethnicity[key as EthnicityKey] ?? 0) + count
  } else {
    bd.race ??= {}
    bd.race[key as RaceKey] = (bd.race[key as RaceKey] ?? 0) + count
  }
}

// ── Shape 2b — per-school BLOCK layout ──────────────────────────────────────────

/** The section-group header labels that mark the BLOCK layout (col-0 keywords). */
const SECTION_BY_LABEL: Record<string, 'gender' | 'ethnicity' | 'race'> = {
  gender: 'gender',
  ethnicity: 'ethnicity',
  race: 'race',
}

/** Does this grid use the stacked per-school BLOCK layout? Signalled uniquely by a
 *  lone Gender/Ethnicity/Race section-header row (col 0), absent from the flat shapes. */
function looksLikeBlockLayout(grid: string[][]): boolean {
  return grid.some((row) => !!SECTION_BY_LABEL[lc(row?.[0])])
}

/** Classify a block-header row's grade columns (col 0 is the school name, skipped). */
function blockGradeCols(cells: string[]): {
  gradeCols: { idx: number; key: GradeKey }[]
  totalCol: number
  unknownGradeHeaders: string[]
} {
  const gradeCols: { idx: number; key: GradeKey }[] = []
  let totalCol = -1
  const unknownGradeHeaders: string[] = []
  cells.forEach((raw, idx) => {
    if (idx === 0) return // col 0 is the school name
    const h = clean(raw)
    if (!h) return
    if (h.toLowerCase() === 'total') {
      if (totalCol < 0) totalCol = idx
      return
    }
    const gk = gradeKeyFromColumn(h)
    if (gk) {
      gradeCols.push({ idx, key: gk })
      return
    }
    if (looksLikeGradeColumn(h)) unknownGradeHeaders.push(h)
  })
  return { gradeCols, totalCol, unknownGradeHeaders }
}

interface BlockAccum {
  sourceName: string
  gradeCols: { idx: number; key: GradeKey }[]
  totalCol: number
  byGrade: Partial<Record<GradeKey, number>>
  byDemographics: DemographicBreakdown
  total: number
  warnings: string[]
}

/** The overall count for a demographic data row: its Total column, else summed grades. */
function rowTotal(block: BlockAccum, cells: string[]): number {
  if (block.totalCol >= 0) {
    const t = num(cells[block.totalCol])
    if (t > 0) return t
  }
  return block.gradeCols.reduce((s, g) => s + num(cells[g.idx]), 0)
}

/** Fold a finished block accumulator into a NormalizedDiocesanRow. */
function finishBlock(block: BlockAccum): NormalizedDiocesanRow {
  const gradeSum = Object.values(block.byGrade).reduce((s, v) => s + (v ?? 0), 0)
  const hasDemo = !!(block.byDemographics.gender || block.byDemographics.ethnicity || block.byDemographics.race)
  return {
    sourceName: block.sourceName,
    total: block.total > 0 ? block.total : gradeSum,
    byGrade: block.byGrade,
    byStatus: null,
    byDemographics: hasDemo ? block.byDemographics : null,
    warnings: block.warnings,
  }
}

/**
 * BLOCK reader (Shape 2b): walk the grid, opening a new block on each school-header
 * row (col 0 = a non-empty, non-section, non-demographic name with ≥3 grade columns),
 * routing labeled demographic rows into the current section, and taking byGrade +
 * totalEnrolled from the block's "Total" row.
 */
function parseDiocesanBlocks(grid: string[][], observedOn: string | null): DiocesanParseResult {
  const rows: NormalizedDiocesanRow[] = []
  const warnings: string[] = []
  let block: BlockAccum | null = null
  let section: 'gender' | 'ethnicity' | 'race' | null = null

  const flush = (): void => {
    if (block) rows.push(finishBlock(block))
    block = null
    section = null
  }

  for (const cells of grid) {
    const label = clean(cells[0])
    const low = label.toLowerCase()

    if (!label) continue // blank spacer / blank-labeled (unknown) demographic row → skip

    // Section-group header ("Gender"/"Ethnicity"/"Race").
    if (SECTION_BY_LABEL[low]) {
      section = SECTION_BY_LABEL[low]!
      continue
    }

    // The block's grand-Total row → byGrade + totalEnrolled.
    if (low === 'total') {
      if (block) {
        for (const g of block.gradeCols) {
          const n = num(cells[g.idx])
          if (n > 0) block.byGrade[g.key] = (block.byGrade[g.key] ?? 0) + n
        }
        block.total = block.totalCol >= 0 ? num(cells[block.totalCol]) : 0
      }
      continue
    }

    // A demographic ROW LABEL folds into byDemographics under the current section.
    const hit = demographicKeyFromLabel(label)
    if (hit) {
      if (block && section && hit.dim === section) {
        addDemo(block.byDemographics, hit.dim, hit.key, rowTotal(block, cells))
      }
      continue
    }

    // Otherwise: a candidate new school-block header (needs real grade columns).
    const { gradeCols, totalCol, unknownGradeHeaders } = blockGradeCols(cells)
    if (gradeCols.length >= 3) {
      flush()
      block = {
        sourceName: label,
        gradeCols,
        totalCol,
        byGrade: {},
        byDemographics: {},
        total: 0,
        warnings: unknownGradeHeaders.map((h) => `Column '${h}' is not a known grade — not counted.`),
      }
    }
    // A stray unrecognized label with no grade columns is ignored.
  }
  flush()

  if (rows.length === 0) warnings.push('No school blocks were found in the file.')
  return { sourceShape: 'details', observedOn: observedOn ?? null, rows, warnings }
}

/**
 * Parse a diocesan enrollment file (xlsx or csv) into per-school normalized rows.
 * Never throws — returns `{ rows: [], warnings: [...] }` on an unusable file.
 */
export function parseDiocesanEnrollment(
  buffer: Buffer,
  opts: ParseDiocesanOptions = {},
): DiocesanParseResult {
  const warnings: string[] = []
  let grid: string[][] = []
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = wb.SheetNames[0]
    if (sheetName) {
      const sheet = wb.Sheets[sheetName]!
      grid = XLSX.utils
        .sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
        .map((row) => (Array.isArray(row) ? row.map((c) => clean(c)) : []))
    }
  } catch {
    return { sourceShape: 'details', observedOn: opts.observedOn ?? null, rows: [], warnings: ['Could not read the file as a spreadsheet or CSV.'] }
  }

  if (grid.length === 0) {
    return { sourceShape: 'details', observedOn: opts.observedOn ?? null, rows: [], warnings: ['The file has no rows.'] }
  }

  const observedOn = opts.observedOn ?? findObservedOn(grid)

  // Shape 2b — stacked per-school BLOCK layout (detected by a section-header row).
  if (looksLikeBlockLayout(grid)) {
    return parseDiocesanBlocks(grid, observedOn ?? null)
  }

  const found = findHeaderRow(grid)
  if (!found) {
    return {
      sourceShape: 'details',
      observedOn: observedOn ?? null,
      rows: [],
      warnings: ['Could not find a recognizable header row (expected a School Name column with grade or admissions columns).'],
    }
  }
  const { rowIdx, map } = found
  const isAdmissions = map.gradeCols.length === 0 && map.newCol >= 0 && map.returningCol >= 0
  const sourceShape = isAdmissions ? 'admissions' : 'details'

  const colWarnings: string[] = []
  if (map.unknownGradeHeaders.length > 0) {
    for (const h of map.unknownGradeHeaders) {
      colWarnings.push(`Column '${h}' is not a known grade — not counted.`)
    }
  }

  const rows: NormalizedDiocesanRow[] = []
  for (let r = rowIdx + 1; r < grid.length; r++) {
    const cells = grid[r]!
    // Resolve the school name — the name column, else the first non-numeric cell.
    let sourceName =
      map.schoolNameCol >= 0 ? clean(cells[map.schoolNameCol]) : ''
    if (!sourceName) {
      const firstText = cells.find((c) => clean(c) && num(c) === 0 && !/^\d/.test(clean(c)))
      sourceName = clean(firstText)
    }
    if (!sourceName) continue // blank line / spacer
    // Skip an obvious grand-total / footer row.
    if (/^(total|grand total|all schools|totals?)$/i.test(sourceName)) continue

    const byGrade: Partial<Record<GradeKey, number>> = {}
    for (const g of map.gradeCols) {
      const n = num(cells[g.idx])
      if (n > 0) byGrade[g.key] = (byGrade[g.key] ?? 0) + n
    }

    const byDemographics: DemographicBreakdown = {}
    for (const d of map.demoCols) addDemo(byDemographics, d.dim, d.key, num(cells[d.idx]))
    const hasDemo = !!(byDemographics.gender || byDemographics.ethnicity || byDemographics.race)

    const newCount = map.newCol >= 0 ? num(cells[map.newCol]) : 0
    const returningCount = map.returningCol >= 0 ? num(cells[map.returningCol]) : 0
    const byStatus =
      map.newCol >= 0 || map.returningCol >= 0 ? { new: newCount, returning: returningCount } : null

    const gradeSum = Object.values(byGrade).reduce((s, v) => s + (v ?? 0), 0)
    const totalCell = map.totalCol >= 0 ? num(cells[map.totalCol]) : 0
    const total =
      totalCell > 0
        ? totalCell
        : isAdmissions
          ? newCount + returningCount
          : gradeSum

    rows.push({
      sourceName,
      total,
      byGrade,
      byStatus,
      byDemographics: hasDemo ? byDemographics : null,
      warnings: [...colWarnings],
    })
  }

  if (rows.length === 0) warnings.push('No school rows were found under the header.')

  return { sourceShape, observedOn: observedOn ?? null, rows, warnings }
}
