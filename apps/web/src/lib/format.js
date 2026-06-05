// ─────────────────────────────────────────────────────────────
// Number & date formatting helpers (ported from the legacy engine)
// ─────────────────────────────────────────────────────────────
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Accounting format: zero/null → em dash, negatives in parentheses. */
export function fmt(n) {
  if (n === 0 || n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `(${s})` : s
}

/** Dollar-prefixed accounting format used for net-asset / total rows. */
export function fmtDollar(n) {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `$(${s})` : `$ ${s}`
}

/** Plain two-decimal number (no dash substitution) for SFP cells. */
export function plain(n) {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "2026-05-29" → "May 29, 2026". Empty → em dash. */
export function formatDate(value) {
  if (!value) return '—'
  const [yr, mo, dy] = value.split('-').map(Number)
  return `${MONTHS[mo - 1]} ${dy}, ${yr}`
}

/** "2026-06-30" → "Jun 30, 2026". Empty → "—". Short form for chips/strips. */
export function formatShortDate(value) {
  if (!value) return '—'
  const [yr, mo, dy] = value.split('-').map(Number)
  return `${MONTHS[mo - 1].slice(0, 3)} ${dy}, ${yr}`
}

export const PERIOD_LABELS = {
  ytd: 'Year-to-Date',
  mtd: 'Month-to-Date',
  fy: 'Full Fiscal Year',
}
