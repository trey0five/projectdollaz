import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Files, Plus } from 'lucide-react'
import { previewFile } from '@finrep/ingestion'
import { useApp } from '../context/AppContext.jsx'
import ColumnPicker from './intake/ColumnPicker.jsx'
import { AuroraCard, AuroraLightButton } from './ui/aurora/index.js'
import { needsCheckPhrase, reviewButtonLabel } from '../lib/reviewQueue.js'
import { openReviewModal, useReviewModal } from '../lib/reviewModalStore.js'
import ReviewAccountsHost from './intake/ReviewAccountsHost.jsx'
import IntakeFinishBar from './intake/IntakeFinishBar.jsx'
import { formatShortDate } from '../lib/format.js'
import { statementPartial } from '../lib/statementNotes.js'
import DragOverlay from './DragOverlay.jsx'
import HeroDropzone from './HeroDropzone.jsx'
import FileStatusCard from './FileStatusCard.jsx'
import EmptySlotCard from './EmptySlotCard.jsx'
import IntakeGuide from './IntakeGuide.jsx'
import PeriodControls from './PeriodControls.jsx'
import SummaryStrip from './SummaryStrip.jsx'
import ExportMenu from './ExportMenu.jsx'
import SaveBar from './SaveBar.jsx'
import PromotePyToggle from './PromotePyToggle.jsx'
import '../styles/pending/b2-finance.css'
import { SLOT_ROLES, ROLE_META } from '../lib/roleMeta.js'

const ACCEPT = '.xlsx,.xls,.csv'

const WATCH_HUE = '#d97706'
const GOOD_HUE = '#059669'

/**
 * "Two income statements end Jun 30, 2026 — remove one to combine with your
 * Balance Sheet." One line per (date, doubled kind) among the halves the
 * pairing kept apart as ambiguous (#40).
 */
export function ambiguityBanners(files) {
  const seen = new Map()
  for (const f of files || []) {
    const n = f?.pairNote
    if (!n || n.why !== 'ambiguous') continue
    const date = f.metadata?.periodEndDate ?? ''
    const doubled = n.doubled === 'bs' ? 'bs' : 'pl'
    const k = `${date}|${doubled}`
    if (seen.has(k)) continue
    const when = date ? formatShortDate(date) : 'on the same day'
    seen.set(
      k,
      doubled === 'pl'
        ? `Two income statements end ${when} — remove one to combine with your Balance Sheet.`
        : `Two balance sheets end ${when} — remove one to combine with your Profit and Loss.`,
    )
  }
  return [...seen.values()]
}

/**
 * A4: the Add-data callout. Amber while accounts wait for a person; a short
 * green "all sorted" once a review this visit has finished. Plain words, one
 * big button. Pure props so it can be pinned without the intake around it.
 */
export function ReviewCallout({ total, done, onReview, financeHref = '/finance', showFinanceLink = true }) {
  const reduce = useReducedMotion()
  if (total > 0) {
    return (
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 0.8, 0.2, 1] }}
        className="mb-5"
      >
        <AuroraCard tone="watch" className="!px-5 !py-4 sm:!px-6" data-testid="review-callout" role="status">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d97706]/[0.12] text-[#9a4508]"
              aria-hidden="true"
            >
              <AlertTriangle size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold leading-snug text-ink">{needsCheckPhrase(total)}</p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-ink2">
                KYRO couldn&rsquo;t be sure what {total === 1 ? 'it is' : 'they are'}, so{' '}
                {total === 1 ? 'it’s' : 'they’re'} left out of your statements until you confirm —
                most already have a suggestion.
              </p>
            </div>
            <AuroraLightButton
              hue={WATCH_HUE}
              onClick={onReview}
              aria-haspopup="dialog"
              className="w-full justify-center sm:w-auto"
              data-testid="review-now"
              data-kyro-avoid=""
            >
              {reviewButtonLabel(total)} <ArrowRight size={16} aria-hidden="true" />
            </AuroraLightButton>
          </div>
        </AuroraCard>
      </motion.div>
    )
  }
  if (done && !showFinanceLink) {
    // The step's own finish ("Done — show my numbers") or the confirm band is
    // the next step, so this is just a short success line — ONE finishing
    // action on screen.
    return (
      <p
        className="mb-4 flex items-center gap-2 text-[14.5px] font-semibold text-[#047857]"
        data-testid="review-done"
        role="status"
      >
        <CheckCircle2 size={17} aria-hidden="true" />
        All accounts sorted — your statements are ready
      </p>
    )
  }
  if (done) {
    return (
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 0.8, 0.2, 1] }}
        className="mb-5"
      >
        <AuroraCard tone="good" className="!px-5 !py-4 sm:!px-6" data-testid="review-done" role="status">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#059669]/[0.12] text-[#047857]"
              aria-hidden="true"
            >
              <CheckCircle2 size={22} />
            </span>
            <p className="min-w-0 flex-1 text-[16px] font-bold leading-snug text-ink">
              All accounts sorted — your statements are ready
            </p>
            <AuroraLightButton
              hue={GOOD_HUE}
              to={financeHref}
              className="w-full justify-center sm:w-auto"
              data-testid="see-finance"
            >
              See Finance <ArrowRight size={16} aria-hidden="true" />
            </AuroraLightButton>
          </div>
        </AuroraCard>
      </motion.div>
    )
  }
  return null
}

const CONFLICT_COPY = {
  duplicate: (c) =>
    `Two files are set to ${c.role.toUpperCase()} — pick one role per file.`,
  unresolved: () => 'Some files need a role — confirm each via its chip.',
  'missing-current': () => 'Add or assign a Current-Year file to preview statements.',
  'ambiguous-period': () =>
    'Two files share the same period-end — set which is Current vs Prior via their chips.',
}

/**
 * Which finish state the step is in (pure) →
 *   'incomplete' — no This-year file: nothing to finish (disabled);
 *   'saving'     — a file is still reading / saving (waits);
 *   'needsDate'  — a This-year file read but NOT saved because it has no
 *                  year-end date (disabled, with the reason — "Done" used to
 *                  leave for an empty Finance page and drop the upload);
 *   'blocked'    — read but not saved because the roles conflict (disabled);
 *   'half'       — This year is half a trial balance: "Add its Balance Sheet"
 *                  is the primary action, Done secondary;
 *   'review'     — accounts wait for a person (Done secondary, with why);
 *   'ready'.
 */
export function intakeFinishState({
  hasCurrent,
  parsing,
  saving,
  reviewTotal,
  unsaved = false,
  canSave = true,
  hasDate = true,
  half = null,
}) {
  if (!hasCurrent) return 'incomplete'
  if (parsing) return 'saving'
  if (unsaved && !canSave) return hasDate ? 'blocked' : 'needsDate'
  if (saving) return 'saving'
  if (half === 'pl' || half === 'bs') return 'half'
  if (reviewTotal > 0) return 'review'
  return 'ready'
}

export const FINISH_SAVE_ERROR = 'We couldn’t save your file just now. Press Done again to try once more.'

/**
 * Finish the step (pure of React; the bar calls it) → null, or the plain error.
 *
 * Only a failed autosave leaves the intake dirty here (otherwise the bar says
 * "Saving…" and can't be pressed): retry the save, stay put if it fails or
 * throws, and open the year THIS save wrote — the host's own period is from
 * before it (for a brand-new year: the previous year, or nothing).
 */
export async function runFinish({ dirty, canGenerate, save, onFinish }) {
  let periodId = null
  if (dirty && canGenerate && typeof save === 'function') {
    let snap = null
    try {
      snap = await save()
    } catch {
      snap = null
    }
    if (!snap) return FINISH_SAVE_ERROR
    periodId = snap.fiscalPeriodId ?? null
  }
  onFinish(periodId ? { periodId } : undefined)
  return null
}

/**
 * `confirmBandShowing` — the Add-data host renders the "Does this look right?"
 * confirm band right under the intake; while it shows, IT is the next step, so
 * the green "all sorted" callout drops its own "See Finance" button.
 *
 * `onFinish` — the Finance Add-data trial-balance step passes it: the step then
 * ends in ONE bar ("Done — show my numbers" → the full Finance overview), and
 * the green callout likewise drops "See Finance".
 */
export default function IntakeBar({ confirmBandShowing = false, onFinish = null } = {}) {
  const {
    files,
    byRole,
    intakeMode,
    conflicts,
    loadFiles,
    loadFilesForRole,
    status,
    collapse,
    canEdit,
    // #32 column picker host + A4 review queue (absent on older mounts).
    pickerFileId = null,
    closeColumnPicker = () => {},
    applyColumns = () => false,
    intakeMemory = null,
    review = null,
    schoolId = null,
    saveState = 'idle',
    periodDate = '',
    reports = null,
    dirty = false,
    canGenerate = false,
    save = null,
  } = useApp()
  // A5: the review popup's store also remembers a school that just finished
  // sorting, so the green "all sorted" survives the intake's autosave remount.
  const reviewModal = useReviewModal()
  // A4: remember that something needed review during this visit, so the
  // callout can turn green when the last account is sorted (derived-state
  // update during render — never an effect).
  const reviewTotal = review?.total ?? 0
  const [hadReview, setHadReview] = useState(false)
  if (reviewTotal > 0 && !hadReview) setHadReview(true)
  const reviewDone =
    reviewTotal === 0 && (hadReview || (!!schoolId && reviewModal.sortedSchoolId === schoolId))
  // While the green "all sorted" callout is up, the italic status line
  // ("Sorted 9 accounts.") only repeats it — one message, not two.
  const doneShowing = canEdit && intakeMode === 'review' && reviewDone

  // ── The ONE finish (only when the host passed onFinish) ───────────────────
  // The intake autosaves ~1.4 s after a file reads; until it has, "Done" waits
  // (a dirty, savable intake counts as saving). Pressing it while a save is
  // still owed saves first, then leaves — never leaves work behind.
  const parsing = files.some((f) => f.status === 'parsing')
  const savePending =
    saveState === 'saving' || (dirty && canGenerate && saveState !== 'error' && saveState !== 'blocked')
  const cyHalf = statementPartial(byRole?.cy)
  const finishState = intakeFinishState({
    hasCurrent: !!byRole?.cy,
    parsing,
    saving: savePending,
    reviewTotal,
    unsaved: dirty,
    canSave: canGenerate,
    hasDate: !!periodDate,
    half: cyHalf === 'pl' || cyHalf === 'bs' ? cyHalf : null,
  })
  const [finishError, setFinishError] = useState('')
  const finishNow = async () => {
    if (!onFinish || finishState === 'saving') return
    setFinishError('')
    const err = await runFinish({ dirty, canGenerate, save, onFinish })
    if (err) setFinishError(err)
    // The finish bar reads this: an error string means "no celebration".
    return err
  }
  const inputRef = useRef(null)
  // Override-upload plumbing: a hidden input whose next selection is pinned to
  // the role captured here (used by a history-filled slot's "Upload to override").
  const overrideInputRef = useRef(null)
  const overrideRoleRef = useRef(null)
  const overrideRef = useRef((role) => {
    overrideRoleRef.current = role
    overrideInputRef.current?.click()
  })

  // Which file ids need user attention: any file in a duplicate/unresolved
  // conflict, plus any low-confidence unconfirmed suggestion.
  const reviewIds = useMemo(() => {
    const ids = new Set()
    for (const c of conflicts) {
      if (
        c.kind === 'duplicate' ||
        c.kind === 'unresolved' ||
        c.kind === 'ambiguous-period'
      ) {
        c.fileIds.forEach((id) => ids.add(id))
      }
    }
    for (const f of files) {
      if (
        f.status === 'ready' &&
        !f.roleConfirmed &&
        (f.role === 'unknown' || (f.suggestion?.confidence ?? 0) < 0.5)
      ) {
        ids.add(f.id)
      }
    }
    return ids
  }, [files, conflicts])

  // The ids that cleanly resolved into a single role slot (via the existing
  // resolveRoles-derived byRole). Any other file — duplicate-role claimant,
  // unknown/unresolved, 'ignore', extra, or still-parsing/errored — is NOT in
  // a slot and must surface in the "Needs a role" overflow row rather than be
  // silently dropped or overwrite a slot.
  const slottedIds = useMemo(() => {
    const ids = new Set()
    for (const role of SLOT_ROLES) {
      const f = byRole[role]
      if (f) ids.add(f.id)
    }
    return ids
  }, [byRole])

  // "Needs a role" holds only files KYRO could read (or is still reading); a
  // file it couldn't read gets its own "Couldn't read" group (#32).
  const unslotted = useMemo(
    () => files.filter((f) => !slottedIds.has(f.id) && f.status !== 'error'),
    [files, slottedIds]
  )
  const unreadable = useMemo(
    () => files.filter((f) => !slottedIds.has(f.id) && f.status === 'error'),
    [files, slottedIds]
  )
  const ambiguity = useMemo(() => ambiguityBanners(files), [files])

  // The ONE column picker (#32), full width under the file groups. An error
  // entry brings its own preview; a file that read (Change columns) is
  // re-previewed from its bytes, starting from the layout it was read with.
  const pickerEntry = pickerFileId ? files.find((f) => f.id === pickerFileId && f.bytes) ?? null : null
  const pickerSetup = useMemo(() => {
    if (!pickerEntry) return null
    if (pickerEntry.status === 'error') {
      const preview = pickerEntry.failure?.preview ?? null
      return preview ? { preview, initial: preview.guess } : null
    }
    let preview = null
    try {
      preview = previewFile(pickerEntry.fileName, pickerEntry.bytes)
    } catch {
      preview = null
    }
    return preview ? { preview, initial: pickerEntry.metadata?.layout ?? preview.guess } : null
  }, [pickerEntry])
  // Bring the picker into view when it opens — a ref callback, not an effect.
  const scrollPickerIntoView = (node) => {
    node?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }

  // Same-document guard: a new user can drop the SAME trial balance into every
  // slot. Flag the EXACT same uploaded file (name + size) appearing in 2+ slots —
  // a precise signal of the mistake with no false positives (two genuinely
  // different docs won't share name+size; a legit audited-current-year shares a
  // period-end but not the file). History-loaded comparatives are excluded — they
  // aren't a user upload mistake.
  const duplicateSlots = useMemo(() => {
    const slotted = SLOT_ROLES.map((role) => ({ role, f: byRole[role] })).filter(
      (x) => x.f && x.f.status === 'ready' && !x.f.fromHistory
    )
    const groups = new Map()
    for (const { role, f } of slotted) {
      const key = `${f.fileName ?? ''}|${f.fileSize ?? 0}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(role)
    }
    for (const roles of groups.values()) if (roles.length >= 2) return roles
    return null
  }, [byRole])

  const onBrowse = (e) => {
    if (e.target.files?.length) loadFiles(e.target.files)
    e.target.value = ''
  }

  // The set of roles that have a live duplicate conflict. resolveRoles leaves
  // such a slot empty (claimants surface in "Needs a role"); we mark the slot
  // as conflicted so it reads "resolve below" instead of "missing — add one".
  const duplicateRoles = useMemo(() => {
    const s = new Set()
    for (const c of conflicts) {
      if (c.kind === 'duplicate' && c.role) s.add(c.role)
    }
    return s
  }, [conflicts])

  // Dropping/browsing N files INTO one slot should pin only the FIRST file to
  // that slot's role (one file per slot); any extras go through the normal
  // auto-classify path rather than all being force-stamped to the same role.
  const assignToSlot = (role, list) => {
    const arr = Array.from(list)
    if (arr.length === 0) return
    loadFilesForRole(role, [arr[0]])
    if (arr.length > 1) loadFiles(arr.slice(1))
  }

  return (
    <section className="no-print relative py-4 sm:py-6">
      <DragOverlay />

      <div className="mx-auto max-w-page px-4 sm:px-10">
      <AnimatePresence mode="wait">
        {/* ── EMPTY ── */}
        {intakeMode === 'empty' && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Export sits in its own right-aligned row so the dropzone can span
                the full column and stay centered (symmetric with the preview
                placeholder below). */}
            {/* (No Export here: an empty intake has nothing to export — the
                disabled button was a fourth control with nothing behind it.) */}
            {canEdit ? (
              <>
                {/* id anchors Penny's "drop your trial balance here" glide. */}
                <div id="tb-upload-drop">
                  <HeroDropzone />
                </div>
                <div className="mt-4">
                  <IntakeGuide />
                </div>
              </>
            ) : (
              <div className="rounded-[8px] border border-dashed border-hair/[0.18] bg-white px-6 py-12 text-center">
                <p className="font-serif text-lg italic text-ink2">
                  No saved statements yet for this school.
                </p>
                <p className="mt-1 text-[15px] text-ink2">
                  You have view-only access. Saved periods appear in History.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── COLLAPSED ── */}
        {intakeMode === 'collapsed' && (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex flex-1">
              <SummaryStrip />
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <SaveBar />
              <ExportMenu />
            </div>
          </motion.div>
        )}

        {/* ── REVIEW ── */}
        {intakeMode === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* ONE ROW, ONE JOB. This header used to carry four controls of
                equal weight — Add, Save, Cancel, Export — beside a heading, on
                top of an explainer, on top of three tall cards, on top of a
                period bar. Saving is the job; Add is secondary; Cancel and
                Export are things you occasionally need and never look for. */}
            {/* A4: impossible to miss — accounts waiting for a person. */}
            {canEdit && (
              <ReviewCallout
                total={reviewTotal}
                done={reviewDone}
                onReview={() => openReviewModal(schoolId)}
                showFinanceLink={!confirmBandShowing && !onFinish}
              />
            )}

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-heading font-semibold text-ink">
                Your files
              </h2>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                {/* ONE add action: with the step's finish bar there, its "Add
                    another file" is it (plus the empty slots themselves). */}
                {canEdit && !onFinish && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="btn btn-secondary w-full shrink-0 whitespace-nowrap sm:w-auto"
                  >
                    <Plus size={14} aria-hidden="true" /> Add
                  </button>
                )}
                {/* id anchors Penny's "save your trial balance" glide. */}
                <span id="tb-save-button" className="contents">
                  <SaveBar />
                </span>
                {/* Export only once there are numbers to export. */}
                {reports ? (
                  <div className="w-full shrink-0 sm:w-auto" data-testid="intake-export">
                    <ExportMenu onCancel={canEdit ? collapse : null} />
                  </div>
                ) : null}
              </div>
            </div>

            {/* same-document warning (e.g. the same TB dropped into every slot) */}
            {duplicateSlots && (
              <div className="b2-callout mb-5" data-tone="watch">
                <Files size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">The same file looks like it’s in more than one slot.</p>
                  <p className="mt-0.5">
                    {duplicateSlots.map((r) => ROLE_META[r].plainLabel).join(' and ')} appear to be
                    the same document. Each slot needs a <em>different</em> file — see “What goes
                    where” above. If you only have this year’s books, remove the others and keep just{' '}
                    <span className="font-semibold">#1</span>.
                  </p>
                </div>
              </div>
            )}

            {/* conflict banners */}
            {conflicts.length > 0 && (
              <div className="mb-5 space-y-2">
                {conflicts.map((c, i) => (
                  <div
                    key={`${c.kind}-${i}`}
                    className="b2-callout font-medium"
                    data-tone="watch"
                  >
                    <AlertTriangle size={15} className="shrink-0" />
                    {CONFLICT_COPY[c.kind](c)}
                  </div>
                ))}
              </div>
            )}

            {/* #40: two halves of the same kind on one date — nothing merges
                until the person removes one. */}
            {ambiguity.length > 0 && (
              <div className="mb-5 space-y-2" data-testid="pair-ambiguity">
                {ambiguity.map((text) => (
                  <div key={text} className="b2-callout font-medium" data-tone="watch">
                    <AlertTriangle size={15} className="shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
            )}

            {/* THREE ROLE SLOTS — Current Year / Prior Year / Audited FY End.
                Each slot is either a filled FileStatusCard (resolved via
                byRole) or a draggable + clickable EmptySlotCard placeholder. */}
            <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SLOT_ROLES.map((role) => {
                const filled = byRole[role]
                const meta = ROLE_META[role]
                return (
                  <div key={role} className="flex flex-col">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                      <span className="tabular-nums text-ink">{meta.step}</span>
                      {meta.plainLabel}
                    </p>
                    <AnimatePresence mode="wait" initial={false}>
                      {filled ? (
                        <FileStatusCard
                          key={filled.id}
                          file={filled}
                          needsReview={reviewIds.has(filled.id)}
                          onOverride={
                            filled.fromHistory
                              ? () => overrideRef.current?.(role)
                              : undefined
                          }
                        />
                      ) : canEdit ? (
                        <EmptySlotCard
                          key={`empty-${role}`}
                          role={role}
                          needsAttention={role === 'cy' && !duplicateRoles.has(role)}
                          conflicted={duplicateRoles.has(role)}
                          assignFiles={(list) => assignToSlot(role, list)}
                        />
                      ) : (
                        <div
                          key={`empty-ro-${role}`}
                          className="flex min-h-[196px] w-full flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-hair/[0.18] bg-ground px-4 py-8 text-center"
                        >
                          <p className="text-[15px] font-semibold text-ink">{meta.plainLabel}</p>
                          <p className="text-[14px] italic text-ink2">Not provided</p>
                        </div>
                      )}
                    </AnimatePresence>
                    {/* PY auto-promote opt-in — only renders for a fresh,
                        promotable Prior-Year upload (component self-gates). */}
                    {role === 'py' && filled && <PromotePyToggle />}
                  </div>
                )
              })}
            </div>

            {/* NEEDS A ROLE — overflow for files that didn't resolve to a single
                slot: duplicate-role claimants, unknown/unresolved, 'ignore',
                extras, plus parsing/error cards. Each keeps its editable
                RoleChip + remove; confirming a role promotes it into its slot. */}
            {unslotted.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.1em] text-ink">
                  <AlertTriangle size={14} className="text-ink2" /> Needs a role
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {unslotted.map((f) => (
                      <FileStatusCard
                        key={f.id}
                        file={f}
                        needsReview={reviewIds.has(f.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* COULDN'T READ (#32) — files KYRO could not turn into accounts,
                each saying why in plain words and, when it can, offering to
                show KYRO the columns. */}
            {unreadable.length > 0 && (
              <div className="mt-6" data-testid="couldnt-read">
                <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.1em] text-ink">
                  <AlertOctagon size={14} className="text-ink2" /> Couldn&rsquo;t read
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {unreadable.map((f) => (
                      <FileStatusCard key={f.id} file={f} needsReview={false} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* THE COLUMN PICKER — one at a time, full width (a slot card is
                too narrow for a grid preview). */}
            {canEdit && pickerEntry && pickerSetup && (
              <div className="mt-6" ref={scrollPickerIntoView}>
                <ColumnPicker
                  key={pickerEntry.id}
                  fileName={pickerEntry.fileName}
                  bytes={pickerEntry.bytes}
                  preview={pickerSetup.preview}
                  initial={pickerSetup.initial}
                  memory={intakeMemory}
                  onApply={(choice) => applyColumns(pickerEntry.id, choice)}
                  onCancel={closeColumnPicker}
                />
              </div>
            )}

            <div className="mt-5">
              <PeriodControls />
            </div>

            {/* THE ONE FINISH (Finance Add-data): straight to the overview. */}
            {canEdit && onFinish && (
              <IntakeFinishBar
                state={finishState}
                reviewCount={reviewTotal}
                onFinish={finishNow}
                onAddFile={() => inputRef.current?.click()}
                // The other half goes into THIS year's slot (never the
                // nearest empty box).
                sticky
                half={finishState === 'half' ? cyHalf : null}
                onAddHalf={() => overrideRef.current?.('cy')}
                error={finishError}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* A5: the ONE review popup every "Review …" button opens. */}
      {canEdit && <ReviewAccountsHost />}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onBrowse}
      />
      <input
        ref={overrideInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const role = overrideRoleRef.current
          if (role && e.target.files?.length) assignToSlot(role, e.target.files)
          overrideRoleRef.current = null
          e.target.value = ''
        }}
      />

      {status && !doneShowing && (
        <p aria-live="polite" className="mt-4 text-[15px] italic text-ink2">
          {status}
        </p>
      )}
      </div>
    </section>
  )
}
