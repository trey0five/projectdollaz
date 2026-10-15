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
import { useEffect, useMemo, useState } from 'react'
import { PackageOpen } from 'lucide-react'
import PageHeader from '../ui/surface/PageHeader.jsx'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import AddDataWizard from './AddDataWizard.jsx'
import { requestOpenReview } from '../../lib/reviewRequest.js'
import { wizardConfigFor, wizardModuleLabel } from './wizardConfigs.jsx'

export default function AddDataTab({
  module,
  schoolId: schoolIdProp,
  periodId: periodIdProp,
  canEdit: canEditProp,
  onDone,
  // Optional celebrate-hook, forwarded to whichever embed wants it (see ctx).
  onLitUp = null,
  // Whether the saved data actually produced statement figures. Travels with
  // onLitUp because it governs the same thing: whether a celebration is
  // truthful yet. See FinancePage.statementsHaveNumbers.
  dataReady = true,
  // Optional: the host page's "the person finished — show what they saved"
  // hook, called with the period id the intake just saved (Finance selects it).
  onFinished = null,
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
  //
  // `?intake=` (AIC Phase E) is the SECOND half of the same deep link: which tab
  // INSIDE the chosen option's embed to land on. It exists because /data is a
  // redirect to /finance?tab=add under ui.v2 — the redirect is static and drops
  // the query string entirely — so an accreditation CTA pointing at the data hub
  // reached a generic add-data screen and the bulk-year uploader never opened.
  // Advisory: an option that ignores it, or a value its embed doesn't know, is a
  // no-op rather than an error.
  const [deepLink] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      return { option: q.get('add'), intake: q.get('intake'), review: q.get('review') === '1' }
    } catch {
      return { option: null, intake: null, review: false }
    }
  })
  const initialOption = deepLink.option

  // A4: `?review=1` (the Finance band's "Review N accounts") asks the trial
  // balance step to open its review panel. The ask is sticky (reviewRequest) so
  // the first file card that mounts with something to review takes it — the
  // stored files hydrate a moment after this tab mounts. No setState here.
  useEffect(() => {
    if (deepLink.review) requestOpenReview()
  }, [deepLink])

  const rawConfig = wizardConfigFor(module)
  // An option whose embed renders nothing for a viewer must not be OFFERED to a
  // viewer: the academics uploaders return null without edit rights, so a board
  // member who clicked "Assessment results" got a blank work panel and no
  // explanation. Filtering here keeps the rule in one place for every module.
  const config = useMemo(
    () =>
      rawConfig
        ? { ...rawConfig, options: rawConfig.options.filter((o) => !o.requiresEdit || canEdit) }
        : null,
    [rawConfig, canEdit],
  )

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
      // The school's fiscal years, so a wizard step can ASK which year an upload
      // counts for rather than deriving it from today's date.
      periods,
      canEdit,
      school: activeSchool,
      hydratedFiles,
      activePeriod,
      hydrationToken,
      onSaved: handleSaved,
      // Optional: the host page's "celebrate what this upload lit up" hook. Only
      // Finance passes one today; an embed without it simply renders no gate.
      onLitUp,
      dataReady,
      onFinished,
      // Advisory tab hint for whichever embed the deep link opened.
      intake: deepLink.intake,
    }),
    [
      schoolId,
      periodId,
      periodLabel,
      // The school's fiscal years, so a wizard step can ASK which year an upload
      // counts for rather than deriving it from today's date.
      periods,
      canEdit,
      activeSchool,
      hydratedFiles,
      activePeriod,
      hydrationToken,
      handleSaved,
      onLitUp,
      dataReady,
      onFinished,
      deepLink,
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
    <div className="mx-auto max-w-page px-4 pb-12 sm:px-10">
      <PageHeader eyebrow={`${label} · Add data`} title={title} meta={body} />
      <p className="mt-6 flex items-center gap-2 text-[13px] text-ink2">
        <PackageOpen size={16} aria-hidden="true" className="shrink-0" />
        {kind === 'no-school' ? 'The school switcher is at the top of the sidebar.' : 'Records are one click away in the sidebar.'}
      </p>
    </div>
  )
}
