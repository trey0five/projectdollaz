// ─────────────────────────────────────────────────────────────────────────────
// SuggestionsStrip — deterministic evidence suggestions for ONE catalog-linked
// standard, rendered inside the dark EvidencePanel. The server matches the
// standard's evidence tags against the school's real artifacts (approved minutes,
// policies, budgets, audits, strategic plans, the live governance report…) and
// each card is one click from becoming a linked evidence row. Already-attached
// artifacts show a checkmark; strategic-plan rows carrying linkAction:'strategy'
// ALSO offer "Link to plan" (PATCH strategySource*). Amber accents on navy.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Check, Link2, Plus, Sparkles } from 'lucide-react'

const keyOf = (s) => `${s.sourceType}:${s.sourceRef ?? ''}`

export default function SuggestionsStrip({ suggestions, canEdit, onAttach, onLinkPlan }) {
  const [busyKey, setBusyKey] = useState(null)
  const [err, setErr] = useState('')

  if (suggestions === null) {
    return (
      <p className="text-[12.5px] text-white/45">Scanning your operations for matching evidence…</p>
    )
  }
  if (!suggestions.length) return null

  const run = async (sug, fn) => {
    if (!fn) return
    setBusyKey(keyOf(sug))
    setErr('')
    try {
      await fn(sug)
    } catch {
      setErr('Could not use this suggestion. Please try again.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#fde68a]">
        <Sparkles size={13} aria-hidden />
        Found {suggestions.length} matching artifact{suggestions.length === 1 ? '' : 's'} in your
        operations
      </p>
      <ul className="space-y-1.5">
        {suggestions.map((sug) => {
          const k = keyOf(sug)
          const busy = busyKey === k
          return (
            <li
              key={k}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-navy/50 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-white/85">{sug.label}</span>
                <span className="block text-[11px] text-white/40">
                  {sug.tag ? sug.tag.replaceAll('_', ' ') : null}
                  {sug.date ? ` · ${sug.date}` : ''}
                </span>
              </span>
              {sug.alreadyAttached ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[12px] font-semibold text-emerald-300">
                  <Check size={12} aria-hidden /> Attached
                </span>
              ) : canEdit ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => run(sug, onAttach)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-2 py-1 text-[12px] font-semibold text-[#fde68a] transition hover:bg-[#F59E0B]/25 disabled:opacity-50"
                  >
                    <Plus size={12} aria-hidden />
                    {busy ? 'Adding…' : 'Add as evidence'}
                  </button>
                  {sug.linkAction === 'strategy' && onLinkPlan ? (
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => run(sug, onLinkPlan)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-[12px] font-semibold text-white/70 transition hover:border-[#F59E0B]/50 hover:text-[#fde68a] disabled:opacity-50"
                      title="Bind this standard to the strategic plan (strategy link, not evidence)"
                    >
                      <Link2 size={12} aria-hidden /> Link to plan
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {err ? <p className="mt-2 text-[12px] text-red-300">{err}</p> : null}
    </div>
  )
}
