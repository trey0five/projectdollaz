// Step 5 — Generate. A summary checklist of the sections that will be included
// (derived purely from the bundle's availability flags + edited state). "Generate
// & Print" flushes the latest edits, PUTs {markGenerated:true} to stamp
// generatedAt, then navigates to the auto-printing print route. "Preview in
// browser" goes to the same route (its no-print toolbar lets the user review
// before printing).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Minus, Printer, Eye, AlertCircle } from 'lucide-react'
import WizardNav from './WizardNav.jsx'

export default function Step5Generate({ ctx }) {
  const { data, draft, goTo, canEdit, save, saveNow } = ctx
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const av = data?.availability || {}
  const hasMda = !!draft.mdaText?.trim()

  const sections = [
    { label: 'Cover page', on: true },
    { label: 'Table of contents', on: true },
    { label: 'Management discussion & analysis', on: hasMda },
    { label: 'Statement of operations (budget vs actual)', on: av.hasSnapshot },
    { label: 'Key indicators', on: (data?.keyIndicators || []).some((k) => k.available && k.value != null) },
    { label: 'Statement of financial position', on: av.hasSnapshot },
    { label: 'Statement of changes in net assets', on: av.hasSnapshot },
    { label: 'Statement of cash flows', on: !!data?.cashFlows?.available },
  ]

  const goPrint = async (markGenerated) => {
    setBusy(true)
    setErr('')
    try {
      // Flush any pending edits, then optionally stamp generatedAt.
      if (canEdit) await saveNow()
      if (markGenerated && canEdit) await save({ markGenerated: true })
      // Carry the chosen granularity (+ month/quarter selection) into the print
      // route so monthly/quarterly packets print what the wizard previewed —
      // not the annual default.
      const qs = new URLSearchParams({ period: draft.periodId })
      if (draft.granularity && draft.granularity !== 'annual') qs.set('granularity', draft.granularity)
      if (draft.granularity === 'monthly' && draft.monthKey) qs.set('month', draft.monthKey)
      if (draft.granularity === 'quarterly' && draft.quarter) qs.set('quarter', draft.quarter)
      navigate(`/reports/board/print?${qs.toString()}`)
    } catch {
      setErr('Could not finalize the report. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-serif text-title font-medium text-ink">Generate the packet</h2>
        <p className="mt-1 text-[13.5px] text-ink2">
          Here&apos;s what your board report will include. Generate to stamp it and open the print
          view, or preview first.
        </p>
      </header>

      <ul className="mb-6 border-t border-hair">
        {sections.map((s) => (
          <li key={s.label} className="fig !justify-start !gap-2.5">
            <i className={`mark ${s.on ? 'tone-good' : 'tone-neutral'}`} aria-hidden="true" />
            <span className={s.on ? 'text-ink2' : 'text-ink2/60'} aria-label={s.on ? 'included' : 'not available'}>
              {s.on ? <Check size={13} /> : <Minus size={13} />}
            </span>
            <span className={s.on ? 'text-ink' : 'text-ink2/70'}>{s.label}</span>
            {!s.on && <span className="ml-auto text-[11px] italic text-ink2/70">not available</span>}
          </li>
        ))}
      </ul>

      {!hasMda && (
        <p className="mb-4 text-[12.5px] italic text-ink2">
          Tip: you haven&apos;t drafted an MD&amp;A narrative yet — the section will show a placeholder.
        </p>
      )}

      {err && (
        <p className="b2-callout b2-risk mb-3" role="alert">
          <AlertCircle size={14} aria-hidden="true" /> {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => goPrint(true)}
          disabled={busy || !draft.periodId}
          className="btn btn-primary"
        >
          <Printer size={14} aria-hidden="true" /> {busy ? 'Preparing…' : 'Generate & print'}
        </button>
        <button
          type="button"
          onClick={() => goPrint(false)}
          disabled={busy || !draft.periodId}
          className="btn btn-secondary"
        >
          <Eye size={14} aria-hidden="true" /> Preview in browser
        </button>
      </div>

      <WizardNav onBack={() => goTo(4)} />
    </div>
  )
}
