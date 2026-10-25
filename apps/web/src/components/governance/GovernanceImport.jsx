// ─────────────────────────────────────────────────────────────────────────────
// GovernanceImport — a board roster / people list, or a committee list, as a
// file (#46). Preview, then import.
//
// `kind` picks the import: 'people' (a board roster, finance team or staff
// list; `defaultGroup` is what unlabelled rows become) or 'committees' (one
// row per member, or one row per committee with a Members cell). Any column
// names — the server matches them by meaning and says how it read each one.
// The preview lists every row with what will happen (new / update / skipped,
// or committee + member + role); Import merges — nothing is ever removed.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, RefreshCcw, Upload } from 'lucide-react'
import { governanceImportApi, apiErrorMessage } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import ColumnMapDialog from '../imports/ColumnMapDialog.jsx'
import '../../styles/pending/a2-carry.css'

const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls'

const COPY = {
  people: {
    title: 'Upload a board roster or people list',
    blurb:
      'Excel or CSV, any column names — Name, Position, Term expires, Email, Group… we match them. People already on file are updated (by email, then name); the rest are added.',
    cta: 'Import people',
  },
  committees: {
    title: 'Upload a committee list',
    blurb:
      'Excel or CSV — one row per member (Committee, Member, Role), or one row per committee with a Members cell. Committees and people we don’t have yet are created; memberships are added.',
    cta: 'Import committees',
  },
}

const GROUP_LABEL = { board: 'Board', finance_team: 'Finance team', staff: 'Staff' }
const ROLE_LABEL = { chair: 'Chair', vice_chair: 'Vice chair', secretary: 'Secretary', member: 'Member' }
const ACTION_TONE = { new: 'good', update: 'watch', skipped: 'risk', existing: 'good' }

export default function GovernanceImport({ schoolId, canEdit, kind = 'people', defaultGroup = 'board', onApplied }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [mapOpen, setMapOpen] = useState(false) // the mapping popup (#44)
  const copy = COPY[kind]

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setErr('')
    setMapOpen(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const runPreview = async (f, map = null) => {
    setBusy(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      if (kind === 'people') fd.append('defaultGroup', defaultGroup)
      if (map) fd.append('mapping', JSON.stringify(map))
      const res = kind === 'people' ? await governanceImportApi.previewPeople(schoolId, fd) : await governanceImportApi.previewCommittees(schoolId, fd)
      const p = res.data ?? res
      setPreview(p)
      setMapOpen(!!p.problem) // a required column we couldn't find: the popup opens itself
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not read that file.'))
    } finally {
      setBusy(false)
    }
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
      if (kind === 'people') fd.append('defaultGroup', defaultGroup)
      const res = kind === 'people' ? await governanceImportApi.previewPeople(schoolId, fd) : await governanceImportApi.previewCommittees(schoolId, fd)
      const p = res.data ?? res
      setPreview(p)
      setMapOpen(!!p.problem)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not read that file.'))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!preview || busy) return
    const rows =
      kind === 'people'
        ? preview.rows.filter((r) => r.action !== 'skipped').map((r) => r.person)
        : preview.rows.filter((r) => !r.issues?.length).map((r) => r.entry)
    if (!rows.length) {
      setErr('Nothing to import — every row was skipped.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = kind === 'people' ? await governanceImportApi.commitPeople(schoolId, { rows }) : await governanceImportApi.commitCommittees(schoolId, { rows })
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
    <div data-testid={`governance-import-${kind}`}>
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
            <p className="text-small text-ink" data-testid="governance-import-summary">
              {kind === 'people'
                ? `${summary.new} new · ${summary.update} to update · ${summary.skipped} skipped`
                : `${summary.committees} committee${summary.committees === 1 ? '' : 's'} (${summary.newCommittees} new) · ${summary.members} membership${summary.members === 1 ? '' : 's'} · ${summary.newPeople} people to add`}
            </p>
          ) : null}
          {preview.problem ? (
            <p className="a2-note mt-2" data-tone="watch">
              <AlertTriangle size={13} aria-hidden /> {preview.problem}{' '}
              <button type="button" className="dt-link" onClick={() => setMapOpen(true)}>
                Pick the columns
              </button>
            </p>
          ) : null}
          {preview.columns?.length ? (
            <p className="mt-2 text-[12.5px] text-ink2" data-testid="governance-import-columns">
              How we read your columns:{' '}
              {preview.columns.map((c, i) => (
                <span key={c.header}>
                  {i > 0 && ' · '}
                  <span className="font-medium text-ink">{c.header}</span> → {c.field}
                </span>
              ))}
              {preview.table ? (
                <>
                  {' · '}
                  <button type="button" className="dt-link" onClick={() => setMapOpen(true)}>
                    Change how columns are read
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          {(preview.warnings ?? []).map((w) => (
            <p key={w} className="a2-note mt-2" data-tone="watch">
              <AlertTriangle size={13} aria-hidden /> {w}
            </p>
          ))}

          <ul className="a2-rows mt-3 max-h-[22rem] overflow-auto" aria-label="Rows in the file">
            {rows.map((r) => {
              const action = kind === 'people' ? r.action : r.committeeAction
              return (
                <li key={r.row} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small">
                  <i aria-hidden="true" className={`mark tone-${ACTION_TONE[action] ?? 'watch'}`} />
                  {kind === 'people' ? (
                    <>
                      <span className="w-16 shrink-0 text-[12px] uppercase tracking-wide text-ink2">{r.action}</span>
                      <span className="font-medium text-ink">{r.person.name}</span>
                      <span className="text-ink2">{r.person.title || '—'}</span>
                      <span className="text-ink2">{(r.person.groups ?? []).map((g) => GROUP_LABEL[g] ?? g).join(', ')}</span>
                      {r.person.termEnd ? <span className="text-ink2">term ends {r.person.termEnd}</span> : null}
                      {r.issues?.length ? <span className="basis-full text-[12.5px] text-[rgb(var(--c-risk))]">{r.issues.join(' · ')}</span> : null}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-ink">{r.committee}</span>
                      {r.committeeAction === 'new' ? <span className="text-[12px] uppercase tracking-wide text-ink2">new committee</span> : null}
                      {r.member ? (
                        <>
                          <span className="text-ink2">·</span>
                          <span className="text-ink">{r.member}</span>
                          <span className="text-ink2">{ROLE_LABEL[r.role] ?? r.role}</span>
                          {r.personAction === 'new' ? <span className="text-[12px] uppercase tracking-wide text-ink2">new person</span> : null}
                        </>
                      ) : (
                        <span className="text-ink2">no members listed</span>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={commit} disabled={busy || !!preview.problem} icon={<FileSpreadsheet size={14} />}>
              {copy.cta}
            </Button>
            <Button variant="quiet" onClick={reset} icon={<RefreshCcw size={13} />}>
              Start over
            </Button>
          </div>
        </motion.div>
      ) : null}

      {result ? (
        <p className="a2-note mt-3" data-tone="good" data-testid="governance-import-done">
          <CheckCircle2 size={14} aria-hidden />{' '}
          {kind === 'people'
            ? `Imported — ${result.created} added, ${result.updated} updated.`
            : `Imported — ${result.committeesCreated} committees and ${result.peopleCreated} people added, ${result.membershipsAdded} memberships added${result.alreadyMembers ? `, ${result.alreadyMembers} already there` : ''}.`}
        </p>
      ) : null}
      {err ? (
        <p className="a2-note mt-3" data-tone="risk">
          {err}
        </p>
      ) : null}
      {mapOpen && preview?.table ? (
        <ColumnMapDialog
          table={preview.table}
          problem={preview.problem}
          busy={busy}
          onClose={() => setMapOpen(false)}
          onApply={(map) => {
            setMapOpen(false)
            if (file) void runPreview(file, map)
          }}
        />
      ) : null}
    </div>
  )
}
