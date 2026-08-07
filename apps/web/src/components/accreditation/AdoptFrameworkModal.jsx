// ─────────────────────────────────────────────────────────────────────────────
// AdoptFrameworkModal — pick an accreditor framework and pull its full standards
// catalog into the school's register. Built on the shared EntityFormModal shell
// (this is a plain modal, NOT a RecordFlow — the AddDataWizard configs are
// untouched). Radio CARDS: accreditor + version, standard/assurance counts, a
// rubric-label preview, and an "Adopted" badge when the school already carries
// it (re-adopt is idempotent — it fills gaps, never dupes). Submit → POST adopt
// → the caller refreshes standards + readiness.
//
// AND REMOVAL LIVES HERE TOO, on the same screen, because adopt and un-adopt are
// one decision: this is the only place you can see what you already hold while
// choosing what to change. A school may now hold several frameworks and the
// catalog offers seven, so "I adopted the wrong one" became a realistic and
// expensive mistake — and until this, undoing it meant deleting up to 42
// standards one row at a time.
//
// REMOVING IS ALWAYS PERMITTED. Refusing to remove a framework a school had
// already scored would strand exactly the person who needs it most. What stands
// between a mis-click and a year of lost work is the COUNT: the server counts
// the loss first, this modal makes the school read it, and only then does the
// delete run.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Compass, Check, AlertTriangle } from 'lucide-react'
import EntityFormModal from '../ui/EntityFormModal.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { removalLines, isCostless } from '../../lib/frameworkRemoval.js'

const AMBER = '#F59E0B'

function FrameworkCard({ fw, selected, onSelect, onRemove, v2 }) {
  return (
    // The Remove control is a SIBLING of the radio, never nested inside it — a
    // button inside a button is invalid HTML and, worse here, one mis-aimed
    // click away from selecting the framework you meant to delete.
    <div className="relative sm:col-span-2" data-testid={`framework-card-${fw.code}`}>
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(fw.code)}
      className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${
        selected
          ? 'border-[#F59E0B] bg-[#F59E0B]/10'
          : v2
            ? 'border-rule/80 bg-white hover:border-[#F59E0B]/60'
            : 'border-white/15 bg-white/5 hover:border-[#F59E0B]/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              v2 ? 'text-[#b45309]' : 'text-[#fbbf24]/90'
            }`}
          >
            {fw.accreditor} · {fw.version}
          </p>
          <p
            className={`mt-0.5 truncate text-[14.5px] font-semibold ${
              v2 ? 'text-navy' : 'text-white'
            }`}
          >
            {fw.name}
          </p>
          <p className={`mt-1 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/60'}`}>
            {fw.standardCount} standards
            {fw.assuranceCount ? ` · ${fw.assuranceCount} assurances` : ''}
            {fw.indexMax ? ` · index ${fw.indexMin}–${fw.indexMax}` : ''}
          </p>
          {Array.isArray(fw.rubricLabels) && fw.rubricLabels.length ? (
            <p className={`mt-1.5 text-[12px] ${v2 ? 'text-muted/80' : 'text-white/45'}`}>
              Rubric: {fw.rubricLabels.join(' → ')}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            aria-hidden
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              selected ? 'border-[#F59E0B]' : v2 ? 'border-rule' : 'border-white/25'
            }`}
            style={selected ? { backgroundColor: AMBER } : undefined}
          >
            {selected ? <Check size={12} className="text-navy" strokeWidth={3} /> : null}
          </span>
          {fw.adopted ? (
            <span
              className={
                v2
                  ? 'rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700'
                  : 'rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300'
              }
            >
              Adopted · {fw.adoptedCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
    {/* Only for a framework you actually hold, and deliberately understated:
        this is the least-used control on the screen and the most destructive. */}
    {fw.adopted && onRemove ? (
      <button
        type="button"
        onClick={() => onRemove(fw)}
        className={`absolute bottom-2.5 right-3 rounded-md px-2 py-0.5 text-[12px] font-semibold underline-offset-2 transition hover:underline ${
          v2 ? 'text-muted hover:text-red-700' : 'text-white/50 hover:text-red-300'
        }`}
      >
        Remove
      </button>
    ) : null}
    </div>
  )
}

/**
 * The confirmation. Renders ONLY server-counted figures — there is no client-side
 * arithmetic here and no fallback sentence, because a confirmation that
 * disagrees with the delete it authorises is the worst bug this screen could
 * have. While the count is loading it says so rather than guessing.
 */
function RemovePanel({ fw, impact, loading, error, busy, onCancel, onConfirm, v2 }) {
  const { losses, survives } = removalLines(impact)
  const costless = isCostless(impact)
  return (
    <div
      data-testid="framework-remove-confirm"
      className={`rounded-xl border-2 px-4 py-3.5 sm:col-span-2 ${
        v2 ? 'border-red-300 bg-red-50' : 'border-red-400/40 bg-red-400/10'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={17} className={v2 ? 'mt-0.5 text-red-600' : 'mt-0.5 text-red-300'} />
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-semibold ${v2 ? 'text-navy' : 'text-white'}`}>
            Remove {fw.name}?
          </p>

          {loading ? (
            <p className={`mt-1.5 text-[13px] ${v2 ? 'text-muted' : 'text-white/60'}`}>
              Counting what this would remove…
            </p>
          ) : error ? (
            <p className={`mt-1.5 text-[13px] ${v2 ? 'text-red-700' : 'text-red-200'}`}>{error}</p>
          ) : (
            <>
              <ul className={`mt-1.5 space-y-0.5 text-[13px] ${v2 ? 'text-navy/80' : 'text-white/75'}`}>
                {losses.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {/* An untouched framework is a tidy-up, not a loss — say so rather
                  than alarming somebody who adopted it by accident a minute ago. */}
              {costless ? (
                <p className={`mt-1.5 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/55'}`}>
                  You haven’t scored or evidenced anything against this framework yet.
                </p>
              ) : null}
              {survives.map((line) => (
                <p
                  key={line}
                  className={`mt-1.5 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/55'}`}
                >
                  {line}
                </p>
              ))}
            </>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                v2
                  ? 'border-rule bg-white text-navy hover:border-navy/40'
                  : 'border-white/20 bg-white/5 text-white hover:border-white/40'
              }`}
            >
              Keep it
            </button>
            <button
              type="button"
              data-testid="framework-remove-confirm-btn"
              onClick={onConfirm}
              disabled={busy || loading || !!error}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Removing…' : 'Remove framework'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdoptFrameworkModal({
  open,
  onClose,
  frameworks,
  onAdopt,
  onRemovalImpact = null,
  onRemove = null,
  reduce,
}) {
  const v2 = useUiV2()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // ── removal state: which framework, its server-counted impact, and progress ──
  const [removing, setRemoving] = useState(null) // the framework being confirmed
  const [impact, setImpact] = useState(null)
  const [impactErr, setImpactErr] = useState('')
  const [impactLoading, setImpactLoading] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)

  const startRemove = async (fw) => {
    setRemoving(fw)
    setImpact(null)
    setImpactErr('')
    setImpactLoading(true)
    try {
      const res = await onRemovalImpact(fw.code)
      // NO FALLBACK NUMBERS. If the count did not arrive, the confirm button
      // stays disabled — authorising a delete against invented figures would be
      // worse than making the user try again.
      if (!res) throw new Error('no impact')
      setImpact(res)
    } catch {
      setImpactErr('Could not work out what this would remove. Please try again.')
    } finally {
      setImpactLoading(false)
    }
  }

  const cancelRemove = () => {
    setRemoving(null)
    setImpact(null)
    setImpactErr('')
  }

  const confirmRemove = async () => {
    setRemoveBusy(true)
    try {
      await onRemove(removing.code)
      // The modal STAYS OPEN: removing one of three frameworks is rarely the
      // whole errand, and the list behind this panel has already refreshed.
      if (selected === removing.code) setSelected(null)
      cancelRemove()
    } catch {
      setImpactErr('Could not remove this framework. Please try again.')
    } finally {
      setRemoveBusy(false)
    }
  }

  const loading = frameworks === null
  const list = frameworks ?? []
  const selectedFw = list.find((f) => f.code === selected) ?? null

  const submit = async (e) => {
    e.preventDefault()
    if (!selected) {
      setErr('Choose a framework to adopt.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onAdopt(selected)
      onClose()
    } catch {
      setErr('Could not adopt this framework. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={Compass}
      title="Adopt a framework"
      subtitle="Pull the accreditor's full standards catalog into your register — codes, order, and rubric included"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={selectedFw?.adopted ? 'Re-adopt (fills gaps)' : 'Adopt framework'}
      reduce={reduce}
      wide
    >
      {loading ? (
        <p className={`text-[13px] sm:col-span-2 ${v2 ? 'text-muted' : 'text-white/55'}`}>
          Loading frameworks…
        </p>
      ) : list.length === 0 ? (
        <p className={`text-[13px] sm:col-span-2 ${v2 ? 'text-muted' : 'text-white/55'}`}>
          No frameworks are available yet — the catalog may still be seeding.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Accreditation framework" className="space-y-2.5 sm:col-span-2">
          {list.map((fw) =>
            // The confirmation REPLACES the card it belongs to, so the thing you
            // are about to delete and the question about deleting it are never
            // two separate places on the screen.
            removing?.code === fw.code ? (
              <RemovePanel
                key={fw.code}
                fw={fw}
                impact={impact}
                loading={impactLoading}
                error={impactErr}
                busy={removeBusy}
                onCancel={cancelRemove}
                onConfirm={confirmRemove}
                v2={v2}
              />
            ) : (
              <FrameworkCard
                key={fw.code}
                fw={fw}
                selected={selected === fw.code}
                onSelect={setSelected}
                onRemove={onRemove && onRemovalImpact ? startRemove : null}
                v2={v2}
              />
            ),
          )}
        </div>
      )}
    </EntityFormModal>
  )
}
