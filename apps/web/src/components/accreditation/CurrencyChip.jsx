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
// Two surfaces, one vocabulary:
//   · light (default) — the Evidence tab and the standards register
//   · dark            — inside the navy evidence panel, where the light chip
//                       palette is unreadable
// The print page uses `currencyLabel()` directly instead: a chip is ink noise on
// paper, and the Index's Current column is a word plus a date, nothing more.
// ─────────────────────────────────────────────────────────────────────────────
import { currencyMeta } from './evidenceMeta.js'
import { formatShortDate } from '../../lib/format.js'

const DARK_CHIP = {
  current: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
  expiring: 'border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#fde68a]',
  stale: 'border-red-400/35 bg-red-400/10 text-red-300',
  missing: 'border-red-400/30 bg-red-400/[0.07] text-red-300',
  unknown: 'border-white/20 bg-white/[0.06] text-white/70',
  not_tracked: 'border-white/12 bg-white/[0.04] text-white/50',
}

/** The glyph, read off props (the house workaround for the lint rule that flags a
 *  component resolved during render — same as IconAction / DomainGlyph). */
function StateGlyph(props) {
  const Icon = props.icon
  return <Icon size={props.size ?? 12} aria-hidden />
}

export default function CurrencyChip({
  state,
  /** yyyy-mm-dd the state hangs on. Rendered ONLY when `showDate` and non-null. */
  expiresOn = null,
  showDate = false,
  dark = false,
  size = 'md',
  /** Full sentence for the tooltip — always the server's `message`, never ours. */
  title = null,
  className = '',
}) {
  if (!state) return null
  const meta = currencyMeta(state)
  const cls = dark ? (DARK_CHIP[state] ?? DARK_CHIP.unknown) : meta.chip
  const small = size === 'sm'
  // A date is shown only when the engine computed one. `missing`, `not_tracked`
  // and `unknown` carry none by construction, so this branch simply never fires
  // for them — there is no placeholder date anywhere in this component.
  const date = showDate && expiresOn ? formatShortDate(String(expiresOn).slice(0, 10)) : null

  return (
    <span
      title={title || undefined}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border font-semibold ${
        small ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[12px]'
      } ${cls} ${className}`}
    >
      <StateGlyph icon={meta.icon} size={small ? 11 : 12} />
      <span className="truncate">{meta.label}</span>
      {date ? (
        <span className={`shrink-0 font-normal ${dark ? 'opacity-70' : 'opacity-75'}`}>{date}</span>
      ) : null}
    </span>
  )
}
