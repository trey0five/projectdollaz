// ─────────────────────────────────────────────────────────────────────────────
// StandardDocuments — file evidence for ONE standard, riding the EXISTING CORE
// knowledge document store (NO new upload infra): multipart upload with
// sourceType:'standard' + sourceRef:<standardId> (server validates school
// ownership via resolveLink), list filtered to this standard (sourceType filter
// server-side + sourceRef client-side), presigned download-url on click. After a
// successful upload we ALSO POST an evidence row { title: file name,
// kind:'document', sourceType:'knowledge_document', sourceRef:<doc.id> } so the
// file shows in the evidence list and counts toward coverage/readiness (§3.8 of
// the frozen contract). Dark styling — it lives inside the navy EvidencePanel.
// Precedent: the governance person credential uploader + KnowledgePage.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Download, FileUp, Paperclip } from 'lucide-react'
import { documentsApi } from '../../lib/api.js'

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export default function StandardDocuments({ schoolId, standardId, canEdit, createEvidence, onChanged }) {
  const fileRef = useRef(null)
  const [docs, setDocs] = useState(null) // null = loading
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const res = await documentsApi.list(schoolId, { sourceType: 'standard' })
      const rows = (res.data?.documents ?? []).filter((d) => d.sourceRef === standardId)
      setDocs(rows)
    } catch {
      setDocs([])
    }
  }

  // Lazy load on mount (the panel was just expanded) — microtask defer + cancelled
  // flag, mirroring the EvidencePanel idiom.
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => documentsApi.list(schoolId, { sourceType: 'standard' }))
      .then((res) => {
        if (cancelled) return
        setDocs((res.data?.documents ?? []).filter((d) => d.sourceRef === standardId))
      })
      .catch(() => {
        if (!cancelled) setDocs([])
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, standardId])

  const upload = async (file) => {
    if (!file || busy) return
    setBusy(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^.]+$/, ''))
      fd.append('sourceType', 'standard')
      fd.append('sourceRef', standardId)
      const res = await documentsApi.upload(schoolId, fd)
      const docId = res.data?.id ?? null
      // §3.8 — the auto evidence row makes the upload count toward coverage/readiness.
      if (docId && createEvidence) {
        await createEvidence(standardId, {
          title: file.name,
          kind: 'document',
          sourceType: 'knowledge_document',
          sourceRef: docId,
        })
      }
      if (fileRef.current) fileRef.current.value = ''
      await load()
      await onChanged?.()
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

  const download = async (doc) => {
    setErr('')
    try {
      const res = await documentsApi.downloadUrl(schoolId, doc.id)
      const url = res.data?.url ?? null
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setErr(
        e?.response?.status === 503
          ? "Document storage isn't configured yet."
          : 'Could not get a download link.',
      )
    }
  }

  return (
    <div>
      <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/50">
        <Paperclip size={13} aria-hidden /> Documents on this standard
      </p>

      {docs === null ? (
        <p className="text-[12.5px] text-white/45">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-[12.5px] text-white/45">No files uploaded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy/50 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-white/85">{doc.fileName}</span>
                <span className="block text-[11px] text-white/40">
                  {fmtSize(doc.sizeBytes)}
                  {doc.createdAt ? ` · ${doc.createdAt.slice(0, 10)}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => download(doc)}
                aria-label={`Download ${doc.fileName}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-[12px] font-semibold text-white/70 transition hover:border-[#F59E0B]/60 hover:text-[#fde68a]"
              >
                <Download size={12} aria-hidden /> Download
              </button>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            upload(e.dataTransfer?.files?.[0] ?? null)
          }}
          className={`mt-2.5 rounded-xl border-2 border-dashed px-3 py-3 text-center transition ${
            dragOver ? 'border-[#F59E0B]/70 bg-[#F59E0B]/10' : 'border-white/15 bg-white/5'
          }`}
        >
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#fde68a]">
            <FileUp size={14} aria-hidden />
            {busy ? 'Uploading…' : 'Drop a file here or browse'}
            <input
              ref={fileRef}
              type="file"
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0] ?? null)}
              className="sr-only"
              aria-label="Upload a document for this standard"
            />
          </label>
          <p className="mt-0.5 text-[11px] text-white/40">
            Filed to the knowledge library and counted as evidence automatically.
          </p>
        </div>
      ) : null}

      {err ? <p className="mt-2 text-[12px] text-red-300">{err}</p> : null}
    </div>
  )
}
