// ─────────────────────────────────────────────────────────────────────────────
// MaintenanceBidsPanel — the slide-over (governance PersonDetailPanel precedent,
// a `.b1-drawer`: white, hairlines, status as 2px marks) for one maintenance
// item's vendor bids + the Leadership decision.
// Bids are LAZY: fetched here on open, never with the register list.
//
// Roles (server-enforced; the UI mirrors it):
//   viewer      — reads everything
//   accountant  — adds bids, deletes pending bids, uploads bid documents; sees a
//                 muted "awaiting Leadership" state instead of an Accept button
//   owner       — "Leadership": Accept (with a decision note) + Reopen decision
//
// Accept stamps the ITEM server-side (selectedBidId, vendor, estimatedCost =
// winning amount, decidedBy/At/Note, open→scheduled) and rejects sibling pending
// bids atomically; the response {item,bids} refreshes this panel and onChanged()
// re-pulls the register + inherited budget (committed moved).
//
// Bid documents ride the CORE knowledge store: upload multipart with
// sourceType:'maintenance_bid' + sourceRef:<bidId>; one list call per open,
// grouped by sourceRef (no per-bid N+1).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  X,
  Gavel,
  Trophy,
  Paperclip,
  FileText,
  Download,
  Plus,
  Trash2,
  Undo2,
  Check,
} from 'lucide-react'
import { facilitiesApi, documentsApi, apiErrorMessage } from '../../lib/api.js'
import { Section, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function fmtDay(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_BADGE = {
  pending: { label: 'Pending', tone: 'watch' },
  accepted: { label: 'Accepted', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'neutral' },
}

// ── Per-bid document chip strip (paperclip upload + list/download) ────────────
function BidDocuments({ schoolId, bid, docs, canEdit, onUploaded, onError }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file) => {
    if (!file || busy) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^.]+$/, ''))
      fd.append('sourceType', 'maintenance_bid')
      fd.append('sourceRef', bid.id)
      await documentsApi.upload(schoolId, fd)
      await onUploaded()
    } catch (e) {
      onError(
        e?.response?.status === 503
          ? "Document storage isn't configured yet."
          : (e?.response?.data?.message ?? 'Upload failed. Please try again.'),
      )
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const download = async (doc) => {
    try {
      const res = await documentsApi.downloadUrl(schoolId, doc.id)
      const url = res.data?.url ?? null
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      onError('Could not get a download link.')
    }
  }

  if (!canEdit && docs.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {docs.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => download(doc)}
          title={`Download ${doc.title}`}
          className="dt-link max-w-[200px] text-[11.5px]"
        >
          <FileText size={11} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{doc.title}</span>
          <Download size={10} className="shrink-0" aria-hidden="true" />
        </button>
      ))}
      {canEdit ? (
        <>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            onChange={(e) => upload(e.target.files?.[0] ?? null)}
            aria-label="Attach a document to this bid"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            title="Attach a quote / proposal document"
            className="dt-link text-[11.5px] disabled:opacity-50"
          >
            <Paperclip size={11} aria-hidden="true" />
            {busy ? 'Uploading…' : 'Attach'}
          </button>
        </>
      ) : null}
    </div>
  )
}

// ── The inline add-bid form (owner + accountant) ──────────────────────────────
function AddBidForm({ vendors, disabled, onAdd }) {
  const [vendorId, setVendorId] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const activeVendors = vendors.filter((v) => v.active !== false)

  const submit = async () => {
    if (busy) return
    if (!vendorId && !vendorName.trim()) {
      setErr('Pick a vendor or type a vendor name.')
      return
    }
    if (amount.trim() === '' || Number.isNaN(Number(amount)) || Number(amount) < 0) {
      setErr('A bid amount is required.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await onAdd({
        ...(vendorId ? { vendorId } : {}),
        ...(!vendorId && vendorName.trim() ? { vendorName: vendorName.trim() } : {}),
        amount: Number(amount),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      setVendorId('')
      setVendorName('')
      setAmount('')
      setNotes('')
    } catch (e) {
      setErr(apiErrorMessage?.(e) ?? e?.response?.data?.message ?? 'Could not add this bid.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section label="Add a bid">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          disabled={disabled}
          aria-label="Vendor"
          className="sel w-full"
        >
          <option value="">— vendor from register —</option>
          {activeVendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          disabled={disabled || !!vendorId}
          maxLength={160}
          placeholder="…or type a vendor name"
          aria-label="Vendor name (free text)"
          className="b1-fld disabled:opacity-50"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          placeholder="Amount ($)"
          aria-label="Bid amount"
          className="b1-fld tabular-nums"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled}
          maxLength={2000}
          placeholder="Notes (optional)"
          aria-label="Bid notes"
          className="b1-fld"
        />
      </div>
      {err ? <p className="mt-1.5 text-[12px] font-medium text-risk">{err}</p> : null}
      <Button variant="primary" size="sm" onClick={submit} disabled={disabled || busy} icon={<Plus size={13} />} className="mt-2">
        {busy ? 'Adding…' : 'Add bid'}
      </Button>
    </Section>
  )
}

export default function MaintenanceBidsPanel({
  schoolId,
  item: itemProp,
  vendors = [],
  canEdit,
  isOwner,
  onClose,
  onChanged,
}) {
  const reduce = useReducedMotion()
  const [item, setItem] = useState(itemProp)
  const [bids, setBids] = useState([])
  const [docsByBid, setDocsByBid] = useState({})
  const [loading, setLoading] = useState(true)
  const [actionErr, setActionErr] = useState('')
  // Which pending bid has its accept-note prompt expanded, and the note text.
  const [acceptingId, setAcceptingId] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const itemId = itemProp?.id ?? null

  const loadDocs = useCallback(
    async (bidList) => {
      try {
        const res = await documentsApi.list(schoolId, { sourceType: 'maintenance_bid' })
        const ids = new Set((bidList ?? []).map((b) => b.id))
        const grouped = {}
        for (const doc of res.data?.documents ?? []) {
          if (doc.sourceRef && ids.has(doc.sourceRef)) {
            ;(grouped[doc.sourceRef] ??= []).push(doc)
          }
        }
        setDocsByBid(grouped)
      } catch {
        // Doc store optional — bids still render without attachments.
        setDocsByBid({})
      }
    },
    [schoolId],
  )

  // Lazy-load the bids on open (microtask defer + cancelled flag idiom).
  useEffect(() => {
    let cancelled = false
    if (!schoolId || !itemId) return undefined
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      facilitiesApi
        .listBids(schoolId, itemId)
        .then(async (res) => {
          if (cancelled) return
          const list = res.data?.bids ?? []
          setBids(list)
          await loadDocs(list)
        })
        .catch(() => {
          if (!cancelled) setActionErr('Could not load the bids for this item.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, itemId, loadDocs])

  // Esc closes; body scroll locks while open (slide-over idiom).
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

  if (!itemProp) return null

  const decided = !!item?.selectedBidId
  const resolved = item?.status === 'resolved'
  const pendingCount = bids.filter((b) => b.status === 'pending').length

  const refreshBids = async () => {
    const res = await facilitiesApi.listBids(schoolId, itemId)
    const list = res.data?.bids ?? []
    setBids(list)
    await loadDocs(list)
  }

  const addBid = async (body) => {
    await facilitiesApi.createBid(schoolId, itemId, body)
    await refreshBids()
    onChanged?.()
  }

  const deleteBid = async (bid) => {
    setActionErr('')
    if (!window.confirm(`Delete the ${fmtMoney(bid.amount)} bid from ${bid.vendorName ?? 'this vendor'}?`))
      return
    try {
      await facilitiesApi.removeBid(schoolId, itemId, bid.id)
      await refreshBids()
      onChanged?.()
    } catch (e) {
      setActionErr(e?.response?.data?.message ?? 'Only pending bids can be deleted.')
    }
  }

  const accept = async (bid) => {
    if (busy) return
    setBusy(true)
    setActionErr('')
    try {
      const res = await facilitiesApi.acceptBid(schoolId, itemId, bid.id, {
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      if (res.data?.item) setItem(res.data.item)
      const list = res.data?.bids ?? []
      setBids(list)
      await loadDocs(list)
      setAcceptingId(null)
      setNote('')
      onChanged?.()
    } catch (e) {
      setActionErr(e?.response?.data?.message ?? 'Could not accept this bid.')
    } finally {
      setBusy(false)
    }
  }

  const reopen = async () => {
    if (busy || !item?.selectedBidId) return
    if (!window.confirm('Reopen this decision? All bids return to pending and the decision stamps are cleared.'))
      return
    setBusy(true)
    setActionErr('')
    try {
      const res = await facilitiesApi.reopenBid(schoolId, itemId, item.selectedBidId)
      if (res.data?.item) setItem(res.data.item)
      const list = res.data?.bids ?? []
      setBids(list)
      await loadDocs(list)
      onChanged?.()
    } catch (e) {
      setActionErr(e?.response?.data?.message ?? 'Could not reopen this decision.')
    } finally {
      setBusy(false)
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
        aria-label={`Bids for ${item?.title ?? 'maintenance item'}`}
        initial={reduce ? false : { x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="b1-drawer"
      >
        <div className="b1-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="pg-eyebrow">Facilities · Vendor bids</p>
            <h2 className="font-serif text-[24px] font-medium leading-tight text-ink [overflow-wrap:anywhere]">{item?.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {pendingCount > 0 ? (
                <Pill variant="status" tone="watch">
                  {pendingCount} pending
                </Pill>
              ) : null}
              {decided ? (
                <Pill variant="status" tone="good">
                  Winner picked
                </Pill>
              ) : null}
              {resolved ? (
                <Pill variant="status" tone="neutral">
                  Resolved
                </Pill>
              ) : null}
            </div>
            {/* Decision line — who/when/why the winner was picked */}
            {decided ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-start gap-2 text-[12.5px] text-ink">
                  <i className="mark tone-good mt-[3px]" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">Approved by Leadership</span>
                    {item?.decidedAt ? ` · ${fmtDay(item.decidedAt)}` : ''}
                    {item?.decisionNote ? <span className="text-ink2"> · “{item.decisionNote}”</span> : null}
                  </span>
                </p>
                {isOwner && !resolved ? (
                  <Button size="sm" onClick={reopen} disabled={busy} icon={<Undo2 size={12} />}>
                    Reopen decision
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="b1-icon-act">
            <X size={16} />
          </button>
        </div>

        <div className="b1-drawer-body">
          <Section label="Bids" aside={bids.length ? <span className="tabular-nums">{bids.length}</span> : null}>
            {actionErr ? <p className="mb-2 text-[12.5px] font-medium text-risk">{actionErr}</p> : null}

            {loading ? (
              <p className="text-[13px] text-ink2">Loading bids…</p>
            ) : bids.length === 0 ? (
              <div className="b1-empty">
                <p>No bids yet. Collect quotes from your vendors, then Leadership picks the winner.</p>
              </div>
            ) : (
              <ul className="b1-list">
                {bids.map((bid) => {
                  const badge = STATUS_BADGE[bid.status] ?? STATUS_BADGE.pending
                  const winner = bid.status === 'accepted'
                  const muted = bid.status === 'rejected'
                  return (
                    <li key={bid.id} className={`py-3 ${muted ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[14px] font-semibold text-ink [overflow-wrap:anywhere]">
                              {bid.vendorName ?? 'Unnamed vendor'}
                            </span>
                            <Pill variant="status" tone={badge.tone}>
                              {winner ? <Trophy size={10} aria-hidden="true" /> : null}
                              {badge.label}
                            </Pill>
                          </div>
                          {bid.notes ? <p className="mt-0.5 text-[12.5px] leading-snug text-ink2">{bid.notes}</p> : null}
                          <BidDocuments
                            schoolId={schoolId}
                            bid={bid}
                            docs={docsByBid[bid.id] ?? []}
                            canEdit={canEdit}
                            onUploaded={refreshBids}
                            onError={setActionErr}
                          />
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-serif text-[20px] font-medium tabular-nums text-ink">{fmtMoney(bid.amount)}</p>
                          <p className="text-[11px] text-ink2">{fmtDay(bid.createdAt)}</p>
                        </div>
                      </div>

                      {/* Pending-bid actions: owner accepts, accountant awaits */}
                      {bid.status === 'pending' && !resolved ? (
                        <div className="mt-2.5">
                          {isOwner ? (
                            acceptingId === bid.id ? (
                              <div className="space-y-2">
                                <input
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  maxLength={2000}
                                  placeholder="Decision note (optional): why this vendor?"
                                  aria-label="Decision note"
                                  autoFocus
                                  className="b1-fld"
                                />
                                <div className="flex items-center gap-1.5">
                                  <Button variant="primary" size="sm" onClick={() => accept(bid)} disabled={busy} icon={<Check size={13} />}>
                                    {busy ? 'Accepting…' : 'Confirm winner'}
                                  </Button>
                                  <Button
                                    variant="quiet"
                                    size="sm"
                                    onClick={() => {
                                      setAcceptingId(null)
                                      setNote('')
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setAcceptingId(bid.id)
                                    setNote('')
                                  }}
                                  icon={<Trophy size={13} />}
                                >
                                  Accept this bid
                                </Button>
                                <button
                                  type="button"
                                  onClick={() => deleteBid(bid)}
                                  aria-label="Delete this bid"
                                  title="Delete this pending bid"
                                  className="b1-icon-act b1-icon-act-danger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink2"
                                title="Only Leadership (owner) can accept a winning bid"
                              >
                                <Gavel size={12} aria-hidden="true" />
                                Awaiting Leadership approval
                              </span>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => deleteBid(bid)}
                                  aria-label="Delete this bid"
                                  title="Delete this pending bid"
                                  className="b1-icon-act b1-icon-act-danger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Add a bid — owner + accountant, never on a resolved item */}
          {canEdit && !resolved ? <AddBidForm vendors={vendors} disabled={busy} onAdd={addBid} /> : null}
        </div>

        {/* Footer — the roles legend (frozen copy) */}
        <div className="b1-drawer-foot !justify-center">
          <p className="text-center text-[12px] font-medium text-ink2">
            Viewers read · Accountants manage items &amp; bids · Leadership approves winners
          </p>
        </div>
      </motion.aside>
    </div>
  )
}
