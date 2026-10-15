import { useState } from 'react'
import { Info } from 'lucide-react'
import { reconciliationApi } from '../../../lib/api.js'
import { useReconciliation } from '../../../hooks/useReconciliation.js'
import { Section } from '../../ui/surface/index.js'
import ReconciliationHeadline from './ReconciliationHeadline.jsx'
import ReconciliationBreakdowns from './ReconciliationBreakdowns.jsx'
import DisbursementsTable from './DisbursementsTable.jsx'
import AnomaliesList from './AnomaliesList.jsx'
import DisbursementIntake from './DisbursementIntake.jsx'
import UseDisbursedTotalButton from './UseDisbursedTotalButton.jsx'

/**
 * Phase 2B — Scholarship Reconciliation section, placed on /readiness after the
 * compliance intake. Intakes the funding org's (Step Up For Students) per-
 * disbursement detail (parsed in-browser, columns mapped) and reconciles the SUM
 * against the school's RECORDED scholarship revenue (the 2A scholarshipFundsReceived,
 * "per the books"). Addresses AUP §IV at the disbursement-vs-recorded-revenue
 * level; per-student bank-deposit tracing stays a §IV CHECKLIST item. A one-click
 * action adopts the disbursed total as the recorded figure so 2A and 2B stay
 * consistent and the $250k trigger uses real data. Viewer is read-only.
 */
export default function ScholarshipReconciliationSection({
  schoolId,
  periodId,
  canEdit,
  onRecordedChanged,
}) {
  const { result, disbursements, loading, error, reload } = useReconciliation(schoolId, periodId)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const save = async (rows) => {
    setSaving(true)
    setSaveError('')
    try {
      await reconciliationApi.saveDisbursements(schoolId, periodId, rows)
      await reload()
    } catch {
      setSaveError('Could not save the disbursements.')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    setSaveError('')
    try {
      await reconciliationApi.clearDisbursements(schoolId, periodId)
      await reload()
    } catch {
      setSaveError('Could not clear the disbursement set.')
    } finally {
      setSaving(false)
    }
  }

  // After adopting the disbursed total as recorded revenue, refresh BOTH this
  // reconciliation and the 2A compliance badges (via the parent callback).
  const onApplied = async () => {
    await reload()
    await onRecordedChanged?.()
  }

  return (
    <section className="space-y-5">
      {/* The wizard's step intro titles this step and the page's DisclaimerBanner
          carries the "pre-flag, not the AUP" framing — only the scope note that
          is specific to this step stays here. */}
      <div className="b2-callout">
        <Info size={14} aria-hidden="true" />
        <span>
          This matches the funding organization&rsquo;s disbursed total against your recorded
          scholarship revenue (AUP §IV). Tracing each student&rsquo;s bank deposit stays on your
          CPA checklist.
        </span>
      </div>

      {loading ? (
        <div className="b2-note" aria-busy="true">
          <p>Loading the reconciliation…</p>
        </div>
      ) : error ? (
        <p className="b2-callout b2-risk" role="alert">
          {error}
        </p>
      ) : (
        <>
          {canEdit && (
            <DisbursementIntake
              existing={disbursements}
              saving={saving}
              onSave={save}
              onClear={clear}
            />
          )}
          {saveError && (
            <p className="b2-callout b2-risk" role="alert">
              {saveError}
            </p>
          )}

          {result && (
            <>
              <ReconciliationHeadline result={result} />

              {result.totalDisbursed > 0 && (
                <UseDisbursedTotalButton
                  schoolId={schoolId}
                  periodId={periodId}
                  totalDisbursed={result.totalDisbursed}
                  recorded={result.recordedScholarshipRevenue}
                  canEdit={canEdit}
                  onApplied={onApplied}
                />
              )}

              {result.count > 0 && <ReconciliationBreakdowns result={result} />}

              <Section label="Anomalies">
                <AnomaliesList anomalies={result.anomalies} />
              </Section>

              <Section label={`Disbursements (${disbursements.length})`}>
                <DisbursementsTable disbursements={disbursements} />
              </Section>
            </>
          )}
        </>
      )}
    </section>
  )
}
