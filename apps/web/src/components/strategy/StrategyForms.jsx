// ─────────────────────────────────────────────────────────────────────────────
// StrategyForms — the four thin add/edit wrappers for Strategic Planning, each
// built on the shared premium EntityFormModal (Field / Select / fieldInput /
// fieldTextarea) + DatePicker, exactly like AdvancementPage's CampaignFormModal.
// No new modal chrome.
//   PlanForm       name · mission · FY range · status · next review
//   PillarForm     name · description
//   GoalForm       title · description · MEASURE-BY (metric key OR milestones) ·
//                  target (natural unit → 0..1 for percent) · start/target dates.
//                  Picking "Not measurable" flips to milestone mode (target hidden).
//   InitiativeForm title · status
// The GoalForm baseline is intentionally absent — the API freezes it at bind.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Target, Layers, Flag, ListChecks } from 'lucide-react'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { METRIC_OPTIONS, isPercentMetric, METRIC_CATALOG } from '../../hooks/useStrategy.js'

const MILESTONE_MODE = '__milestone__'
const PLAN_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'archived', label: 'Archived' },
]
const INITIATIVE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Display label for a school member (firstName lastName, else email). */
function memberLabel(m) {
  const full = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
  return full || m.email || 'Member'
}

/** The shared Owner picker, rendered only when the members roster is available. */
function OwnerField({ members, value, onChange, reduce, index }) {
  if (!Array.isArray(members) || members.length === 0) return null
  return (
    <Field label="Owner" span={2} index={index} reduce={reduce}>
      <Select value={value ?? ''} onChange={onChange}>
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{memberLabel(m)}</option>
        ))}
      </Select>
    </Field>
  )
}

// ═══════════════════════════ PlanForm ═══════════════════════════════════════
export function PlanForm({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(
    initial ?? { name: '', mission: '', fyStartYear: '', fyEndYear: '', status: 'draft', nextReviewDate: '' },
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setErr('A plan name is required.')
    const fyStart = Number(form.fyStartYear)
    const fyEnd = Number(form.fyEndYear)
    if (!form.fyStartYear || !form.fyEndYear || Number.isNaN(fyStart) || Number.isNaN(fyEnd)) {
      return setErr('Enter the fiscal-year start and end.')
    }
    if (fyEnd < fyStart) return setErr('FY end must be on or after FY start.')
    setSaving(true)
    setErr('')
    try {
      await onSave({
        name: form.name.trim(),
        mission: form.mission.trim() ? form.mission.trim() : null,
        fyStartYear: fyStart,
        fyEndYear: fyEnd,
        status: form.status,
        nextReviewDate: form.nextReviewDate ? form.nextReviewDate : null,
      })
      onClose()
    } catch {
      setErr('Could not save this plan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open
      icon={Target}
      title={initial ? 'Edit plan' : 'New strategic plan'}
      subtitle="The multi-year plan your pillars & goals hang from"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save plan' : 'Create plan'}
      reduce={reduce}
    >
      <Field label="Plan name" span={2} index={0} reduce={reduce}>
        <input value={form.name} onChange={set('name')} maxLength={200} placeholder="e.g. Strategic Plan 2026–2030" className={fieldInput} autoFocus />
      </Field>
      <Field label="Mission / vision" span={2} index={1} reduce={reduce}>
        <textarea value={form.mission} onChange={set('mission')} maxLength={2000} rows={2} className={fieldTextarea} />
      </Field>
      <Field label="FY start year" index={2} reduce={reduce}>
        <input type="number" min="2000" max="2100" value={form.fyStartYear} onChange={set('fyStartYear')} placeholder="2026" className={fieldInput} />
      </Field>
      <Field label="FY end year" index={3} reduce={reduce}>
        <input type="number" min="2000" max="2100" value={form.fyEndYear} onChange={set('fyEndYear')} placeholder="2030" className={fieldInput} />
      </Field>
      <Field label="Status" index={4} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {PLAN_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Next review date" index={5} reduce={reduce}>
        <DatePicker value={form.nextReviewDate} onChange={(v) => set('nextReviewDate')({ target: { value: v } })} className={fieldInput} />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ PillarForm ═════════════════════════════════════
export function PillarForm({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? { name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setErr('A pillar name is required.')
    setSaving(true)
    setErr('')
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
      })
      onClose()
    } catch {
      setErr('Could not save this pillar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open
      icon={Layers}
      title={initial ? 'Edit pillar' : 'New pillar'}
      subtitle="A strategic theme your goals roll up into"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save pillar' : 'Add pillar'}
      reduce={reduce}
    >
      <Field label="Pillar name" span={2} index={0} reduce={reduce}>
        <input value={form.name} onChange={set('name')} maxLength={160} placeholder="e.g. Financial Sustainability" className={fieldInput} autoFocus />
      </Field>
      <Field label="Description" span={2} index={1} reduce={reduce}>
        <textarea value={form.description} onChange={set('description')} maxLength={2000} rows={2} className={fieldTextarea} />
      </Field>
    </EntityFormModal>
  )
}

/** Map a COMPUTED goal → GoalForm `initial` (percent target ×100 for display;
 *  milestone labels joined by newline). Kept next to the form so the mapping and
 *  the submit-conversion stay in one place. */
export function goalToFormInitial(goal) {
  const isMs = goal.goalType === 'milestone'
  const isMetric = goal.goalType === 'metric'
  const percent = isMetric && isPercentMetric(goal.metricKey)
  let targetValue = ''
  if (isMetric && typeof goal.target === 'number') {
    targetValue = String(percent ? Math.round(goal.target * 1000) / 10 : goal.target)
  }
  return {
    title: goal.title ?? '',
    description: goal.description ?? '',
    measure: isMs ? MILESTONE_MODE : isMetric ? goal.metricKey : '',
    targetValue,
    startDate: goal.startDate ?? '',
    targetDate: goal.targetDate ?? '',
    milestones: isMs ? (goal.milestones ?? []).map((m) => m.label).join('\n') : '',
    ownerUserId: goal.owner?.userId ?? '',
  }
}

// ═══════════════════════════ GoalForm ═══════════════════════════════════════
export function GoalForm({ initial, onClose, onSave, reduce, pillars = null, members = null }) {
  // A pillar selector is shown only when CREATING and the caller passes the pillar
  // list (the create POST is nested under a pillar). pillarId rides in the body;
  // the page peels it off for the path param.
  const showPillarSelect = !initial && Array.isArray(pillars) && pillars.length > 0
  const [form, setForm] = useState(
    initial ?? {
      pillarId: pillars?.[0]?.id ?? '',
      title: '',
      description: '',
      measure: '', // a metric key, MILESTONE_MODE, or '' (unset)
      targetValue: '',
      startDate: '',
      targetDate: '',
      milestones: '', // newline-separated labels (milestone mode)
      ownerUserId: '',
    },
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const isMilestone = form.measure === MILESTONE_MODE
  const isMetric = !!form.measure && !isMilestone
  const percent = isMetric && isPercentMetric(form.measure)
  const unit = isMetric ? METRIC_CATALOG[form.measure]?.unit : null

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setErr('A goal title is required.')
    if (showPillarSelect && !form.pillarId) return setErr('Choose a pillar for this goal.')
    if (!form.measure) return setErr('Choose how this goal is measured.')

    let body
    if (isMilestone) {
      const labels = form.milestones
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      body = {
        title: form.title.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        goalType: 'milestone',
        milestones: labels.map((label) => ({ label })),
        startDate: form.startDate ? form.startDate : null,
      }
    } else {
      const raw = form.targetValue.toString().trim()
      if (raw === '' || Number.isNaN(Number(raw))) return setErr('Enter a numeric target.')
      const target = percent ? Number(raw) / 100 : Number(raw)
      body = {
        title: form.title.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        goalType: 'metric',
        metricKey: form.measure,
        targetValue: target,
        startDate: form.startDate ? form.startDate : null,
        targetDate: form.targetDate ? form.targetDate : null,
      }
    }

    if (showPillarSelect) body.pillarId = form.pillarId
    body.ownerUserId = form.ownerUserId || null

    setSaving(true)
    setErr('')
    try {
      await onSave(body)
      onClose()
    } catch {
      setErr('Could not save this goal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open
      icon={Flag}
      title={initial ? 'Edit goal' : 'New goal'}
      subtitle="A measurable outcome under a pillar"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save goal' : 'Add goal'}
      reduce={reduce}
      wide
    >
      {showPillarSelect ? (
        <Field label="Pillar" span={2} index={0} reduce={reduce}>
          <Select value={form.pillarId} onChange={set('pillarId')}>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Goal title" span={2} index={0} reduce={reduce}>
        <input value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Reach 90 days cash on hand" className={fieldInput} autoFocus />
      </Field>
      <Field
        label="Measured by"
        span={2}
        index={1}
        reduce={reduce}
        hint={
          isMetric
            ? 'This goal reads its current value LIVE from your financials — it is never typed in.'
            : isMilestone
              ? 'Not tied to a metric — you check off milestones as they complete.'
              : undefined
        }
      >
        <Select value={form.measure} onChange={set('measure')}>
          <option value="">— choose how it&apos;s measured —</option>
          <option value={MILESTONE_MODE}>Not measurable — track by milestones</option>
          <optgroup label="Live metrics (auto-computed)">
            {METRIC_OPTIONS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </optgroup>
        </Select>
      </Field>

      {isMetric ? (
        <>
          <Field label={`Target${percent ? ' (%)' : unit === 'currency' ? ' ($)' : ''}`} index={2} reduce={reduce}>
            <input
              type="number"
              step="any"
              value={form.targetValue}
              onChange={set('targetValue')}
              placeholder={percent ? 'e.g. 8.5' : 'e.g. 90'}
              className={fieldInput}
            />
          </Field>
          <Field label="Target date" index={3} reduce={reduce}>
            <DatePicker value={form.targetDate} onChange={(v) => set('targetDate')({ target: { value: v } })} className={fieldInput} />
          </Field>
        </>
      ) : null}

      {isMilestone ? (
        <Field label="Milestones (one per line)" span={2} index={2} reduce={reduce}>
          <textarea value={form.milestones} onChange={set('milestones')} rows={3} placeholder={'Board approves plan\nHire capital campaign lead\nBreak ground'} className={fieldTextarea} />
        </Field>
      ) : null}

      <Field label="Start date" index={isMilestone ? 3 : 4} reduce={reduce}>
        <DatePicker value={form.startDate} onChange={(v) => set('startDate')({ target: { value: v } })} className={fieldInput} />
      </Field>
      <OwnerField members={members} value={form.ownerUserId} onChange={set('ownerUserId')} reduce={reduce} index={isMilestone ? 5 : 6} />
      <Field label="Description" span={2} index={isMilestone ? 6 : 7} reduce={reduce}>
        <textarea value={form.description} onChange={set('description')} maxLength={2000} rows={2} className={fieldTextarea} />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ InitiativeForm ═════════════════════════════════
export function InitiativeForm({ initial, onClose, onSave, reduce, goals = null, members = null }) {
  const showGoalSelect = !initial && Array.isArray(goals) && goals.length > 0
  const [form, setForm] = useState(
    initial ?? { goalId: goals?.[0]?.id ?? '', title: '', status: 'planned', ownerUserId: '' },
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setErr('An initiative title is required.')
    if (showGoalSelect && !form.goalId) return setErr('Choose the goal this initiative advances.')
    setSaving(true)
    setErr('')
    try {
      const body = { title: form.title.trim(), status: form.status, ownerUserId: form.ownerUserId || null }
      if (showGoalSelect) body.goalId = form.goalId
      await onSave(body)
      onClose()
    } catch {
      setErr('Could not save this initiative.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open
      icon={ListChecks}
      title={initial ? 'Edit initiative' : 'New initiative'}
      subtitle="A project that moves a goal forward"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save initiative' : 'Add initiative'}
      reduce={reduce}
    >
      {showGoalSelect ? (
        <Field label="Advances goal" span={2} index={0} reduce={reduce}>
          <Select value={form.goalId} onChange={set('goalId')}>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Initiative title" span={2} index={0} reduce={reduce}>
        <input value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Launch tuition-assistance review" className={fieldInput} autoFocus />
      </Field>
      <Field label="Status" span={2} index={1} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {INITIATIVE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </Field>
      <OwnerField members={members} value={form.ownerUserId} onChange={set('ownerUserId')} reduce={reduce} index={2} />
    </EntityFormModal>
  )
}
