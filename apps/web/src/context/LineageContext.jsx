// ─────────────────────────────────────────────────────────────
// Figure-to-source audit trail (drill-down) wiring.
//
// A thin context that lets every statement value cell open the shared
// LineageDrawer for the line it represents — WITHOUT prop-drilling the
// drawer callback / bundle / imports through the four statement
// components. The provider is rendered once per statement host
// (Dashboard live preview + ReportTabs read-only history) and owns the
// open-drawer state; the statements stay declarative and just call
// onOpenLineage({ statement, variant, lineKey, label, value }).
//
// `imports` is the period's import summaries (importsApi.listForPeriod)
// used for the drawer's "Source" section; it is OPTIONAL — the live
// intake preview has no persisted period yet, so the drawer degrades
// gracefully when imports is null/empty.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react'

const LineageContext = createContext(null)

export function LineageProvider({
  children,
  onOpenLineage,
  bundle,
  imports = null,
  schoolId = null,
  periodId = null,
}) {
  // No useMemo needed: the host passes stable callbacks/values and re-renders
  // are cheap. Consumers read individual fields, not the object identity.
  // schoolId/periodId let the drawer POST the QuickBooks transaction drill.
  return (
    <LineageContext.Provider value={{ onOpenLineage, bundle, imports, schoolId, periodId }}>
      {children}
    </LineageContext.Provider>
  )
}

/**
 * Returns the lineage wiring, or null when no provider is mounted (e.g. a
 * statement rendered outside the drill-down host). Callers MUST tolerate null
 * so the statements still render plain, non-clickable amounts.
 */
export function useLineage() {
  return useContext(LineageContext)
}
