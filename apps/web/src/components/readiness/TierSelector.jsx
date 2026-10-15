import '../../styles/pending/b2-finance.css'
import { PROGRAM_OPTIONS } from '../../lib/complianceMeta.js'

/**
 * FTC / FES-EO / FES-UA program-tier pills. Multi-select (programs is an array).
 * Selected -> the primary chip (b2-chip aria-pressed); unselected -> hairline. When read-only
 * (no onChange) the pills render as static status, pointing the user to the intake
 * form (the canonical source of `programs`).
 */
export default function TierSelector({ selected = [], onChange, disabled = false, size = 'md' }) {
  const readOnly = !onChange || disabled
  const pad = size === 'sm' ? '!min-h-[28px] !py-1 !text-[12px]' : ''

  const toggle = (value) => {
    if (readOnly) return
    const set = new Set(selected)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    // keep canonical order
    onChange(PROGRAM_OPTIONS.map((p) => p.value).filter((v) => set.has(v)))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PROGRAM_OPTIONS.map(({ value, label }) => {
        const active = selected.includes(value)
        return (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            disabled={readOnly}
            aria-pressed={active}
            className={`b2-chip ${pad} ${readOnly ? '!cursor-default !opacity-100' : ''}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
