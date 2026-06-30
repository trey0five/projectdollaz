// ─────────────────────────────────────────────────────────────
// Drill-down host: owns the open-drawer state, provides the lineage
// wiring to the statement cells, and renders the shared LineageDrawer.
//
// Wrap the four statement components in this once per render site
// (Dashboard live preview + ReportTabs read-only history). The `bundle`
// is the in-hand ReportBundle (live or snapshot) carrying `.lineage`;
// `imports` is the period's import summaries for the Source section
// (optional — null in the live intake preview, fetched in history).
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react'
import { LineageProvider } from '../../context/LineageContext.jsx'
import LineageDrawer from './LineageDrawer.jsx'

export default function LineageHost({ bundle, imports = null, children }) {
  const [selection, setSelection] = useState(null)
  const [open, setOpen] = useState(false)

  const onOpenLineage = useCallback((sel) => {
    setSelection(sel)
    setOpen(true)
  }, [])

  const onClose = useCallback(() => setOpen(false), [])

  return (
    <LineageProvider onOpenLineage={onOpenLineage} bundle={bundle} imports={imports}>
      {children}
      <LineageDrawer
        open={open}
        onClose={onClose}
        selection={selection}
        bundle={bundle}
        imports={imports}
      />
    </LineageProvider>
  )
}
