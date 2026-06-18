// ─────────────────────────────────────────────────────────────
// Versioned ruleset descriptor(s) for the Florida scholarship AUP.
//
// Citations are pinned to a STATUTE YEAR because subsection letters shifted after
// the 2023 FES consolidation (HB 1 / Ch. 2023-16, eff. July 1 2023). A future
// ruleset (e.g. '2026.1') can be added to RULESETS WITHOUT editing the 2025.1
// rules — the registry/evaluate layer reads the active descriptor's metadata only.
// ─────────────────────────────────────────────────────────────
import type { RulesetDescriptor } from './types.js'

/** The active FL scholarship AUP ruleset (statute year 2024, programs FTC/FES-EO/FES-UA). */
export const FL_SCHOLARSHIP_AUP: RulesetDescriptor = {
  id: 'fl-scholarship-aup',
  version: '2025.1',
  statuteYear: 2024,
  label: 'Florida Scholarship AUP — Readiness Pre-Flag',
  programs: ['FTC', 'FES_EO', 'FES_UA'],
}

/**
 * Registry of rulesets keyed by version. Add a new version here; the existing
 * descriptors stay frozen so historical evaluations remain reproducible.
 */
export const RULESETS: Record<string, RulesetDescriptor> = {
  [FL_SCHOLARSHIP_AUP.version]: FL_SCHOLARSHIP_AUP,
}
