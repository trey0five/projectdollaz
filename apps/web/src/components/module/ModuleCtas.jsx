// ─────────────────────────────────────────────────────────────────────────────
// ModuleCtas — the on-page twins of the sidebar's module sections: "Add data"
// (primary) and "Records" (secondary). Both are plain relative links to the
// `?tab=` URL model ModuleTabs already reads, so they need no state, deep-link
// cleanly, and keep the sidebar's active row in sync.
//
// PREMIUM UI P2: they wear the flat `Button` primitive (36px, radius 6, no
// bevel / sheen / uppercase) so every module header's actions sit on the
// hairline in one voice. Primary stays the action blue; inside ModuleAccent
// the module hue reaches only the 2px rule, never a button fill.
//
// RecordsCta renders NOTHING for a module with no records tab (hr, planning) —
// never offer a destination that doesn't exist. Callers pass the module key.
// ─────────────────────────────────────────────────────────────────────────────
import { CloudUpload, Table2 } from 'lucide-react'
import { Button } from '../ui/surface/index.js'
import { moduleTabs, moduleTabLabel } from './moduleAnatomy.js'

export function AddDataCta({ label = 'Add data', className = '' }) {
  return (
    <Button to="?tab=add" variant="primary" icon={<CloudUpload size={15} />} className={className}>
      {label}
    </Button>
  )
}

/** Secondary sibling. The default label resolves through moduleTabLabel so
 *  per-module renames (finance's records tab reads "Workspaces") stay in
 *  lockstep with the sidebar. */
export function RecordsCta({ module, label = null, className = '' }) {
  if (module && !moduleTabs(module).includes('records')) return null
  return (
    <Button to="?tab=records" variant="secondary" icon={<Table2 size={15} />} className={className}>
      {label ?? moduleTabLabel(module, 'records')}
    </Button>
  )
}

export default AddDataCta
