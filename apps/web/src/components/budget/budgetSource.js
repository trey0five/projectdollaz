// ─────────────────────────────────────────────────────────────────────────────
// describeBudgetSource — classify how the ONE budget record for a (school,period)
// was filled, so the UI can show a friendly "source" badge and the wizard can
// warn before an overwrite. Pure (no React), shared by BudgetSummary and (via the
// shell) MonthlySpreadGrid's header.
//
// ORDERING IS LOAD-BEARING. A driver-model apply writes BOTH lines.driverModel
// AND lines.spread (format:'driver'), so driverModel MUST be checked first — else
// a driver budget would mis-read as an import/manual. The import allow-list is
// only the real imported formats (diocesan|generic); a format:'driver' spread is
// never treated as an import.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ lines?: any } | null | undefined} budget
 * @returns {{ kind: 'driver'|'import'|'manual'|'none', label: string, fileName?: string }}
 */
export function describeBudgetSource(budget) {
  const lines = budget?.lines
  if (!lines) return { kind: 'none', label: 'No budget yet' }

  // The spread's FORMAT is the authoritative record of what the LIVE budget is —
  // it's rewritten on every apply/import (buildDriverSpread writes 'driver';
  // imports write 'diocesan'|'generic'). lines.driverModel can LINGER after an
  // import-over-driver (we preserve the assumptions so the user can re-edit), so
  // it must NOT be the primary signal — that would mislabel an imported budget.
  const fmt = lines.spread?.format
  if (fmt === 'driver') {
    return { kind: 'driver', label: 'Built with the guided setup' }
  }
  if (fmt === 'diocesan' || fmt === 'generic') {
    const fileName = lines.spread?.fileName
    return fileName
      ? { kind: 'import', label: 'Imported spreadsheet', fileName }
      : { kind: 'import', label: 'Imported spreadsheet' }
  }

  // No spread on the record: a driver budget without a spread (rare) → driver;
  // otherwise a manual category budget.
  if (lines.driverModel) {
    return { kind: 'driver', label: 'Built with the guided setup' }
  }
  if (lines.revenue || lines.expense) {
    return { kind: 'manual', label: 'Built manually' }
  }
  return { kind: 'none', label: 'No budget yet' }
}
