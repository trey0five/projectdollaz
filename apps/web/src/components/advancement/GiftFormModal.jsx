// ─────────────────────────────────────────────────────────────────────────────
// GiftFormModal — add / edit a single gift or pledge, rebuilt LIGHT on the shared
// EntityFormModal (replaces the old dark inline GiftForm). `initial` null → add
// mode. Emits a ready-to-POST body byte-compatible with the old form (gift ⇒
// receivedAmount omitted, server forces = amount; status NEVER sent — the server
// derives it). AGGREGATE only — no donor PII fields, by design.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Gift as GiftIcon, ShieldCheck } from 'lucide-react'
import EntityFormModal, { Field, Select, fieldInput } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { GIFT_KINDS, GIFT_KIND_LABEL } from './campaignMeta.js'

const EMPTY_GIFT_FORM = {
  kind: 'gift',
  amount: '',
  receivedAmount: '',
  occurredOn: '',
  label: '',
  source: '',
  note: '',
}

export function GiftFormModal({ open, initial, campaignName, onClose, onSubmit, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_GIFT_FORM)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isPledge = form.kind === 'pledge'

  const submit = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.amount.toString().trim() || Number.isNaN(amount) || amount < 0) {
      setErr('Enter a valid amount.')
      return
    }
    if (!form.occurredOn) {
      setErr('Pick a date.')
      return
    }
    const body = {
      kind: form.kind,
      amount,
      occurredOn: form.occurredOn,
      label: form.label.trim() ? form.label.trim() : null,
      source: form.source.trim() ? form.source.trim() : null,
      note: form.note.trim() ? form.note.trim() : null,
    }
    if (isPledge) {
      const rec = form.receivedAmount.toString().trim()
      const recNum = rec === '' ? 0 : Number(rec)
      if (Number.isNaN(recNum) || recNum < 0 || recNum > amount) {
        setErr('Received must be between 0 and the pledged amount.')
        return
      }
      body.receivedAmount = recNum
    }
    setSaving(true)
    setErr('')
    try {
      await onSubmit(body)
      onClose()
    } catch {
      setErr('Could not save this entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={GiftIcon}
      title={initial ? 'Edit entry' : 'Add gift or pledge'}
      subtitle={campaignName}
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save entry' : 'Add entry'}
      reduce={reduce}
    >
      <Field label="Type" index={0} reduce={reduce}>
        <Select value={form.kind} onChange={set('kind')}>
          {GIFT_KINDS.map((k) => (
            <option key={k} value={k}>
              {GIFT_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={isPledge ? 'Pledged amount ($)' : 'Amount ($)'} index={1} reduce={reduce}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={set('amount')}
          placeholder="e.g. 5000"
          className={fieldInput}
          autoFocus
        />
      </Field>
      {isPledge ? (
        <Field label="Received so far ($)" index={2} reduce={reduce}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.receivedAmount}
            onChange={set('receivedAmount')}
            placeholder="0"
            className={fieldInput}
          />
        </Field>
      ) : null}
      <Field label="Date" index={3} reduce={reduce}>
        <DatePicker
          value={form.occurredOn}
          onChange={(v) => set('occurredOn')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Label (optional — no donor names)" span={2} index={4} reduce={reduce}>
        <input
          value={form.label}
          onChange={set('label')}
          maxLength={120}
          placeholder="e.g. Spring appeal · Anonymous major gift"
          className={fieldInput}
        />
      </Field>
      <Field label="Source (optional)" index={5} reduce={reduce}>
        <input
          value={form.source}
          onChange={set('source')}
          maxLength={60}
          placeholder="e.g. event · online · grant"
          className={fieldInput}
        />
      </Field>
      <Field label="Note (optional)" index={6} reduce={reduce}>
        <input value={form.note} onChange={set('note')} maxLength={2000} className={fieldInput} />
      </Field>
      <p className="flex items-center gap-1.5 text-[12px] text-muted sm:col-span-2">
        <ShieldCheck size={13} className="shrink-0 text-gold" />
        Aggregate only — record amounts, never donor names.
      </p>
    </EntityFormModal>
  )
}
