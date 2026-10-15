// ─────────────────────────────────────────────────────────────────────────────
// verdict — the Aurora STATUS vocabulary in one place. A verdict is a state,
// never a module colour: Good / Watch / At risk, always shown as WORD + ICON +
// COLOUR (never colour alone). `neutral` is for a figure with no band — it
// carries no judgement word unless the caller supplies one (never invent a
// target to manufacture a verdict).
// ─────────────────────────────────────────────────────────────────────────────

export const VERDICT_LABEL = { good: 'Good', watch: 'Watch', risk: 'At risk' }

// Registry statuses + the tones the domain pages already use, folded onto the
// three verdicts. Anything unknown (incl. 'neutral', null) → null = no verdict.
const ALIASES = {
  good: 'good',
  strength: 'good',
  ok: 'good',
  watch: 'watch',
  warn: 'watch',
  warning: 'watch',
  risk: 'risk',
  bad: 'risk',
  critical: 'risk',
  danger: 'risk',
}

/** Map any status/tone token to 'good' | 'watch' | 'risk' | null. */
export function toVerdict(status) {
  if (status == null) return null
  return ALIASES[String(status).toLowerCase()] ?? null
}

const ORDER = { risk: 0, watch: 1, good: 2 }

/** Worst first: risk → watch → good → none. Stable for equal verdicts. */
export function byVerdict(a, b) {
  return (ORDER[toVerdict(a)] ?? 3) - (ORDER[toVerdict(b)] ?? 3)
}

/** "2 at risk · 1 watch · 1 good" from a list of statuses (empty parts dropped). */
export function verdictCountLabel(statuses) {
  const n = { risk: 0, watch: 0, good: 0 }
  for (const s of statuses ?? []) {
    const v = toVerdict(s)
    if (v) n[v] += 1
  }
  return [
    n.risk ? `${n.risk} at risk` : null,
    n.watch ? `${n.watch} watch` : null,
    n.good ? `${n.good} good` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
