// ─────────────────────────────────────────────────────────────────────────────
// ingestFailure — one shape for "KYRO couldn't read this file" (#32).
//
// The parser throws an IngestError carrying a plain-language `reason`, the
// question to ask (`ask`) and, when the grid could be read at all, a `preview`
// for the column picker. Anything else thrown (a FileReader failure, an old
// plain Error) normalises to the same shape with no preview, so every surface
// renders one thing. The preview is browser-only: it is never logged, sent to
// the API or handed to KYRO chat.
// ─────────────────────────────────────────────────────────────────────────────
import { ingestFailureOf } from '@finrep/ingestion'

/** → { code, reason, ask, preview, technical, canPick } */
export function failureFromError(err) {
  let f
  try {
    f = ingestFailureOf(err)
  } catch {
    f = null
  }
  const technical = f?.technical ?? (err && err.message) ?? String(err ?? '')
  // The parser words its own refusals; this is only the floor for a code that
  // arrives without words (budget figures picked as the amounts).
  const fallback = f?.code === 'budget-column' ? 'This column holds budget figures. Pick the Actual column.' : null
  const reason = (f?.reason || fallback || technical || 'We couldn’t read this file.').trim()
  const preview = f?.preview ?? null
  return {
    code: f?.code ?? null,
    reason,
    ask: f?.ask ?? null,
    preview,
    technical,
    canPick: !!preview,
  }
}

/** The one-line text: reason, then the question when there is one. */
export function failureText(f) {
  if (!f) return ''
  return f.ask ? `${f.reason} ${f.ask}` : f.reason
}
