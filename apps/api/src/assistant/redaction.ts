// ─────────────────────────────────────────────────────────────────────────────
// Redactor — the FERPA egress guardrail for Penny. A REQUEST-SCOPED tokenizer:
// known PII field values (family/AR-AP party names, internal user names, emails,
// student refs) are swapped for stable opaque placeholders BEFORE anything is put
// in an LLM prompt, and restored to their real values ONLY in the final answer
// rendered to the already-authenticated caller. The model reasons over tokens; it
// never receives the identity.
//
//   token('Jane Doe', 'PARTY')  -> '[[PARTY_1]]'   (stable within the request)
//   restore('[[PARTY_1]] owes $500')  -> 'Jane Doe owes $500'
//
// Pure + deterministic within a request (no clock, no randomness). When disabled
// (ferpaMode off) every method is a passthrough, so non-FERPA tenants are byte-
// identical to today.
// ─────────────────────────────────────────────────────────────────────────────

export type PiiKind = 'PARTY' | 'PERSON' | 'EMAIL' | 'STUDENT'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const SSN_RE = /\b\d{3}-?\d{2}-?\d{4}\b/g
// Longest a `[[KIND_N]]` token can be — bounds how much the stream restorer
// holds back on an unclosed `[[`.
const MAX_TOKEN_LEN = 24

export class Redactor {
  private readonly byValue = new Map<string, string>() // raw value -> token
  private readonly byToken = new Map<string, string>() // token -> raw value
  private readonly counters: Record<PiiKind, number> = { PARTY: 0, PERSON: 0, EMAIL: 0, STUDENT: 0 }

  constructor(private readonly enabled: boolean = true) {}

  get active(): boolean {
    return this.enabled
  }

  /**
   * Tokenize a KNOWN PII field value (payee, party, actorName, email, studentRef).
   * Returns a stable placeholder — the same input always yields the same token
   * within this request. Empty/nullish and disabled cases pass through unchanged.
   */
  token(value: string | null | undefined, kind: PiiKind): string {
    const raw = (value ?? '').trim()
    if (!this.enabled || !raw) return value ?? ''
    const existing = this.byValue.get(raw)
    if (existing) return existing
    const tok = `[[${kind}_${++this.counters[kind]}]]`
    this.byValue.set(raw, tok)
    this.byToken.set(tok, raw)
    return tok
  }

  /**
   * Redact FREE text (e.g. a spreadsheet-digest description, a corrective-action
   * note): swap any already-registered raw value for its token, then mask emails
   * and SSN-shaped runs. Not a full NER — the reliable protection is field-level
   * token() at the source; this is the belt-and-suspenders pass for text bodies.
   */
  redactText(text: string | null | undefined): string {
    if (!this.enabled || !text) return text ?? ''
    let out = text
    // Longest known values first so a substring never masks a superstring.
    for (const raw of [...this.byValue.keys()].sort((a, b) => b.length - a.length)) {
      if (raw.length < 3) continue
      out = out.split(raw).join(this.byValue.get(raw)!)
    }
    out = out.replace(EMAIL_RE, (m) => this.token(m, 'EMAIL'))
    out = out.replace(SSN_RE, '[[SSN]]')
    return out
  }

  /**
   * Restore tokens to their real values for the FINAL answer shown to the caller
   * (who is authenticated and authorized to see them). No-op when disabled.
   * Tolerant of whitespace the model may inject inside a token (`[[ PARTY_1 ]]`).
   * The `[[SSN]]` mask has no stored value and is intentionally left in place.
   */
  restore(text: string | null | undefined): string {
    if (!this.enabled || !text) return text ?? ''
    return text.replace(
      /\[\[\s*([A-Z]+_\d+)\s*\]\]/g,
      (m, inner: string) => this.byToken.get(`[[${inner}]]`) ?? m,
    )
  }

  /** How many distinct identities were tokenized (for audit/telemetry). */
  get tokenizedCount(): number {
    return this.byToken.size
  }
}

// Keys whose STRING value is an identity → tokenized wherever they appear in a
// tool result (recursively, tool-agnostic). Deliberately narrow: account
// `description`, `name`, and school names are NOT here — they're not student PII
// and the model needs them. Add a key only when its value is always a person/party.
const IDENTITY_KEYS: Record<string, PiiKind> = {
  payee: 'PARTY',
  party: 'PARTY',
  partyName: 'PARTY',
  counterparty: 'PARTY',
  actorName: 'PERSON',
  by: 'PERSON',
  responsibleParty: 'PERSON',
  assignee: 'PERSON',
  assigneeName: 'PERSON',
  approver: 'PERSON',
  email: 'EMAIL',
  recipientEmail: 'EMAIL',
  contactEmail: 'EMAIL',
  studentRef: 'STUDENT',
  studentName: 'STUDENT',
}

// AGGREGATE-SAFE by design: enrollment `byDemographics` (gender/ethnicity/race COUNTS)
// and `byGrade` are nested numeric maps with non-identity keys — they are neither
// IDENTITY_KEYS nor FREETEXT_KEYS, so they pass through untouched (no student PII).
//
// Free-text keys that may contain a stray name/email in narrative → passed through
// redactText (masks emails/SSN + already-known identities; never touches account
// descriptions, which are not in this set).
const FREETEXT_KEYS = new Set([
  'rootCause',
  'correctiveAction',
  'suggestedRootCause',
  'suggestedCorrectiveAction',
  'memo',
  'note',
  'notes',
])

/**
 * Recursively redact a tool result before it is serialized into an LLM prompt.
 * Identity-keyed strings are tokenized; narrative-keyed strings are text-redacted;
 * everything else (amounts, account descriptions, school names, dates) passes
 * through. No-op when the redactor is disabled.
 */
export function redactToolResult(value: unknown, redactor: Redactor): unknown {
  if (!redactor.active) return value

  // Pass 1: register EVERY identity token across the whole tree first, so that
  // free-text redaction (pass 2) knows all identities regardless of key order
  // (e.g. a `note` that names a `payee` appearing later in the same object).
  const register = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) register(x)
    } else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string' && k in IDENTITY_KEYS) redactor.token(val, IDENTITY_KEYS[k])
        else register(val)
      }
    }
  }
  register(value)

  // Pass 2: emit the redacted copy (identity tokens are already minted/stable).
  const walk = (v: unknown, key: string | undefined): unknown => {
    if (typeof v === 'string') {
      if (key && key in IDENTITY_KEYS) return redactor.token(v, IDENTITY_KEYS[key])
      if (key && FREETEXT_KEYS.has(key)) return redactor.redactText(v)
      return v
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key))
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val, k)
      return out
    }
    return v
  }
  return walk(value, undefined)
}

/**
 * A streaming restorer: buffers just enough to never split a `[[TOKEN]]` across
 * chunk boundaries, restoring complete tokens to their real values as text flows
 * to the caller. Passthrough (no buffering) when the redactor is disabled.
 */
export function makeStreamRestorer(
  redactor: Redactor,
  emit: (s: string) => void,
): { push: (chunk: string) => void; flush: () => void } {
  let buf = ''
  return {
    push(chunk: string): void {
      if (!redactor.active) {
        emit(chunk)
        return
      }
      buf += chunk
      const lastOpen = buf.lastIndexOf('[[')
      let safe = buf.length
      // Hold back an unclosed `[[…` only while it could still become a token —
      // capped at MAX_TOKEN_LEN so a stray `[[` never stalls the stream to EOF.
      if (
        lastOpen !== -1 &&
        buf.indexOf(']]', lastOpen) === -1 &&
        buf.length - lastOpen <= MAX_TOKEN_LEN
      ) {
        safe = lastOpen
      } else if (buf.endsWith('[')) {
        safe = buf.length - 1
      }
      const out = buf.slice(0, safe)
      buf = buf.slice(safe)
      if (out) emit(redactor.restore(out))
    },
    flush(): void {
      if (buf) {
        emit(redactor.restore(buf))
        buf = ''
      }
    },
  }
}
