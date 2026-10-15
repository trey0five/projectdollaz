// Step 3 — Variance review + per-line explanations + MD&A (the editing heart).
// The budget-vs-actual table renders rows from operations.revenue/expense VERBATIM
// (Actual / Budget / Over(Under) / % columns, RAG-colored, totals + Net Surplus).
// An editable Explanation textarea per line writes into draft.explanations[type]
// [key] (debounced PUT, DEEP-merged server-side so siblings survive). The MD&A
// panel drafts via POST mda (rule baseline + optional LLM, 12s server cap — never
// blank, never hangs); editing flips mdaSource -> 'user'. Empty-budget: budget/
// over-under cells render em-dash but explanations + MD&A stay fully usable.
import { useState } from 'react'
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react'
import { boardReportApi } from '../../../../lib/api.js'
import { money, overUnder, pct } from '../boardReportUtils.js'
import WizardNav from './WizardNav.jsx'
import { Pill } from '../../../ui/surface/index.js'

export default function Step3Variance({ ctx }) {
  const { data, draft, dispatch, goTo, canEdit, saving, saveError, schoolId } = ctx
  const ops = data?.operations

  // MD&A draft state (the generate call is local to this step).
  const [drafting, setDrafting] = useState(false)
  const [mdaErr, setMdaErr] = useState('')
  const [mdaMeta, setMdaMeta] = useState(null) // { source, configured } from the last draft

  const draftMda = async () => {
    if (!schoolId || !draft.periodId) return
    setDrafting(true)
    setMdaErr('')
    try {
      const res = await boardReportApi.mda(schoolId, draft.periodId, {})
      const text = res.data?.text || ''
      dispatch({ type: 'setMda', text, source: res.data?.source || 'rule' })
      setMdaMeta({ source: res.data?.source || 'rule', configured: !!res.data?.configured })
    } catch {
      setMdaErr('Could not draft the narrative. You can still write it yourself below.')
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-serif text-title font-medium text-ink">
          Statement of operations &amp; narrative
        </h2>
        <p className="mt-1 text-[13.5px] text-ink2">
          Review the budget-vs-actual variance, add a short explanation per line, and draft the
          management discussion. Everything saves automatically.
        </p>
      </header>

      {!ops ? (
        <p className="b2-note">No operations data for this period.</p>
      ) : (
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" className="dt-num">Actual</th>
                <th scope="col" className="dt-num">Budget</th>
                <th scope="col" className="dt-num">Over (Under)</th>
                <th scope="col" className="dt-num">%</th>
                <th scope="col">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {sectionHeader('Revenue')}
              {(ops.revenue || []).map((r) => renderRow(r, 'revenue', { canEdit, draft, dispatch }))}
              {renderTotal('Total revenue', ops.revenueTotals)}

              {sectionHeader('Expenses')}
              {(ops.expense || []).map((r) => renderRow(r, 'expense', { canEdit, draft, dispatch }))}
              {renderTotal('Total expenses', ops.expenseTotals)}

              {renderTotal('Net surplus / (deficit)', ops.netSurplus, true)}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MD&A editor ─────────────────────────────────────────────────────── */}
      <section className="mt-7">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-heading font-semibold text-ink">
            <Sparkles size={16} aria-hidden="true" className="text-penny" /> Management discussion &amp; analysis
          </h3>
          {canEdit && (
            <div className="flex items-center gap-2">
              {draft.mdaSource && (
                <Pill
                  title={mdaMeta?.configured === false ? 'AI not configured — deterministic baseline' : undefined}
                >
                  {draft.mdaSource === 'llm' ? <Sparkles size={10} aria-hidden="true" className="text-penny" /> : null}
                  {draft.mdaSource === 'user' ? 'Edited' : draft.mdaSource === 'llm' ? 'AI draft' : 'Auto draft'}
                </Pill>
              )}
              <button
                type="button"
                onClick={draftMda}
                disabled={drafting}
                className="btn btn-secondary btn-sm"
              >
                {drafting ? (
                  <RefreshCw size={13} aria-hidden="true" className="animate-spin text-penny" />
                ) : draft.mdaText ? (
                  <RefreshCw size={13} aria-hidden="true" className="text-penny" />
                ) : (
                  <Sparkles size={13} aria-hidden="true" className="text-penny" />
                )}
                {drafting ? 'Drafting…' : draft.mdaText ? 'Regenerate' : 'Draft with AI'}
              </button>
            </div>
          )}
        </div>

        {mdaErr && (
          <p className="b2-callout b2-risk mb-2" role="alert">
            <AlertCircle size={14} aria-hidden="true" /> {mdaErr}
          </p>
        )}

        <textarea
          value={draft.mdaText || ''}
          readOnly={!canEdit}
          onChange={(e) =>
            dispatch({ type: 'setMda', text: e.target.value, source: 'user' })
          }
          placeholder="Draft a short narrative for the committee — operating results, what drove the variances, and your outlook. Use “Draft with AI” to start from a baseline."
          rows={7}
          className="w-full resize-y rounded-[6px] border border-hair/[0.18] bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 read-only:bg-ground"
        />
        <p className="mt-1 text-[11px] text-ink2">
          KYRO drafts this from your variances; edit it before it goes in the packet. Your edits
          are kept and marked “Edited.”
        </p>
      </section>

      <WizardNav
        onBack={() => goTo(2)}
        onNext={() => goTo(4)}
        nextLabel="Branding"
        saving={saving}
        saved={!saving && !saveError}
      />
      {saveError && (
        <p className="b2-callout b2-risk mt-2" role="alert">{saveError}</p>
      )}
    </div>
  )
}

// ── Render-helpers ────────────────────────────────────────────────────────────

function sectionHeader(label) {
  return (
    <tr key={`hdr-${label}`} className="dt-section">
      <td colSpan={6} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
        {label}
      </td>
    </tr>
  )
}

// Variance tone (the RAG rule the packet prints): a 2px mark beside the ink
// figure — never coloured text on screen.
function ragTone(favorable, variancePct) {
  if (favorable == null) return null
  if (favorable) return 'good'
  return Math.abs(variancePct ?? 0) > 10 ? 'risk' : 'watch'
}
function varianceCell(value, tone, extra = '') {
  return (
    <td className={`dt-num whitespace-nowrap ${extra}`}>
      {tone && value !== '—' ? <i className={`mark tone-${tone} mr-1.5`} aria-label={tone === 'good' ? 'favorable' : 'unfavorable'} /> : null}
      {value}
    </td>
  )
}

function renderRow(r, type, { canEdit, draft, dispatch }) {
  const tone = ragTone(r.favorable, r.variancePct)
  const value = draft.explanations?.[type]?.[r.key] ?? ''
  return (
    <tr key={`${type}-${r.key}`}>
      <td>{r.label}</td>
      <td className="dt-num">{money(r.actual)}</td>
      <td className="dt-num text-ink2">{r.budget == null ? '—' : money(r.budget)}</td>
      {varianceCell(r.variance == null ? '—' : overUnder(r.variance), tone)}
      <td className="dt-num text-[12px] text-ink2">{pct(r.variancePct)}</td>
      <td className="py-1">
        <textarea
          value={value}
          readOnly={!canEdit}
          aria-label={`Explanation for ${r.label}`}
          onChange={(e) =>
            dispatch({ type: 'setExplanation', categoryType: type, key: r.key, text: e.target.value })
          }
          placeholder={canEdit ? 'Add a comment…' : '—'}
          rows={1}
          className="block min-h-[28px] w-full min-w-[140px] resize-y rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-[12px] leading-snug text-ink outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 read-only:border-transparent read-only:bg-transparent"
        />
      </td>
    </tr>
  )
}

function renderTotal(label, t, isNet = false) {
  if (!t) return null
  const tone = ragTone(t.favorable, t.variancePct)
  return (
    <tr key={label} className={isNet ? 'dt-section-total' : 'dt-subtotal'}>
      <td className="font-semibold">{label}</td>
      <td className="dt-num font-semibold">{money(t.actual)}</td>
      <td className="dt-num">{t.budget == null ? '—' : money(t.budget)}</td>
      {varianceCell(t.variance == null ? '—' : overUnder(t.variance), tone, 'font-semibold')}
      <td className="dt-num text-[12px] text-ink2">{pct(t.variancePct)}</td>
      <td />
    </tr>
  )
}
