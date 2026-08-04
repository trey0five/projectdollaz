// ─────────────────────────────────────────────────────────────────────────────
// ModuleCtas — the on-page twins of the sidebar's module sections: "Add data"
// (primary, 3D btn-cta) and "Records" (secondary, hue-tinted). Both are plain
// relative links to the `?tab=` URL model ModuleTabs already reads, so they need
// no state, deep-link cleanly, and keep the sidebar's active row in sync.
//
// RecordsCta renders NOTHING for a module with no records tab (hr, planning) —
// never offer a destination that doesn't exist. Callers pass the module key.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { CloudUpload, Table2 } from 'lucide-react'
import { moduleTabs, moduleTabLabel } from './moduleAnatomy.js'

const BASE =
  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40'

export function AddDataCta({ label = 'Add data', className = '' }) {
  return (
    <Link to="?tab=add" className={`${BASE} btn-cta ${className}`}>
      <CloudUpload size={16} />
      {label}
    </Link>
  )
}

/** Secondary sibling: a hue-tinted outline pill (module accent via --c-module).
 *  The default label resolves through moduleTabLabel so per-module renames
 *  (finance's records tab reads "Workspaces") stay in lockstep with the sidebar. */
export function RecordsCta({ module, label = null, className = '' }) {
  if (module && !moduleTabs(module).includes('records')) return null
  return (
    <Link to="?tab=records" className={`${BASE} module-cta-ghost ${className}`}>
      <Table2 size={16} />
      {label ?? moduleTabLabel(module, 'records')}
    </Link>
  )
}

export default AddDataCta
