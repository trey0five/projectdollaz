// ─────────────────────────────────────────────────────────────────────────────
// RecordsImport — a module's records as a file (#51): maintenance items, gifts
// and pledges, campaigns, accreditation standards, a staff list. Preview, then
// import. One component, a `target` per module; the server owns the schema
// (any column names, matched by meaning) and says how it read each column and
// what each row will do. Import merges — nothing is ever removed.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, RefreshCcw, Upload } from 'lucide-react'
import { recordsImportApi, apiErrorMessage } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/a2-carry.css'

const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls'

export const TARGET_COPY = {
  maintenance: {
    title: 'Upload a maintenance or asset list',
    blurb: 'Excel or CSV — Item, Location, Due date, Vendor, Cost, Status… any column names. Items already on file (same item and location) are updated; the rest are added.',
    cta: 'Import items',
    noun: 'items',
  },
  gifts: {
    title: 'Upload gifts and pledges',
    blurb: 'Excel or CSV — Donor, Date, Amount, Campaign, Type (gift or pledge)… any column names. Campaigns named in the file are created if missing. Each row becomes a gift or pledge.',
    cta: 'Import gifts',
    noun: 'gifts',
  },
  campaigns: {
    title: 'Upload a campaign list',
    blurb: 'Excel or CSV — Campaign, Goal, Raised, Fiscal year, Start, End, Status… any column names. Campaigns already on file (same name) are updated; the rest are added.',
    cta: 'Import campaigns',
    noun: 'campaigns',
  },
  standards: {
    title: 'Upload your standards or indicators',
    blurb: 'Excel or CSV — Code, Standard, Domain, Rating (met / partially / not met), Owner, Review date… any column names. Standards already on file (same code) are updated; the rest are added.',
    cta: 'Import standards',
    noun: 'standards',
  },
  staff: {
    title: 'Upload a staff list',
    blurb: 'Excel or CSV — Name, Title, Email, Start date… any column names. People already on file are updated (by email, then name); the rest are added to the staff group.',
    cta: 'Import staff',
    noun: 'people',
  },
}

const TONE = { new: 'good', update: 'watch', skipped: 'risk' }

/** The two or three cells that identify a row in the preview list, per target. */
function summarize(target, rec) {
  switch (target) {
    case 'maintenance':
      return [rec.title, rec.location, rec.targetDate ? `due ${rec.targetDate}` : null, rec.vendor]
    case 'gifts':
      return [rec.label, rec.occurredOn, rec.amount != null ? `$${Number(rec.amount).toLocaleString('en-US')}` : null, rec.kind, rec.campaign]
    case 'campaigns':
      return [rec.name, rec.goalAmount != null ? `goal $${Number(rec.goalAmount).toLocaleString('en-US')}` : null, rec.status, rec.fiscalYear ? `FY${rec.fiscalYear}` : null]
    case 'standards':
      return [rec.code, rec.title, rec.rating?.replace('_', ' '), rec.category]
    case 'staff':
      return [rec.name, rec.title, rec.email]
    default:
      return [JSON.stringify(rec).slice(0, 80)]
  }
}

export default function RecordsImport({ schoolId, canEdit, target, onApplied }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const copy = TARGET_COPY[target] ?? TARGET_COPY.maintenance

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setErr('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const pick = async (f) => {
    if (!f || !canEdit) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setErr('')
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await recordsImportApi.preview(schoolId, target, fd)
      setPreview(res.data ?? res)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not read that file.'))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!preview || busy) return
    const rows = preview.rows.filter((r) => r.action !== 'skipped').map((r) => r.record)
    if (!rows.length) {
      setErr('Nothing to import — every row was skipped.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await recordsImportApi.commit(schoolId, target, { rows })
      setResult(res.data ?? res)
      setPreview(null)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onApplied?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not import that file.'))
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return null
  const rows = preview?.rows ?? []
  const summary = preview?.summary ?? null

  return (
    <div data-testid={`records-import-${target}`}>
      <h3 className="a2-title">{copy.title}</h3>
      <p className="mt-1 max-w-[70ch] text-small text-ink2">{copy.blurb}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void pick(e.dataTransfer?.files?.[0])
        }}
        className={`a2-drop mt-4 flex-col items-center gap-2 px-4 py-6 text-center ${dragOver ? 'is-over' : ''}`}
      >
        <Upload size={20} aria-hidden className="text-ink2" />
        <p className="text-small text-ink">{file ? file.name : 'Drop the file here, or'}</p>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} icon={<FileText size={14} />} disabled={busy}>
          Choose file
        </Button>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <p className="text-[12px] text-ink2">Excel or CSV · any column names</p>
      </div>

      {preview ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="a2-block">
          {summary ? (
            <p className="text-small text-ink" data-testid="records-import-summary">
              {summary.new} new · {summary.update} to update · {summary.skipped} skipped
            </p>
          ) : null}
          {preview.columns?.length ? (
            <p className="mt-2 text-[12.5px] text-ink2" data-testid="records-import-columns">
              How we read your columns:{' '}
              {preview.columns.map((c, i) => (
                <span key={c.header}>
                  {i > 0 && ' · '}
                  <span className="font-medium text-ink">{c.header}</span> → {c.field}
                </span>
              ))}
            </p>
          ) : null}
          {(preview.warnings ?? []).map((w) => (
            <p key={w} className="a2-note mt-2" data-tone="watch">
              <AlertTriangle size={13} aria-hidden /> {w}
            </p>
          ))}

          <ul className="a2-rows mt-3 max-h-[22rem] overflow-auto" aria-label="Rows in the file">
            {rows.map((r) => (
              <li key={r.row} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small">
                <i aria-hidden="true" className={`mark tone-${TONE[r.action] ?? 'watch'}`} />
                <span className="w-16 shrink-0 text-[12px] uppercase tracking-wide text-ink2">{r.action}</span>
                {summarize(target, r.record)
                  .filter(Boolean)
                  .map((v, i) => (
                    <span key={i} className={i === 0 ? 'font-medium text-ink' : 'text-ink2'}>
                      {v}
                    </span>
                  ))}
                {r.issues?.length ? <span className="basis-full text-[12.5px] text-[rgb(var(--c-risk))]">{r.issues.join(' · ')}</span> : null}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={commit} disabled={busy} icon={<FileSpreadsheet size={14} />}>
              {copy.cta}
            </Button>
            <Button variant="quiet" onClick={reset} icon={<RefreshCcw size={13} />}>
              Start over
            </Button>
          </div>
        </motion.div>
      ) : null}

      {result ? (
        <p className="a2-note mt-3" data-tone="good" data-testid="records-import-done">
          <CheckCircle2 size={14} aria-hidden /> Imported — {result.created} {copy.noun} added, {result.updated} updated
          {result.skipped ? `, ${result.skipped} skipped` : ''}.
        </p>
      ) : null}
      {err ? (
        <p className="a2-note mt-3" data-tone="risk">
          {err}
        </p>
      ) : null}
    </div>
  )
}
