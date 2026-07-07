// Audit trail / value-versioning — the SINGLE source of truth for a statement
// snapshot's provenance trigger. The DTO @IsIn (if any), the SnapshotHistoryService
// labels, the generate() prov param, and the Penny get_value_history tool ALL import
// from here so the enum + its labels can never drift (the @IsIn-drift lesson from the
// Penny apply tool). Pure TS: zero Nest, zero IO — safe to import from any module.

export type SnapshotTrigger =
  | 'manual'
  | 'upload'
  | 'quickbooks_sync'
  | 'scheduled_sync'
  | 'remap'

/** Every valid trigger, for @IsIn / runtime validation. */
export const SNAPSHOT_TRIGGERS: readonly SnapshotTrigger[] = [
  'manual',
  'upload',
  'quickbooks_sync',
  'scheduled_sync',
  'remap',
]

/** Human-facing labels — one place so every surface (drawer, Penny) reads alike. */
export const SNAPSHOT_TRIGGER_LABELS: Record<SnapshotTrigger, string> = {
  manual: 'Manual',
  upload: 'File upload',
  quickbooks_sync: 'QuickBooks sync',
  scheduled_sync: 'Scheduled sync',
  remap: 'Category remap',
}

/** Label for an unresolved/legacy row that correlation could not classify. */
export const UNKNOWN_TRIGGER_LABEL = 'Earlier version'

export function isSnapshotTrigger(v: unknown): v is SnapshotTrigger {
  return typeof v === 'string' && (SNAPSHOT_TRIGGERS as readonly string[]).includes(v)
}

/** Resolve a stored trigger (possibly null/legacy) to its display label. */
export function triggerLabel(trigger: SnapshotTrigger | 'unknown' | null | undefined): string {
  return trigger && trigger !== 'unknown' && isSnapshotTrigger(trigger)
    ? SNAPSHOT_TRIGGER_LABELS[trigger]
    : UNKNOWN_TRIGGER_LABEL
}
