// AR/AP aging → briefing attention items. PURE (no Nest/DB) so the threshold logic
// is unit-testable in isolation (cash-briefing.spec.ts). The briefing reads the
// persisted ArApAgingSnapshot DIRECTLY via Prisma and passes the row here — this
// module NEVER touches QboAgingService (the rule that keeps AnalyticsModule off
// IntegrationsModule). Returns [] when row is null (not connected / never captured).
//
// VALUE-SAFE by construction: items carry ONLY aggregate $ + counts (no party names),
// and every figure is placed verbatim in title/why so the narration numeric-guard
// passes for free. ≤2 items (one AR, one AP), edge-triggered so it never cries wolf.
import type { ArApAgingSnapshot } from '@finrep/db'
import type { AttentionItem, AttentionSeverity } from './briefing.service.js'

// Thresholds (edge-triggered — no crying wolf).
const AR_OVERDUE_FLOOR = 1000 // absolute $ floor to surface AR overdue
const AR_MATERIAL_PCT = 0.05 // …or 5% of AR overdue (whichever trips)
const AR_90_CRITICAL_PCT = 0.1 // 10%+ of AR sitting 90+ days out → critical
const AP_OVERDUE_FLOOR = 1000 // absolute $ floor to surface AP past due
const AP_CRITICAL_PCT = 0.5 // mostly-overdue payables → a real cash crunch → critical
const AGING_STALE_DAYS = 45 // snapshot older than this → downgrade AR + refresh nudge

/** Whole-dollar money string, e.g. "$48,200". */
function fmtMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
}

/** A short "as of Jul 7" label from a Date (UTC). */
function asOfLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Whole days between an as-of Date and nowISO (positive when the snapshot is older). */
function ageInDays(asOfDate: Date, nowISO: string): number {
  const now = Date.parse(nowISO)
  const then = asOfDate.getTime()
  if (!Number.isFinite(now) || !Number.isFinite(then)) return 0
  return Math.floor((now - then) / 86_400_000)
}

/**
 * Build the (≤2) cash attention items from a persisted aging snapshot. AR overdue +
 * AP past due, each an aggregate-only value-safe item. Severity is edge-triggered off
 * the stored scalars; a >45-day-old snapshot downgrades the AR item to info and adds a
 * "re-sync QuickBooks" nudge (still actionable, but won't shout critical off stale data).
 */
export function buildAgingAttentionItems(row: ArApAgingSnapshot | null, nowISO: string): AttentionItem[] {
  if (!row) return []
  const items: AttentionItem[] = []
  const asOf = asOfLabel(row.asOfDate)
  const stale = ageInDays(row.asOfDate, nowISO) > AGING_STALE_DAYS

  // ── AR — receivables overdue ──────────────────────────────────────────────
  const arOverdue = row.arOverdue
  const arTotal = row.arTotal
  const ar90 = row.ar90Plus
  if (arOverdue > 0 && (arOverdue >= AR_OVERDUE_FLOOR || (arTotal > 0 && arOverdue / arTotal >= AR_MATERIAL_PCT))) {
    let severity: AttentionSeverity =
      ar90 > 0 && arTotal > 0 && ar90 / arTotal >= AR_90_CRITICAL_PCT ? 'critical' : 'warn'
    let why =
      `${fmtMoney(arOverdue)} in receivables ${arOverdue === 1 ? 'is' : 'are'} past due` +
      (arTotal > 0 ? ` of ${fmtMoney(arTotal)} outstanding` : '')
    if (ar90 > 0) {
      why +=
        ` — ${fmtMoney(ar90)} of it more than 90 days out` +
        (row.ar90Count > 0 ? ` across ${row.ar90Count} account${row.ar90Count === 1 ? '' : 's'}` : '')
    }
    why += ` (as of ${asOf}).`
    if (stale) {
      severity = 'info'
      why += ` This aging is from ${asOf}; re-sync QuickBooks for the current picture.`
    }
    items.push({
      id: 'cash:ar-overdue',
      severity,
      source: 'cash',
      title: `${fmtMoney(arOverdue)} in receivables overdue`,
      why,
      metricKey: null,
      value: arOverdue,
      link: '/cash',
      dueDate: null,
    })
  }

  // ── AP — vendor bills past due ────────────────────────────────────────────
  const apOverdue = row.apOverdue
  const apTotal = row.apTotal
  if (apOverdue > 0 && apOverdue >= AP_OVERDUE_FLOOR) {
    const severity: AttentionSeverity = apTotal > 0 && apOverdue / apTotal >= AP_CRITICAL_PCT ? 'critical' : 'warn'
    let why = `${fmtMoney(apOverdue)} in vendor bills ${apOverdue === 1 ? 'is' : 'are'} past due`
    if (row.apDueSoon > 0) why += `; another ${fmtMoney(row.apDueSoon)} due within 30 days`
    why += ` (as of ${asOf}).`
    items.push({
      id: 'cash:ap-overdue',
      severity,
      source: 'cash',
      title: `${fmtMoney(apOverdue)} in bills past due`,
      why,
      metricKey: null,
      value: apOverdue,
      link: '/cash',
      dueDate: null,
    })
  }

  return items
}
