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
// meta dialogs share EntityFormModal (the ONE record dialog); the register is a
// DataTable on the ground (Premium UI P4).
//
// TWO gate states are preserved as LIGHT page-level panels:
//   • notEntitled  — the subscription is paused (API 402).
//   • notConfigured — S3 storage isn't set up on the server (API 503). The list
//     still renders; only uploads/downloads are unavailable.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import {
  Library,
  Upload,
  Pencil,
  Trash2,
  Download,
  Link2,
  Check,
  Tag,
  Clock,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useDocuments } from '../hooks/useDocuments.js'
import EntityFormModal, { Field, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import { PageHeader, DataTable, Pill } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

// Friendly labels for the linked-record source types (a doc "linked to a record"
// carries a sourceType other than 'manual' — a governance policy, board report, …).
const SOURCE_BADGE = {
  policy: { label: 'Governance' },
  board_report: { label: 'Board report' },
  standard: { label: 'Accreditation' },
  campaign: { label: 'Advancement' },
  maintenance: { label: 'Facilities' },
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

// ── Register atoms: quiet icon actions, a ruled state row ────────────────────
function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`b1-icon-act${danger ? ' b1-icon-act-danger' : ''}`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

/** Loading / error / empty — a ruled block on the ground, never a dashed card. */
function StateRow({ title, children, error }) {
  return (
    <div className="b1-empty" role={error ? 'alert' : undefined}>
      {title ? <p className="b1-empty-title">{title}</p> : null}
      {children ? <p className={error ? 'b1-empty-err' : undefined}>{children}</p> : null}
    </div>
  )
}

function SourceBadge({ sourceType }) {
  const def = SOURCE_BADGE[sourceType]
  if (!def) return <span className="text-ink2">Manual upload</span>
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Link2 className="h-3 w-3 text-ink2" aria-hidden="true" />
      {def.label}
    </span>
  )
}

// ── Entitlement / configuration gate: a plain page header on the ground ──────
// Knowledge has NO module gate (CORE), but TWO page-level states: the subscription
// is paused (notEntitled) OR storage isn't set up on the server (notConfigured).
function GatePanel({ notEntitled }) {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <PageHeader
        eyebrow="Knowledge"
        title={notEntitled ? 'Your subscription is paused' : 'Document storage isn\u2019t set up yet'}
        meta={
          notEntitled
            ? 'Reactivate your plan to access your document library.'
            : 'Your library needs cloud storage configured on the server before you can upload or download files. Ask your administrator to finish the storage setup.'
        }
      />
    </div>
  )
}

// ═══════════════════════════ UPLOAD MODAL ═══════════════════════════════════
// The shared EntityFormModal (unchanged flow: file → title → description → tags).

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
    <EntityFormModal
      open
      icon={Upload}
      title="Upload a document"
      subtitle="Filed to your knowledge library"
      onClose={onClose}
      onSubmit={submit}
      saving={busy}
      error={err}
      submitLabel="Upload"
      reduce={reduce}
    >
      <Field label="File" span={2} index={0} reduce={reduce}>
        <input
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
          }}
          className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-ink/[.06] file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-ink`}
        />
      </Field>
      <Field label="Title" span={2} index={1} reduce={reduce}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={fieldInput}
          placeholder="e.g. Employee handbook 2026"
        />
      </Field>
      <Field label="Description (optional)" span={2} index={2} reduce={reduce}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={2}
          className={fieldTextarea}
        />
      </Field>
      <Field label="Tags (comma-separated)" span={2} index={3} reduce={reduce}>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={fieldInput} placeholder="hr, policy, 2026" />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ EDIT-META MODAL ════════════════════════════════
// The shared EntityFormModal. Edits title / description / tags via updateMeta.

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
    <EntityFormModal
      open
      icon={Tag}
      title="Edit tags & details"
      subtitle={doc.fileName}
      onClose={onClose}
      onSubmit={submit}
      saving={busy}
      error={err}
      submitLabel="Save"
      reduce={reduce}
    >
      <Field label="Title" span={2} index={0} reduce={reduce}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={fieldInput} />
      </Field>
      <Field label="Description (optional)" span={2} index={1} reduce={reduce}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={2}
          className={fieldTextarea}
        />
      </Field>
      <Field label="Tags (comma-separated)" span={2} index={2} reduce={reduce}>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={fieldInput} placeholder="hr, policy, 2026" />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ DOCUMENTS TABLE ════════════════════════════════

function DocumentsTable({ items, loading, error, canEdit, onDownload, onEdit, onDelete }) {
  if (loading) return <StateRow>Loading documents…</StateRow>
  if (error) return <StateRow error>{error}</StateRow>
  if (items.length === 0) return <StateRow title="No documents yet">Upload your first file.</StateRow>

  const columns = [
    {
      key: 'title',
      header: 'Document',
      sortable: true,
      render: (doc) => (
        <div className="min-w-[12rem] py-1.5">
          <span className="font-semibold">{doc.title}</span>
          <span className="dt-sub truncate">{doc.fileName}</span>
          {doc.tags?.length ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {doc.tags.map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </span>
          ) : null}
        </div>
      ),
    },
    { key: 'mimeType', header: 'Type', render: (doc) => <span className="text-ink2">{mimeLabel(doc.mimeType)}</span> },
    { key: 'sourceType', header: 'Source', render: (doc) => <SourceBadge sourceType={doc.sourceType} /> },
    {
      key: 'sizeBytes',
      header: 'Size',
      num: true,
      sortable: true,
      render: (doc) => <span className="whitespace-nowrap text-ink2">{fmtSize(doc.sizeBytes)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Added',
      sortable: true,
      render: (doc) => <span className="whitespace-nowrap text-ink2">{fmtDate(doc.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'dt-num',
      className: 'dt-num',
      render: (doc) => (
        <div className="dt-actions inline-flex justify-end gap-1">
          <IconAction Icon={Download} onClick={() => onDownload(doc)} label={`Download ${doc.title}`} title="Download" />
          {canEdit ? (
            <>
              <IconAction Icon={Pencil} onClick={() => onEdit(doc)} label={`Edit ${doc.title}`} title="Edit tags & details" />
              <IconAction Icon={Trash2} danger onClick={() => onDelete(doc)} label={`Delete ${doc.title}`} />
            </>
          ) : null}
        </div>
      ),
    },
  ]

  return <DataTable caption="Documents" columns={columns} rows={items} markOf={(doc) => (isUntagged(doc) ? 'watch' : null)} />
}

const TABS = [{ key: 'documents', label: 'Documents' }]

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function KnowledgeWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

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
  // `?upload=1` (AIC Phase E). Two early-warning rules — EVI-MISSING-REQUIRED and
  // FIN-AUDIT-STALE — answer "what do I do?" with "upload it", and the link was
  // inert: the page read no search params, so the reader arrived at the document
  // library with no upload modal and no next step.
  const [searchParams, setSearchParams] = useSearchParams()
  const [uploadOpen, setUploadOpen] = useState(
    () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('upload') === '1',
  )
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled || !searchParams.get('upload')) return
      const next = new URLSearchParams(searchParams)
      next.delete('upload')
      setSearchParams(next, { replace: true })
    })
    return () => {
      cancelled = true
    }
    // Mount-only: consumed once, so refresh and back do not re-open the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
      onDownload={onDownload}
      onEdit={setEditingDoc}
      onDelete={onDelete}
    />
  )

  const onNew = canEdit ? () => setUploadOpen(true) : null

  return (
    <>
      {actionErr ? (
        <div className="mx-auto max-w-page px-4 pt-4 sm:px-10">
          <p role="alert" className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
            <i className="mark tone-risk" aria-hidden="true" />
            {actionErr}
          </p>
        </div>
      ) : null}

      <DomainCommandCenter
        showBack
        eyebrow={`Knowledge · ${activeSchool?.name ?? 'School'}`}
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
