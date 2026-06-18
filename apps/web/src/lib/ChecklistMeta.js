// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — Year-End checklist UI metadata. Maps the 3 checklist item statuses
// onto the existing health palette (good/neutral) with ZERO new colors — defers to
// statusMeta() from metricMeta.js for the class bundle. Kind labels mirror the AUP
// procedure/document split. Section titles defer to complianceMeta's sectionTitle
// (with a DOCUMENTS fallback).
// ─────────────────────────────────────────────────────────────────────────────
import { Circle, CheckCircle2, MinusCircle } from 'lucide-react'
import { statusMeta } from './metricMeta.js'
import { sectionTitle } from './complianceMeta.js'

// status -> { palette (health token), label, Icon }.
const CHECKLIST_STATUS = {
  pending: { palette: 'neutral', label: 'Pending', Icon: Circle },
  done: { palette: 'good', label: 'Done', Icon: CheckCircle2 },
  na: { palette: 'neutral', label: 'N/A', Icon: MinusCircle },
}

/** The 3 status options, in order, for the selector. */
export const CHECKLIST_STATUS_OPTIONS = [
  { value: 'pending', ...CHECKLIST_STATUS.pending },
  { value: 'done', ...CHECKLIST_STATUS.done },
  { value: 'na', ...CHECKLIST_STATUS.na },
]

/** Resolve a checklist status -> { palette, label, Icon, meta } (meta = health token bundle). */
export function checklistStatusMeta(status) {
  const base = CHECKLIST_STATUS[status] ?? CHECKLIST_STATUS.pending
  return { ...base, meta: statusMeta(base.palette) }
}

/** Item kind chip labels. */
export const KIND_LABELS = {
  procedure: 'Procedure',
  document: 'Document',
}

/** A checklist group title: the DOCUMENTS bucket gets a friendly label; the rest
 *  reuse the AUP section title with a leading section letter. */
export function checklistGroupTitle(section, fallbackTitle) {
  if (section === 'DOCUMENTS') return fallbackTitle || 'Documents to Gather'
  return `${section} · ${sectionTitle(section)}`
}
