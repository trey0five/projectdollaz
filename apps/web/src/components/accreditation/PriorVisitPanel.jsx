// ─────────────────────────────────────────────────────────────────────────────
// PriorVisitPanel — AIC Phase F. THE ONLY GROUND TRUTH IN THE PROGRAM: what a
// real visiting team actually wrote about this school, and whether the school has
// closed it. It lives on the Evidence tab, the artifact axis, beside the other
// things a team will ask to see.
//
// It exists so the product can say the single most credible sentence it has:
// "the 2021 team cited you here, and it is still open."
//
// FOUR THINGS THIS COMPONENT WILL NOT DO:
//
//  1. It will not turn a prior visit into a probability. Nothing here is a
//     percentage, a likelihood, a score or a weight. One visiting team per six
//     years per school is not calibratable and never will be, and the honest use
//     of a citation is to DISPLAY it and let it raise a standard's visibility —
//     not to tune arithmetic with it.
//  2. It will not match a citation to a standard. `citedStandardCode` is free text
//     lifted from a PDF; the SERVER decides, by exact equality after trim and
//     uppercase and by nothing else, and hands back `matchedStandardId` /
//     `matchedStandardCode` / `unmatched` per row. There is no fuzzy matching
//     here, no prefix match, no "COG-A3 ≈ COG-3".
//  3. It will not hide an unmatched citation. Unmatched rows get their own
//     section, their code is printed EXACTLY as the team wrote it, and the
//     server's `unmatchedNote` is rendered verbatim above them. A citation
//     matched to the wrong standard is worse than an unmatched one.
//  4. It will not close anything on the school's behalf. Status is a human's
//     answer; when a human sets it to closed with no date the SERVER stamps the
//     date, so there is no client-side clock on this path at all.
//
// PREMIUM UI P4 (a2): a Section on the ground — the counts as a StatStrip, the
// citations as DataTables (status as a Pill with a 2px mark, row actions that
// fade in on hover), the unmatched set under its own ruled note. One flat
// Button adds a finding; the add/edit form rides the shared EntityFormModal.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Pencil, Trash2, Plus, TriangleAlert, Link2Off } from 'lucide-react'
import EntityFormModal, {
  Field,
  Select,
  fieldInput,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../../lib/api.js'
import { formatShortDate } from '../../lib/format.js'
import { Button, DataTable, Pill, Section, Stat, StatStrip } from '../ui/surface/index.js'
import '../../styles/pending/a2-carry.css'

const PRIOR_VISIT_STATUSES = ['open', 'closed']

const STATUS_BADGE = {
  open: { label: 'Still open', tone: 'risk' },
  closed: { label: 'Closed', tone: 'good' },
}

/** 'yyyy-mm-dd' slice of an ISO DateTime, for a DatePicker value. */
function isoDay(v) {
  return v ? String(v).slice(0, 10) : ''
}

// ═══════════════════════════ DATA ════════════════════════════════════════════
// The panel owns its own read (no shared hook): it is the only consumer of this
// endpoint, and the accreditation page already carries seven hooks. Same
// await-BEFORE-setState discipline as every other register read here.

function usePriorVisitFindings(schoolId) {
  const [rows, setRows] = useState([])
  const [unmatchedNote, setUnmatchedNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    try {
      const res = await accreditationApi.listPriorVisitFindings(sid)
      const data = res.data
      setRows(Array.isArray(data) ? data : (data?.findings ?? data?.items ?? []))
      // Composed on the server and rendered VERBATIM. When there is nothing
      // unmatched there is no note, and we do not invent one.
      setUnmatchedNote(Array.isArray(data) ? '' : (data?.unmatchedNote ?? ''))
    } catch (e) {
      setRows([])
      setUnmatchedNote('')
      if (isModuleNotLicensed(e) || isPaymentRequired(e)) setNotLicensed(true)
      else setError('Could not load your prior visiting-team findings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setRows([])
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const refresh = useCallback(() => (schoolId ? load(schoolId) : Promise.resolve()), [schoolId, load])

  return { rows, unmatchedNote, loading, error, notLicensed, refresh }
}

// ═══════════════════════════ THE ADD / EDIT MODAL ════════════════════════════

const EMPTY_FORM = {
  frameworkId: '',
  visitDate: '',
  citedStandardCode: '',
  text: '',
  status: 'open',
  closedDate: '',
  evidenceRef: '',
}

export function findingToForm(f) {
  return {
    frameworkId: f.frameworkId ?? '',
    visitDate: isoDay(f.visitDate),
    citedStandardCode: f.citedStandardCode ?? '',
    text: f.text ?? '',
    status: f.status ?? 'open',
    closedDate: isoDay(f.closedDate),
    evidenceRef: f.evidenceRef ?? '',
  }
}

/** Key by key — the global forbidNonWhitelisted pipe 400s ANY unexpected key. */
function toBody(form) {
  return {
    frameworkId: form.frameworkId ? form.frameworkId : null,
    visitDate: form.visitDate,
    // Stored VERBATIM as entered. Normalisation happens at match time on the
    // server and is never written back over what the team actually wrote.
    citedStandardCode: form.citedStandardCode.trim(),
    text: form.text.trim(),
    status: form.status,
    // Left null on purpose when closing: the SERVER stamps the close date. There
    // is no client clock anywhere on this path.
    closedDate: form.closedDate ? form.closedDate : null,
    evidenceRef: form.evidenceRef.trim() ? form.evidenceRef.trim() : null,
  }
}

function useFrameworks(schoolId, enabled) {
  const [frameworks, setFrameworks] = useState([])
  useEffect(() => {
    if (!schoolId || !enabled) return undefined
    let cancelled = false
    accreditationApi
      .listFrameworks(schoolId)
      .then((res) => {
        if (!cancelled) setFrameworks(res.data?.frameworks ?? [])
      })
      .catch(() => {
        if (!cancelled) setFrameworks([])
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, enabled])
  return frameworks
}

export function PriorVisitFormModal({ open, schoolId, initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const frameworks = useFrameworks(schoolId, open)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.visitDate) {
      setErr('When did the team visit?')
      return
    }
    if (!form.citedStandardCode.trim()) {
      setErr('Enter the standard code exactly as the team wrote it.')
      return
    }
    if (!form.text.trim()) {
      setErr('Enter what the team actually said.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toBody(form))
      onClose()
    } catch (e2) {
      setErr(e2?.response?.data?.message ?? 'Could not save this finding.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={History}
      title={initial ? 'Edit prior-visit finding' : 'Record a prior-visit finding'}
      subtitle="What the last visiting team wrote, in their words"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save finding' : 'Add finding'}
      reduce={reduce}
    >
      <Field label="Accreditor" index={0} reduce={reduce}>
        <Select value={form.frameworkId} onChange={set('frameworkId')}>
          <option value="">— not recorded —</option>
          {frameworks.map((fw) => (
            <option key={fw.id} value={fw.id}>
              {fw.name}
            </option>
          ))}
        </Select>
        <span className="mt-1 block text-[12px] text-ink2">
          You may hold a report from an accreditor you have not adopted here.
        </span>
      </Field>
      <Field label="Visit date" index={1} reduce={reduce}>
        <DatePicker
          value={form.visitDate}
          onChange={(v) => set('visitDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Standard they cited" span={2} index={2} reduce={reduce}>
        <input
          value={form.citedStandardCode}
          onChange={set('citedStandardCode')}
          maxLength={40}
          placeholder="e.g. COG-A3"
          className={fieldInput}
        />
        <span className="mt-1 block text-[12px] text-ink2">
          Type it exactly as it appears in their report. We store it verbatim, and if it does not
          match a standard in your register we will show it as unmatched rather than guess which
          standard they meant.
        </span>
      </Field>
      <Field label="What they wrote" span={2} index={3} reduce={reduce}>
        <textarea
          value={form.text}
          onChange={set('text')}
          maxLength={4000}
          rows={4}
          placeholder="Paste the finding in the team’s own words."
          className={fieldTextarea}
        />
      </Field>
      <Field label="Status" index={4} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {PRIOR_VISIT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'open' ? 'Still open' : 'Closed'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Closed on" index={5} reduce={reduce}>
        <DatePicker
          value={form.closedDate}
          onChange={(v) => set('closedDate')({ target: { value: v } })}
          className={fieldInput}
        />
        <span className="mt-1 block text-[12px] text-ink2">
          Leave blank when closing and we date it today.
        </span>
      </Field>
      <Field label="How it was closed" span={2} index={6} reduce={reduce}>
        <input
          value={form.evidenceRef}
          onChange={set('evidenceRef')}
          maxLength={500}
          placeholder="e.g. Board minutes, 14 May 2024 — policy 4.2 adopted"
          className={fieldInput}
        />
        <span className="mt-1 block text-[12px] text-ink2">
          A note for your own team. We do not resolve it or verify it, and we never imply we did.
        </span>
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ THE PANEL ═══════════════════════════════════════

function StatusPill({ status }) {
  const def = STATUS_BADGE[status]
  if (!def) return null
  return (
    <Pill variant="status" tone={def.tone}>
      {def.label}
    </Pill>
  )
}

/** The columns of a citation table. `showMatch` = the matched register. */
function findingColumns({ canEdit, onEdit, onDelete, onOpenStandard, showMatch, firstCol }) {
  const cols = [
    {
      key: 'match',
      header: firstCol,
      width: '11rem',
      render: (f) => (
        <div className="py-2">
          {showMatch ? (
            <button
              type="button"
              onClick={
                f.matchedStandardId && onOpenStandard
                  ? () => onOpenStandard(f.matchedStandardId)
                  : undefined
              }
              disabled={!f.matchedStandardId || !onOpenStandard}
              className="a2-code transition enabled:hover:border-hair/40 enabled:hover:text-ink disabled:cursor-default"
            >
              {/* The MATCHED standard's own code, as it appears in the register. */}
              {f.matchedStandardCode ?? '—'}
            </button>
          ) : (
            <Pill variant="status" tone="watch">
              <Link2Off size={11} aria-hidden />
              Unmatched
            </Pill>
          )}
          {/* ALWAYS shown, matched or not: what the team actually wrote. When it
              differs from the register's code, the reader can see both. */}
          <span className="dt-sub mt-1">Cited as “{f.citedStandardCode}”</span>
        </div>
      ),
    },
    {
      key: 'visit',
      header: 'Visit',
      width: '7.5rem',
      className: 'whitespace-nowrap text-ink2',
      render: (f) => formatShortDate(isoDay(f.visitDate)),
    },
    {
      key: 'text',
      header: 'What the team wrote',
      render: (f) => (
        <div className="py-2">
          <p className="max-w-xl whitespace-pre-line text-small leading-relaxed text-ink">{f.text}</p>
          {f.evidenceRef ? (
            <span className="dt-sub mt-1">How it was closed: {f.evidenceRef}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      render: (f) => (
        <div className="py-2">
          <StatusPill status={f.status} />
          {f.status === 'closed' && f.closedDate ? (
            <span className="dt-sub mt-1">{formatShortDate(isoDay(f.closedDate))}</span>
          ) : null}
        </div>
      ),
    },
  ]
  if (canEdit) {
    cols.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '5.5rem',
      render: (f) => (
        <div className="dt-actions flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(f)}
            aria-label={`Edit the finding cited as ${f.citedStandardCode}`}
            title="Edit"
            className="a2-icon-btn"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(f)}
            aria-label={`Delete the finding cited as ${f.citedStandardCode}`}
            title="Delete"
            data-tone="risk"
            className="a2-icon-btn"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    })
  }
  return cols
}

function FindingTable({ rows, firstCol, showMatch, ...handlers }) {
  return (
    <DataTable
      columns={findingColumns({ ...handlers, showMatch, firstCol })}
      rows={rows}
      rowKey="id"
      markOf={(f) => (f.status === 'open' ? 'risk' : f.status === 'closed' ? 'good' : null)}
      caption={showMatch ? 'Prior-visit findings matched to your register' : 'Prior-visit findings we could not match'}
    />
  )
}

export default function PriorVisitPanel({ schoolId, canEdit, reduce, onOpenStandard, onSaved }) {
  const { rows, unmatchedNote, loading, error, notLicensed, refresh } =
    usePriorVisitFindings(schoolId)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const initial = useMemo(() => (editing ? findingToForm(editing) : null), [editing])

  const matched = rows.filter((f) => !f.unmatched)
  const unmatched = rows.filter((f) => f.unmatched)
  const openCount = rows.filter((f) => f.status === 'open').length

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (f) => {
    setEditing(f)
    setModalOpen(true)
  }
  // A WRITE HERE MOVES THE WHOLE PAGE, so the whole page has to be told.
  //
  // Recording an open citation against a code the school actually holds moves
  // `acc.prior_visit_findings` from no_data to available AND puts an
  // ACC-PRIOR-FINDING-OPEN finding on that standard. The twin behind the
  // attention rail, the Signals tab and the horizon is a SEPARATE read
  // (useAccreditationTwin), which only re-pulls on mount or on `penny:data-changed`
  // — so before this callback existed, the phase's headline finding never appeared
  // after the write that created it, and the Signals tab still said "not tracked"
  // until a browser reload. AccreditationPage solves exactly this for evidence
  // writes with `afterEvidenceWrite`; `onSaved` is the same idea for this panel.
  const afterWrite = async () => {
    await refresh()
    try {
      await onSaved?.()
    } catch {
      /* fail-soft: a stale twin must never make a saved finding look like a failure */
    }
  }
  const onSave = async (body) => {
    if (editing) await accreditationApi.updatePriorVisitFinding(schoolId, editing.id, body)
    else await accreditationApi.createPriorVisitFinding(schoolId, body)
    await afterWrite()
  }
  const onDelete = async (f) => {
    if (!window.confirm(`Delete the finding cited as “${f.citedStandardCode}”?`)) return
    await accreditationApi.removePriorVisitFinding(schoolId, f.id)
    await afterWrite()
  }

  const addButton = canEdit ? (
    <Button variant="primary" size="sm" onClick={openAdd} icon={<Plus size={14} />}>
      Add finding
    </Button>
  ) : null

  const handlers = { canEdit, onEdit: openEdit, onDelete, onOpenStandard }

  let body
  if (notLicensed) {
    body = <p className="a2-empty">Prior-visit findings are part of the Accreditation module.</p>
  } else if (loading) {
    body = <p className="a2-empty">Loading prior visiting-team findings…</p>
  } else if (error) {
    body = (
      <p className="a2-note" data-tone="risk">
        {error}
      </p>
    )
  } else if (rows.length === 0) {
    body = (
      <div className="a2-empty">
        <p className="a2-empty-title">No prior visiting-team findings recorded.</p>
        <p className="max-w-xl">
          Type in what your last team actually wrote. It is the only outside verdict on this school
          we will ever have, and it is the one thing your next team is certain to read.
        </p>
      </div>
    )
  } else {
    body = (
      <div className="space-y-5">
        <StatStrip cols={3} className="border-t border-hair">
          <Stat label="Recorded" value={rows.length} note="citations on file" />
          <Stat
            label="Still open"
            value={openCount}
            status={openCount > 0 ? 'risk' : undefined}
            note={openCount > 0 ? 'by your own register' : 'nothing outstanding'}
          />
          <Stat
            label="Unmatched"
            value={unmatched.length}
            status={unmatched.length > 0 ? 'watch' : undefined}
            note={unmatched.length > 0 ? 'no standard of that code' : 'all matched'}
          />
        </StatStrip>

        {matched.length > 0 ? (
          <FindingTable rows={matched} firstCol="Standard" showMatch {...handlers} />
        ) : null}

        {/* ── The unmatched section. Its heading is fixed, the note is the
            SERVER's and is printed verbatim, and every row is shown in full. ── */}
        {unmatched.length > 0 ? (
          <div className="space-y-2">
            <div className="a2-note" data-tone="watch">
              <TriangleAlert size={14} aria-hidden />
              <div>
                <h4 className="text-[14px] font-semibold text-ink">
                  Cited standards we could not match to your register
                </h4>
                {unmatchedNote ? (
                  <p className="mt-1 max-w-3xl text-small leading-relaxed text-ink2">
                    {unmatchedNote}
                  </p>
                ) : null}
              </div>
            </div>
            <FindingTable rows={unmatched} firstCol="Match" showMatch={false} {...handlers} />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <Section
      label={
        <span className="inline-flex items-center gap-1.5">
          <History size={13} aria-hidden />
          Prior visit
        </span>
      }
      aside={addButton}
    >
      <h3 className="sec-title !mb-1">Findings from your last visit</h3>
      <p className="mb-4 max-w-2xl text-small leading-relaxed text-ink2">
        What a real visiting team wrote, and whether you have closed it. A team reads its
        predecessor&apos;s report before it reads yours.
      </p>
      {body}
      <PriorVisitFormModal
        key={editing ? editing.id : 'new'}
        open={modalOpen}
        schoolId={schoolId}
        initial={initial}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        reduce={reduce}
      />
    </Section>
  )
}
