// ─────────────────────────────────────────────────────────────────────────────
// Knowledge route (Phase 4 v1): AppShell chrome + the document store browser.
// CORE (always included, NOT a licensed module) — every entitled school sees it.
// Files upload SERVER-SIDE (multipart → the API PutObjects to S3); download opens a
// presigned GET url in a new tab (top-level nav to S3, no CORS). Navy/gold theme,
// framer-motion, reduced-motion safe, no setState-in-effect (the hook owns loading).
//
// If storage isn't configured the upload/download return 503 → a friendly
// "Document storage isn't configured yet" banner; the list still renders.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Library,
  Upload,
  Trash2,
  Download,
  X,
  FileText,
  FileSpreadsheet,
  FileImage,
  Presentation,
  File as FileIcon,
  Link2,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useDocuments } from '../hooks/useDocuments.js'

const SOURCE_BADGE = {
  policy: { label: 'Governance', cls: 'border-sky-400/50 bg-sky-500/15 text-sky-200' },
  board_report: { label: 'Board report', cls: 'border-gold/50 bg-gold/15 text-gold-light' },
  standard: { label: 'Accreditation', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  campaign: { label: 'Advancement', cls: 'border-pink-400/50 bg-pink-500/15 text-pink-200' },
  maintenance: { label: 'Facilities', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
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

function iconFor(mimeType) {
  const m = mimeType ?? ''
  if (m.startsWith('image/')) return FileImage
  if (m.includes('spreadsheet') || m.includes('ms-excel') || m === 'text/csv') return FileSpreadsheet
  if (m.includes('presentation') || m.includes('powerpoint')) return Presentation
  if (m === 'application/pdf' || m.includes('word') || m === 'text/plain') return FileText
  return FileIcon
}

function SourceBadge({ sourceType }) {
  const def = SOURCE_BADGE[sourceType]
  if (!def) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      <Link2 className="h-3 w-3" />
      {def.label}
    </span>
  )
}

function UploadModal({ onClose, onSubmit }) {
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
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-navy-light/95 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-white">Upload a document</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
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

function KnowledgePanel() {
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
    getDownloadUrl,
  } = useDocuments(schoolId)

  const [modalOpen, setModalOpen] = useState(false)
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

  const showList = !notEntitled && !loading && !error

  const header = useMemo(
    () => (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-2.5">
            <Library className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-white">Knowledge</h1>
            <p className="text-sm text-white/60">
              {total} document{total === 1 ? '' : 's'} — your institutional memory, searchable everywhere.
            </p>
          </div>
        </div>
        {canEdit ? (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy shadow-lg hover:bg-gold-light"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        ) : null}
      </div>
    ),
    [total, canEdit],
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:pl-64">
      {header}

      {notConfigured ? (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Document storage isn&apos;t configured yet. Uploads and downloads are temporarily unavailable.
        </div>
      ) : null}
      {actionErr ? (
        <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionErr}
        </div>
      ) : null}

      {notEntitled ? (
        <div className="rounded-2xl border border-white/10 bg-navy-light/70 p-8 text-center text-white/70">
          Your subscription is inactive. Reactivate to access your documents.
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-white/10 bg-navy-light/50 p-8 text-center text-white/50">
          Loading documents…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-center text-red-200">
          {error}
        </div>
      ) : null}

      {showList && items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-navy-light/40 p-12 text-center">
          <Library className="mx-auto mb-3 h-10 w-10 text-white/30" />
          <p className="text-white/70">No documents yet.</p>
          {canEdit ? <p className="mt-1 text-sm text-white/50">Upload your first file to get started.</p> : null}
        </div>
      ) : null}

      {showList && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((doc, i) => {
            const Icon = iconFor(doc.mimeType)
            return (
              <motion.div
                key={doc.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : Math.min(i * 0.03, 0.3) }}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-navy-light/70 px-4 py-3 hover:border-gold/40"
              >
                <div className="rounded-lg border border-white/10 bg-navy/60 p-2.5">
                  <Icon className="h-5 w-5 text-gold-light" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-white">{doc.title}</span>
                    <SourceBadge sourceType={doc.sourceType} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-white/50">
                    <span className="truncate">{doc.fileName}</span>
                    <span>{fmtSize(doc.sizeBytes)}</span>
                    <span>{fmtDate(doc.createdAt)}</span>
                  </div>
                  {doc.tags?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {doc.tags.map((t) => (
                        <span key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDownload(doc)}
                    title="Download"
                    className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-gold"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {canEdit ? (
                    <button
                      onClick={() => onDelete(doc)}
                      title="Delete"
                      className="rounded-lg p-2 text-white/70 hover:bg-red-500/20 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : null}

      {modalOpen ? <UploadModal onClose={() => setModalOpen(false)} onSubmit={upload} /> : null}
    </div>
  )
}

export default function KnowledgePage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <KnowledgePanel />
    </div>
  )
}
