// Cash-flow reconciliation → briefing attention item. PURE (no Nest/DB) so the
// gating logic is unit-testable in isolation (reconciliation-briefing.spec.ts). The
// briefing reads the persisted CashFlowSnapshot DIRECTLY via Prisma and passes the
// row here — this module NEVER touches QboCashFlowService (the rule that keeps
// AnalyticsModule off IntegrationsModule). Returns [] when row is null (not connected
// / never captured) OR the books tie / can't be compared — an honest non-signal (the
// green "Reconciled ✓" badge lives on the /cash page, not the briefing).
//
// VALUE-SAFE by construction: the item carries ONLY aggregate $ deltas (no accounts,
// no parties), and every figure is placed verbatim in title/why so the narration
// numeric-guard passes for free. Edge-triggered: fires ONLY when the recon overall
// status is 'differs' AND a STRONG check (cash / net income) is MATERIAL — a differs-
// but-immaterial gap shows amber on the page but never reaches the briefing.
import type { CashFlowSnapshot } from '@finrep/db'
import type { AttentionItem, AttentionSeverity } from './briefing.service.js'

/** Per-check detail persisted on the snapshot (only the fields we read). */
interface ReconDetailCheck {
  material?: boolean
}
type ReconDetail = Record<string, ReconDetailCheck | null | undefined>

/** Whole-dollar money string, e.g. "$48,200". */
function fmtMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
}

/** A short "as of Jul 7" label from a Date (UTC). */
function asOfLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Build the (≤1) reconciliation attention item from a persisted cash-flow snapshot.
 * Fires ONLY when reconStatus is 'differs' AND at least one STRONG check (cash A or
 * net income B) is material (the service stamped `material` into `detail`). Severity is
 * `warn`, escalating to `critical` when BOTH strong checks break (systemic — the view
 * is not faithful to the source). The LOOSE cash-change check (C) can NEVER fire this.
 */
export function buildReconciliationItems(row: CashFlowSnapshot | null, nowISO: string): AttentionItem[] {
  void nowISO // reserved (parity with buildAgingAttentionItems' stale-downgrade hook)
  if (!row) return []
  if (row.reconStatus !== 'differs') return []

  const detail = (row.detail ?? {}) as ReconDetail
  const cashMaterial = detail.cash?.material === true
  const niMaterial = detail.net_income?.material === true
  if (!cashMaterial && !niMaterial) return []

  const severity: AttentionSeverity = cashMaterial && niMaterial ? 'critical' : 'warn'
  const asOf = asOfLabel(row.capturedAt)

  // Compose the value-safe reason from whichever strong check(s) are material. Figures
  // are placed verbatim so the narration numeric-guard passes for free.
  const parts: string[] = []
  if (cashMaterial && row.cashDiff != null) parts.push(`cash differs from QuickBooks by ${fmtMoney(row.cashDiff)}`)
  if (niMaterial && row.netIncomeDiff != null) parts.push(`net income differs by ${fmtMoney(row.netIncomeDiff)}`)
  const lead = parts.length > 0 ? `Your ${parts.join(' and ')}` : 'Your statements differ from QuickBooks'
  const why = `${lead} (as of ${asOf}). Your statements may be built on stale or mis-mapped data — reconcile before relying on them.`

  return [
    {
      id: 'cash:reconciliation',
      severity,
      source: 'cash',
      title: "Your books don't reconcile to QuickBooks",
      why,
      metricKey: null,
      value: cashMaterial && row.cashDiff != null ? row.cashDiff : (row.netIncomeDiff ?? null),
      link: '/cash',
      dueDate: null,
    },
  ]
}
