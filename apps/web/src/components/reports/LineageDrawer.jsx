// ─────────────────────────────────────────────────────────────
// Figure-to-source audit-trail drawer (Phase 0).
//
// Click any statement line → this accessible right-side slide-over shows:
//   (a) CONTRIBUTING ACCOUNTS — the raw trial-balance rows that fed the line
//       (bundle.lineage[statement][variant][lineKey].sources), with a tie-out
//       check against the line value; and
//   (b) SOURCE — the period's active import for that column (file name OR
//       "QuickBooks Online") + when it was imported/synced.
//
// Mirrors MetricDrawer.jsx for a11y/UX: AnimatePresence slide-over, role=dialog
// /aria-modal, Escape + backdrop close, focus into the panel on open, reduced-
// motion → fade. Read-only, screen-only (the affordance lives behind no-print);
// the drawer is fixed/z-50 so it never enters the printed report flow.
//
// Lineage is read entirely from the in-hand client bundle (live generateReports
// or a stored snapshot payload) — no lineage endpoint. `imports` is the period's
// import summaries (importsApi.listForPeriod); it is OPTIONAL, so the Source
// section degrades gracefully (e.g. live intake preview before a period is saved).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, FileText, RefreshCw, CheckCircle2, AlertTriangle, Link2, Receipt, Loader2 } from 'lucide-react'
import { fmt, formatDate } from '../../lib/format.js'
import { useQbDrill, DRILL_STATE_COPY } from '../../hooks/useQbDrill.js'
import TransactionList from './TransactionList.jsx'
import ValueHistory from './ValueHistory.jsx'

// Map a statement id to the import role whose active version fed the column.
const ROLE_BY_VARIANT = { cy: 'cy', py: 'py', audit: 'audit' }

/** Look up the LineLineage for a selection, tolerating the nested/flat shapes. */
function findLineage(bundle, selection) {
  const lin = bundle?.lineage
  if (!lin || !selection) return null
  const { statement, variant, lineKey } = selection
  if (statement === 'SOA') return lin.soa?.[variant]?.[lineKey] ?? null
  if (statement === 'SFP') return lin.sfp?.[variant]?.[lineKey] ?? null
  if (statement === 'SCF') return lin.scf?.[lineKey] ?? null
  if (statement === 'NetAssets') return lin.netAssets?.[lineKey] ?? null
  return null
}

/** The active import that fed this column (cy/py/audit), if loaded. */
function findSource(imports, selection) {
  if (!Array.isArray(imports) || !selection) return null
  // SCF/NetAssets are CY-derived; everything else maps variant → role.
  const role =
    selection.statement === 'SCF' || selection.statement === 'NetAssets'
      ? 'cy'
      : ROLE_BY_VARIANT[selection.variant] ?? 'cy'
  return imports.find((i) => i.role === role && i.active) ?? null
}

function SourceBadge({ imp }) {
  const isQbo = imp.sourceType === 'quickbooks'
  const Icon = isQbo ? RefreshCw : FileText
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-rule/50 bg-white px-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-navy">{imp.sourceName}</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {isQbo ? 'Synced from QuickBooks Online' : 'Uploaded trial balance'}
          {' · '}
          {formatDate((imp.createdAt || '').slice(0, 10))}
        </p>
      </div>
    </div>
  )
}

export default function LineageDrawer({
  open,
  onClose,
  selection,
  bundle,
  imports,
  schoolId = null,
  periodId = null,
}) {
  const reduce = useReducedMotion()
  const panelRef = useRef(null)
  const drill = useQbDrill(schoolId)

  // Clear the transaction drill whenever the selected line changes, so a fresh
  // line never shows the previous line's transactions. Adjusting state during
  // render (guarded by the key) avoids a setState-in-effect — the same pattern
  // Dashboard uses to reset its active tab.
  const selKey = selection ? `${selection.statement}|${selection.variant}|${selection.lineKey}` : null
  const [prevSelKey, setPrevSelKey] = useState(selKey)
  if (selKey !== prevSelKey) {
    setPrevSelKey(selKey)
    drill.reset()
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => panelRef.current?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, onClose])

  const line = findLineage(bundle, selection)
  const source = findSource(imports, selection)
  const sources = line?.sources ?? []
  const hasAccounts = sources.length > 0

  // Tie-out: the lineage stores raw signed TB rows + a sign (revenue = -1), and
  // `value` is the display figure. So sign * Σtotals ≈ value when a line is a
  // direct rollup. Subtotals/derived lines carry sources:[] (no tie-out shown).
  const sourceSum = sources.reduce((s, r) => s + (r.total || 0), 0)
  const signedSum = (line?.sign ?? 1) * sourceSum
  const lineValue = line?.value ?? selection?.value ?? 0
  const diff = signedSum - lineValue
  const ties = Math.abs(diff) < 0.01

  // QuickBooks transaction drill is offered ONLY when this column was synced from
  // QuickBooks (source gate), the line has contributing accounts (subtotals have
  // none), and we can reach the API (schoolId + periodId + a lineKey to resolve).
  const isQbo = source?.sourceType === 'quickbooks'
  const canDrill =
    isQbo && hasAccounts && !!schoolId && !!periodId && !!selection?.lineKey
  const drillResult = drill.status === 'done' ? drill.result : null
  const drillReason = drillResult && !drillResult.drillable ? drillResult.reason : null
  const runDrill = () =>
    drill.run({
      periodId,
      statement: selection.statement,
      variant: selection.variant,
      lineKey: selection.lineKey,
    })

  return (
    <AnimatePresence>
      {open && selection && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`${selection.label} — source trace`}
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto bg-cream shadow-lift outline-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-rule/50 bg-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
                  <Link2 size={19} />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-navy">{selection.label}</h2>
                  <p className="mt-0.5 text-[13px] italic text-muted">Audit trail — figure to source</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-rule/60 p-1.5 text-muted transition-colors hover:border-gold hover:text-navy"
                aria-label="Close trace"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-5 px-5 py-5">
              {/* line value */}
              <div>
                <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Line total
                </p>
                <span className="gold-text font-serif text-[40px] font-semibold leading-none">
                  {fmt(lineValue)}
                </span>
              </div>

              {/* contributing accounts */}
              <div>
                <p className="mb-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Contributing accounts
                </p>
                {hasAccounts ? (
                  <>
                    <div className="overflow-hidden rounded-lg border border-rule/50 bg-white">
                      <div className="grid grid-cols-[64px_minmax(0,1fr)_92px] gap-2 border-b border-rule/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <span>Acct</span>
                        <span>Description</span>
                        <span className="text-right">Amount</span>
                      </div>
                      <ul className="divide-y divide-rule/30">
                        {sources.map((s, i) => (
                          <li
                            key={`${s.acct}-${i}`}
                            className="grid grid-cols-[64px_minmax(0,1fr)_92px] gap-2 px-3 py-2 text-[14px]"
                          >
                            <span className="font-mono text-navy">{s.acct}</span>
                            <span className="truncate text-ink" title={s.desc}>
                              {s.desc || '—'}
                            </span>
                            <span className={`text-right tabular-nums ${s.total < 0 ? 'amt-neg' : 'text-navy'}`}>
                              {fmt(s.total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* tie-out */}
                    <div
                      className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-semibold ${
                        ties
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {ties ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      {ties
                        ? 'Accounts tie out to the line total.'
                        : `Accounts differ from the line by ${fmt(Math.abs(diff))} (reclassed/adjusted).`}
                    </div>
                  </>
                ) : (
                  <p className="rounded-lg border border-rule/50 bg-section px-3 py-3 text-[14px] italic text-muted">
                    {line
                      ? 'No account-level detail — this is a calculated subtotal or derived figure.'
                      : 'No line-level detail available for this figure.'}
                  </p>
                )}
              </div>

              {/* QuickBooks transaction drill — the fourth unfurl: from
                  "these accounts" to the actual QuickBooks transactions inside
                  them. Lazy: nothing fetches until the gold button is clicked. */}
              {canDrill && (
                <div className="no-print">
                  {drill.status === 'idle' && (
                    <button
                      type="button"
                      onClick={runDrill}
                      className="btn-gold w-full"
                    >
                      <Receipt size={15} />
                      View the transactions
                    </button>
                  )}

                  {drill.status === 'loading' && (
                    <div className="rounded-lg border border-rule/50 bg-white p-3">
                      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-navy">
                        <Loader2 size={15} className="animate-spin text-gold" />
                        Pulling the transactions behind this number…
                      </div>
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="h-6 animate-pulse rounded bg-section" />
                        ))}
                      </div>
                    </div>
                  )}

                  {drill.status === 'error' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[14px] text-amber-700">
                      <p className="font-semibold">Couldn&apos;t load transactions.</p>
                      <button
                        type="button"
                        onClick={runDrill}
                        className="mt-1.5 text-[13px] font-semibold text-navy underline decoration-gold underline-offset-2 hover:text-gold"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {drill.status === 'done' && drillResult?.drillable && (
                    <TransactionList result={drillResult} />
                  )}

                  {drill.status === 'done' && drillReason && (
                    <p className="rounded-lg border border-rule/50 bg-section px-3 py-3 text-[14px] italic text-muted">
                      {DRILL_STATE_COPY[drillReason] ?? 'Transaction detail is unavailable for this line.'}
                    </p>
                  )}
                </div>
              )}

              {/* value history — "how this line changed" across the period's
                  snapshot chain. NOT QBO-gated (upload history matters too):
                  enabled whenever we can reach the API for this line. */}
              {!!schoolId && !!periodId && !!selection?.lineKey && (
                <ValueHistory
                  schoolId={schoolId}
                  periodId={periodId}
                  enabled
                  noun="line"
                  swapKey={selKey}
                  selection={{
                    statement: selection.statement,
                    variant: selection.variant,
                    lineKey: selection.lineKey,
                  }}
                />
              )}

              {/* source provenance */}
              <div>
                <p className="mb-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Source
                </p>
                {source ? (
                  <SourceBadge imp={source} />
                ) : (
                  <p className="rounded-lg border border-rule/50 bg-section px-3 py-3 text-[14px] italic text-muted">
                    {Array.isArray(imports)
                      ? 'No import on record for this column.'
                      : 'Source appears once this period is saved.'}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
