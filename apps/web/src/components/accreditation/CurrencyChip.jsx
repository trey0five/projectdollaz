// ─────────────────────────────────────────────────────────────────────────────
// CurrencyChip — Phase C: the six-state evidence chip, in one place.
//
// current · expiring · stale · missing · unknown · not_tracked.
//
// THE ONE RULE THIS COMPONENT ENFORCES: the chip never invents a currency. It
// renders the state the engine returned and, when the engine gave one, the date
// that state hangs on. It never falls back to "Current", never converts a null
// date into today, and never prints a date the payload did not carry. `unknown`
// and `not_tracked` are first-class chips with their own neutral colours, not
// error states and not empty states — a school is scored down for neither.
//
// One surface, one vocabulary (Premium UI P4, a2): the ledger Pill — ink text and
// a 2px semantic mark (current → good · expiring → watch · stale/missing → risk ·
// unknown/not_tracked → neutral). The navy evidence panel that needed a dark
// variant is light now, so the dark branch is gone.
// The print page uses `currencyLabel()` directly instead: a chip is ink noise on
// paper, and the Index's Current column is a word plus a date, nothing more.
// ─────────────────────────────────────────────────────────────────────────────
import { currencyMeta } from './evidenceMeta.js'
import { formatShortDate } from '../../lib/format.js'
import Pill from '../ui/surface/Pill.jsx'

/** Currency state → the Pill's mark tone. Unknown keys read neutral. */
const STATE_TONE = {
  current: 'good',
  expiring: 'watch',
  stale: 'risk',
  missing: 'risk',
  unknown: 'neutral',
  not_tracked: 'neutral',
}

export default function CurrencyChip({
  state,
  /** yyyy-mm-dd the state hangs on. Rendered ONLY when `showDate` and non-null. */
  expiresOn = null,
  showDate = false,
  /** Full sentence for the tooltip — always the server's `message`, never ours. */
  title = null,
  className = '',
}) {
  if (!state) return null
  const meta = currencyMeta(state)
  // A date is shown only when the engine computed one. `missing`, `not_tracked`
  // and `unknown` carry none by construction, so this branch simply never fires
  // for them — there is no placeholder date anywhere in this component.
  const date = showDate && expiresOn ? formatShortDate(String(expiresOn).slice(0, 10)) : null

  return (
    <Pill
      variant="status"
      tone={STATE_TONE[state] ?? 'neutral'}
      title={title || undefined}
      className={`max-w-full ${className}`.trim()}
    >
      <span className="truncate">{meta.label}</span>
      {date ? <span className="shrink-0 font-medium text-ink2">{date}</span> : null}
    </Pill>
  )
}
