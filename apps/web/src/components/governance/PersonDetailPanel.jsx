// ─────────────────────────────────────────────────────────────────────────────
// PersonDetailPanel — the slide-over (no new authed route) for one governance
// person: identity + term, committee memberships, and the credential documents
// section. Premium UI P4: a `.b1-drawer` (the Panel geometry pinned right, the one
// float shadow) with its sections as label rules on white — no tinted bands,
// no per-row cards; the module hue survives only as icon strokes.
//
// Documents reuse the CORE knowledge store UNCHANGED: upload via documentsApi
// multipart with sourceType:'governance_person' + sourceRef:<personId> and a
// tag from the cv|license|degree|background_check convention; download opens the
// existing presigned url in a new tab. Person detail (GET .../people/:id) lists
// exactly those documents — no new upload infra.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X, Pencil, Star, Download, Upload, Trash2 } from 'lucide-react'
import { governancePeopleApi, documentsApi } from '../../lib/api.js'
import { Section, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'
import { DROP_HIGHLIGHT, useFileDrop } from '../../hooks/useFileDrop.js'
import {
  CREDENTIAL_TAGS,
  credentialTagLabel,
  groupLabel,
  roleLabel,
  termStatusOf,
  TERM_BADGE,
  isoDay,
} from './peopleMeta.js'

// ── Tiny atoms (the register's vocabulary: status Pills, ink text) ──────────
function TermBadge({ person }) {
  const status = termStatusOf(person)
  const b = TERM_BADGE[status]
  return (
    <Pill variant="status" tone={b.tone}>
      {b.label}
    </Pill>
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

// ── The credential upload strip (canEdit only) ────────────────────────────────
function UploadCredential({ schoolId, personId, onUploaded }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [tag, setTag] = useState('cv')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // The ONE way a file arrives — the picker and a drop both call this. A drop
  // also lands in the native input (where the browser allows it) so it shows
  // the dropped file's name instead of "No file chosen".
  const chooseFile = (f, { fromDrop = false } = {}) => {
    setFile(f ?? null)
    if (!fromDrop || !f || !fileRef.current) return
    try {
      const dt = new DataTransfer()
      dt.items.add(f)
      fileRef.current.files = dt.files
    } catch {
      /* older browsers / jsdom: the state still holds the file */
    }
  }
  const { dragging, dropProps } = useFileDrop({
    disabled: busy,
    onFiles: ([f]) => chooseFile(f, { fromDrop: true }),
    onReject: (msg) => setErr(msg),
  })

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
    <div className="space-y-2">
      <div
        {...dropProps}
        data-testid="credential-drop"
        className={`flex flex-wrap items-center gap-2 rounded-[6px] ${dragging ? DROP_HIGHLIGHT : ''}`}
      >
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          className="b1-fld min-w-0 flex-1 file:mr-2 file:rounded file:border-0 file:bg-ink/[.06] file:px-2 file:py-1 file:text-[12px] file:font-semibold file:text-ink"
          aria-label="Choose a credential file"
        />
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="sel" aria-label="Credential type">
          {CREDENTIAL_TAGS.map((t) => (
            <option key={t} value={t}>
              {credentialTagLabel(t)}
            </option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={submit} disabled={!file || busy} icon={<Upload size={13} />}>
          {busy ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      <p className="text-[12px] text-ink2">
        CV, license, degree, or background check. Filed to the knowledge library and linked here.
      </p>
      {err ? <p className="text-[12px] font-medium text-risk">{err}</p> : null}
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
      <motion.div
        className="b1-drawer-scrim"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${p.name} details`}
        initial={reduce ? false : { x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="b1-drawer"
      >
        <div className="b1-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="pg-eyebrow">Governance · Person</p>
            <h2 className="font-serif text-[24px] font-medium leading-tight text-ink [overflow-wrap:anywhere]">{p.name}</h2>
            {p.title ? <p className="mt-0.5 text-[13px] text-ink2">{p.title}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(p.groups ?? []).map((g) => (
                <Pill key={g}>{groupLabel(g)}</Pill>
              ))}
              <TermBadge person={p} />
              {p.active === false ? (
                <Pill variant="status" tone="neutral">
                  Inactive
                </Pill>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit ? (
              <>
                <button type="button" onClick={() => onEdit?.(p)} aria-label={`Edit ${p.name}`} title="Edit" className="b1-icon-act">
                  <Pencil size={15} />
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(p)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete"
                    className="b1-icon-act b1-icon-act-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" onClick={onClose} aria-label="Close" className="b1-icon-act">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="b1-drawer-body">
          <Section label="Profile">
            <dl className="b1-facts">
              <div>
                <dt>Term</dt>
                <dd>{p.termStart || p.termEnd ? `${fmtDay(p.termStart)} → ${fmtDay(p.termEnd)}` : '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{p.email ?? '—'}</dd>
              </div>
            </dl>
            {p.bio ? <p className="mt-3 text-[13px] leading-relaxed text-ink2">{p.bio}</p> : null}
          </Section>

          <Section label="Committees">
            {loading && !detail ? (
              <p className="text-[13px] text-ink2">Loading…</p>
            ) : memberships.length === 0 ? (
              <div className="b1-empty">
                <p>Not on any committee yet. Add them from the Committees tab.</p>
              </div>
            ) : (
              <ul className="b1-list">
                {memberships.map((m) => (
                  <li key={m.id} className="b1-row justify-between">
                    <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{m.committeeName}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink2">
                      {m.role === 'chair' ? <Star size={11} fill="currentColor" className="tone-hue" aria-hidden="true" /> : null}
                      {roleLabel(m.role)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section label="Credentials & documents">
            {canEdit ? (
              <div className="mb-3">
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
              </div>
            ) : null}
            {actionErr ? <p className="mb-2 text-[12.5px] font-medium text-risk">{actionErr}</p> : null}
            {loading && !detail ? (
              <p className="text-[13px] text-ink2">Loading…</p>
            ) : documents.length === 0 ? (
              <div className="b1-empty">
                <p>No credentials on file yet.</p>
              </div>
            ) : (
              <ul className="b1-list">
                {documents.map((doc) => (
                  <li key={doc.id} className="b1-row">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold [overflow-wrap:anywhere]">{doc.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink2">
                        {[...(doc.tags ?? []).map(credentialTagLabel), fmtDay(doc.createdAt)].join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => download(doc)}
                      aria-label={`Download ${doc.title}`}
                      title="Download"
                      className="b1-icon-act"
                    >
                      <Download size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </motion.aside>
    </div>
  )
}
