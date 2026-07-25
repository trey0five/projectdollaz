// ─────────────────────────────────────────────────────────────────────────────
// CampaignFormModal — the ONE create/edit form for a fundraising campaign, moved
// out of AdvancementPage so the register (+ New / Edit) and the campaign detail
// route share it. Logic unchanged: `initial` null → create mode; emits a ready-
// to-POST body via toCampaignBody. Built on the shared EntityFormModal.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { STATUSES, CAMPAIGN_TYPES, TYPE_LABEL, STATUS_LABEL } from './campaignMeta.js'

export const EMPTY_CAMPAIGN_FORM = {
  name: '',
  campaignType: '',
  goalAmount: '',
  raisedAmount: '',
  fiscalYear: '',
  startDate: '',
  closeDate: '',
  status: 'active',
  notes: '',
}

function toCampaignBody(form) {
  const goal = form.goalAmount.trim()
  const raised = form.raisedAmount.trim()
  const fy = form.fiscalYear.trim()
  return {
    name: form.name.trim(),
    campaignType: form.campaignType ? form.campaignType : null,
    goalAmount: goal === '' ? null : Number(goal),
    raisedAmount: raised === '' ? 0 : Number(raised),
    fiscalYear: fy === '' ? null : Number(fy),
    startDate: form.startDate ? form.startDate : null,
    closeDate: form.closeDate ? form.closeDate : null,
    status: form.status,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

/** Maps a campaign entity to the string-typed form shape `initial` expects. */
export function campaignToForm(entity) {
  if (!entity) return null
  return {
    name: entity.name ?? '',
    campaignType: entity.campaignType ?? '',
    goalAmount:
      entity.goalAmount === null || entity.goalAmount === undefined ? '' : String(entity.goalAmount),
    raisedAmount:
      entity.raisedAmount === null || entity.raisedAmount === undefined
        ? ''
        : String(entity.raisedAmount),
    fiscalYear:
      entity.fiscalYear === null || entity.fiscalYear === undefined ? '' : String(entity.fiscalYear),
    startDate: entity.startDate ?? '',
    closeDate: entity.closeDate ?? '',
    status: entity.status ?? 'active',
    notes: entity.notes ?? '',
  }
}

export function CampaignFormModal({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_CAMPAIGN_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('A campaign name is required.')
      return
    }
    if (form.goalAmount.trim() && Number.isNaN(Number(form.goalAmount))) {
      setErr('Goal amount must be a number.')
      return
    }
    if (form.raisedAmount.trim() && Number.isNaN(Number(form.raisedAmount))) {
      setErr('Raised amount must be a number.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toCampaignBody(form))
      onClose()
    } catch {
      setErr('Could not save this campaign.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open
      icon={Megaphone}
      title={initial ? 'Edit campaign' : 'Add campaign'}
      subtitle="A fundraising campaign"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save campaign' : 'Add campaign'}
      reduce={reduce}
    >
      <Field label="Campaign name" span={2} index={0} reduce={reduce}>
        <input
          value={form.name}
          onChange={set('name')}
          maxLength={200}
          placeholder="e.g. 2026 Annual Fund"
          className={fieldInput}
          autoFocus
        />
      </Field>
      <Field label="Type" index={1} reduce={reduce}>
        <Select value={form.campaignType} onChange={set('campaignType')}>
          <option value="">—</option>
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" index={2} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Goal amount ($)" index={3} reduce={reduce}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.goalAmount}
          onChange={set('goalAmount')}
          placeholder="e.g. 250000"
          className={fieldInput}
        />
      </Field>
      <Field label="Raised so far ($)" index={4} reduce={reduce}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.raisedAmount}
          onChange={set('raisedAmount')}
          placeholder="e.g. 135000"
          className={fieldInput}
        />
      </Field>
      <Field label="Fiscal year" index={5} reduce={reduce}>
        <input
          type="number"
          min="2000"
          max="2100"
          value={form.fiscalYear}
          onChange={set('fiscalYear')}
          placeholder="e.g. 2026"
          className={fieldInput}
        />
      </Field>
      <Field label="Start date" index={6} reduce={reduce}>
        <DatePicker
          value={form.startDate}
          onChange={(v) => set('startDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Close date" index={7} reduce={reduce}>
        <DatePicker
          value={form.closeDate}
          onChange={(v) => set('closeDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Notes" span={2} index={8} reduce={reduce}>
        <textarea value={form.notes} onChange={set('notes')} maxLength={4000} rows={2} className={fieldTextarea} />
      </Field>
    </EntityFormModal>
  )
}
