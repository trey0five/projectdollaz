// ─────────────────────────────────────────────────────────────────────────────
// PersonDetailPanel — the slide-over (no new authed route) for one governance
// person: identity + term, committee memberships, and the credential documents
// section. LIGHT surface over the light command-center page (the dark overlays
// stay reserved for the *FormModals).
//
// Documents reuse the CORE knowledge store UNCHANGED: upload via documentsApi
// multipart with sourceType:'governance_person' + sourceRef:<personId> and a
// tag from the cv|license|degree|background_check convention; download opens the
// existing presigned url in a new tab. Person detail (GET .../people/:id) lists
// exactly those documents — no new upload infra.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  X,
  Pencil,
  UserRound,
  Users,
  Star,
  FileText,
  Download,
  Upload,
  CalendarRange,
  Mail,
  Trash2,
} from 'lucide-react'
import { governancePeopleApi, documentsApi } from '../../lib/api.js'
import {
  GOV_HUE,
  CREDENTIAL_TAGS,
  credentialTagLabel,
  groupLabel,
  roleLabel,
  termStatusOf,
  TERM_BADGE,
  isoDay,
} from './peopleMeta.js'

// ── Tiny light-theme atoms (shared idiom with the register tables) ────────────
function GroupChip({ group }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ borderColor: `${GOV_HUE}55`, backgroundColor: `${GOV_HUE}14`, color: '#5B21B6' }}
    >
      {groupLabel(group)}
    </span>
  )
}

function TermBadge({ person }) {
  const status = termStatusOf(person)
  const b = TERM_BADGE[status]
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}
    >
      {b.label}
    </span>
  )
}

function fmtDay(iso) {
  const day = isoDay(iso)
  if (!day) return '—'
  const d = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function SectionHeading(props) {
  const HeadIcon = props.Icon
  return (
    <h3 className="flex items-center gap-2 font-serif text-[16px] font-semibold text-navy">
      <HeadIcon size={16} style={{ color: GOV_HUE }} />
      {props.children}
    </h3>
  )
}

// ── The credential upload strip (canEdit only) ────────────────────────────────
function UploadCredential({ schoolId, personId, onUploaded }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [tag, setTag] = useState('cv')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!file || busy) return
    setBusy(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^.]+$/, ''))
      fd.append('tags', JSON.stringify([tag]))
      fd.append('sourceType', 'governance_person')
      fd.append('sourceRef', personId)
      await documentsApi.upload(schoolId, fd)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await onUploaded()
    } catch (e) {
      setErr(
        e?.response?.status === 503
          ? "Document storage isn't configured yet."
          : (e?.response?.data?.message ?? 'Upload failed. Please try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-rule/70 bg-cream/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-w-0 flex-1 text-[12.5px] text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-[#7C3AED] file:px-2.5 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
          aria-label="Choose a credential file"
        />
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] font-semibold text-navy"
          aria-label="Credential type"
        >
          {CREDENTIAL_TAGS.map((t) => (
            <option key={t} value={t}>
              {credentialTagLabel(t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={!file || busy}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: GOV_HUE }}
        >
          <Upload size={13} />
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted">
        CV, license, degree, or background check — filed to the knowledge library, linked here.
      </p>
      {err ? <p className="mt-1 text-[12px] font-medium text-danger">{err}</p> : null}
    </div>
  )
}

export default function PersonDetailPanel({
  schoolId,
  person, // the roster-list row (instant header paint while detail loads)
  canEdit,
  refreshToken = 0,
  onClose,
  onEdit,
  onDelete,
  onChanged,
}) {
  const reduce = useReducedMotion()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionErr, setActionErr] = useState('')

  const personId = person?.id ?? null

  // Microtask defer + cancelled flag (the useCommittees idiom) so it is
  // react-hooks/set-state-in-effect safe.
  useEffect(() => {
    let cancelled = false
    if (!schoolId || !personId) return undefined
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      governancePeopleApi
        .get(schoolId, personId)
        .then((res) => {
          if (!cancelled) setDetail(res.data ?? null)
        })
        .catch(() => {
          if (!cancelled) setDetail(null)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, personId, refreshToken])

  // Esc closes; body scroll locks while open (modal idiom).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const p = detail ?? person
  if (!p) return null
  const memberships = detail?.memberships ?? []
  const documents = detail?.documents ?? []

  const download = async (doc) => {
    setActionErr('')
    try {
      const res = await documentsApi.downloadUrl(schoolId, doc.id)
      const url = res.data?.url ?? null
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setActionErr(
        e?.response?.status === 503
          ? "Document storage isn't configured yet."
          : 'Could not get a download link.',
      )
    }
  }

  return (
    <div className="fixed inset-0 z-[55]">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-navy-deep/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Slide-over pane */}
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${p.name} details`}
        initial={reduce ? { opacity: 0 } : { x: '100%' }}
        animate={reduce ? { opacity: 1 } : { x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-hidden border-l border-rule/60 bg-white shadow-2xl"
      >
        {/* Header — purple accent band */}
        <div
          className="relative shrink-0 px-5 pb-4 pt-5"
          style={{ background: `linear-gradient(135deg, ${GOV_HUE}14, transparent 65%)` }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow"
              style={{ backgroundColor: GOV_HUE }}
            >
              <UserRound size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-[22px] font-semibold leading-tight text-navy">
                {p.name}
              </h2>
              {p.title ? <p className="mt-0.5 text-[13.5px] italic text-muted">{p.title}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {(p.groups ?? []).map((g) => (
                  <GroupChip key={g} group={g} />
                ))}
                <TermBadge person={p} />
                {p.active === false ? (
                  <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                    Inactive
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit?.(p)}
                    aria-label={`Edit ${p.name}`}
                    title="Edit"
                    className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                  >
                    <Pencil size={15} />
                  </button>
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      aria-label={`Delete ${p.name}`}
                      title="Delete"
                      className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-8 pt-4">
          {/* Identity rows */}
          <div className="space-y-2 text-[13.5px]">
            <p className="flex items-center gap-2 text-muted">
              <CalendarRange size={14} className="shrink-0" style={{ color: GOV_HUE }} />
              <span>
                Term:{' '}
                <span className="font-semibold text-navy">
                  {p.termStart || p.termEnd ? `${fmtDay(p.termStart)} → ${fmtDay(p.termEnd)}` : '—'}
                </span>
              </span>
            </p>
            <p className="flex items-center gap-2 text-muted">
              <Mail size={14} className="shrink-0" style={{ color: GOV_HUE }} />
              <span>
                Email: <span className="font-semibold text-navy">{p.email ?? '—'}</span>
              </span>
            </p>
            {p.bio ? (
              <p className="rounded-xl border border-rule/50 bg-cream/50 p-3 text-[13px] leading-relaxed text-muted">
                {p.bio}
              </p>
            ) : null}
          </div>

          {/* Committee memberships */}
          <div className="space-y-2.5">
            <SectionHeading Icon={Users}>Committees</SectionHeading>
            {loading && !detail ? (
              <p className="text-[13px] text-muted">Loading…</p>
            ) : memberships.length === 0 ? (
              <p className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-3 py-4 text-center text-[13px] italic text-muted">
                Not on any committee yet — add them from the Committees tab.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {memberships.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-rule/50 bg-cream/40 px-3 py-2"
                  >
                    <span className="truncate text-[13.5px] font-semibold text-navy">
                      {m.committeeName}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold"
                      style={
                        m.role === 'chair'
                          ? { borderColor: `${GOV_HUE}55`, backgroundColor: `${GOV_HUE}14`, color: '#5B21B6' }
                          : undefined
                      }
                    >
                      {m.role === 'chair' ? <Star size={11} fill="currentColor" /> : null}
                      {roleLabel(m.role)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Credential documents */}
          <div className="space-y-2.5">
            <SectionHeading Icon={FileText}>Credentials &amp; documents</SectionHeading>
            {canEdit ? (
              <UploadCredential
                schoolId={schoolId}
                personId={p.id}
                onUploaded={async () => {
                  // Re-pull the detail (doc list) + let the page refresh doc counts.
                  const res = await governancePeopleApi.get(schoolId, p.id)
                  setDetail(res.data ?? null)
                  onChanged?.()
                }}
              />
            ) : null}
            {actionErr ? <p className="text-[12.5px] font-medium text-danger">{actionErr}</p> : null}
            {loading && !detail ? (
              <p className="text-[13px] text-muted">Loading…</p>
            ) : documents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-3 py-4 text-center text-[13px] italic text-muted">
                No credentials on file yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {documents.map((doc) => (
                    <motion.li
                      key={doc.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduce ? undefined : { opacity: 0 }}
                      className="flex items-center gap-2.5 rounded-xl border border-rule/50 bg-cream/40 px-3 py-2"
                    >
                      <FileText size={15} className="shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-navy">{doc.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {(doc.tags ?? []).map((t) => (
                            <span
                              key={t}
                              className="rounded-md border border-rule/60 bg-section px-1.5 py-0.5 text-[10.5px] font-semibold text-muted"
                            >
                              {credentialTagLabel(t)}
                            </span>
                          ))}
                          <span className="text-[11px] text-muted/70">{fmtDay(doc.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => download(doc)}
                        aria-label={`Download ${doc.title}`}
                        title="Download"
                        className="shrink-0 rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                      >
                        <Download size={14} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </motion.aside>
    </div>
  )
}
