import { formatMetricValue } from '@finrep/analytics'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Board Report pure presentation helpers. NO financial math here: every
// number rendered comes verbatim from the server-assembled BoardReportBundle
// (sharedShapes). These helpers ONLY format already-computed values for display
// (the wizard table + the print document share them).
// ─────────────────────────────────────────────────────────────────────────────

// Whole-dollar accounting format for board tables: negatives in parentheses,
// null → em dash. Board packets show rounded whole dollars (no cents).
export function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const r = Math.round(n)
  const s = Math.abs(r).toLocaleString('en-US')
  return r < 0 ? `(${s})` : s
}

// "Over (Under)" budget column: same accounting convention as money().
export const overUnder = money

// Signed percent, one decimal. null → em dash.
export function pct(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const s = Math.abs(n).toFixed(1)
  return `${n >= 0 ? '+' : '−'}${s}%`
}

// RAG color for a variance row given the bundle's `favorable` flag (the server
// already encoded the revenue/expense spend-is-bad convention into it).
export function ragColor(favorable, variancePct) {
  if (favorable == null) return '#8a93a6'
  if (favorable) return '#1b7a4b'
  return Math.abs(variancePct ?? 0) > 10 ? '#c0392b' : '#b8860b'
}

// Key-indicator value formatting by unit (matches the bundle's `unit` field).
// Thin shim over the canonical formatMetricValue: the board's KeyIndicator now
// carries canonical MetricUnit values (percent/currency/days/…) plus its own
// 'count' pseudo-unit. 'count' keeps the board's integer/1-dp local logic and
// 'days' keeps the board's plain " days" suffix (no thousands commas); every
// other unit defers to the shared formatter so all surfaces stay in lockstep.
export function formatIndicator(value, unit) {
  if (value == null || Number.isNaN(value)) return '—'
  switch (unit) {
    case 'days':
      return `${Math.round(value)} days`
    case 'count':
      return Number.isInteger(value)
        ? value.toLocaleString('en-US')
        : value.toLocaleString('en-US', { maximumFractionDigits: 1 })
    default:
      return formatMetricValue(value, unit)
  }
}

// "2026-06-30" or ISO → "June 30, 2026". Null-safe.
export function longDate(value) {
  if (!value) return null
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ISO timestamp → "Jun 26, 2026, 3:05 PM". Null-safe.
export function dateTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const DEFAULT_TITLE = 'Financial Report to the Finance Committee'
export const DEFAULT_COMMITTEE = 'Finance Committee'

// Decode a base64 data-URL's payload byte length (client-side pre-send guard so we
// reject an oversized logo with a friendly message before the PATCH). 5MB cap
// mirrors the authoritative server guard.
export const LOGO_MAX_BYTES = 5 * 1024 * 1024
export function dataUrlByteLength(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  // Each base64 char encodes 6 bits; padding '=' trims the tail.
  const padding = (b64.match(/=+$/) || [''])[0].length
  return Math.floor((b64.length * 3) / 4) - padding
}
