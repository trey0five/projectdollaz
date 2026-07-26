// ─────────────────────────────────────────────────────────────────────────────
// MaintenanceBidsPanel — the slide-over (governance PersonDetailPanel precedent,
// orange-hued) for one maintenance item's vendor bids + the Leadership decision.
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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
  Clock,
} from 'lucide-react'
import { facilitiesApi, documentsApi, apiErrorMessage } from '../../lib/api.js'

const FAC_HUE = '#EA580C'

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
  pending: { label: 'Pending', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]', icon: Clock },
  accepted: { label: 'Accepted', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700', icon: Trophy },
  rejected: { label: 'Rejected', cls: 'border-rule/60 bg-section text-muted', icon: null },
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
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {docs.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => download(doc)}
          title={`Download ${doc.title}`}
          className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-rule/60 bg-section px-1.5 py-0.5 text-[11px] font-semibold text-muted transition hover:border-[#EA580C]/50 hover:text-navy"
        >
          <FileText size={11} className="shrink-0" />
          <span className="truncate">{doc.title}</span>
          <Download size={10} className="shrink-0" />
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
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-rule/70 px-1.5 py-0.5 text-[11px] font-semibold text-muted transition hover:border-[#EA580C]/60 hover:text-[#EA580C] disabled:opacity-50"
          >
            <Paperclip size={11} />
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
    <div className="rounded-xl border border-dashed border-rule/70 bg-cream/50 p-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Add a bid</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          disabled={disabled}
          aria-label="Vendor"
          className="rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] font-semibold text-navy"
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
          className="rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] text-navy placeholder:text-muted/70 disabled:opacity-50"
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
          className="rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] text-navy placeholder:text-muted/70"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled}
          maxLength={2000}
          placeholder="Notes (optional)"
          aria-label="Bid notes"
          className="rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] text-navy placeholder:text-muted/70"
        />
      </div>
      {err ? <p className="mt-1.5 text-[12px] font-medium text-danger">{err}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={disabled || busy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
        style={{ backgroundColor: FAC_HUE }}
      >
        <Plus size={13} />
        {busy ? 'Adding…' : 'Add bid'}
      </button>
    </div>
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
        aria-label={`Bids for ${item?.title ?? 'maintenance item'}`}
        initial={reduce ? { opacity: 0 } : { x: '100%' }}
        animate={reduce ? { opacity: 1 } : { x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-hidden border-l border-rule/60 bg-white shadow-2xl"
      >
        {/* Header — orange accent band */}
        <div
          className="relative shrink-0 px-5 pb-4 pt-5"
          style={{ background: `linear-gradient(135deg, ${FAC_HUE}14, transparent 65%)` }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow"
              style={{ backgroundColor: FAC_HUE }}
            >
              <Gavel size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Vendor bids
              </p>
              <h2 className="truncate font-serif text-[21px] font-semibold leading-tight text-navy">
                {item?.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {pendingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11.5px] font-semibold text-[#7a5e00]">
                    <Clock size={11} />
                    {pendingCount} pending
                  </span>
                ) : null}
                {decided ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">
                    <Trophy size={11} />
                    Winner picked
                  </span>
                ) : null}
                {resolved ? (
                  <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                    Resolved
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
            >
              <X size={16} />
            </button>
          </div>
          {/* Decision line — who/when/why the winner was picked */}
          {decided ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/60 bg-emerald-50/70 px-3 py-2">
              <p className="text-[12.5px] text-emerald-800">
                <span className="font-semibold">Approved by Leadership</span>
                {item?.decidedAt ? ` · ${fmtDay(item.decidedAt)}` : ''}
                {item?.decisionNote ? (
                  <span className="italic"> — “{item.decisionNote}”</span>
                ) : null}
              </p>
              {isOwner && !resolved ? (
                <button
                  type="button"
                  onClick={reopen}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700 transition hover:border-emerald-500 disabled:opacity-50"
                >
                  <Undo2 size={12} />
                  Reopen decision
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-4">
          {actionErr ? <p className="text-[12.5px] font-medium text-danger">{actionErr}</p> : null}

          {loading ? (
            <p className="text-[13px] text-muted">Loading bids…</p>
          ) : bids.length === 0 ? (
            <p className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-3 py-6 text-center text-[13px] italic text-muted">
              No bids yet — collect quotes from your vendors, then Leadership picks the winner.
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {bids.map((bid) => {
                  const badge = STATUS_BADGE[bid.status] ?? STATUS_BADGE.pending
                  const BadgeIcon = badge.icon
                  const winner = bid.status === 'accepted'
                  const muted = bid.status === 'rejected'
                  return (
                    <motion.li
                      key={bid.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduce ? undefined : { opacity: 0 }}
                      className={`rounded-xl border p-3 ${
                        winner
                          ? 'border-emerald-300/80 bg-emerald-50/60'
                          : muted
                            ? 'border-rule/50 bg-cream/40 opacity-60'
                            : 'border-rule/50 bg-cream/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[14px] font-semibold text-navy">
                              {bid.vendorName ?? 'Unnamed vendor'}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                            >
                              {BadgeIcon ? <BadgeIcon size={10} /> : null}
                              {badge.label}
                            </span>
                          </div>
                          {bid.notes ? (
                            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                              {bid.notes}
                            </p>
                          ) : null}
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
                          <p className="font-serif text-[18px] font-semibold tabular-nums text-navy">
                            {fmtMoney(bid.amount)}
                          </p>
                          <p className="text-[11px] text-muted">{fmtDay(bid.createdAt)}</p>
                        </div>
                      </div>

                      {/* Pending-bid actions: owner accepts, accountant awaits */}
                      {bid.status === 'pending' && !resolved ? (
                        <div className="mt-2.5 border-t border-rule/40 pt-2.5">
                          {isOwner ? (
                            acceptingId === bid.id ? (
                              <div className="space-y-2">
                                <input
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  maxLength={2000}
                                  placeholder="Decision note (optional) — why this vendor?"
                                  aria-label="Decision note"
                                  autoFocus
                                  className="w-full rounded-lg border border-rule/70 bg-white px-2.5 py-1.5 text-[12.5px] text-navy placeholder:text-muted/70"
                                />
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => accept(bid)}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                                  >
                                    <Check size={13} />
                                    {busy ? 'Accepting…' : 'Confirm winner'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAcceptingId(null)
                                      setNote('')
                                    }}
                                    className="rounded-full border border-rule/70 px-3 py-1.5 text-[12px] font-semibold text-muted transition hover:text-navy"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAcceptingId(bid.id)
                                    setNote('')
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-glow transition hover:brightness-110"
                                  style={{ backgroundColor: FAC_HUE }}
                                >
                                  <Trophy size={13} />
                                  Accept this bid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteBid(bid)}
                                  aria-label="Delete this bid"
                                  title="Delete this pending bid"
                                  className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="inline-flex items-center gap-1 rounded-md border border-rule/60 bg-section px-2 py-1 text-[11.5px] font-semibold text-muted"
                                title="Only Leadership (owner) can accept a winning bid"
                              >
                                <Gavel size={11} />
                                Awaiting Leadership approval
                              </span>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => deleteBid(bid)}
                                  aria-label="Delete this bid"
                                  title="Delete this pending bid"
                                  className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}

          {/* Add a bid — owner + accountant, never on a resolved item */}
          {canEdit && !resolved ? (
            <AddBidForm vendors={vendors} disabled={busy} onAdd={addBid} />
          ) : null}
        </div>

        {/* Footer — the roles legend (frozen copy) */}
        <div className="shrink-0 border-t border-rule/60 bg-cream/60 px-5 py-3">
          <p className="text-center text-[12px] font-medium text-muted">
            Viewers read · Accountants manage items &amp; bids · Leadership approves winners
          </p>
        </div>
      </motion.aside>
    </div>
  )
}
