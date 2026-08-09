// ─────────────────────────────────────────────────────────────────────────────
// CommitmentModal — add / edit an EXPECTED ITEM (a CashCommitment), on the shared
// EntityFormModal luxe surface. The page root's moduleAccentVars('finance') means
// every accent in here renders finance blue, not gold — intended.
//
// Fields map 1:1 onto SaveCommitmentDto (the server's whitelist): label,
// direction, amount, startDate, recurrence, endDate (recurring only), category,
// confidence. PATCH takes the FULL DTO, so an edit re-sends everything and
// preserves the fields this form does not surface (notes, dayRule) from the
// commitment being edited.
//
// Pre-seeded examples ("a gala, a roof repair, a grant") arrive as `initial`
// WITHOUT amount or date — a template never invents a figure the school did not
// state, so those two fields always start empty on add.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import EntityFormModal, { Field, Select, fieldInput } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import CurrencyField from './CurrencyField.jsx'

// The closed category set the engine understands, plus `other`. A free-typed
// category would leak raw keys into the Why sentence and the workbook rows.
const CATEGORIES = [
  ['fundraising', 'Fundraising'],
  ['capital_project', 'Capital project'],
  ['grants', 'Grants'],
  ['other_income', 'Other income'],
  ['other_expense', 'Other expense'],
  ['other', 'Other'],
]

const RECURRENCES = [
  ['once', 'Once'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Every two weeks'],
  ['semimonthly', 'Twice a month'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['annual', 'Annually'],
]

// How much is genuinely known — the engine's confidence classes a school can
// honestly claim for an item it typed in ('modelled' is earned from history,
// never self-declared).
const CONFIDENCE = [
  ['assumption', 'An estimate — my best guess'],
  ['scheduled', 'Scheduled — the date is set, the amount may move'],
  ['committed', 'Committed — date and amount are known'],
]

const blank = () => ({
  label: '',
  direction: 'out',
  amount: '',
  startDate: '',
  recurrence: 'once',
  endDate: '',
  category: 'other_expense',
  confidence: 'assumption',
})

export default function CommitmentModal({
  open,
  onClose,
  onSave, // async (body) — throws to keep the modal open on failure
  saving = false,
  error = '',
  initial = null, // a commitment (edit) or a pre-seed {label,direction,category}
  editing = false,
}) {
  const reduce = useReducedMotion()
  const [form, setForm] = useState(blank)
  const [localError, setLocalError] = useState('')

  // Re-arm the fields each time the modal opens (add, edit, or a pre-seeded
  // example chip). Seeds carry label/direction/category ONLY — see header note.
  useEffect(() => {
    if (!open) return
    setLocalError('')
    setForm({
      ...blank(),
      ...(initial
        ? {
            label: initial.label ?? '',
            direction: initial.direction ?? 'out',
            category: initial.category ?? 'other_expense',
            ...(editing
              ? {
                  amount: initial.amount != null ? String(initial.amount) : '',
                  startDate: initial.startDate ?? '',
                  recurrence: initial.recurrence ?? 'once',
                  endDate: initial.endDate ?? '',
                  confidence: initial.confidence ?? 'assumption',
                }
              : null),
          }
        : null),
    })
  }, [open, initial, editing])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))

  const submit = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.label.trim()) return setLocalError('Give this item a name.')
    if (!Number.isFinite(amount) || amount <= 0)
      return setLocalError('Enter the amount as a positive number.')
    if (!form.startDate) return setLocalError('Pick the date this lands.')
    setLocalError('')
    const recurring = form.recurrence !== 'once'
    await onSave({
      label: form.label.trim(),
      category: form.category,
      direction: form.direction,
      amount,
      confidence: form.confidence,
      recurrence: form.recurrence,
      startDate: form.startDate,
      endDate: recurring && form.endDate ? form.endDate : null,
      // PATCH replaces the whole record — carry the fields this form doesn't
      // surface so an edit can't silently erase them.
      ...(editing && initial?.dayRule ? { dayRule: initial.dayRule } : null),
      ...(editing && initial?.notes ? { notes: initial.notes } : null),
    })
  }

  const recurring = form.recurrence !== 'once'

  return (
    <EntityFormModal
      open={open}
      onClose={onClose}
      icon={TrendingUp}
      title={editing ? 'Edit expected item' : 'Add expected item'}
      subtitle="A movement of cash you know is coming."
      onSubmit={submit}
      saving={saving}
      error={localError || error}
      submitLabel={editing ? 'Save changes' : 'Add to forecast'}
    >
      <Field label="Label" span={2} index={0} reduce={reduce}>
        <input
          className={fieldInput}
          value={form.label}
          onChange={set('label')}
          placeholder="Spring gala, roof repair, grant award…"
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="Money in or out" index={1} reduce={reduce}>
        <Select value={form.direction} onChange={set('direction')}>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </Select>
      </Field>

      <Field label="Amount" index={2} reduce={reduce}>
        {/* The premium money field — live thousands formatting, raw string out
            (Number(form.amount) below is unchanged). */}
        <CurrencyField
          value={form.amount}
          onChange={set('amount')}
          variant="light"
          size="md"
          className="mt-1.5 w-full"
          aria-label="Amount"
          placeholder="25,000"
        />
      </Field>

      <Field label="Date" index={3} reduce={reduce}>
        <DatePicker value={form.startDate} onChange={set('startDate')} className={fieldInput} />
      </Field>

      <Field label="Repeats" index={4} reduce={reduce}>
        <Select value={form.recurrence} onChange={set('recurrence')}>
          {RECURRENCES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      {recurring ? (
        <Field
          label="Until"
          hint="Leave empty to repeat to the end of the horizon."
          index={5}
          reduce={reduce}
        >
          <DatePicker
            value={form.endDate}
            onChange={set('endDate')}
            className={fieldInput}
            min={form.startDate || undefined}
          />
        </Field>
      ) : null}

      <Field label="Category" index={recurring ? 6 : 5} reduce={reduce}>
        <Select value={form.category} onChange={set('category')}>
          {CATEGORIES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="How certain" span={recurring ? 1 : 2} index={recurring ? 7 : 6} reduce={reduce}>
        <Select value={form.confidence} onChange={set('confidence')}>
          {CONFIDENCE.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
    </EntityFormModal>
  )
}
