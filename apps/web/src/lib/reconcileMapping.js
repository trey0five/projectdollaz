// ─────────────────────────────────────────────────────────────────────────────
// Phase 2B — funding-org disbursement parsing + column mapping (web-side).
//
// The funding org (Step Up For Students) exports vary in header naming, so we
// parse a GENERIC table (CSV or XLSX) in the browser and let the user map the
// detected columns to student / program / date / amount. This keeps the pure
// @finrep/compliance package free of any parsing/IO — it only ever receives
// already-mapped Disbursement rows. XLSX uses the same `xlsx` lib the ingestion
// Excel adapter uses; CSV is a small RFC-4180-ish hand-roll (no extra deps).
//
// Nothing here touches the reconciliation MATH — that lives in the pure package.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export const DISBURSEMENT_TEMPLATE_COLUMNS = [
  'Student',
  'Program',
  'PayDate',
  'Amount',
  'Term',
  'BatchRef',
]

/** The mappable target fields. studentRef/program/payDate optional; amount required. */
export const MAPPING_FIELDS = [
  { key: 'studentRef', label: 'Student ref', required: false },
  { key: 'program', label: 'Program', required: false },
  { key: 'payDate', label: 'Pay date', required: false },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'term', label: 'Term', required: false },
  { key: 'batchRef', label: 'Batch ref', required: false },
]

/** A downloadable CSV template the user can fill from their SUFS export. */
export function disbursementTemplateCsv() {
  const sample = [
    ['Student', 'Program', 'PayDate', 'Amount', 'Term', 'BatchRef'],
    ['STU-0001', 'FTC', '2025-08-15', '3750.00', 'Fall', 'B-1001'],
    ['STU-0002', 'FES_UA', '2025-09-15', '5000.00', 'Fall', 'B-1002'],
  ]
  return sample.map((r) => r.join(',')).join('\n') + '\n'
}

// ── Generic table parsing ────────────────────────────────────────────────────

/** RFC-4180-ish CSV parse into a 2D array of strings. */
function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
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
    } else if (ch === '\r') {
      // ignore
    } else field += ch
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Parse a File's pre-read bytes into { headers, rows } where rows is an array of
 * objects keyed by the detected header. Picks the first non-empty row as the
 * header row. Supports .csv and .xls/.xlsx.
 */
export function parseDisbursementTable(fileName, bytes) {
  const isExcel = /\.xlsx?$/i.test(fileName)
  let matrix
  if (isExcel) {
    const wb = XLSX.read(bytes, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
  } else {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    matrix = parseCsv(text)
  }
  // Find the first row with >= 2 non-empty cells as the header.
  let headerIdx = matrix.findIndex(
    (r) => r && r.filter((c) => String(c ?? '').trim() !== '').length >= 2,
  )
  if (headerIdx === -1) return { headers: [], rows: [] }
  const headers = matrix[headerIdx].map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`)
  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i]
    if (!r || r.every((c) => String(c ?? '').trim() === '')) continue
    const obj = {}
    headers.forEach((h, ci) => {
      obj[h] = r[ci] ?? ''
    })
    rows.push(obj)
  }
  return { headers, rows }
}

// ── Auto-mapping heuristics (tolerant of varying funding-org headers) ─────────

const HEADER_HINTS = {
  studentRef: ['student', 'studentid', 'studentref', 'studentnumber', 'pupil', 'childid', 'scholar'],
  program: ['program', 'scholarship', 'tier', 'fund', 'producttype', 'programtype'],
  payDate: ['paydate', 'date', 'paymentdate', 'disbursementdate', 'transactiondate', 'posted', 'paid'],
  amount: ['amount', 'amt', 'paid', 'payment', 'disbursed', 'total', 'value', 'gross', 'net'],
  term: ['term', 'semester', 'period', 'quarter', 'session'],
  batchRef: ['batch', 'batchref', 'reference', 'ref', 'check', 'ach', 'transactionid', 'paymentid'],
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Best-guess mapping of target field -> detected header (or '' when none). */
export function autoMapColumns(headers) {
  const used = new Set()
  const mapping = {}
  for (const field of MAPPING_FIELDS) {
    const hints = HEADER_HINTS[field.key]
    let best = ''
    // Pass 1: exact normalized match.
    for (const h of headers) {
      if (used.has(h)) continue
      if (hints.includes(norm(h))) {
        best = h
        break
      }
    }
    // Pass 2: contains.
    if (!best) {
      for (const h of headers) {
        if (used.has(h)) continue
        const nh = norm(h)
        if (hints.some((hint) => nh.includes(hint))) {
          best = h
          break
        }
      }
    }
    if (best) used.add(best)
    mapping[field.key] = best
  }
  return mapping
}

// ── Mapping -> Disbursement rows ──────────────────────────────────────────────

const VALID_PROGRAMS = ['FTC', 'FES_EO', 'FES_UA']

/** Normalize a funding-org program label to a canonical tier, or null. */
export function normalizeProgram(raw) {
  const n = norm(raw)
  if (!n) return null
  if (n === 'ftc' || n.includes('taxcredit')) return 'FTC'
  if (n === 'fesua' || n.includes('uniqueabilit') || n.includes('esa') || n.includes('ua')) return 'FES_UA'
  if (n === 'feseo' || n.includes('educationalopportun') || n.includes('eo')) return 'FES_EO'
  if (VALID_PROGRAMS.includes(String(raw).trim())) return String(raw).trim()
  return null
}

/** Parse a date cell to ISO yyyy-mm-dd, tolerating common formats; null if unparseable. */
export function normalizeDate(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const s = String(raw).trim()
  // Already ISO.
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // m/d/yyyy or m-d-yyyy.
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s)
  if (m) {
    let [, mo, dy, yr] = m
    if (yr.length === 2) yr = `20${yr}`
    return `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`
  }
  // Excel serial date number.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s)
    if (serial > 0 && serial < 100000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      return d.toISOString().slice(0, 10)
    }
  }
  // Fallback: Date parse (best-effort) then to ISO.
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

/** Parse a currency/number cell to a number, or null. */
export function normalizeAmount(raw) {
  if (raw == null || String(raw).trim() === '') return null
  let s = String(raw).trim()
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[(),$\s]/g, '').replace(/-/g, '')
  if (s === '') return null
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return neg ? -n : n
}

/**
 * Apply a mapping over the parsed table rows -> Disbursement[] (the pure shape).
 * Unmapped optional fields become null. Rows whose amount won't parse keep a null
 * amount (the pure reconciliation flags them as missing_amount).
 */
export function mappingToDisbursements(tableRows, mapping) {
  const get = (row, key) => (mapping[key] ? row[mapping[key]] : undefined)
  return tableRows.map((row) => {
    const amount = normalizeAmount(get(row, 'amount'))
    return {
      studentRef: mapping.studentRef ? String(get(row, 'studentRef') ?? '').trim() || null : null,
      program: mapping.program ? normalizeProgram(get(row, 'program')) : null,
      payDate: mapping.payDate ? normalizeDate(get(row, 'payDate')) : null,
      amount: amount == null ? null : amount,
      term: mapping.term ? String(get(row, 'term') ?? '').trim() || null : null,
      batchRef: mapping.batchRef ? String(get(row, 'batchRef') ?? '').trim() || null : null,
    }
  })
}

/** Rows the API will accept: amount must be a finite number (drop nulls on save). */
export function toApiRows(disbursements) {
  return disbursements
    .filter((d) => typeof d.amount === 'number' && Number.isFinite(d.amount))
    .map((d) => ({
      studentRef: d.studentRef ?? null,
      program: VALID_PROGRAMS.includes(d.program) ? d.program : null,
      payDate: d.payDate ?? null,
      amount: Math.round(d.amount * 100) / 100,
      term: d.term ?? null,
      batchRef: d.batchRef ?? null,
    }))
}
