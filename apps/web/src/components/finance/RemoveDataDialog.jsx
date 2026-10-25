// ─────────────────────────────────────────────────────────────────────────────
// RemoveDataDialog — "Remove the FY25 trial balance?" Every removal of saved
// finance data asks first, and says what goes and what it affects, read from
// the server's preview (POST /finance/removals/preview) so the words match
// what will actually happen:
//   "Your FY25 statements and board report will be emptied, and FY26 loses its
//    prior-year comparison."
// After a removal the undo toast (UndoToastHost) offers Undo; the server keeps
// the removed data for 30 days ("Recently removed").
//
// mode="swap" is the other door: bringing back something whose place now has
// newer data ("Bring back the FY25 trial balance from Oct 3?" → Swap them).
//
// Shell = the app's dialog surface (ReviewAccountsModal's .dlg); a bottom sheet
// on phones. role=alertdialog, focus starts on the safe button, Tab is trapped,
// Esc keeps everything.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import Button from '../ui/surface/Button.jsx'
import { apiErrorMessage, financeFilesApi } from '../../lib/api.js'
import { previewCopy, swapCopy } from '../../lib/removalCopy.js'
import { showUndo } from '../../lib/undoToast.js'
import { afterFinanceChange } from '../../lib/financeRemoval.js'
import { usePersistence } from '../../context/PersistenceContext.jsx'

const EASE = [0.22, 1, 0.36, 1]

function trapTab(e, root) {
  if (e.key !== 'Tab' || !root) return
  const nodes = [...root.querySelectorAll('button:not([disabled]), a[href]')]
  if (nodes.length === 0) {
    e.preventDefault()
    return
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || !root.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault()
    first.focus()
  }
}

export default function RemoveDataDialog({
  open,
  schoolId,
  target = null,
  onClose,
  onRemoved,
  mode = 'remove',
  entry = null,
  current = null,
}) {
  if (!open) return null
  return (
    <DialogBody
      schoolId={schoolId}
      target={target}
      onClose={onClose}
      onRemoved={onRemoved}
      mode={mode}
      entry={entry}
      current={current}
    />
  )
}

function DialogBody({ schoolId, target, onClose, onRemoved, mode, entry, current }) {
  const reduce = useReducedMotion()
  const persistence = usePersistence()
  const id = useId()
  const boxRef = useRef(null)
  const keepRef = useRef(null)
  const swap = mode === 'swap'
  const persistenceRef = useRef(persistence)
  useEffect(() => {
    persistenceRef.current = persistence
  })

  // remove mode: the preview drives every word.
  const [preview, setPreview] = useState({ status: swap ? 'ready' : 'loading', data: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const targetKey = JSON.stringify(target || {})
  useEffect(() => {
    if (swap) return undefined
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled) return
      setPreview((p) => (p.status === 'loading' ? p : { status: 'loading', data: p.data }))
      try {
        const res = await financeFilesApi.previewRemoval(schoolId, JSON.parse(targetKey))
        if (!cancelled) setPreview({ status: 'ready', data: res?.data ?? null })
      } catch (e) {
        if (cancelled) return
        const data = e?.response?.data
        if (e?.response?.status === 404 && (data?.code === 'IMPORT_NOT_FOUND' || data?.code === 'NOTHING_TO_REMOVE')) {
          // Already gone (another tab, a QuickBooks sync, KYRO). Say so, and
          // reload the lists so the stale row disappears — Try again can't help.
          setPreview({ status: 'gone', data: null, message: data.message })
          void afterFinanceChange(persistenceRef.current)
          return
        }
        setPreview({ status: 'error', data: null })
      }
    })
    return () => {
      cancelled = true
    }
  }, [swap, schoolId, targetKey, reloadKey])

  // Focus the safe choice on open; give it back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement
    keepRef.current?.focus?.()
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.()
    }
  }, [])

  const close = useCallback(() => {
    if (!busy) onClose?.()
  }, [busy, onClose])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      } else if (e.key === 'Tab') {
        trapTab(e, boxRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const copy = swap
    ? swapCopy(entry, current)
    : preview.status === 'ready' && preview.data
      ? previewCopy(preview.data)
      : null

  const confirmRemove = async () => {
    const p = preview.data
    if (!p) return
    setBusy(true)
    setError('')
    const body = { ...target }
    if (target?.kind === 'trial_balance' && p.activeImportId) body.expectedImportId = p.activeImportId
    let res
    try {
      res = await financeFilesApi.remove(schoolId, body)
    } catch (e) {
      setBusy(false)
      const data = e?.response?.data
      if (e?.response?.status === 409 && data?.code === 'CHANGED') {
        setError(data.message || 'This changed since you opened it. Have another look.')
        setReloadKey((k) => k + 1)
        return
      }
      setError(apiErrorMessage(e, "We couldn't remove it. Please try again."))
      return
    }
    // The opener may unmount (the intake re-hydrates), so nothing below sets
    // this component's state.
    if (res?.data?.removal) showUndo({ schoolId, entry: res.data.removal })
    onRemoved?.(res?.data)
    onClose?.()
    await afterFinanceChange(persistence)
  }

  const confirmSwap = async () => {
    if (!entry?.id) return
    setBusy(true)
    setError('')
    let res
    try {
      res = await financeFilesApi.restore(schoolId, entry.id, { replaceCurrent: true })
    } catch (e) {
      setBusy(false)
      setError(apiErrorMessage(e, "We couldn't bring it back. Nothing was changed."))
      return
    }
    onRemoved?.(res?.data)
    onClose?.()
    await afterFinanceChange(persistence)
  }

  const loading = !swap && preview.status === 'loading'
  const failed = !swap && preview.status === 'error'
  const gone = !swap && preview.status === 'gone'
  const title =
    copy?.title ||
    (gone ? preview.message || "That isn't on file anymore." : failed ? "We couldn't check what this affects." : 'Remove this?')
  const keepLabel = gone ? 'Close' : copy?.keepLabel || 'Keep it'
  const confirmLabel = busy ? (swap ? 'Bringing it back…' : 'Removing…') : copy?.confirmLabel || 'Remove'

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
    >
      <div className="dlg-scrim" onClick={close} aria-hidden="true" />
      <motion.div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-b`}
        data-testid="remove-data-dialog"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="dlg w-full max-w-[34rem] !rounded-b-none sm:!rounded-[var(--r-panel)]"
      >
        <span className="dlg-rule" aria-hidden="true" />
        <div className="dlg-head">
          <span className="dlg-icon" aria-hidden="true">
            {swap ? <RotateCcw size={18} /> : <Trash2 size={18} />}
          </span>
          <h2 id={`${id}-t`} className="dlg-title">
            {title}
          </h2>
        </div>
        <div id={`${id}-b`} className="dlg-body space-y-2">
          {loading && (
            <p className="flex items-center gap-2 text-[14px] leading-[22px] text-ink2" role="status">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Checking what this affects…
            </p>
          )}
          {failed && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] leading-[22px] text-ink2">Nothing has been removed.</p>
              <Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          )}
          {gone && (
            <p className="text-[14px] leading-[22px] text-ink2">
              It was already removed, so there&rsquo;s nothing to do. The list above is up to date now.
            </p>
          )}
          {copy?.lines.map((line) => (
            <p key={line} className="text-[14px] leading-[22px] text-ink2">
              {line}
            </p>
          ))}
          {error && (
            <p className="dlg-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dlg-foot flex-col-reverse !items-stretch sm:flex-row sm:!items-center">
          <Button variant="secondary" ref={keepRef} onClick={close} disabled={busy}>
            {keepLabel}
          </Button>
          {!gone && (
            <Button
              variant="primary"
              onClick={swap ? confirmSwap : confirmRemove}
              disabled={busy || (!swap && !(preview.status === 'ready' && preview.data))}
              icon={busy ? <Loader2 size={14} className="animate-spin" /> : null}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
