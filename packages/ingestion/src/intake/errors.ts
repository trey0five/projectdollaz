// ─────────────────────────────────────────────────────────────
// IngestError (#32): the ONE error type ingest() throws. It keeps the old
// technical text as `message` (so every existing toThrow(/…/) still passes)
// and adds what a person needs: a code, ONE plain `reason`, the `ask` (the
// question to answer), and — when the file could be read as a grid — a
// `preview` the column picker renders.
//
// PRIVACY: `reason` / `ask` name column LETTERS and row NUMBERS only, never
// cell text, so they are safe to show, log or hand to KYRO chat. `preview`
// holds cell text: it is for the browser picker only and must never be put in
// a digest, a log, an API response or an LLM prompt.
// ─────────────────────────────────────────────────────────────
import type { FilePreview } from './preview.js'

export type IngestErrorCode =
  | 'unsupported' // not .xlsx/.xls/.csv                         → no preview
  | 'empty' // unreadable / < 3 rows                         → no preview
  | 'no-accounts' // no account-number column found                → preview
  | 'no-description' // numbers found, no names column                → preview
  | 'no-amount' // accounts found, no balance column / all zero  → preview
  | 'budget-only' // StatementExportError (Budget Overview)        → no preview
  | 'budget-column' // a picked amount/debit/credit header is budget/variance/%/prior  (picker only)
  | 'bad-choice' // the picked columns produced no usable rows    (picker only)

export class IngestError extends Error {
  override readonly name = 'IngestError'
  constructor(
    /** Legacy technical text (automatic path) or = reason (picker path). */
    message: string,
    readonly code: IngestErrorCode,
    /** ONE plain sentence; column LETTERS / row NUMBERS only, never cell text. */
    readonly reason: string,
    /** The question to answer, when there is one. */
    readonly ask: string | null = null,
    /** Browser-only grid preview for the column picker (holds cell text — never log it). */
    readonly preview: FilePreview | null = null,
  ) {
    super(message)
  }
}

/** Duck-typed so it survives bundling / realm boundaries (two copies of the class). */
export function isIngestError(e: unknown): e is IngestError {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: unknown }).name === 'IngestError' &&
    typeof (e as { code?: unknown }).code === 'string'
  )
}

export interface IngestFailure {
  code: IngestErrorCode | null
  reason: string
  ask: string | null
  preview: FilePreview | null
  technical: string
}

/** Normalise ANY thrown value for UI/chat. Plain Error → { code:null, reason: e.message, ask:null, preview:null }. */
export function ingestFailureOf(e: unknown): IngestFailure {
  if (isIngestError(e)) {
    return {
      code: e.code,
      reason: e.reason,
      ask: e.ask ?? null,
      preview: e.preview ?? null,
      technical: e.message,
    }
  }
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string'
        ? (e as { message: string }).message
        : String(e)
  return { code: null, reason: msg, ask: null, preview: null, technical: msg }
}
