import { formatShortDate } from '../../../lib/format.js'

/**
 * AuroraSwitch — the segmented control that sits on the band (period / year /
 * view). Buttons with aria-pressed; the active one is white.
 *   options  [{ value, label, title? }]
 *   value    the active option's value
 *   onChange (value) => void
 *   label    aria-label for the group (e.g. "Period")
 */
export default function AuroraSwitch({ options = [], value, onChange, label = 'Choose', className = '' }) {
  if (!options.length) return null
  return (
    <div className={`au-switch${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="au-switch-btn"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * "FY26" / "FY '26" / "FY2026" → "FY 2026" — one spelling for a fiscal-year
 * label everywhere on the band. Anything else passes through unchanged.
 */
export function fyLabel(label) {
  const t = String(label ?? '').trim()
  const short = t.match(/^FY\s*'?(\d{2})$/i)
  if (short) return `FY 20${short[1]}`
  const long = t.match(/^FY\s*(\d{4})$/i)
  if (long) return `FY ${long[1]}`
  return label
}

/**
 * AuroraPeriodSwitch — AuroraSwitch over the school's SAVED periods, with the
 * same side effect as PeriodSelector (records the on-screen period so the
 * floating assistant scopes to it). With fewer than two periods there is
 * nothing to switch to, so it renders nothing (the eyebrow names the year).
 */
export function AuroraPeriodSwitch({ periods, activeId, onSelect, label = 'Period' }) {
  if (!periods || periods.length < 2) return null
  return (
    <AuroraSwitch
      label={label}
      value={activeId}
      options={periods.map((p) => ({ value: p.id, label: fyLabel(p.label), title: p.periodEndDate ? `Period end ${formatShortDate(p.periodEndDate)}` : undefined }))}
      onChange={(id) => {
        try {
          localStorage.setItem('finrep_active_period', id)
        } catch {
          /* ignore */
        }
        onSelect?.(id)
      }}
    />
  )
}
