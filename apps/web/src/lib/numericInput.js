// Input sanitizers for numeric text fields. inputMode only hints the mobile
// keyboard — it doesn't stop a desktop user (or a paste) from entering letters.
// These strip invalid characters as the user types while PRESERVING in-progress
// input ("", "-", "12.", ".") so typing a decimal feels natural. They return a
// string (not a Number) — the form still parses/validates on its own terms.

// Digits, one decimal point, and (optionally) a single leading minus.
export function sanitizeDecimal(value, { allowNegative = false } = {}) {
  let v = String(value ?? '').replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, '')
  if (allowNegative) {
    const neg = v.startsWith('-')
    v = v.replace(/-/g, '')
    if (neg) v = '-' + v
  }
  // Keep only the first decimal point.
  const dot = v.indexOf('.')
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
  return v
}

// Digits only, plus an optional single leading minus.
export function sanitizeInteger(value, { allowNegative = false } = {}) {
  let v = String(value ?? '').replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '')
  if (allowNegative) {
    const neg = v.startsWith('-')
    v = v.replace(/-/g, '')
    if (neg) v = '-' + v
  }
  return v
}
