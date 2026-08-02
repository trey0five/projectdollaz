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
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  History,
  Pencil,
  Trash2,
  Plus,
  TriangleAlert,
  Link2Off,
  CircleCheck,
  CircleDot,
} from 'lucide-react'
import EntityFormModal, {
  Field,
  Select,
  fieldInput,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../../lib/api.js'
import { formatShortDate } from '../../lib/format.js'

const PRIOR_VISIT_STATUSES = ['open', 'closed']

const STATUS_BADGE = {
  open: {
    label: 'Still open',
    cls: 'border-danger/30 bg-danger/10 text-danger',
    Icon: CircleDot,
  },
  closed: {
    label: 'Closed',
    cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    Icon: CircleCheck,
  },
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
        <span className="mt-1 block text-[11.5px] text-white/50">
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
        <span className="mt-1 block text-[11.5px] text-white/60">
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
        <span className="mt-1 block text-[11.5px] text-white/50">
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
        <span className="mt-1 block text-[11.5px] text-white/50">
          A note for your own team. We do not resolve it or verify it, and we never imply we did.
        </span>
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ THE PANEL ═══════════════════════════════════════

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function StatusPill({ status }) {
  const def = STATUS_BADGE[status]
  if (!def) return null
  const Icon = def.Icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      <Icon size={11} />
      {def.label}
    </span>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-rule/60 bg-white px-3 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 font-serif text-[19px] font-semibold leading-none text-navy">{value}</p>
      {sub ? <p className="mt-1 text-[11.5px] leading-snug text-muted">{sub}</p> : null}
    </div>
  )
}

function FindingRows({ rows, canEdit, reduce, onEdit, onDelete, onOpenStandard, showMatch }) {
  return (
    <AnimatePresence initial={false}>
      {rows.map((f) => (
        <motion.tr
          key={f.id}
          layout={!reduce}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          className="group border-t border-rule/50 align-top"
        >
          <td className="px-4 py-3">
            {showMatch ? (
              <button
                type="button"
                onClick={
                  f.matchedStandardId && onOpenStandard
                    ? () => onOpenStandard(f.matchedStandardId)
                    : undefined
                }
                disabled={!f.matchedStandardId || !onOpenStandard}
                className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] font-semibold text-navy transition enabled:hover:border-gold/60 disabled:cursor-default"
              >
                {/* The MATCHED standard's own code, as it appears in the register. */}
                {f.matchedStandardCode ?? '—'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[12px] font-semibold text-[#7a5e00]">
                <Link2Off size={11} />
                Unmatched
              </span>
            )}
            {/* ALWAYS shown, matched or not: what the team actually wrote. When it
                differs from the register's code, the reader can see both. */}
            <p className="mt-1 text-[11.5px] text-muted">
              Cited as “{f.citedStandardCode}”
            </p>
          </td>
          <td className="px-4 py-3 text-muted">{formatShortDate(isoDay(f.visitDate))}</td>
          <td className="px-4 py-3">
            <p className="max-w-xl whitespace-pre-line text-[13.5px] leading-relaxed text-navy">
              {f.text}
            </p>
            {f.evidenceRef ? (
              <p className="mt-1 text-[12px] text-muted">How it was closed: {f.evidenceRef}</p>
            ) : null}
          </td>
          <td className="px-4 py-3">
            <StatusPill status={f.status} />
            {f.status === 'closed' && f.closedDate ? (
              <p className="mt-1 text-[11.5px] text-muted">{formatShortDate(isoDay(f.closedDate))}</p>
            ) : null}
          </td>
          {canEdit ? (
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(f)}
                  aria-label={`Edit the finding cited as ${f.citedStandardCode}`}
                  title="Edit"
                  className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(f)}
                  aria-label={`Delete the finding cited as ${f.citedStandardCode}`}
                  title="Delete"
                  className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          ) : null}
        </motion.tr>
      ))}
    </AnimatePresence>
  )
}

function Table({ children, canEdit, firstCol }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule/50">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-cream">
          <tr>
            <Th>{firstCol}</Th>
            <Th>Visit</Th>
            <Th>What the team wrote</Th>
            <Th>Status</Th>
            {canEdit ? <Th right>Actions</Th> : null}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
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

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gold-gradient text-navy shadow-glow">
          <History size={18} />
        </span>
        <div>
          <h3 className="font-serif text-[17px] font-semibold text-navy">
            Findings from your last visit
          </h3>
          <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            What a real visiting team wrote, and whether you have closed it. A team reads its
            predecessor&apos;s report before it reads yours.
          </p>
        </div>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
        >
          <Plus size={15} /> Add finding
        </button>
      ) : null}
    </div>
  )

  let body
  if (notLicensed) {
    body = (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center text-[13.5px] text-muted">
        Prior-visit findings are part of the Accreditation module.
      </div>
    )
  } else if (loading) {
    body = (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center text-[14px] text-muted">
        Loading prior visiting-team findings…
      </div>
    )
  } else if (error) {
    body = (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center text-[14px] text-danger">
        {error}
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="font-serif text-[16px] italic text-muted">
          No prior visiting-team findings recorded.
        </p>
        <p className="mx-auto mt-1 max-w-xl text-[13px] text-muted">
          Type in what your last team actually wrote. It is the only outside verdict on this school
          we will ever have, and it is the one thing your next team is certain to read.
        </p>
      </div>
    )
  } else {
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Recorded" value={rows.length} sub="citations on file" />
          <Stat
            label="Still open"
            value={openCount}
            sub={openCount > 0 ? 'by your own register' : 'nothing outstanding'}
          />
          <Stat
            label="Unmatched"
            value={unmatched.length}
            sub={unmatched.length > 0 ? 'no standard of that code' : 'all matched'}
          />
        </div>

        {matched.length > 0 ? (
          <Table canEdit={canEdit} firstCol="Standard">
            <FindingRows
              rows={matched}
              canEdit={canEdit}
              reduce={reduce}
              onEdit={openEdit}
              onDelete={onDelete}
              onOpenStandard={onOpenStandard}
              showMatch
            />
          </Table>
        ) : null}

        {/* ── The unmatched section. Its heading is fixed, the note is the
            SERVER's and is printed verbatim, and every row is shown in full. ── */}
        {unmatched.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/[0.04] p-3">
            <div className="flex items-start gap-2">
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[#7a5e00]" />
              <div>
                <h4 className="text-[13.5px] font-semibold text-navy">
                  Cited standards we could not match to your register
                </h4>
                {unmatchedNote ? (
                  <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
                    {unmatchedNote}
                  </p>
                ) : null}
              </div>
            </div>
            <Table canEdit={canEdit} firstCol="Match">
              <FindingRows
                rows={unmatched}
                canEdit={canEdit}
                reduce={reduce}
                onEdit={openEdit}
                onDelete={onDelete}
                onOpenStandard={onOpenStandard}
                showMatch={false}
              />
            </Table>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section className="space-y-3 rounded-2xl border border-rule/60 bg-white p-4 sm:p-5">
      {header}
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
    </section>
  )
}
