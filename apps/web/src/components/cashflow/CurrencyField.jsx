// ─────────────────────────────────────────────────────────────────────────────
// CurrencyField — the premium money input for the cash-forecast page.
//
// FORMATTING ONLY, NEVER MATH: the component displays live thousands separators
// ($ glyph, 1,234,567, tabular numerals) while reporting the RAW numeric string
// ("1234567" / "1234.56") through onChange — callers keep doing Number(raw) and
// no money arithmetic ever happens here. Caret discipline: on every keystroke we
// count the significant characters (digits + the decimal point) left of the
// caret in what the user typed, then restore the caret after that many
// significant characters in the re-formatted string — stable through commas
// appearing and disappearing, and paste just works because it is the same path.
//
// Variants: `dark` (the navy hero — white figures on a frosted well, finance-blue
// focus glow) and `light` (white surfaces / the record modal). Sizes sm|md|lg
// (lg is the hero's display size). Focus animates a ring + soft glow + a whisper
// of scale; reduced-motion collapses all of it to a plain focus ring. An
// empty-after-touch field shows a subtle danger ring — invalid is visible, never
// silently ignored.
// ─────────────────────────────────────────────────────────────────────────────
import { useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

// Keep digits and the FIRST decimal point only.
const stripRaw = (s) => {
  let raw = String(s ?? '').replace(/[^0-9.]/g, '')
  const dot = raw.indexOf('.')
  if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '')
  return raw
}

export const formatCurrencyDisplay = (value) => {
  const raw = stripRaw(value)
  if (!raw) return ''
  const [int, dec] = raw.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec != null ? `${grouped}.${dec}` : grouped
}

const SIZES = {
  sm: { input: 'py-2 pl-7 pr-3 text-[14px]', glyph: 'left-2.5 text-[12.5px]' },
  md: { input: 'py-2.5 pl-8 pr-3.5 text-[15px]', glyph: 'left-3 text-[13.5px]' },
  lg: { input: 'py-2.5 pl-9 pr-3.5 text-[21px] font-semibold', glyph: 'left-3 text-[16px]' },
}

export default function CurrencyField({
  value, // raw numeric string ('' | '1234567' | '1234.56')
  onChange, // (raw) => void — receives the RAW string, never the display
  variant = 'light', // 'light' | 'dark'
  size = 'md', // 'sm' | 'md' | 'lg'
  placeholder = '125,000',
  className = '', // width / margin from the caller
  id,
  'aria-label': ariaLabel,
  autoFocus = false,
  disabled = false,
}) {
  const reduce = useReducedMotion()
  const dark = variant === 'dark'
  const sz = SIZES[size] ?? SIZES.md
  const inputRef = useRef(null)
  // Significant chars left of the caret in the user's LAST keystroke — consumed
  // once by the layout effect below to re-place the caret after formatting.
  const caretSigRef = useRef(null)
  const [touched, setTouched] = useState(false)

  const display = formatCurrencyDisplay(value)
  const invalid = touched && display === ''

  const handleChange = (e) => {
    const el = e.target
    const at = el.selectionStart ?? el.value.length
    caretSigRef.current = stripRaw(el.value.slice(0, at)).length
    onChange(stripRaw(el.value))
  }

  useLayoutEffect(() => {
    if (caretSigRef.current == null) return
    const target = caretSigRef.current
    caretSigRef.current = null
    const el = inputRef.current
    if (!el || document.activeElement !== el) return
    let pos = 0
    let seen = 0
    while (pos < display.length && seen < target) {
      if (/[0-9.]/.test(display[pos])) seen += 1
      pos += 1
    }
    el.setSelectionRange(pos, pos)
  }, [display])

  const wrapper = dark
    ? `group relative rounded-xl border-2 bg-white/10 transition-all duration-200 ${
        invalid
          ? 'border-red-400/60 shadow-[0_0_0_3px_rgba(248,113,113,0.16)]'
          : 'border-white/15 focus-within:border-[#60A5FA]/70 focus-within:bg-white/[0.13] focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.25),0_0_20px_-4px_rgba(59,130,246,0.5)]'
      }`
    : `group relative rounded-xl border-2 bg-white transition-all duration-200 ${
        invalid
          ? 'border-red-400/70 shadow-[0_0_0_3px_rgba(248,113,113,0.14)]'
          : 'border-rule/80 focus-within:border-[#2563EB]/70 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.14),0_0_18px_-6px_rgba(37,99,235,0.45)]'
      }`

  return (
    <div className={`${wrapper} ${reduce ? '' : 'focus-within:scale-[1.015]'} ${className}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 font-semibold transition-colors duration-200 ${sz.glyph} ${
          dark
            ? 'text-white/45 group-focus-within:text-[#93C5FD]'
            : 'text-muted/60 group-focus-within:text-[#2563EB]'
        }`}
      >
        $
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        value={display}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        className={`w-full rounded-[inherit] bg-transparent tabular-nums outline-none ${sz.input} ${
          dark ? 'text-white placeholder-white/35' : 'text-navy placeholder-muted/50'
        } disabled:opacity-50`}
      />
    </div>
  )
}
