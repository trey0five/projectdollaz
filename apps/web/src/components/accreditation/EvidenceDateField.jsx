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
// On-theme DatePicker, never a native <input type="date"> (house rule). Light only
// (Premium UI P4, a2): the evidence drawer it lives in is light now, so the navy
// variant is gone; the field is the drawer's compact plain field.
// ─────────────────────────────────────────────────────────────────────────────
import { useId } from 'react'
import { CalendarRange } from 'lucide-react'
import DatePicker from '../ui/DatePicker.jsx'
import { EFFECTIVE_DATE_HELP, EFFECTIVE_DATE_LABEL } from './evidenceMeta.js'
import '../../styles/pending/a2-carry.css'

export default function EvidenceDateField({
  /** ISO 'yyyy-mm-dd' or '' — the drop-in DatePicker contract. */
  value = '',
  onChange,
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
        className="a2-label mb-1 flex items-center gap-1.5"
      >
        <CalendarRange size={13} aria-hidden />
        {EFFECTIVE_DATE_LABEL}
      </label>
      <DatePicker
        id={id}
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        aria-label={EFFECTIVE_DATE_LABEL}
        placeholder="Leave blank if unsure"
        className="a2-field"
      />
      {showHelp ? (
        <p className="mt-1 text-[12px] leading-relaxed text-ink2">
          {EFFECTIVE_DATE_HELP}
        </p>
      ) : null}
    </div>
  )
}
