import { motion, useReducedMotion } from 'framer-motion'
import { PROGRAM_OPTIONS } from '../../lib/complianceMeta.js'

/**
 * FTC / FES-EO / FES-UA program-tier pills. Multi-select (programs is an array).
 * Selected -> the good-chip palette; unselected -> neutral section. When read-only
 * (no onChange) the pills render as static status, pointing the user to the intake
 * form (the canonical source of `programs`).
 */
export default function TierSelector({ selected = [], onChange, disabled = false, size = 'md' }) {
  const reduce = useReducedMotion()
  const readOnly = !onChange || disabled
  const pad = size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-4 py-1.5 text-[12px]'

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
          <motion.button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            disabled={readOnly}
            whileTap={reduce || readOnly ? undefined : { scale: 0.97 }}
            aria-pressed={active}
            className={`rounded-full border font-semibold uppercase tracking-[0.08em] transition-all ${pad} ${
              active
                ? 'border-gold bg-gold text-white shadow-[0_3px_12px_-3px_rgba(184,150,80,0.65)]'
                : 'border-border bg-section text-muted'
            } ${readOnly ? 'cursor-default' : 'hover:border-gold/50'}`}
          >
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}
