// ─────────────────────────────────────────────────────────────────────────────
// RubricPicker — the 1–4 self-score pips for one LEAF accreditation standard
// (Cognia "Insufficient → Impacting", MSA/NSBECS equivalents). Four amber pips;
// click sets the score (optimistic PATCH upstream), clicking the ACTIVE pip
// clears back to unscored (explicit-null clear per the API contract). Framework
// rubric labels ride on hover titles; `showLabel` also prints the active label
// (used in the expanded detail panel; the register row stays compact).
// Renders in BOTH themes: `dark` for the navy EvidencePanel, light for the table.
// Legacy RatingBadge is untouched — rating = accreditor lifecycle, rubric =
// self-score; both render side by side.
// ─────────────────────────────────────────────────────────────────────────────
const AMBER = '#F59E0B'
const SCORES = [1, 2, 3, 4]

export default function RubricPicker({
  value = null, // 1..4 | null (unscored)
  labels = null, // framework rubricLabels: array[4], index i = label for score i+1
  activeLabel: activeLabelProp = null, // server-resolved label for the CURRENT score
  onChange, // (nextScoreOrNull) => void
  disabled = false,
  dark = false,
  showLabel = false,
}) {
  // Prefer the server-resolved per-standard rubricLabel (correct even when the
  // row belongs to a different framework than the page-level labels array).
  const activeLabel =
    activeLabelProp ?? (value != null && labels?.[value - 1] ? labels[value - 1] : null)
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="radiogroup"
        aria-label="Self-assessed rubric score (1–4)"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${
          dark ? 'border-white/15 bg-white/5' : 'border-rule/60 bg-section'
        }`}
      >
        {SCORES.map((score) => {
          const filled = value != null && score <= value
          const isCurrent = value === score
          const name = labels?.[score - 1] ? `${score} — ${labels[score - 1]}` : `Score ${score}`
          const title = isCurrent ? `${name} (click to clear)` : name
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              aria-label={title}
              title={title}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation()
                onChange?.(isCurrent ? null : score)
              }}
              className={`h-3.5 w-3.5 rounded-full transition-transform ${
                disabled ? 'cursor-default' : 'hover:scale-125'
              }`}
              style={{
                backgroundColor: filled
                  ? AMBER
                  : dark
                    ? 'rgba(255,255,255,0.18)'
                    : 'rgba(31,61,114,0.14)',
                boxShadow: isCurrent ? '0 0 0 2.5px rgba(245,158,11,0.35)' : 'none',
              }}
            />
          )
        })}
      </span>
      {showLabel ? (
        <span
          className={`text-[12px] font-semibold ${
            activeLabel
              ? 'text-[#F59E0B]'
              : dark
                ? 'text-white/45'
                : 'text-muted/70'
          }`}
        >
          {activeLabel ?? 'Unscored'}
        </span>
      ) : null}
    </span>
  )
}
