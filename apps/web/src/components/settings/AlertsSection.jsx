// Phase 4E — proactive alerts / standing requests. Owner/accountant set standing
// requests: a scheduled DIGEST ("email me a weekly cash summary") or a THRESHOLD
// alert ("alert me if days-cash < 30"). Each is evaluated on the server's 30-min
// tick and emailed. A "Send test" button fires one immediately. Read-only for
// viewers. Mirrors ReportScheduleSection's idiom + the navy/gold theme.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, Send, Trash2, Plus } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useEntitlement } from '../../hooks/useEntitlement.js'
import { alertsApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

// Metric options for a threshold alert — MUST mirror ALERT_METRIC_KEYS on the API.
const METRICS = [
  { key: 'days_cash_on_hand', label: 'Days Cash on Hand' },
  { key: 'months_operating_reserve', label: 'Months of Operating Reserve' },
  { key: 'operating_margin', label: 'Operating Margin (%)' },
  { key: 'tuition_dependency', label: 'Tuition Dependency (%)' },
  { key: 'cost_per_pupil', label: 'Cost per Pupil ($)' },
  { key: 'net_tuition_per_student', label: 'Net Tuition per Student ($)' },
  { key: 'financial_aid_per_student', label: 'Financial Aid per Student ($)' },
  { key: 'aid_per_aided_student', label: 'Aid per Aided Student ($)' },
  { key: 'tuition_discount_rate', label: 'Tuition Discount Rate (%)' },
  { key: 'pct_students_on_aid', label: '% Students on Aid' },
  { key: 'enrollment_change_yoy', label: 'Enrollment Change YoY (%)' },
  { key: 'student_teacher_ratio', label: 'Student-Teacher Ratio' },
]
const CADENCES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

const metricLabel = (k) => METRICS.find((m) => m.key === k)?.label || k

const cadenceLabel = (c) => CADENCES.find((x) => x.key === c)?.label || c || 'Weekly'

/** Plain-language phrasing of one alert's rule. */
function ruleText(a) {
  if (a.type === 'digest') {
    return `Email me a ${cadenceLabel(a.cadence).toLowerCase()} financial summary`
  }
  // AIC Phase E. This branch is not optional decoration: the accreditation digest
  // carries NO metric, operator or threshold — the create path forces all three to
  // null — so without it the row fell through to the threshold sentence and
  // rendered the literal string "Alert me if null > null".
  if (a.type === 'warning_digest') {
    return `Email me ${cadenceLabel(a.cadence).toLowerCase()} accreditation early warnings`
  }
  const word = a.operator === 'lt' ? '<' : '>'
  return `Alert me if ${metricLabel(a.metricKey)} ${word} ${a.threshold}`
}

/** The badge word + tint per type. Three types, three styles. */
const TYPE_META = {
  digest: { label: 'digest', chip: 'bg-navy/10 text-navy' },
  threshold: { label: 'threshold', chip: 'bg-gold/15 text-gold' },
  warning_digest: { label: 'accreditation', chip: 'bg-amber-100 text-amber-700' },
}

const labelCls = 'mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

export default function AlertsSection() {
  const { activeId, activeSchool } = useSchools()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const { licensed: accreditationLicensed } = useEntitlement('accreditation')

  const [alerts, setAlerts] = useState([])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  // Create form state.
  const [type, setType] = useState('digest')
  const [cadence, setCadence] = useState('weekly')
  const [metricKey, setMetricKey] = useState('days_cash_on_hand')
  const [operator, setOperator] = useState('lt')
  const [threshold, setThreshold] = useState('30')

  const load = useCallback(async (id) => {
    try {
      const res = await alertsApi.list(id)
      setAlerts(res.data?.alerts || [])
    } catch {
      setAlerts([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled && activeId) load(activeId)
    })
    return () => {
      cancelled = true
    }
  }, [activeId, load])

  const create = async () => {
    if (!canEdit || busy) return
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const body =
        type === 'digest' || type === 'warning_digest'
          ? { type, cadence }
          : { type: 'threshold', metricKey, operator, threshold: Number(threshold) }
      if (type === 'threshold' && !Number.isFinite(Number(threshold))) {
        throw new Error('Enter a numeric threshold.')
      }
      await alertsApi.create(activeId, body)
      setOk('Alert created.')
      await load(activeId)
    } catch (e) {
      setErr(e?.message && !e?.response ? e.message : apiErrorMessage(e, 'Could not create the alert.'))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (a) => {
    if (!canEdit) return
    setErr('')
    setOk('')
    try {
      await alertsApi.update(activeId, a.id, { enabled: !a.enabled })
      await load(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not update the alert.'))
    }
  }

  const remove = async (a) => {
    if (!canEdit) return
    setErr('')
    setOk('')
    try {
      await alertsApi.remove(activeId, a.id)
      await load(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not delete the alert.'))
    }
  }

  const sendTest = async (a) => {
    if (!canEdit) return
    setErr('')
    setOk('')
    try {
      const res = await alertsApi.test(activeId, a.id)
      const d = res.data || {}
      setOk(d.sent ? `Test sent. ${d.detail || ''}` : `Nothing sent. ${d.detail || ''}`)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not send the test.'))
    }
  }

  if (!activeSchool) {
    return (
      <SettingsCard title="Alerts">
        <p className="text-[16px] text-muted">Select a school first.</p>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      title="Proactive alerts"
      description={
        canEdit
          ? 'Get emailed a recurring summary, or the moment a key metric crosses a line.'
          : 'Read-only — only an owner or accountant can edit.'
      }
    >
      {/* Existing alerts */}
      <div className="mb-6 space-y-3">
        {alerts.length === 0 && (
          <p className="text-[15px] text-muted">No standing alerts yet.</p>
        )}
        {alerts.map((a) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-border bg-white px-4 py-3"
          >
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide ${
                (TYPE_META[a.type] ?? TYPE_META.threshold).chip
              }`}
            >
              <Bell size={12} /> {(TYPE_META[a.type] ?? { label: a.type }).label}
            </span>
            <span className="flex-1 text-[15px] font-semibold text-navy">{ruleText(a)}</span>
            {a.lastSentAt && (
              <span className="text-[13px] text-muted">
                Last sent {new Date(a.lastSentAt).toLocaleDateString()}
              </span>
            )}
            {canEdit && (
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-muted">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={() => toggle(a)}
                    className="h-4 w-4 accent-gold"
                  />
                  {a.enabled ? 'On' : 'Off'}
                </label>
                <button
                  onClick={() => sendTest(a)}
                  className="inline-flex items-center gap-1 rounded-lg border-2 border-border bg-white px-3 py-1.5 text-[13px] font-semibold text-navy transition-all hover:border-gold/50 hover:text-gold"
                >
                  <Send size={13} /> Test
                </button>
                <button
                  onClick={() => remove(a)}
                  aria-label="Delete alert"
                  className="inline-flex items-center rounded-lg border-2 border-border bg-white p-1.5 text-muted transition-all hover:border-red-300 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Create form */}
      {canEdit && (
        <div className="rounded-xl border-2 border-dashed border-border p-4">
          {/* AIC Phase E — the accreditation digest is offered ONLY to a school
              that has licensed the module, because that is the same gate the
              server evaluates the alert behind. Shipping the notification path
              without a door was the defect: it was reachable by raw API only. */}
          <div className="mb-4 flex flex-wrap gap-2">
            {['digest', 'threshold', ...(accreditationLicensed ? ['warning_digest'] : [])].map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-all ${
                    type === t
                      ? 'bg-navy text-white'
                      : 'border-2 border-border bg-white text-navy hover:border-gold/50'
                  }`}
                >
                  {t === 'digest'
                    ? 'Scheduled digest'
                    : t === 'threshold'
                      ? 'Threshold alert'
                      : 'Accreditation early warnings'}
                </button>
              ),
            )}
          </div>

          {type === 'digest' || type === 'warning_digest' ? (
            <div className="mb-4">
              <label className={labelCls}>Cadence</label>
              <select className={inputCls} value={cadence} onChange={(e) => setCadence(e.target.value)}>
                {CADENCES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[14px] text-muted">
                {type === 'digest'
                  ? 'A financial summary emailed to you on this cadence.'
                  : 'New accreditation early warnings, emailed on this cadence. Nothing new means no email.'}
              </p>
            </div>
          ) : (
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <label className={labelCls}>Metric</label>
                <select
                  className={inputCls}
                  value={metricKey}
                  onChange={(e) => setMetricKey(e.target.value)}
                >
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>When</label>
                <select
                  className={inputCls}
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                >
                  <option value="lt">Below</option>
                  <option value="gt">Above</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Value</label>
                <input
                  className={`${inputCls} sm:w-28`}
                  value={threshold}
                  inputMode="decimal"
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
          )}

          {err && <FormError>{err}</FormError>}
          {ok && <FormSuccess>{ok}</FormSuccess>}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={create}
            disabled={busy}
            className="btn-primary mt-2 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
          >
            <Plus size={16} /> {busy ? 'Creating…' : 'Create alert'}
          </motion.button>
        </div>
      )}

      {!canEdit && err && <FormError>{err}</FormError>}
      {!canEdit && ok && <FormSuccess>{ok}</FormSuccess>}
    </SettingsCard>
  )
}
