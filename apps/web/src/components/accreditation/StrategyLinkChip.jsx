// ─────────────────────────────────────────────────────────────────────────────
// StrategyLinkChip — the soft link between one accreditation standard and the
// school's strategic plan (Cognia std 7/26, NSBECS 1/10 all *require* a 3–5 year
// plan as evidence of continuous improvement). Linked → a chip showing the
// resolved strategyLabel deep-linking to /strategy, with an × to clear (explicit
// null clears both fields per the API contract). Unlinked + canEdit → a "Link to
// strategy" button opening an inline picker of the school's plans and goals
// (strategyApi; fail-soft when the strategy module isn't licensed). Dark styling —
// it lives inside the navy EvidencePanel; a compact linked-only chip renders in
// the light register row via `light`.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, X } from 'lucide-react'
import { strategyApi } from '../../lib/api.js'

export default function StrategyLinkChip({ schoolId, standard, canEdit, onLink, onClear, light = false }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(null) // null = loading, { plans, goals }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const linked = standard?.strategySourceType != null && standard?.strategySourceRef != null
  const label =
    standard?.strategyLabel ??
    (standard?.strategySourceType === 'strategy_goal' ? 'Strategy goal' : 'Strategic plan')

  // ── Linked chip (both themes) ───────────────────────────────────────────────
  if (linked) {
    return (
      <span className="inline-flex max-w-full items-center gap-1">
        <Link
          to="/strategy"
          title={`Linked to ${label} — open Strategy`}
          className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition ${
            light
              ? 'border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#b45309] hover:bg-[#F59E0B]/20'
              : 'border-[#F59E0B]/50 bg-[#F59E0B]/15 text-[#fde68a] hover:bg-[#F59E0B]/25'
          }`}
        >
          <Target size={12} aria-hidden className="shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
        {canEdit && onClear ? (
          <button
            type="button"
            onClick={() => onClear(standard.id)}
            aria-label="Clear the strategy link"
            title="Clear the strategy link"
            className={`rounded-full p-1 transition ${
              light
                ? 'text-muted hover:text-danger'
                : 'text-white/45 hover:text-red-300'
            }`}
          >
            <X size={12} />
          </button>
        ) : null}
      </span>
    )
  }

  if (!canEdit || light) return null

  // ── Unlinked: the picker (dark panel only) ─────────────────────────────────
  const openPicker = async () => {
    setOpen(true)
    setErr('')
    setOptions(null)
    try {
      const res = await strategyApi.getPlans(schoolId)
      const plans = res.data?.plans ?? []
      // Goals ride each plan's tree; schools carry ~1 plan so this stays cheap.
      const goals = []
      for (const p of plans) {
        try {
          const full = await strategyApi.getPlan(schoolId, p.id)
          for (const pillar of full.data?.pillars ?? []) {
            for (const g of pillar.goals ?? []) {
              goals.push({ id: g.id, title: g.title ?? g.name ?? 'Goal', planName: p.name })
            }
          }
        } catch {
          /* plan tree unavailable — plans alone still work */
        }
      }
      setOptions({ plans, goals })
    } catch {
      setOptions({ plans: [], goals: [] })
      setErr('Strategy module unavailable — no plans to link.')
    }
  }

  const pick = async (type, ref) => {
    setBusy(true)
    setErr('')
    try {
      await onLink(standard.id, type, ref)
      setOpen(false)
      setOptions(null)
    } catch {
      setErr('Could not link. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-[12px] font-semibold text-white/60 transition hover:border-[#F59E0B]/60 hover:text-[#fde68a]"
      >
        <Target size={12} aria-hidden /> Link to strategy
      </button>
    )
  }

  return (
    <div className="w-full rounded-xl border border-[#F59E0B]/30 bg-navy/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#fde68a]">
          <Target size={13} aria-hidden /> Link to your strategic plan
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setOptions(null)
            setErr('')
          }}
          aria-label="Close strategy picker"
          className="rounded-md p-1 text-white/50 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      {options === null ? (
        <p className="text-[12.5px] text-white/45">Loading your plans…</p>
      ) : (
        <div className="space-y-2.5">
          {options.plans.length === 0 && options.goals.length === 0 && !err ? (
            <p className="text-[12.5px] text-white/45">No strategic plans yet — create one in Strategy.</p>
          ) : null}
          {options.plans.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                Plans
              </p>
              <ul className="space-y-1">
                {options.plans.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pick('strategic_plan', p.id)}
                      className="w-full truncate rounded-lg border border-white/10 bg-navy/50 px-2.5 py-1.5 text-left text-[13px] text-white/85 transition hover:border-[#F59E0B]/50 disabled:opacity-50"
                    >
                      {p.name}
                      {p.fyStartYear ? (
                        <span className="text-white/45">
                          {' '}
                          · FY{String(p.fyStartYear).slice(-2)}–{String(p.fyEndYear ?? p.fyStartYear).slice(-2)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {options.goals.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                Goals
              </p>
              <ul className="space-y-1">
                {options.goals.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pick('strategy_goal', g.id)}
                      className="w-full truncate rounded-lg border border-white/10 bg-navy/50 px-2.5 py-1.5 text-left text-[13px] text-white/85 transition hover:border-[#F59E0B]/50 disabled:opacity-50"
                    >
                      {g.title}
                      <span className="text-white/45"> · {g.planName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      {err ? <p className="mt-2 text-[12px] text-red-300">{err}</p> : null}
    </div>
  )
}
