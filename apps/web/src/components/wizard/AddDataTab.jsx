// ─────────────────────────────────────────────────────────────────────────────
// AddDataTab — THE FROZEN SEAM. ENG-C1 mounts this as each module's "Add data"
// tab: `<AddDataTab module="finance" />`. It looks up the module's wizardConfig
// and renders the reusable AddDataWizard.
//
// Contract:
//   • Props: { module } REQUIRED; optional { schoolId, periodId, canEdit, onDone }.
//     When school/period/canEdit are omitted it derives them from context, mirroring
//     DataHubPage's period-derivation VERBATIM (incl. the school-swap race guard).
//   • Reads ?add=<optionKey> for the initial option (read-only; never mutates ?tab).
//   • MUST NOT navigate. On a successful save it calls onDone?.() then dispatches
//     the existing `penny:data-changed` refresh event.
//   • Unconfigured module → own empty-teach state, never crash.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import AddDataWizard from './AddDataWizard.jsx'
import { wizardConfigFor, wizardModuleLabel } from './wizardConfigs.jsx'

export default function AddDataTab({
  module,
  schoolId: schoolIdProp,
  periodId: periodIdProp,
  canEdit: canEditProp,
  onDone,
}) {
  const { activeSchool } = useSchools()
  const { periods, hydratedFiles, activePeriod, hydrationToken } = usePersistence()

  const schoolId = schoolIdProp ?? activeSchool?.id ?? null
  const canEdit =
    canEditProp ??
    (activeSchool?.role === 'owner' || activeSchool?.role === 'accountant')

  // ── Period derivation (mirrors DataHubPage VERBATIM incl. school-swap race) ──
  // Default to the live/active period, validated against the CURRENT school's
  // loaded periods so a stale cross-tenant id during a school swap can't stick.
  const defaultPeriodId =
    ((periods || []).some((p) => p.id === activePeriod?.id) ? activePeriod?.id : null) ??
    (periods || []).find((p) => p.hasSnapshot)?.id ??
    (periods || [])[0]?.id ??
    null

  const [derivedPeriodId, setDerivedPeriodId] = useState(null)
  const [lastSchoolId, setLastSchoolId] = useState(schoolId)
  if (schoolId !== lastSchoolId) {
    setLastSchoolId(schoolId)
    setDerivedPeriodId(null)
  }
  const periodValidForSchool =
    derivedPeriodId != null && (periods || []).some((p) => p.id === derivedPeriodId)
  if (defaultPeriodId && !periodValidForSchool) {
    setDerivedPeriodId(defaultPeriodId)
  }

  const periodId = periodIdProp ?? derivedPeriodId
  const periodLabel = (periods || []).find((p) => p.id === periodId)?.label || ''

  // Deep-link initial option (?add=…). Read once — AddDataTab never mutates the URL.
  const [initialOption] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('add')
    } catch {
      return null
    }
  })

  const config = wizardConfigFor(module)

  // On save: refresh the mounting page, then fan out the standard refresh event.
  const handleSaved = useMemo(
    () => () => {
      onDone?.()
      window.dispatchEvent(new CustomEvent('penny:data-changed', { detail: { key: module } }))
    },
    [onDone, module],
  )

  const ctx = useMemo(
    () => ({
      schoolId,
      periodId,
      periodLabel,
      canEdit,
      school: activeSchool,
      hydratedFiles,
      activePeriod,
      hydrationToken,
      onSaved: handleSaved,
    }),
    [
      schoolId,
      periodId,
      periodLabel,
      canEdit,
      activeSchool,
      hydratedFiles,
      activePeriod,
      hydrationToken,
      handleSaved,
    ],
  )

  if (!config) {
    return <TeachState module={module} kind="unconfigured" />
  }
  if (!schoolId) {
    return <TeachState module={module} kind="no-school" />
  }

  return (
    <AddDataWizard
      key={`${module}:${schoolId}`}
      config={config}
      ctx={ctx}
      initialOption={initialOption}
    />
  )
}

function TeachState({ module, kind }) {
  const label = wizardModuleLabel(module)
  const [title, body] =
    kind === 'no-school'
      ? ['Pick a school first', 'Choose a school from the switcher to start adding its data.']
      : [
          `Nothing to add for ${label} yet`,
          'This module doesn’t have a guided add-data flow yet — you can still manage its records from the Records tab.',
        ]
  return (
    <div className="mx-auto max-w-xl rounded-2xl border-2 border-rule/60 bg-white px-6 py-12 text-center shadow-card">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-section text-muted">
        <PackageOpen size={24} />
      </span>
      <h2 className="font-serif text-xl font-semibold text-navy">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  )
}
