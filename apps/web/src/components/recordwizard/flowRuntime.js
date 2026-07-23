// ─────────────────────────────────────────────────────────────────────────────
// flowRuntime — PURE helpers behind RecordFlow: field/step/item validation, the
// dirty check, count phrasing, and the sequential submit engine. No React, no
// DOM — Engineer B validates flow configs headlessly against these, and the
// component layer stays free of validation logic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate ONE field's raw value. Built-in order (frozen): showIf false → skip;
 * required (trimmed-empty / '' select / '' date fails); numeric parse; integer
 * whole-number; money ≤2dp; min/max; then field.validate(raw, values).
 * @returns {string|null} a friendly message, or null when the value passes.
 */
export function validateField(field, raw, values) {
  if (field.showIf && !field.showIf(values)) return null

  // Checkboxes are booleans — only a custom rule can fail them.
  if (field.type === 'checkbox') {
    return field.validate ? field.validate(raw, values) : null
  }

  const str = raw == null ? '' : String(raw)
  const trimmed = str.trim()

  if (field.required && trimmed === '') {
    return field.requiredMsg || `${field.label} is required`
  }

  if (field.type === 'number' && trimmed !== '') {
    const n = Number(trimmed)
    if (Number.isNaN(n)) return `${field.label} must be a number`
    if (field.integer && !Number.isInteger(n)) return `${field.label} must be a whole number`
    if (field.money && !/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
      return `${field.label} can have at most 2 decimal places`
    }
    if (field.min != null && n < field.min) return `${field.label} must be at least ${field.min}`
    if (field.max != null && n > field.max) return `${field.label} must be ${field.max} or less`
  }

  return field.validate ? field.validate(raw, values) : null
}

/**
 * Validate every field on one step.
 * @returns {Object<string,string>|null} { fieldKey: message } or null when clean.
 */
export function validateStep(step, values, data) {
  const errors = {}
  for (const field of step.fields) {
    const msg = validateField(field, values[field.key], values)
    if (msg) errors[field.key] = msg
  }
  return Object.keys(errors).length ? errors : null
}

/**
 * Validate a whole draft item across every field step.
 * @returns {null | { stepIdx: number, errors: Object<string,string> }} the FIRST
 * failing field step (so the UI can jump the user straight to it), or null.
 */
export function validateItem(flow, values, data) {
  for (let i = 0; i < flow.steps.length; i++) {
    const errors = validateStep(flow.steps[i], values, data)
    if (errors) return { stepIdx: i, errors }
  }
  return null
}

/**
 * Shallow "has the draft been touched?" check against the flow's defaults.
 * Strict !== on the defaults' own keys — typing then erasing back to the
 * default string lands pristine again, which is exactly what the guard wants.
 */
export function isDirty(values, defaults) {
  for (const key of Object.keys(defaults)) {
    if (values[key] !== defaults[key]) return true
  }
  return false
}

/** '3 policies' / '1 policy' — the one place count phrasing lives. */
export function flowCount(n, noun, nounPlural) {
  return `${n} ${n === 1 ? noun : nounPlural}`
}

/**
 * The sequential submit engine (frozen): one POST at a time (gentle on the
 * API), continue-on-error, and NEVER re-post an item that already saved — a
 * retry batch can run over the full basket without minting duplicates.
 */
export async function submitQueue(items, submitOne, { onStart, onResult, onDone }) {
  let ok = 0
  let failed = 0
  for (const item of items) {
    if (item.status === 'done') {
      ok++
      continue // NEVER re-post a success — no dupes, ever
    }
    onStart(item.id)
    try {
      await submitOne(item)
      onResult(item.id, { ok: true })
      ok++
    } catch (e) {
      onResult(item.id, { ok: false, error: e })
      failed++
    }
  }
  onDone({ ok, failed })
}
