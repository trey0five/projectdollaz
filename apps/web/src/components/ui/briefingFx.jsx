// ─────────────────────────────────────────────────────────────────────────────
// briefingFx — small dynamic touches shared by the briefing surfaces
// (HomeBriefing + OrgBriefing):
//   CountUp        an integer that counts up on mount (rAF, ease-out)
//   WhyText        prose with every FIGURE ($300,000 · 86.6% · 43) set in gold
//   titleProgress  pulls "NN%" out of a checklist-style title for a progress bar
// All respect prefers-reduced-motion (CountUp renders the final value).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/** An integer that counts up 0 → value on mount (ease-out cubic). The effect is
 *  idempotent — it (re)runs the count whenever the target changes and cancels
 *  cleanly, so StrictMode's double-effect can't strand it at 0. */
export function CountUp({ value, duration = 700, className }) {
  const reduce = useReducedMotion()
  const target = Number(value) || 0
  const [n, setN] = useState(0)
  useEffect(() => {
    if (reduce || target === 0) return undefined
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setN(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, target, duration])
  return (
    <span className={`tabular-nums ${className ?? ''}`}>{reduce ? target : n}</span>
  )
}

// Figures worth popping: $1,234.56 · 86.6% · 1,234 · 43 (word-bounded).
const FIGURE_RE = /(\$[\d,]+(?:\.\d+)?|\d[\d,]*(?:\.\d+)?%|\b\d[\d,]*(?:\.\d+)?\b)/g

// Figure colour per surface tone. Light surfaces (the triage cards) use the deep
// gold that reads on cream/white; the `dark` tone is for the navy narration hero,
// where a lighter, glowing gold pops against the deep-navy glass. Same FIGURE_RE —
// only the highlight colour changes (additive tone, not a second grammar).
const FIGURE_TONE = {
  light: 'font-semibold tabular-nums text-[#7a5e00]',
  dark: 'font-semibold tabular-nums text-gold-light drop-shadow-[0_0_10px_rgba(212,180,122,0.45)]',
}

/** The item's "why" prose with every figure set in semibold gold, so the numbers
 *  read at a glance instead of drowning in the sentence. `tone` picks the highlight
 *  colour for the surface: 'light' (default, cream/white cards) or 'dark' (the navy
 *  narration hero). */
export function WhyText({ text, tone = 'light' }) {
  if (!text) return null
  const parts = String(text).split(FIGURE_RE)
  const figureClass = FIGURE_TONE[tone] ?? FIGURE_TONE.light
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={figureClass}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** "Year-end checklist 85% complete" → 85 (else null) — drives an in-card bar. */
export function titleProgress(title) {
  const m = /(\d{1,3})%\s+complete/i.exec(title || '')
  if (!m) return null
  const pct = Number(m[1])
  return pct >= 0 && pct <= 100 ? pct : null
}
