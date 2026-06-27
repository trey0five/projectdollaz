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
      navigate(`/reports/board/print?period=${draft.periodId}`)
    } catch {
      setErr('Could not finalize the report. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-serif text-2xl font-semibold text-navy">Generate the packet</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          Here&apos;s what your board report will include. Generate to stamp it and open the print
          view, or preview first.
        </p>
      </header>

      <ul className="mb-6 divide-y divide-rule/40 rounded-xl border border-rule/60">
        {sections.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px]">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                s.on ? 'bg-emerald-100 text-emerald-700' : 'bg-section text-muted/60'
              }`}
            >
              {s.on ? <Check size={13} /> : <Minus size={13} />}
            </span>
            <span className={s.on ? 'text-ink' : 'text-muted/70'}>{s.label}</span>
            {!s.on && <span className="ml-auto text-[11px] italic text-muted/70">not available</span>}
          </li>
        ))}
      </ul>

      {!hasMda && (
        <p className="mb-4 text-[12.5px] italic text-muted">
          Tip: you haven&apos;t drafted an MD&amp;A narrative yet — the section will show a placeholder.
        </p>
      )}

      {err && (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-rose-600">
          <AlertCircle size={15} /> {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => goPrint(true)}
          disabled={busy || !draft.periodId}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Printer size={16} /> {busy ? 'Preparing…' : 'Generate & print'}
        </button>
        <button
          type="button"
          onClick={() => goPrint(false)}
          disabled={busy || !draft.periodId}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-[13.5px] font-semibold text-navy transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-50"
        >
          <Eye size={16} /> Preview in browser
        </button>
      </div>

      <WizardNav onBack={() => goTo(4)} />
    </div>
  )
}
