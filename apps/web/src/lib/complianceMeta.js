// ─────────────────────────────────────────────────────────────────────────────
// Review Readiness UI metadata (Phase 2A). Maps the 5 compliance finding statuses
// onto the existing health palette (good/watch/risk/neutral) with ZERO new colors
// — it defers to statusMeta() from metricMeta.js for the actual class bundle.
// needs_data and manual both map to neutral; they are distinguished by label + icon.
// ─────────────────────────────────────────────────────────────────────────────
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  FileSearch,
  MinusCircle,
} from 'lucide-react'
import { statusMeta } from './metricMeta.js'

// status -> { palette (health token), label, Icon }.
const COMPLIANCE_STATUS = {
  pass: { palette: 'good', label: 'Pass', Icon: CheckCircle2 },
  reportable: { palette: 'watch', label: 'Reportable', Icon: AlertTriangle },
  material: { palette: 'risk', label: 'Material', Icon: ShieldAlert },
  needs_data: { palette: 'neutral', label: 'Needs data', Icon: HelpCircle },
  manual: { palette: 'neutral', label: 'Manual / CPA', Icon: FileSearch },
  not_applicable: { palette: 'neutral', label: 'N/A', Icon: MinusCircle },
  // Prudential warning (red_flags) — not an AUP exception; watch palette.
  watch: { palette: 'watch', label: 'Watch', Icon: AlertTriangle },
}

/** Resolve a finding status -> { palette, label, Icon, meta }. meta is the health token bundle. */
export function complianceStatusMeta(status) {
  const base = COMPLIANCE_STATUS[status] ?? COMPLIANCE_STATUS.needs_data
  return { ...base, meta: statusMeta(base.palette) }
}

// Human section titles (mirror the AUP's six sections + the eligibility gate).
export const SECTION_TITLES = {
  I: 'School Eligibility',
  II: 'Accounting System',
  III: 'Financial Controls',
  IV: 'Deposit & Classification',
  V: 'Education-Related Expenses',
  VI: 'Tuition, Operating Term & Attendance',
  ELIGIBILITY: 'Eligibility Gate',
}

export function sectionTitle(section) {
  return SECTION_TITLES[section] ?? section
}

// Rule "kind" chip labels.
export const KIND_LABELS = {
  auto: 'Auto',
  intake: 'Intake',
  checklist: 'Checklist',
}

// The three program tiers (single source for the selector + intake form).
export const PROGRAM_OPTIONS = [
  { value: 'FTC', label: 'FTC' },
  { value: 'FES_EO', label: 'FES-EO' },
  { value: 'FES_UA', label: 'FES-UA' },
]

export function programLabel(value) {
  return PROGRAM_OPTIONS.find((p) => p.value === value)?.label ?? value
}
