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
  FileText,
  Upload,
  Pencil,
  Trash2,
  Download,
  Link2,
  Check,
  Tag,
  Clock,
  CreditCard,
  ArrowLeft,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { AuroraButton, AuroraEmpty, AuroraLightButton, VerdictEm } from '../components/ui/aurora/index.js'
import RegisterEmpty from '../components/module/RegisterEmpty.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useDocuments } from '../hooks/useDocuments.js'
import EntityFormModal, { Field, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import FileDropZone from '../components/ui/FileDropZone.jsx'
import { DataTable, Pill } from '../components/ui/surface/index.js'
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
  const { activeSchool } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  return (
    <DomainStatePanel
      showBack
      title="Knowledge"
      Icon={Library}
      icon={Library}
      verdict={notEntitled ? 'Your subscription is paused.' : 'Document storage isn\u2019t set up yet.'}
      primaryAction={
        notEntitled ? (
          <AuroraButton
            variant="primary"
            to={isOwner ? '/settings/billing' : '/settings'}
            icon={<CreditCard size={19} aria-hidden="true" />}
          >
            Resume your plan
          </AuroraButton>
        ) : (
          <AuroraButton variant="primary" to="/app" icon={<ArrowLeft size={19} aria-hidden="true" />}>
            Back to the dashboard
          </AuroraButton>
        )
      }
      text={
        notEntitled
          ? 'Reactivate your plan to open your document library.'
          : 'Files can\u2019t be uploaded or downloaded until storage is set up.'
      }
      sub={notEntitled ? null : 'Ask your administrator to finish the storage setup.'}
    />
  )
}

// ═══════════════════════════ UPLOAD MODAL ═══════════════════════════════════
// The shared EntityFormModal (unchanged flow: file → title → description → tags).

// Mirrors the server's MIME_ALLOWLIST (api/src/knowledge/documents.service.ts),
// so a file it would refuse is refused here, in words, before the upload.
export const KNOWLEDGE_ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.csv', '.txt',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/csv', 'text/plain',
].join(',')

function UploadModal({ onClose, onSubmit }) {
  const reduce = useReducedMotion()
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // The ONE way a file arrives — the picker and a drop both call this.
  const chooseFile = (f) => {
    setFile(f ?? null)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

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
      {/* Not a <Field>: Field is a <label>, and the drop zone is one too —
          labels can't nest. Same label style and full-width span. */}
      <div className="block min-w-0 sm:col-span-2">
        <span className="fld-label block">File</span>
        {/* Drop or choose — both run chooseFile (owner 2026-10-25: drag and drop everywhere). */}
        <FileDropZone
          testId="knowledge-drop"
          fileName={file?.name}
          title={file ? 'Drop another file here, or choose one' : 'Drop a file here, or choose one'}
          ariaLabel="Choose a document to upload"
          accept={KNOWLEDGE_ACCEPT}
          acceptLabel="PDF, Word, Excel, PowerPoint, CSV, text or a PNG, JPG, GIF or WebP image"
          disabled={busy}
          hint="PDF, Word, Excel, PowerPoint, CSV, text, or a PNG/JPG/GIF/WebP image · one at a time, up to 25 MB"
          onFiles={([f]) => chooseFile(f)}
        />
      </div>
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

function DocumentsTable({ items, loading, error, canEdit, onDownload, onEdit, onDelete, onUpload = null }) {
  if (loading) return <StateRow>Loading documents…</StateRow>
  if (error) return <StateRow error>{error}</StateRow>
  // Empty library: the card carries the one button, under the band's own
  // "Upload document" — the same verb, and the strip's "New" is hidden.
  if (items.length === 0)
    return onUpload ? (
      <AuroraEmpty
        icon={FileText}
        text="No documents yet."
        action={
          <AuroraLightButton variant="ghost" onClick={onUpload} icon={<Upload size={15} aria-hidden="true" />}>
            Upload document
          </AuroraLightButton>
        }
      />
    ) : (
      <RegisterEmpty icon={FileText} text="No documents yet." actionLabel="Upload document" />
    )

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
      icon: FileText,
      value: String(total),
      status: 'neutral',
      sub: { icon: Library, text: 'in your library', tone: 'neutral' },
    }

    const linkedKpi = {
      label: 'Linked to a record',
      icon: Link2,
      value: String(linkedCount),
      status: linkedCount > 0 ? 'good' : 'neutral',
      sub: { icon: Link2, text: 'attached to another record', tone: 'neutral' },
    }

    const recentKpi = {
      label: 'Added recently',
      icon: Clock,
      value: String(recentCount),
      status: 'neutral',
      sub: { icon: Clock, text: 'in the last 30 days', tone: 'neutral' },
    }

    const untaggedKpi = {
      label: 'Untagged',
      icon: Tag,
      value: String(untaggedCount),
      // An empty library is not "all tagged" — no documents, no verdict.
      status: untaggedCount > 0 ? 'watch' : total === 0 ? 'neutral' : 'good',
      sub:
        untaggedCount > 0
          ? { icon: Tag, text: 'need a tag', tone: 'neutral' }
          : total === 0
            ? { icon: Tag, text: 'nothing to tag yet', tone: 'neutral' }
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
        why: 'Add a tag so it is easy to find.',
        actions: [{ label: 'Add tags', primary: false, onClick: () => setEditingDoc(doc) }],
      }))
  }, [items, canEdit])

  // ── The band's one sentence (real counts only) ────────────────────────────
  const verdict = useMemo(() => {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    if (total === 0) return <>Your library is empty. Upload a policy, a report or any file to keep it here.</>
    const recent = items.filter(addedInLast30Days).length
    const untagged = items.filter(isUntagged).length
    return (
      <>
        <VerdictEm>{plural(total, 'document', 'documents')}</VerdictEm> in your library
        {recent > 0 ? (
          <>
            , <VerdictEm>{recent}</VerdictEm> added in the last 30 days
          </>
        ) : null}
        .{' '}
        {untagged > 0 ? (
          <VerdictEm tone="watch">{plural(untagged, 'needs a tag', 'need a tag')}.</VerdictEm>
        ) : (
          <VerdictEm tone="good">Everything is tagged.</VerdictEm>
        )}
      </>
    )
  }, [items, total])

  // ── Gate states (BOTH light, page-level) ───────────────────────────────────
  // notEntitled → subscription paused. notConfigured → S3 not set up on the server.
  // (The list can't render meaningfully without storage, so notConfigured is a
  // page-level gate here, mirroring the prior "storage isn't set up" panel.)
  if (notEntitled || notConfigured) return <GatePanel notEntitled={notEntitled} />

  const openUpload = canEdit ? () => setUploadOpen(true) : null
  const libraryEmpty = !loading && !error && items.length === 0

  const registerTable = (
    <DocumentsTable
      items={items}
      loading={loading}
      error={error}
      canEdit={canEdit}
      onDownload={onDownload}
      onEdit={setEditingDoc}
      onDelete={onDelete}
      onUpload={openUpload}
    />
  )

  // One verb for one job: the band's primary is always "Upload document"; the
  // strip's "New" shows only once the library has files (while it is empty the
  // empty card already carries the button).
  const onNew = libraryEmpty ? null : openUpload
  const primaryAction = openUpload ? (
    <AuroraButton variant="primary" onClick={openUpload} icon={<Upload size={19} aria-hidden="true" />}>
      Upload document
    </AuroraButton>
  ) : null

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
        eyebrow={null}
        title="Knowledge"
        Icon={Library}
        verdict={verdict}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={onNew}
        primaryAction={primaryAction}
        registerTable={registerTable}
        registerSubtitle="Every file your school keeps here"
        registerIcon={Library}
        attentionItems={attentionItems}
        howItWorks={
          <>
            <p>Files are stored securely for your school. A download opens a private link that expires.</p>
            <p>
              A file is linked when it was attached to a policy, board report, standard, campaign or repair. Added
              recently means in the last 30 days.
            </p>
          </>
        }
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
