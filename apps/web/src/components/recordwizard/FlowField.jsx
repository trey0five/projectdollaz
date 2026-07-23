// ─────────────────────────────────────────────────────────────────────────────
// FlowField — renders ONE FlowField from a flow config, reusing the shared
// field-lux styles (EntityFormModal's Field/Select/fieldInput…) so wizard
// inputs look identical to the edit modals, and the shared DatePicker for
// every date (never a native date input). Wires the a11y error contract
// (aria-invalid + aria-describedby → the inline <p id=…>) and the live money
// echo ('$ 12,500') under valid non-empty money fields.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import {
  Field,
  Select,
  fieldInput,
  fieldSelect,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'

/** Resolve a select's options — static array or (data, values) factory. */
function resolveOptions(field, data, values) {
  const opts = typeof field.options === 'function' ? field.options(data, values) : field.options
  return Array.isArray(opts) ? opts : []
}

export default function FlowField({
  field,
  idBase,
  value,
  values,
  data,
  loadErrors,
  error,
  hue,
  reduce,
  index,
  onChange,
}) {
  const id = `${idBase}-${field.key}`
  const errorId = `${id}-err`
  const describedBy = error ? errorId : undefined

  // A failed OPTIONAL lookup renders a disabled select + a soft note — it never
  // blocks the flow (required lookups are the flow gate's job).
  const lookupFailed = !!(field.lookupKey && loadErrors?.[field.lookupKey])

  // Live '$ 12,500' echo for money fields once the value parses cleanly.
  const moneyEcho =
    field.money &&
    !error &&
    String(value ?? '').trim() !== '' &&
    Number.isFinite(Number(value)) &&
    /^-?\d+(\.\d{1,2})?$/.test(String(value).trim())
      ? `$ ${Number(value).toLocaleString()}`
      : null

  let control = null
  if (field.type === 'select') {
    control = (
      <Select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={lookupFailed}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {field.emptyOptionLabel != null && <option value="">{field.emptyOptionLabel}</option>}
        {resolveOptions(field, data, values).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    )
  } else if (field.type === 'textarea') {
    control = (
      <textarea
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        rows={field.rows || 3}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        className={fieldTextarea}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
    )
  } else if (field.type === 'date') {
    // DatePicker owns its popover a11y; the inline error <p> below still names
    // the problem (the picker's trigger doesn't take aria-invalid).
    control = (
      <DatePicker
        id={id}
        value={value || ''}
        onChange={(next) => onChange(field.key, next)}
        className={fieldInput}
        aria-label={field.label}
        min={field.min}
        max={field.max}
      />
    )
  } else if (field.type === 'checkbox') {
    control = (
      <span className="mt-1.5 flex min-h-[44px] items-center gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className="h-5 w-5 cursor-pointer rounded border-rule"
          style={{ accentColor: hue }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <span className="text-[14px] text-ink/80">{field.placeholder || 'Yes'}</span>
      </span>
    )
  } else {
    // 'text' and 'number' — number keeps a RAW string value (validation owns
    // parsing) with the right software keyboard via inputMode.
    control = (
      <input
        id={id}
        type="text"
        inputMode={field.type === 'number' ? (field.integer ? 'numeric' : 'decimal') : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        className={fieldInput}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
    )
  }

  return (
    <Field
      label={field.label}
      hint={lookupFailed ? 'Couldn’t load — you can leave this blank.' : field.hint}
      span={field.span || 1}
      index={index}
      reduce={reduce}
    >
      {control}
      {moneyEcho && (
        <motion.span
          initial={reduce ? false : { opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1 block text-[12.5px] font-semibold"
          style={{ color: hue }}
        >
          {moneyEcho}
        </motion.span>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </Field>
  )
}
