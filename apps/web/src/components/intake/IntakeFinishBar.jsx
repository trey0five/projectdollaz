// ─────────────────────────────────────────────────────────────────────────────
// IntakeFinishBar — the ONE way to finish the Finance trial-balance step.
//
// Owner, 2026-10-15: "when I select I'm done on the trial balance screen, it
// takes me to a redundant screen making me press done again. when I press done
// it gives me half the overview screen … too much redundancy." The step used to
// end in FOUR places: a "Does this look right?" band (two buttons), a footer
// "I'm done", then a Step 3 "That's saved" screen whose "Done" landed on the
// Workspaces tab — not the overview.
//
// Now there is one bar at the bottom of the step:
//   • files in, accounts sorted, saved → primary "Done — show my numbers",
//     which goes straight to the FULL Finance overview;
//   • still saving → the same button, waiting ("Saving…");
//   • accounts waiting for a person → the finish button steps back to
//     secondary with ONE line saying why (the amber "Review N accounts" above
//     is the primary action — it is not repeated here);
//   • a small quiet "Add another file" (the intake's own browse).
// "What changed" (the celebration) stays on the overview, not here. The one
// flourish the bar adds: once a READY finish goes through, it tells the owl
// ('penny:mood' { mood: 'celebrate' }) to toss its cap.
//
// Purely presentational: the host decides the state.
// ─────────────────────────────────────────────────────────────────────────────
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import Button from '../ui/surface/Button.jsx'
import { needsCheckPhrase } from '../../lib/reviewQueue.js'

export const FINISH_LABEL = 'Done — show my numbers'

/**
 * After a ready finish, the floating owl tosses its cap — unless onFinish
 * reports a failure (a non-empty error string, false, or a rejection).
 */
export function celebrateFinish(result) {
  Promise.resolve(result)
    .then((r) => {
      if (r === false || (typeof r === 'string' && r)) return
      window.dispatchEvent(new CustomEvent('penny:mood', { detail: { mood: 'celebrate' } }))
    })
    .catch(() => {})
}

/**
 * The bar's words for a state → { primary: bool, disabled: bool, busy: bool, reason: string|null }.
 * state: 'ready' | 'saving' | 'review' | 'incomplete' | 'needsDate' | 'blocked' | 'half'
 */
export function finishState(state, reviewCount = 0, half = null) {
  switch (state) {
    case 'saving':
      return { primary: true, disabled: true, busy: true, reason: null }
    case 'review':
      return {
        primary: false,
        disabled: false,
        busy: false,
        reason: `${needsCheckPhrase(reviewCount)} — ${reviewCount === 1 ? 'it’s' : 'they’re'} left out of your numbers until ${reviewCount === 1 ? 'it’s' : 'they’re'} sorted.`,
      }
    case 'incomplete':
      return { primary: false, disabled: true, busy: false, reason: 'Add this year’s file to see your numbers.' }
    case 'needsDate':
      // Nothing is saved yet — leaving would drop the upload.
      return {
        primary: false,
        disabled: true,
        busy: false,
        reason: 'Add the year-end date below so we can save this file.',
      }
    case 'blocked':
      return {
        primary: false,
        disabled: true,
        busy: false,
        reason: 'Give each file its own role above so we can save it.',
      }
    case 'half':
      return {
        primary: false,
        disabled: false,
        busy: false,
        reason:
          half === 'bs'
            ? 'This is only the Balance Sheet — income and costs need its Profit and Loss.'
            : 'This is only the Profit and Loss — cash and reserve need its Balance Sheet.',
      }
    default:
      return { primary: true, disabled: false, busy: false, reason: null }
  }
}

export default function IntakeFinishBar({
  state = 'ready',
  reviewCount = 0,
  onFinish,
  onAddFile = null,
  // false → never the primary (a tab with its own primary, e.g. "Save 3 years").
  primary = true,
  // A plain-words line when finishing failed (e.g. the save retry).
  error = '',
  // 'pl' | 'bs' when This year is half a trial balance: its other half is
  // then the PRIMARY action (onAddHalf), and Done steps back.
  half = null,
  onAddHalf = null,
  // On a phone the step is long (three slots + the period): keep the ONE
  // finish in reach at the bottom of the screen instead of 1,200px down.
  sticky = false,
  className = '',
}) {
  const s = finishState(state, reviewCount, half)
  const addHalf = state === 'half' && onAddHalf && (half === 'pl' || half === 'bs')
  if (!primary) s.primary = false
  return (
    <div
      className={`mt-5 flex flex-col gap-3 sm:flex-row sm:items-center ${
        sticky
          ? 'max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-4 max-sm:border-t max-sm:border-hair max-sm:bg-white/95 max-sm:px-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:pt-3 max-sm:backdrop-blur'
          : ''
      } ${className}`}
      data-sticky={sticky ? 'mobile' : undefined}
      data-testid="intake-finish"
      data-state={state}
    >
      {addHalf ? (
        <Button
          variant="primary"
          icon={<Plus size={15} aria-hidden="true" />}
          onClick={() => onAddHalf()}
          className="order-2 w-full justify-center sm:order-4 sm:w-auto"
          data-testid="finish-add-half"
          data-kyro-avoid=""
        >
          {half === 'pl' ? 'Add its Balance Sheet' : 'Add its Profit and Loss'}
        </Button>
      ) : null}
      {onAddFile && !addHalf ? (
        <Button
          variant="quiet"
          icon={<Plus size={15} aria-hidden="true" />}
          onClick={onAddFile}
          className="order-3 w-full justify-center sm:order-1 sm:mr-auto sm:w-auto"
          data-testid="finish-add-file"
        >
          Add another file
        </Button>
      ) : (
        <span className="hidden sm:order-1 sm:mr-auto sm:block" aria-hidden="true" />
      )}
      {error ? (
        <p className="order-1 text-[13.5px] font-medium leading-snug text-[#9a4508] sm:order-2 sm:text-right" role="alert" data-testid="finish-error">
          {error}
        </p>
      ) : null}
      {s.reason ? (
        <p className="order-1 text-[13.5px] leading-snug text-ink2 sm:order-2 sm:text-right" data-testid="finish-reason">
          {s.reason}
        </p>
      ) : null}
      <Button
        variant={s.primary ? 'primary' : 'secondary'}
        // No click event leaks into onFinish (it takes an optional { periodId }).
        onClick={() => {
          const result = onFinish?.()
          if (state === 'ready' && onFinish) celebrateFinish(result)
        }}
        disabled={s.disabled}
        icon={s.busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
        className="order-2 w-full justify-center sm:order-3 sm:w-auto"
        data-testid="finish-button"
        data-kyro-avoid=""
      >
        {s.busy ? 'Saving…' : FINISH_LABEL}
        {!s.busy && <ArrowRight size={15} aria-hidden="true" />}
      </Button>
    </div>
  )
}
