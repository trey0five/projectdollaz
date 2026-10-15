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
import { X, FileText, RefreshCw, CheckCircle2, AlertTriangle, Link2, Receipt, Loader2, Building2 } from 'lucide-react'
import { fmt, formatDate } from '../../lib/format.js'
import { useQbDrill, DRILL_STATE_COPY } from '../../hooks/useQbDrill.js'
import TransactionList from './TransactionList.jsx'
import ValueHistory from './ValueHistory.jsx'
import { Section, Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'

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
    <div className="fig !items-start !justify-start !gap-2.5">
      <Icon size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{imp.sourceName}</p>
        <p className="mt-0.5 text-[12px] text-ink2">
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
            className="absolute inset-0 bg-[#0A1628]/30"
            aria-hidden
          />
          {/* The drawer is a Panel (the one raised surface: hairline + the float
              shadow), white, sliding in once from the right. */}
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
            className="relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-hair bg-white shadow-float outline-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-hair px-5 py-4">
              <div className="min-w-0">
                <p className="pg-eyebrow flex items-center gap-1.5">
                  <Link2 size={12} aria-hidden="true" /> Audit trail — figure to source
                </p>
                <h2 className="font-serif text-title font-medium text-ink">{selection.label}</h2>
              </div>
              <button type="button" onClick={onClose} className="btn btn-quiet btn-sm" aria-label="Close trace">
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col px-5 pb-6">
              {/* line value */}
              <div className="pt-5">
                <p className="stat-label">Line total</p>
                <span className="stat-value num !text-[40px] !leading-[44px]">{fmt(lineValue)}</span>
              </div>

              {/* contributing accounts */}
              <Section label="Contributing accounts" className="!mt-6">
                {hasAccounts ? (
                  <>
                    <div className="dt-wrap">
                      <table className="dt">
                        <thead>
                          <tr>
                            <th scope="col">Acct</th>
                            <th scope="col">Description</th>
                            <th scope="col" className="dt-num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sources.map((s, i) => (
                            <tr key={`${s.acct}-${i}`}>
                              <td className="whitespace-nowrap font-mono text-[12px] text-ink2">{s.acct}</td>
                              <td className="max-w-[180px] truncate" title={s.desc}>
                                {s.desc || '—'}
                              </td>
                              <td className={`dt-num ${s.total < 0 ? 'amt-neg' : ''}`}>{fmt(s.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* tie-out */}
                    <p className={`b2-callout mt-3 font-semibold ${ties ? 'b2-good' : 'b2-watch'}`}>
                      {ties ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
                      {ties
                        ? 'Accounts tie out to the line total.'
                        : `Accounts differ from the line by ${fmt(Math.abs(diff))} (reclassed/adjusted).`}
                    </p>
                  </>
                ) : (
                  <p className="text-small italic text-ink2">
                    {line
                      ? 'No account-level detail — this is a calculated subtotal or derived figure.'
                      : 'No line-level detail available for this figure.'}
                  </p>
                )}
              </Section>

              {/* QuickBooks transaction drill — the fourth unfurl: from
                  "these accounts" to the actual QuickBooks transactions inside
                  them. Lazy: nothing fetches until the button is clicked. */}
              {canDrill && (
                <div className="no-print mt-6">
                  {drill.status === 'idle' && (
                    <Button variant="primary" onClick={runDrill} icon={<Receipt size={14} />} className="w-full">
                      View the transactions
                    </Button>
                  )}

                  {drill.status === 'loading' && (
                    <div aria-busy="true">
                      <p className="mb-3 flex items-center gap-2 text-small font-semibold text-ink">
                        <Loader2 size={14} aria-hidden="true" className="animate-spin text-ink2" />
                        Pulling the transactions behind this number…
                      </p>
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="h-6 animate-pulse rounded-[4px] bg-ground" />
                        ))}
                      </div>
                    </div>
                  )}

                  {drill.status === 'error' && (
                    <div className="b2-callout b2-watch flex-col !gap-1" role="alert">
                      <p className="font-semibold">Couldn&apos;t load transactions.</p>
                      <button type="button" onClick={runDrill} className="dt-link">
                        Try again
                      </button>
                    </div>
                  )}

                  {drill.status === 'done' && drillResult?.drillable && (
                    <>
                      {/* Diocesan (Topology B) drill: the rows come from the shared
                          org-wide QuickBooks company, filtered to this school. */}
                      {drillResult.source?.topology === 'org' && (
                        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] italic text-ink2">
                          <Building2 size={13} aria-hidden="true" className="shrink-0" />
                          From your organization&apos;s QuickBooks company.
                        </p>
                      )}
                      <TransactionList result={drillResult} />
                    </>
                  )}

                  {drill.status === 'done' && drillReason && (
                    <p className="text-small italic text-ink2">
                      {DRILL_STATE_COPY[drillReason] ?? 'Transaction detail is unavailable for this line.'}
                    </p>
                  )}
                </div>
              )}

              {/* value history — "how this line changed" across the period's
                  snapshot chain. NOT QBO-gated (upload history matters too):
                  enabled whenever we can reach the API for this line. */}
              {!!schoolId && !!periodId && !!selection?.lineKey && (
                <div className="mt-6">
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
                </div>
              )}

              {/* source provenance */}
              <Section label="Source" className="!mt-6">
                {source ? (
                  <SourceBadge imp={source} />
                ) : (
                  <p className="text-small italic text-ink2">
                    {Array.isArray(imports)
                      ? 'No import on record for this column.'
                      : 'Source appears once this period is saved.'}
                  </p>
                )}
              </Section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
