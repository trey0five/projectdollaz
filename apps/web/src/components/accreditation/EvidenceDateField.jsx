// ─────────────────────────────────────────────────────────────────────────────
// EvidenceDateField — Phase C: THE ONE FIELD WE ASK FOR.
//
// "Which period does this cover?"
//
// Everything else about an artifact's currency is derived: a policy's cycle lives
// in Governance, a plan's term lives in Strategy, a budget's year lives on its
// fiscal period. The only fact KYRO cannot derive, and will not guess, is which
// period an UPLOADED document actually covers. `createdAt` is when the file
// arrived. `capturedAt` is when we captured it. Neither is a document date, and
// reading either as one is the exact guess this phase exists to ban — so we ask,
// once, in one field, and we make leaving it blank an explicitly safe answer.
//
// That is what the helper line is for. A required date field would be answered
// with a plausible-looking guess, and a guessed date is worse than no date: it
// produces a confident "Current" nobody can defend. Blank produces "Date unknown",
// which is excluded from the health denominator entirely — the school reaches no
// number and one honest sentence, never a flattering one.
//
// On-theme DatePicker, never a native <input type="date"> (house rule). Renders on
// the dark evidence panel by default, which is where it is asked at attach time;
// `dark={false}` gives the light-surface variant for any light host.
// ─────────────────────────────────────────────────────────────────────────────
import { useId } from 'react'
import { CalendarRange } from 'lucide-react'
import DatePicker from '../ui/DatePicker.jsx'
import { EFFECTIVE_DATE_HELP, EFFECTIVE_DATE_LABEL } from './evidenceMeta.js'

const DARK_INPUT =
  'w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-[#F59E0B]/60'
const LIGHT_INPUT =
  'w-full rounded-lg border border-rule/70 bg-white px-3 py-1.5 text-[13px] text-navy outline-none focus:border-[#F59E0B]/60'

export default function EvidenceDateField({
  /** ISO 'yyyy-mm-dd' or '' — the drop-in DatePicker contract. */
  value = '',
  onChange,
  dark = true,
  disabled = false,
  /** Hide the helper line where space is tight (the label still carries it via title). */
  showHelp = true,
  className = '',
}) {
  const id = useId()
  return (
    <div className={className}>
      <label
        htmlFor={id}
        title={EFFECTIVE_DATE_HELP}
        className={`mb-1 flex items-center gap-1.5 text-[12px] font-semibold ${
          dark ? 'text-white/70' : 'text-navy'
        }`}
      >
        <CalendarRange size={13} aria-hidden className={dark ? 'text-[#fde68a]' : 'text-[#F59E0B]'} />
        {EFFECTIVE_DATE_LABEL}
      </label>
      <DatePicker
        id={id}
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        aria-label={EFFECTIVE_DATE_LABEL}
        placeholder="Leave blank if unsure"
        className={dark ? DARK_INPUT : LIGHT_INPUT}
      />
      {showHelp ? (
        <p
          className={`mt-1 text-[11.5px] leading-relaxed ${dark ? 'text-white/45' : 'text-muted'}`}
        >
          {EFFECTIVE_DATE_HELP}
        </p>
      ) : null}
    </div>
  )
}
