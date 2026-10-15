// ─────────────────────────────────────────────────────────────────────────────
// ReviewAccountsHost — wires the ONE "Review N accounts" popup into the intake
// (A5). Mounted once, inside AppProvider (IntakeBar).
//
// Every way in opens the SAME popup:
//   • the Finance band's "Review N accounts" (it lands here with ?review=1 and
//     a STICKY ask — reviewRequest — taken once the stored files have mounted);
//   • the Add-data callout's "Review N accounts" and the file card's amber button
//     (openReviewModal);
//   • the `finrep:open-review` event (the confirm band's "Review N accounts",
//     which sits outside AppProvider).
//
// The open flag and the person's unsaved picks live in reviewModalStore, so
// the intake's autosave remount can't snap the popup shut mid-review.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_CHART } from '@finrep/engine'
import { useApp } from '../../context/AppContext.jsx'
import ReviewAccountsModal from './ReviewAccountsModal.jsx'
import { buildReviewItems, currentPicks, entriesFromPicks, approveState } from '../../lib/reviewPopup.js'
import {
  useReviewModal,
  openReviewModal,
  closeReviewModal,
  setReviewPick,
  markReviewSorted,
} from '../../lib/reviewModalStore.js'
import { OPEN_REVIEW_EVENT, hasReviewRequest, takeReviewRequest, clearReviewRequest } from '../../lib/reviewRequest.js'

const EMPTY_SET = new Set()

export default function ReviewAccountsHost() {
  const {
    files = [],
    activeChart = DEFAULT_CHART,
    serverMappedAccts = EMPTY_SET,
    mapAccounts = null,
    canEdit = false,
    schoolId = null,
  } = useApp()
  const modal = useReviewModal()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const items = useMemo(
    () => buildReviewItems(files, activeChart, serverMappedAccts),
    [files, activeChart, serverMappedAccts],
  )
  const reviewCount = items.length
  const open = canEdit && modal.open && modal.schoolId === schoolId && reviewCount > 0
  const picks = useMemo(() => currentPicks(items, modal.draft), [items, modal.draft])

  // Asks to open: the live event, or a sticky one left by the Finance band
  // before these files had mounted. Only acted on when there is something to
  // sort; a sticky ask is taken by exactly one host (deferred a microtask —
  // never a synchronous setState in an effect).
  useEffect(() => {
    if (!canEdit) return undefined
    let cancelled = false
    const onOpenReview = (e) => {
      if (reviewCount === 0) return
      if (e?.detail?.sticky) clearReviewRequest()
      openReviewModal(schoolId)
    }
    window.addEventListener(OPEN_REVIEW_EVENT, onOpenReview)
    if (reviewCount > 0 && hasReviewRequest()) {
      Promise.resolve().then(() => {
        if (cancelled || !takeReviewRequest()) return
        openReviewModal(schoolId)
      })
    }
    return () => {
      cancelled = true
      window.removeEventListener(OPEN_REVIEW_EVENT, onOpenReview)
    }
  }, [reviewCount, schoolId, canEdit])

  const save = async (entries) => {
    if (!mapAccounts || Object.keys(entries).length === 0) return true
    setSaving(true)
    setError('')
    try {
      // KYRO's untouched suggestions go FILL-ONLY: the popup asks only about
      // accounts the server confirms are unplaced (snapshot payload.unmapped +
      // unsaved files), and onlyNew makes sure an account the school's mapping
      // DOES place keeps its category even if one slipped in. A pick the PERSON
      // made (in the draft) is their decision and goes as a normal merge — so
      // it is never silently dropped, and what they saw is what is saved.
      const chosen = new Set(
        Object.entries(modal.draft || {})
          .filter(([, v]) => !!v)
          .map(([k]) => String(k)),
      )
      const ok = await mapAccounts(entries, { onlyNew: true, chosen })
      if (ok === false) setError('We couldn’t save that just now. Your picks are still here — try again.')
      return ok !== false
    } finally {
      setSaving(false)
    }
  }

  // "Approve and build statements": EVERY answer (a pre-filled suggestion
  // counts) in ONE save; the statements rebuild on the server.
  const onApprove = async () => {
    if (!approveState(items, picks).canApprove || saving) return
    if (await save(entriesFromPicks(items, picks))) markReviewSorted(schoolId)
  }

  // "Save and finish later": what has an answer is saved; the rest wait.
  const onSaveLater = async () => {
    if (saving) return
    if (await save(entriesFromPicks(items, picks))) closeReviewModal()
  }

  return (
    <ReviewAccountsModal
      open={open}
      items={items}
      picks={picks}
      onPick={(acct, category) => setReviewPick(acct, category)}
      onApprove={onApprove}
      onSaveLater={onSaveLater}
      onClose={() => {
        setError('')
        closeReviewModal()
      }}
      saving={saving}
      error={error}
      canEdit={canEdit}
    />
  )
}
