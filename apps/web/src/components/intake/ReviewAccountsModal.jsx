// ─────────────────────────────────────────────────────────────────────────────
// ReviewAccountsModal — "Review 12 accounts", the ONE place a person tells KYRO
// what the accounts it couldn't place are (A5).
//
// It replaced an inline list on the file card that truncated every account to
// "4(" / "40…", showed a bare number, asked for a "Use this" click on EVERY row
// and opened with "We don't know what these accounts are yet…". Here:
//   • accounts are GROUPED by where they belong (Money in / Money out / What we
//     own / What we owe / Net assets / Not sure yet);
//   • every row shows the FULL number and name (wrapping, never truncated) and
//     the amount as money;
//   • each dropdown is PRE-FILLED with KYRO's suggestion, tagged "Suggested" —
//     that counts as the answer unless the person changes it; a row with no
//     suggestion is highlighted "Needs your pick", and those rows ("Not sure
//     yet") come FIRST, their amount saying which way the money went;
//   • the progress line says what is true — "7 of 9 have a category" — and the
//     bar stays amber until the person has gone through the list;
//   • "Approve and build statements" writes the whole mapping in ONE save, and
//     is disabled (with the reason) while any row has no category.
//
// Purely presentational: rows, answers and the save come in as props (see
// ReviewAccountsHost for the wiring), so every rule here is pinned by a test
// without the intake around it. Focus-trapped, Esc closes WITHOUT saving, and
// at phone width it is a full-screen sheet.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks, Loader2, Sparkles, X } from 'lucide-react'
import Button from '../ui/surface/Button.jsx'
import { CATEGORY_OPTIONS, labelFor } from '../MappingCategorySelect.jsx'
import {
  groupItems,
  answeredCount,
  approveState,
  reviewAmount,
  reviewTitle,
} from '../../lib/reviewPopup.js'
import { reviewSplit } from '../../lib/reviewQueue.js'
import '../../styles/pending/c1-flows.css'

const EASE = [0.22, 1, 0.36, 1]
const WATCH = '#d97706'

const SECTION_GROUP_LABEL = {
  revenue: 'Money in',
  expense: 'Money out',
  asset: 'What we own',
  liability: 'What we owe',
  netAssets: 'Net assets',
}
const SECTION_ORDER = ['revenue', 'expense', 'asset', 'liability', 'netAssets']

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Keep Tab / Shift+Tab inside the dialog. */
function trapTab(e, root) {
  if (e.key !== 'Tab' || !root) return
  const nodes = [...root.querySelectorAll(FOCUSABLE)].filter((n) => !n.closest('[aria-hidden="true"]'))
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

/** One account's category dropdown: its section only when QuickBooks fixed it, else every group. */
function CategorySelect({ item, value, onChange, disabled, labelId }) {
  const sections = item.fixed && item.section ? [item.section] : SECTION_ORDER
  const offered = sections.flatMap((s) => CATEGORY_OPTIONS[s] ?? [])
  const extra = value && !offered.some((o) => o.value === value) ? value : null
  return (
    <div className="relative w-full sm:max-w-[22rem]">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-labelledby={labelId}
        data-testid={`review-select-${item.acct}`}
        className={`field-plain field-select w-full ${value ? '' : 'ring-2 ring-[#d97706]/50'}`}
      >
        <option value="">Choose what this is…</option>
        {extra ? <option value={extra}>{labelFor(extra)}</option> : null}
        {sections.length === 1
          ? (CATEGORY_OPTIONS[sections[0]] ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          : sections.map((s) => (
              <optgroup key={s} label={SECTION_GROUP_LABEL[s]}>
                {(CATEGORY_OPTIONS[s] ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-ink2"
      />
    </div>
  )
}

function AccountRow({ item, value, onPick, disabled }) {
  const labelId = useId()
  const suggested = !!item.suggestion && value === item.suggestion.category
  const needsPick = !value
  return (
    <li
      className={`flex flex-col gap-2 px-4 py-3 sm:px-5 ${needsPick ? 'bg-[#d97706]/[0.06]' : ''}`}
      data-testid={`review-row-${item.acct}`}
    >
      <div className="flex items-start gap-3">
        <p id={labelId} className="min-w-0 flex-1 break-words text-[14.5px] leading-snug text-ink">
          <span className="num mr-2 font-bold tabular-nums">{item.acct}</span>
          <span className="font-medium">{item.name}</span>
        </p>
        <span className="num shrink-0 pt-px text-[14px] font-semibold tabular-nums text-ink" data-testid="review-amount">
          {reviewAmount(item.total, item.group)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <CategorySelect
          item={item}
          value={value}
          onChange={(v) => onPick(item.acct, v)}
          disabled={disabled}
          labelId={labelId}
        />
        <span className="flex flex-wrap items-center gap-1.5">
          {suggested && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[#2563EB]/25 bg-[#2563EB]/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1d4ed8]"
              data-testid="tag-suggested"
              title={item.suggestion.reason ? `Suggested: ${item.suggestion.reason}` : 'KYRO’s suggestion'}
            >
              <Sparkles size={11} aria-hidden="true" /> Suggested
            </span>
          )}
          {needsPick && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[#d97706]/40 bg-[#d97706]/[0.1] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9a4508]"
              data-testid="tag-needs-pick"
            >
              <AlertTriangle size={11} aria-hidden="true" /> Needs your pick
            </span>
          )}

          {item.numbered && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink2">
              KYRO numbered this
            </span>
          )}
        </span>
      </div>
    </li>
  )
}

/**
 * The popup. `items` from buildReviewItems; `picks` = { [acct]: category | '' }
 * (currentPicks: suggestions overlaid by the person's changes). Nothing is
 * saved until a footer button is pressed; close / Esc / the scrim never save.
 */
export default function ReviewAccountsModal({
  open,
  items = [],
  picks = {},
  onPick,
  onApprove,
  onSaveLater,
  onClose,
  saving = false,
  error = '',
  canEdit = true,
}) {
  const reduce = useReducedMotion()
  const dialogRef = useRef(null)
  const titleId = useId()
  const total = items.length
  const done = answeredCount(items, picks)
  const groups = useMemo(() => groupItems(items), [items])
  const approve = approveState(items, picks)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  // "Have a category" is not "checked": pre-filled suggestions count as answers,
  // but the bar only turns green once the person has actually gone through the
  // list — scrolled to its end (or it all fits on screen) or changed a pick.
  const bodyRef = useRef(null)
  const [looked, setLooked] = useState(false)
  const markIfAtEnd = () => {
    const el = bodyRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setLooked(true)
  }
  useEffect(() => {
    if (!open) return undefined
    // Opening (re-opening) starts unread; a list that fits needs no scroll.
    const t = window.setTimeout(() => {
      const el = bodyRef.current
      setLooked(!!el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])
  const allGood = pct === 100 && looked

  // Focus moves into the dialog when it opens and returns to the opener when it closes.
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const t = window.setTimeout(() => dialogRef.current?.focus?.(), 0)
    return () => {
      window.clearTimeout(t)
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.()
    }
  }, [open])

  // Esc closes WITHOUT saving; the page behind does not scroll while open.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      } else if (e.key === 'Tab') {
        trapTab(e, dialogRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="dlg-scrim" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-testid="review-modal"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.26, ease: EASE }}
            style={{ '--c-module': '217 119 6' }}
            className="dlg flex h-[100dvh] w-full flex-col !rounded-none outline-none sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:!rounded-[var(--r-panel)]"
          >
            {reduce ? (
              <span className="dlg-rule" aria-hidden="true" />
            ) : (
              <motion.span
                className="dlg-rule"
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.48, ease: EASE, delay: 0.06 }}
              />
            )}

            {/* Header — what this is, why, and how far along. */}
            <div className="dlg-head flex-col !gap-3">
              <div className="flex w-full items-start gap-3">
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d97706]/[0.12] text-[#9a4508]"
                  aria-hidden="true"
                >
                  <ListChecks size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="dlg-title">
                    {reviewTitle(total)}
                  </h2>
                  <p className="dlg-sub !text-[13.5px]">
                    Tell us what each account is once. Every future upload remembers.
                  </p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close without saving" className="dlg-x">
                  <X size={18} />
                </button>
              </div>
              <div className="w-full">
                <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-ink2">
                  <span aria-live="polite" data-testid="review-progress">
                    {reviewSplit(total - done, total)}
                  </span>
                  {approve.missing > 0 && (
                    // Jumps to the first row still waiting for a pick (most sit
                    // under "Not sure yet", at the top of the list).
                    <button
                      type="button"
                      data-testid="jump-to-missing"
                      className="text-[#9a4508] underline decoration-[#9a4508]/40 underline-offset-2 hover:decoration-[#9a4508]"
                      onClick={() => {
                        const first = [...(dialogRef.current?.querySelectorAll('select') ?? [])].find((s) => !s.value)
                        first?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
                        first?.focus?.({ preventScroll: true })
                      }}
                    >
                      {approve.missing} still need{approve.missing === 1 ? 's' : ''} your pick
                    </button>
                  )}
                </div>
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]"
                  role="progressbar"
                  aria-label="Accounts with a category"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={done}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: allGood ? '#059669' : WATCH }}
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                  />
                </div>
              </div>
            </div>

            {/* Body — the accounts, grouped by where they belong. */}
            <div
              ref={bodyRef}
              onScroll={markIfAtEnd}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {groups.map((g) => (
                <section key={g.key} aria-labelledby={`${titleId}-${g.key}`} data-testid={`review-group-${g.key}`}>
                  <div className="sticky top-0 z-[1] flex items-baseline justify-between gap-2 border-b border-hair/[0.1] bg-[#f8fafc] px-4 py-2 sm:px-5">
                    <h3 id={`${titleId}-${g.key}`} className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                      {g.title}
                      <span className="ml-2 font-semibold normal-case tracking-normal text-ink2">{g.hint}</span>
                    </h3>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink2">{g.items.length}</span>
                  </div>
                  <ul className="divide-y divide-hair/[0.08]">
                    {g.items.map((it) => (
                      <AccountRow
                        key={it.acct}
                        item={it}
                        value={picks[String(it.acct)] ?? ''}
                        onPick={(acct, v) => {
                          setLooked(true)
                          onPick?.(acct, v)
                        }}
                        disabled={!canEdit || saving}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {error ? (
              <div className="px-5 pt-2">
                <p className="dlg-error" role="alert">
                  {error}
                </p>
              </div>
            ) : null}

            {/* Footer — finish later, or approve everything in one save. */}
            <div className="dlg-foot flex-col-reverse !items-stretch sm:flex-row sm:!items-center">
              {!approve.canApprove && approve.reason && total > 0 ? (
                <p className="mr-auto text-[12.5px] font-medium text-[#9a4508]" data-testid="approve-reason">
                  {approve.reason}
                </p>
              ) : (
                <p className="mr-auto flex items-center gap-1.5 text-[12.5px] font-medium text-ink2">
                  <CheckCircle2 size={14} className="text-[#059669]" aria-hidden="true" /> Every account has a category.
                </p>
              )}
              <Button
                variant="secondary"
                onClick={onSaveLater}
                disabled={!canEdit || saving}
                data-testid="review-save-later"
                className="w-full justify-center sm:w-auto"
              >
                Save and finish later
              </Button>
              <Button
                variant="primary"
                onClick={onApprove}
                disabled={!canEdit || saving || !approve.canApprove}
                aria-describedby={!approve.canApprove ? `${titleId}-why` : undefined}
                data-testid="review-approve"
                className="w-full justify-center sm:w-auto"
              >
                {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                {saving ? 'Saving…' : 'Approve and build statements'}
              </Button>
              <span id={`${titleId}-why`} className="sr-only">
                {approve.reason ?? ''}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
