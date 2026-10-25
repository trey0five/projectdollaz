// The HTTP contract of /schools/:schoolId/finance/* (the web reads exactly these
// shapes) plus the pure builders shared by the inventory read and the
// removal/restore service.
import type { DataRemoval } from '@finrep/db'
import {
  RESTORE_DAYS,
  ymd,
  type BudgetKind,
  type FileHalf,
  type FileSource,
  type Person,
  type RemovalKind,
} from './finance-files.constants.js'
import type { ComparisonKind } from './removal-impact.js'

export type Role = 'cy' | 'py' | 'audit'

export interface TbItem {
  role: Role
  /** The ACTIVE (newest createdAt) version. */
  importId: string
  sourceName: string
  source: FileSource
  rowCount: number
  uploadedAt: string
  uploadedBy: Person | null
  half: FileHalf
  /** Rows in the (period, role) stack. */
  versions: number
  /** An older half hidden under the active one (e.g. a P&L under a Balance Sheet). */
  hiddenHalf: { half: 'pl' | 'bs'; sourceName: string; uploadedAt: string } | null
}

export interface OnFileYear {
  periodId: string
  label: string
  shortLabel: string
  periodEndDate: string
  periodType: string
  hasStatements: boolean
  hasBoardReport: boolean
  trialBalances: TbItem[]
  monthly: {
    count: number
    total: 12
    months: { monthKey: string; sourceName: string; uploadedAt: string }[]
  } | null
  budget: {
    kind: BudgetKind
    hasForecast: boolean
    updatedAt: string
    updatedBy: Person | null
  } | null
}

export interface RemovalConflict {
  sourceName: string | null
  uploadedAt: string | null
  monthKeys: string[]
}

export interface RemovedEntry {
  id: string
  kind: RemovalKind
  periodId: string
  periodLabel: string
  shortLabel: string
  periodEndDate: string
  role: Role | null
  monthKeys: string[]
  files: { sourceName: string; uploadedAt: string; half: FileHalf }[]
  budgetKind: BudgetKind | null
  removedAt: string
  removedBy: Person | null
  expiresAt: string
  conflict: RemovalConflict | null
}

export interface OnFileResponse {
  restoreDays: typeof RESTORE_DAYS
  years: OnFileYear[]
  recentlyRemoved: RemovedEntry[]
}

export interface PreviewFile {
  importId: string
  sourceName: string
  uploadedAt: string
  half: FileHalf
  source: FileSource
  active: boolean
}

export interface PeriodRef {
  periodId: string
  shortLabel: string
}

export interface RemovalPreview {
  kind: RemovalKind
  periodId: string
  periodLabel: string
  shortLabel: string
  periodEndDate: string
  role: Role | null
  activeImportId: string | null
  files: PreviewFile[]
  monthKeys: string[]
  monthsOnFile: number
  budget: { kind: BudgetKind; hasForecast: boolean } | null
  effects: {
    statements: 'emptied' | 'rebuilt' | 'none'
    boardReport: boolean
    budgetVsActual: boolean
    quickbooks: boolean
    self: { comparison: ComparisonKind; after: PeriodRef | null } | null
    laterYears: { periodId: string; shortLabel: string; comparison: ComparisonKind; after: PeriodRef | null }[]
  }
  restoreDays: typeof RESTORE_DAYS
}

export interface ChangeEffects {
  statements: 'cleared' | 'rebuilt' | 'unchanged' | 'none'
  rebuilt: PeriodRef[]
  failed: PeriodRef[]
}

export interface RemovalResult {
  removal: RemovedEntry
  effects: ChangeEffects
}

export interface RestoreResult {
  restored: RemovedEntry
  replaced: RemovedEntry | null
  effects: ChangeEffects
}

/** What a removal header's `summary` JSON holds (written at removal time). */
export interface RemovalSummary {
  periodLabel: string
  shortLabel: string
  periodEndDate: string
  periodType: string
  files: PreviewFile[]
  snapshotCount: number
  months: { monthKey: string; sourceName: string; uploadedAt: string }[]
  budget: { kind: BudgetKind; hasForecast: boolean; updatedAt: string } | null
}

type HeaderLike = Pick<
  DataRemoval,
  'id' | 'kind' | 'fiscalPeriodId' | 'role' | 'monthKeys' | 'summary' | 'removedAt' | 'expiresAt'
>

/** A removal header (+ who removed it) as the public Recently-removed entry. */
export function toRemovedEntry(
  header: HeaderLike,
  removedBy: Person | null,
  conflict: RemovalConflict | null = null,
): RemovedEntry {
  const s = (header.summary ?? {}) as Partial<RemovalSummary>
  return {
    id: header.id,
    kind: header.kind as RemovalKind,
    periodId: header.fiscalPeriodId,
    periodLabel: s.periodLabel ?? '',
    shortLabel: s.shortLabel ?? s.periodLabel ?? '',
    periodEndDate: s.periodEndDate ?? '',
    role: (header.role as Role | null) ?? null,
    monthKeys: [...(header.monthKeys ?? [])].sort(),
    files: (s.files ?? []).map((f) => ({ sourceName: f.sourceName, uploadedAt: f.uploadedAt, half: f.half ?? null })),
    budgetKind: s.budget?.kind ?? null,
    removedAt: header.removedAt.toISOString(),
    removedBy,
    expiresAt: header.expiresAt.toISOString(),
    conflict,
  }
}

/** The period fields every summary/preview repeats. */
export function periodFields(p: { label: string; periodEndDate: Date; periodType: string }, shortLabel: string) {
  return {
    periodLabel: p.label,
    shortLabel,
    periodEndDate: ymd(p.periodEndDate),
    periodType: p.periodType,
  }
}

// ── "The slot is filled now" — shared by the Recently-removed list and restore.

/** TB: the current ACTIVE import of the (period, role) stack (newest first in). */
export function tbConflict(stackNewestFirst: { sourceName: string; createdAt: Date }[]): RemovalConflict | null {
  const top = stackNewestFirst[0]
  return top ? { sourceName: top.sourceName, uploadedAt: top.createdAt.toISOString(), monthKeys: [] } : null
}

/** Monthly: which of the removed months exist again now (the newest one names it). */
export function monthsConflict(
  monthKeys: string[],
  existing: { monthKey: string; sourceName: string; updatedAt: Date }[],
): RemovalConflict | null {
  const wanted = new Set(monthKeys)
  const hits = existing.filter((m) => wanted.has(m.monthKey))
  if (hits.length === 0) return null
  const newest = [...hits].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]!
  return {
    sourceName: newest.sourceName,
    uploadedAt: newest.updatedAt.toISOString(),
    monthKeys: hits.map((m) => m.monthKey).sort(),
  }
}

/** Budget: a present budget exists for the year now. */
export function budgetConflict(present: { updatedAt: Date } | null): RemovalConflict | null {
  return present ? { sourceName: null, uploadedAt: present.updatedAt.toISOString(), monthKeys: [] } : null
}
