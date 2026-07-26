// ─────────────────────────────────────────────────────────────────────────────
// AdoptFrameworkModal — pick an accreditor framework (Cognia / MSA-CESS / NSBECS)
// and pull its full standards catalog into the school's register. Built on the
// shared EntityFormModal shell (this is a plain modal, NOT a RecordFlow — the
// AddDataWizard configs are untouched). Radio CARDS: accreditor + version,
// standard/assurance counts, a rubric-label preview, and an "Adopted" badge when
// the school already carries it (re-adopt is idempotent — it fills gaps, never
// dupes). Submit → POST adopt → the caller refreshes standards + readiness.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Compass, Check } from 'lucide-react'
import EntityFormModal from '../ui/EntityFormModal.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'

const AMBER = '#F59E0B'

function FrameworkCard({ fw, selected, onSelect, v2 }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(fw.code)}
      className={`w-full rounded-xl border-2 px-4 py-3 text-left transition sm:col-span-2 ${
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
            <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              Adopted · {fw.adoptedCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

export default function AdoptFrameworkModal({ open, onClose, frameworks, onAdopt, reduce }) {
  const v2 = useUiV2()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

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
          {list.map((fw) => (
            <FrameworkCard
              key={fw.code}
              fw={fw}
              selected={selected === fw.code}
              onSelect={setSelected}
              v2={v2}
            />
          ))}
        </div>
      )}
    </EntityFormModal>
  )
}
