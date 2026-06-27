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
import { money, overUnder, pct, ragColor } from '../boardReportUtils.js'
import WizardNav from './WizardNav.jsx'

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
        <h2 className="font-serif text-2xl font-semibold text-navy">
          Statement of operations &amp; narrative
        </h2>
        <p className="mt-1 text-[13.5px] text-muted">
          Review the budget-vs-actual variance, add a short explanation per line, and draft the
          management discussion. Everything saves automatically.
        </p>
      </header>

      {!ops ? (
        <p className="rounded-xl border border-dashed border-border bg-section px-4 py-8 text-center text-[13.5px] italic text-muted">
          No operations data for this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rule/60">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-rule bg-section text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                <th className="py-2.5 pl-3 pr-2 text-left">Line</th>
                <th className="px-2 py-2.5 text-right">Actual</th>
                <th className="px-2 py-2.5 text-right">Budget</th>
                <th className="px-2 py-2.5 text-right">Over (Under)</th>
                <th className="px-2 py-2.5 text-right">%</th>
                <th className="px-2 py-2.5 text-left">Explanation</th>
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
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-navy">
            <Sparkles size={17} className="text-gold" /> Management discussion &amp; analysis
          </h3>
          {canEdit && (
            <div className="flex items-center gap-2">
              {draft.mdaSource && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    draft.mdaSource === 'user'
                      ? 'bg-navy/10 text-navy'
                      : draft.mdaSource === 'llm'
                        ? 'bg-gold/20 text-gold'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                  title={mdaMeta?.configured === false ? 'AI not configured — deterministic baseline' : undefined}
                >
                  {draft.mdaSource === 'user' ? 'Edited' : draft.mdaSource === 'llm' ? 'AI draft' : 'Auto draft'}
                </span>
              )}
              <button
                type="button"
                onClick={draftMda}
                disabled={drafting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12.5px] font-semibold text-navy transition-colors hover:bg-gold/20 disabled:opacity-50"
              >
                {drafting ? (
                  <RefreshCw size={13} className="animate-spin text-gold" />
                ) : draft.mdaText ? (
                  <RefreshCw size={13} className="text-gold" />
                ) : (
                  <Sparkles size={13} className="text-gold" />
                )}
                {drafting ? 'Drafting…' : draft.mdaText ? 'Regenerate' : 'Draft with AI'}
              </button>
            </div>
          )}
        </div>

        {mdaErr && (
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-rose-600">
            <AlertCircle size={14} /> {mdaErr}
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
          className="w-full resize-y rounded-xl border border-border bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition-colors focus:border-gold read-only:bg-section"
        />
        <p className="mt-1 text-[11px] text-muted">
          The narrative always fills from a deterministic baseline first; AI upgrades it when
          configured. Your edits are kept and marked “Edited.”
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
        <p className="mt-2 text-right text-[12px] text-rose-600">{saveError}</p>
      )}
    </div>
  )
}

// ── Render-helpers ────────────────────────────────────────────────────────────

function sectionHeader(label) {
  return (
    <tr key={`hdr-${label}`}>
      <td colSpan={6} className="bg-white pt-3 pl-3 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-gold">
        {label}
      </td>
    </tr>
  )
}

function renderRow(r, type, { canEdit, draft, dispatch }) {
  const color = ragColor(r.favorable, r.variancePct)
  const value = draft.explanations?.[type]?.[r.key] ?? ''
  return (
    <tr key={`${type}-${r.key}`} className="border-b border-rule/40 align-top">
      <td className="py-2 pl-3 pr-2 text-ink">{r.label}</td>
      <td className="px-2 py-2 text-right tabular-nums text-navy">{money(r.actual)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted">
        {r.budget == null ? '—' : money(r.budget)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums" style={{ color: r.variance == null ? undefined : color }}>
        {r.variance == null ? '—' : overUnder(r.variance)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-[12px]" style={{ color: r.variancePct == null ? undefined : color }}>
        {pct(r.variancePct)}
      </td>
      <td className="px-2 py-1.5">
        <textarea
          value={value}
          readOnly={!canEdit}
          onChange={(e) =>
            dispatch({ type: 'setExplanation', categoryType: type, key: r.key, text: e.target.value })
          }
          placeholder={canEdit ? 'Add a comment…' : '—'}
          rows={1}
          className="min-h-[34px] w-full min-w-[140px] resize-y rounded-md border border-border bg-white px-2 py-1.5 text-[12px] leading-snug text-ink outline-none transition-colors focus:border-gold read-only:border-transparent read-only:bg-transparent"
        />
      </td>
    </tr>
  )
}

function renderTotal(label, t, isNet = false) {
  if (!t) return null
  const color = ragColor(t.favorable, t.variancePct)
  return (
    <tr key={label} className={`border-t-2 ${isNet ? 'border-navy/30' : 'border-rule'} font-semibold`}>
      <td className="py-2.5 pl-3 pr-2 text-navy">{label}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-navy">{money(t.actual)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-navy">
        {t.budget == null ? '—' : money(t.budget)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: t.variance == null ? undefined : color }}>
        {t.variance == null ? '—' : overUnder(t.variance)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-[12px]" style={{ color: t.variancePct == null ? undefined : color }}>
        {pct(t.variancePct)}
      </td>
      <td className="px-2 py-2.5" />
    </tr>
  )
}
