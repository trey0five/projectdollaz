// Shared rule helpers. NEVER-THROW contract lives here: `has()` treats both
// undefined and null as "not entered" so a rule returns needs_data rather than a
// false pass/fail. No clock, no random, no mutation.
import type { Program } from '../types.js'

/** True only when a value was actually entered (not undefined, not null). */
export function has<T>(v: T | null | undefined): v is T {
  return v !== undefined && v !== null
}

/** Whether the resolved program list includes a given tier. */
export function hasProgram(programs: Program[], tier: Program): boolean {
  return programs.includes(tier)
}

/**
 * Format a number as USD with no decimals. Pure string math (no toLocaleString)
 * so output is byte-identical on ANY Node/ICU build — minimal-ICU runtimes can
 * silently ignore a pinned locale, which would otherwise be a determinism edge.
 */
export function usd(n: number): string {
  // Round-half-up on the absolute value, then group integer digits in threes.
  const rounded = Math.round(Math.abs(n))
  const neg = n < 0 && rounded > 0 // avoid a "-$0" when a tiny negative rounds to 0
  const whole = rounded.toString()
  let grouped = ''
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ','
    grouped += whole[i]
  }
  return `${neg ? '-' : ''}$${grouped}`
}
