// ─────────────────────────────────────────────────────────────────────────────
// Knowledge route — the DOMAIN COMMAND CENTER (Phase 4 v1, redesigned to match
// Governance / Facilities / Advancement / Accreditation). A LIGHT command-center:
// Penny lands you on Knowledge's slice — the KPIs that describe the library's
// health (documents, records linked, recently added, untagged), a "needs
// attention" rail of organizational nudges (untagged docs), with the documents
// register a tab away. Built on the reusable DomainCommandCenter scaffold.
//
// CORE (always included, NOT a licensed module) — every entitled school sees it.
// Files upload SERVER-SIDE (multipart → the API PutObjects to S3); download opens a
// presigned GET url in a new tab (top-level nav to S3, no CORS). The upload / edit-
// meta modals are kept as dark navy/gold overlays over the light page.
//
// TWO gate states are preserved as LIGHT page-level panels:
//   • notEntitled  — the subscription is paused (API 402).
//   • notConfigured — S3 storage isn't set up on the server (API 503). The list
//     still renders; only uploads/downloads are unavailable.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Library,
  Upload,
  Pencil,
  Trash2,
  Download,
  X,
  Link2,
  Check,
  Tag,
  Clock,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useDocuments } from '../hooks/useDocuments.js'

// Friendly labels for the linked-record source types (a doc "linked to a record"
// carries a sourceType other than 'manual' — a governance policy, board report, …).
const SOURCE_BADGE = {
  policy: { label: 'Governance', cls: 'border-sky-300/70 bg-sky-50 text-sky-700' },
  board_report: { label: 'Board report', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  standard: { label: 'Accreditation', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  campaign: { label: 'Advancement', cls: 'border-pink-300/70 bg-pink-50 text-pink-700' },
  maintenance: { label: 'Facilities', cls: 'border-amber-300/70 bg-amber-50 text-amber-700' },
}

// mime → a short human label for the Type column.
function mimeLabel(mimeType) {
  const m = mimeType ?? ''
  if (m === 'application/pdf') return 'PDF'
  if (m.startsWith('image/')) return 'Image'
  if (m.includes('spreadsheet') || m.includes('ms-excel') || m === 'text/csv') return 'Spreadsheet'
  if (m.includes('presentation') || m.includes('powerpoint')) return 'Slides'
  if (m.includes('word')) return 'Document'
  if (m === 'text/plain') return 'Text'
  if (!m) return '—'
  return 'File'
}

function fmtSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

// A doc is "linked to a record" if its sourceType is present and not a manual upload.
function isLinked(doc) {
  const s = doc?.sourceType
  return !!s && s !== 'manual'
}

function isUntagged(doc) {
  return !Array.isArray(doc?.tags) || doc.tags.length === 0
}

function addedInLast30Days(doc) {
  if (!doc?.createdAt) return false
  const t = new Date(doc.createdAt).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t <= 30 * 24 * 60 * 60 * 1000
}

// ── Light-theme register table primitives (shared idiom with Governance) ─────
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

function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy ${
        danger ? 'hover:border-danger/50 hover:text-danger' : 'hover:border-gold/60'
      }`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

function TableShell({ children, cols }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule/50">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-cream">
          <tr>{cols}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function StateRow({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
      {children}
    </div>
  )
}

function SourceBadge({ sourceType }) {
  const def = SOURCE_BADGE[sourceType]
  if (!def) {
    return (
      <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] font-semibold text-muted">
        Manual upload
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      <Link2 className="h-3 w-3" />
      {def.label}
    </span>
  )
}

// ── Light-theme entitlement / configuration gate ─────────────────────────────
// Knowledge has NO module gate (CORE), but TWO page-level states: the subscription
// is paused (notEntitled) OR storage isn't set up on the server (notConfigured).
function GatePanel({ notEntitled }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <Library size={26} />
        </span>
        {notEntitled ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Reactivate your plan to access your document library.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Document storage isn&apos;t set up yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Your library needs cloud storage configured on the server before you can upload or
              download files. Ask your administrator to finish the storage setup.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ UPLOAD MODAL ═══════════════════════════════════
// Kept as a dark navy/gold overlay over the light page (unchanged flow).

function UploadModal({ onClose, onSubmit }) {
  const reduce = useReducedMotion()
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!file) {
      setErr('Please choose a file.')
      return
    }
    if (!title.trim()) {
      setErr('A title is required.')
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', title.trim())
    if (description.trim()) fd.append('description', description.trim())
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (tagList.length) fd.append('tags', JSON.stringify(tagList))
    setBusy(true)
    try {
      await onSubmit(fd)
      onClose()
    } catch (e2) {
      if (e2?.response?.status === 503) {
        setErr("Document storage isn't configured yet.")
      } else {
        setErr(e2?.response?.data?.message ?? 'Upload failed. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            Upload a document
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">File</label>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
              }}
              className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-1.5 file:font-semibold file:text-navy"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white placeholder-white/40 focus:border-gold focus:outline-none"
              placeholder="e.g. Employee handbook 2026"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white placeholder-white/40 focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white placeholder-white/40 focus:border-gold focus:outline-none"
              placeholder="hr, policy, 2026"
            />
          </div>
          {err ? <p className="text-sm text-red-300">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════ EDIT-META MODAL ════════════════════════════════
// Kept as a dark navy/gold overlay. Edits title / description / tags via updateMeta.

function EditMetaModal({ doc, onClose, onSave }) {
  const reduce = useReducedMotion()
  const [title, setTitle] = useState(doc.title ?? '')
  const [description, setDescription] = useState(doc.description ?? '')
  const [tags, setTags] = useState(Array.isArray(doc.tags) ? doc.tags.join(', ') : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!title.trim()) {
      setErr('A title is required.')
      return
    }
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    setBusy(true)
    try {
      await onSave(doc.id, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        tags: tagList,
      })
      onClose()
    } catch {
      setErr('Could not save those changes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            Edit tags &amp; details
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <p className="truncate text-[13px] text-white/50">{doc.fileName}</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white placeholder-white/40 focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white placeholder-white/40 focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white placeholder-white/40 focus:border-gold focus:outline-none"
              placeholder="hr, policy, 2026"
            />
          </div>
          {err ? <p className="text-sm text-red-300">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════ LIGHT DOCUMENTS TABLE ══════════════════════════

function DocumentsTable({ items, loading, error, canEdit, reduce, onDownload, onEdit, onDelete }) {
  if (loading)
    return (
      <StateRow>
        <p className="text-[14px] text-muted">Loading documents…</p>
      </StateRow>
    )
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (items.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">
          No documents yet — upload your first file.
        </p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Document</Th>
          <Th>Type</Th>
          <Th>Source</Th>
          <Th right>Size</Th>
          <Th>Added</Th>
          <Th right>Actions</Th>
        </>
      }
    >
      <AnimatePresence initial={false}>
        {items.map((doc) => (
          <motion.tr
            key={doc.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="group border-t border-rule/50"
          >
            <td className="px-4 py-3">
              <div className="font-semibold text-navy">{doc.title}</div>
              <div className="mt-0.5 truncate text-[12.5px] text-muted">{doc.fileName}</div>
              {doc.tags?.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {doc.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-rule/60 bg-section px-1.5 py-0.5 text-[11px] font-semibold text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </td>
            <td className="px-4 py-3 text-muted">{mimeLabel(doc.mimeType)}</td>
            <td className="px-4 py-3">
              <SourceBadge sourceType={doc.sourceType} />
            </td>
            <td className="px-4 py-3 text-right text-muted">{fmtSize(doc.sizeBytes)}</td>
            <td className="px-4 py-3 text-muted">{fmtDate(doc.createdAt)}</td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                <IconAction
                  Icon={Download}
                  onClick={() => onDownload(doc)}
                  label={`Download ${doc.title}`}
                  title="Download"
                />
                {canEdit ? (
                  <>
                    <IconAction
                      Icon={Pencil}
                      onClick={() => onEdit(doc)}
                      label={`Edit ${doc.title}`}
                      title="Edit tags & details"
                    />
                    <IconAction
                      Icon={Trash2}
                      danger
                      onClick={() => onDelete(doc)}
                      label={`Delete ${doc.title}`}
                    />
                  </>
                ) : null}
              </div>
            </td>
          </motion.tr>
        ))}
      </AnimatePresence>
    </TableShell>
  )
}

const TABS = [{ key: 'documents', label: 'Documents' }]

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function KnowledgeWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const {
    items,
    total,
    loading,
    error,
    notEntitled,
    notConfigured,
    upload,
    remove,
    updateMeta,
    getDownloadUrl,
  } = useDocuments(schoolId)

  const [tab, setTab] = useState('documents')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  const [actionErr, setActionErr] = useState('')

  const onDownload = async (doc) => {
    setActionErr('')
    try {
      const url = await getDownloadUrl(doc.id)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setActionErr(
        e?.response?.status === 503
          ? "Document storage isn't configured yet."
          : 'Could not get a download link.',
      )
    }
  }

  const onDelete = async (doc) => {
    if (window.confirm(`Delete "${doc.title}"?`)) {
      setActionErr('')
      try {
        await remove(doc.id)
      } catch {
        setActionErr('Could not delete that document.')
      }
    }
  }

  // ── KPIs (computed from the library) ───────────────────────────────────────
  const kpis = useMemo(() => {
    const linkedCount = items.filter(isLinked).length
    const recentCount = items.filter(addedInLast30Days).length
    const untaggedCount = items.filter(isUntagged).length

    const documentsKpi = {
      label: 'Documents',
      value: String(total),
      status: 'neutral',
      sub: { icon: Library, text: 'in your library', tone: 'neutral' },
    }

    const linkedKpi = {
      label: 'Linked to a record',
      value: String(linkedCount),
      status: linkedCount > 0 ? 'good' : 'neutral',
      sub: { icon: Link2, text: 'connected to operations', tone: 'good' },
    }

    const recentKpi = {
      label: 'Added recently',
      value: String(recentCount),
      status: 'neutral',
      sub: { icon: Clock, text: 'in the last 30 days', tone: 'neutral' },
    }

    const untaggedKpi = {
      label: 'Untagged',
      value: String(untaggedCount),
      status: untaggedCount > 0 ? 'watch' : 'good',
      sub:
        untaggedCount > 0
          ? { icon: Tag, text: 'need a tag', tone: 'neutral' }
          : { icon: Check, text: 'all tagged', tone: 'good' },
    }

    return [documentsKpi, linkedKpi, recentKpi, untaggedKpi]
  }, [items, total])

  // ── Needs-attention items — organizational nudges only (untagged docs). ────
  // A library is not an alarm system; the only nudge is "this doc has no tags".
  const attentionItems = useMemo(() => {
    if (!canEdit) return []
    return items
      .filter(isUntagged)
      .slice(0, 6)
      .map((doc) => ({
        id: `untagged-${doc.id}`,
        tone: 'watch',
        title: `${doc.title} has no tags`,
        why: "Add a tag so it's easy to find",
        actions: [{ label: 'Add tags', primary: false, onClick: () => setEditingDoc(doc) }],
      }))
  }, [items, canEdit])

  // ── Gate states (BOTH light, page-level) ───────────────────────────────────
  // notEntitled → subscription paused. notConfigured → S3 not set up on the server.
  // (The list can't render meaningfully without storage, so notConfigured is a
  // page-level gate here, mirroring the prior "storage isn't set up" panel.)
  if (notEntitled || notConfigured) return <GatePanel notEntitled={notEntitled} />

  const registerTable = (
    <DocumentsTable
      items={items}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      onDownload={onDownload}
      onEdit={setEditingDoc}
      onDelete={onDelete}
    />
  )

  const onNew = canEdit ? () => setUploadOpen(true) : null

  return (
    <>
      {actionErr ? (
        <div className="mx-auto mb-2 max-w-[1180px] px-4 sm:px-10">
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {actionErr}
          </div>
        </div>
      ) : null}

      <DomainCommandCenter
        showBack
        eyebrow="Core · Knowledge engine · system of record"
        title="Knowledge"
        Icon={Library}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={onNew}
        registerTable={registerTable}
        attentionItems={attentionItems}
      />

      {uploadOpen ? <UploadModal onClose={() => setUploadOpen(false)} onSubmit={upload} /> : null}
      {editingDoc ? (
        <EditMetaModal
          key={editingDoc.id}
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSave={updateMeta}
        />
      ) : null}
    </>
  )
}

export default function KnowledgePage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <KnowledgeWorkspace />
    </div>
  )
}
