// ─────────────────────────────────────────────────────────────────────────────
// BulkAdoptFlow — AIC Phase I. PROPOSE → REVIEW → CONFIRM, for one standard
// across many schools.
//
// THE UI CONTRACT (spec §6.2, guarded by WEB-5):
//   · Confirm is DISABLED until a proposal has come back. There is no path — not
//     a keyboard one, not a fast double-click — by which a superintendent writes
//     to fourteen schools without first seeing the fourteen rows.
//   · The preview lists EVERY school with its own `status`, including the ones
//     that will be skipped. A preview that showed only the schools we intend to
//     write to would quietly hide "this school has no clone of that standard" and
//     "you are a viewer here" — the two cases a superintendent most needs to see
//     BEFORE confirming.
//   · The confirm sends back the server's `proposalHash`. If the underlying list
//     moved, the server answers 409 PROPOSAL_STALE and this component says so and
//     drops back to propose. It never retries with a new hash on the user's
//     behalf: confirming a list you were not shown is the failure the hash exists
//     to prevent.
//
// This component takes PLAIN PROPS — `onPropose` / `onConfirm` are async
// functions the page wires to the API client — so the honesty spec can drive the
// whole flow with two `vi.fn()`s and no context stack, no router and no fetch
// layer (the standing note in the house pattern file).
//
// It composes no sentence about a result: the per-school `status` tokens are the
// server's, and the tallies below are COUNTS of those tokens, never an
// interpretation of them.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Users } from 'lucide-react'
import DatePicker from '../ui/DatePicker.jsx'

/**
 * TWO VOCABULARIES, AND THE TENSE IS THE POINT — a MIRROR of `BulkAdoptStatus`
 * in apps/api/src/portfolio/bulk-adopt.service.ts.
 *
 * PREVIEW says what WOULD happen (`will_create` / `already_adopted`); CONFIRM
 * says what DID (`created` / `reused` / `failed`). Rendering a preview word under
 * the heading "Applied" is future tense for a completed write, and the only
 * reasonable reading of that screen is that the push did not land.
 */
export const ADOPT_STATUS_LABELS = Object.freeze({
  will_create: 'Will create an initiative',
  already_adopted: 'Already adopted — nothing new will be created',
  no_standard: 'No matching standard at this school — skipped',
  not_licensed: 'Accreditation is not licensed here — skipped',
  forbidden: 'You do not have write access at this school — skipped',
  created: 'Initiative created',
  reused: 'Already adopted — the existing initiative was kept',
  failed: 'Failed — nothing was created here',
})

export function adoptStatusLabel(status) {
  return ADOPT_STATUS_LABELS[status] ?? String(status ?? 'Unknown')
}

const SKIPPED = new Set(['no_standard', 'not_licensed', 'forbidden'])

/**
 * A FAILED ROW IS NOT A PENDING ROW. Without its own tone `failed` fell through
 * to the gold "pending" pill — visually indistinguishable from "will create",
 * on the one screen whose job is to say what actually happened.
 */
function StatusPill({ status }) {
  const skipped = SKIPPED.has(status)
  const done = status === 'created' || status === 'reused' || status === 'already_adopted'
  const failed = status === 'failed'
  const tone = failed
    ? 'border-danger/50 bg-danger/10 text-danger'
    : skipped
      ? 'border-rule/70 bg-section text-muted'
      : done
        ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700'
        : 'border-gold/40 bg-gold/10 text-navy'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}
    >
      {adoptStatusLabel(status)}
    </span>
  )
}

/**
 * The per-school list — every school, every status, no filtering.
 *
 * `failureMessage` is rendered because the server sent it and it is the only
 * statement of WHY a school in a fourteen-school push did not get its
 * initiative. Dropping it renders a failed school identically to a succeeded
 * one, and a superintendent is told a push landed everywhere when it landed at
 * eleven.
 */
function PreviewList({ schools, heading, summary = null }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{heading}</p>
      {summary && <p className="mt-1 text-[12.5px] font-semibold text-navy">{summary}</p>}
      <ul className="mt-1.5 space-y-1.5">
        {schools.map((s, i) => (
          <li
            key={s?.schoolId ?? i}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-rule/60 bg-section px-3 py-2"
          >
            <span className="text-[13px] font-semibold text-navy">{s?.name ?? s?.schoolId}</span>
            <StatusPill status={s?.status} />
            {s?.failureMessage ? (
              <span className="w-full text-[12px] leading-snug text-danger">
                {s.failureMessage}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The one-line tally over an APPLIED result, built only from counts the server
 * sent. A count this component cannot read is omitted rather than guessed at.
 */
export function appliedSummary(result) {
  if (!result) return null
  const parts = []
  const add = (n, one, many) => {
    if (Number.isFinite(n) && n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
  }
  add(result.createdCount, 'initiative created', 'initiatives created')
  add(result.reusedCount, 'already adopted', 'already adopted')
  add(result.skippedCount, 'school skipped', 'schools skipped')
  add(result.failedCount, 'school could not be applied', 'schools could not be applied')
  if (parts.length === 0) return null
  return parts.join(' · ')
}

export default function BulkAdoptFlow({
  priority = null, // the §5 priorities[] row this pushes
  onPropose, // async ({ title, dueDate, targetRubricScore }) => proposal payload
  onConfirm, // async ({ proposalHash, title, dueDate, targetRubricScore }) => result
  onClose,
  canWrite = true,
}) {
  const [title, setTitle] = useState(
    priority?.code ? `Diocesan intervention — ${priority.code}` : '',
  )
  const [dueDate, setDueDate] = useState('')
  const [proposal, setProposal] = useState(null) // { schools[], proposalHash }
  const [result, setResult] = useState(null) // { schools[] }
  const [busy, setBusy] = useState(null) // 'propose' | 'confirm' | null
  const [error, setError] = useState('')

  const previewSchools = useMemo(
    () => (Array.isArray(proposal?.schools) ? proposal.schools : []),
    [proposal],
  )
  const resultSchools = useMemo(
    () => (Array.isArray(result?.schools) ? result.schools : []),
    [result],
  )

  // The confirm gate, stated once: a proposal object carrying a hash must exist.
  const titleOk = title.trim().length >= 3 && title.trim().length <= 200

  // ── THE PROPOSAL IS OVER THESE INPUTS TOO, NOT ONLY OVER THE SCHOOL LIST ────
  // The server hashes the title and the due date alongside the school ids, so
  // editing either after proposing 409s. Left undetected the component blamed the
  // 409 on the SCHOOL LIST — "The list changed since you were shown it" — which is
  // a false statement about a change the user made to a text box. The divergence
  // is knowable locally, so it is said locally, and Confirm is closed until the
  // list has been proposed again.
  const inputsChanged =
    proposal != null &&
    (proposal.proposedTitle !== title.trim() || proposal.proposedDueDate !== (dueDate || ''))

  const confirmDisabled =
    !proposal || !proposal.proposalHash || !titleOk || busy !== null || !canWrite || inputsChanged

  const willCreate = previewSchools.filter((s) => s?.status === 'will_create').length
  const summary = appliedSummary(result)

  const propose = async () => {
    setBusy('propose')
    setError('')
    setResult(null)
    try {
      const payload = await onPropose?.({ title: title.trim(), dueDate: dueDate || undefined })
      // Seam guard: §6.2 names the preview array `schools`; accept `preview` too
      // rather than render an empty list if the API settles on the other name.
      const schools = Array.isArray(payload?.schools)
        ? payload.schools
        : Array.isArray(payload?.preview)
          ? payload.preview
          : []
      // The inputs the hash was taken over, snapshotted LOCALLY. The propose
      // response echoes `title` but not `dueDate`, and a local snapshot is what
      // we actually sent — the honest thing to compare against.
      setProposal({
        ...payload,
        schools,
        proposedTitle: title.trim(),
        proposedDueDate: dueDate || '',
      })
    } catch (e) {
      setProposal(null)
      setError(readError(e) ?? 'The proposal could not be prepared.')
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    if (confirmDisabled) return
    setBusy('confirm')
    setError('')
    try {
      const payload = await onConfirm?.({
        proposalHash: proposal.proposalHash,
        title: title.trim(),
        dueDate: dueDate || undefined,
      })
      // ── A FAILED SCHOOL MUST NOT RENDER AS A SUCCEEDED ONE ────────────────
      // The server names failures twice — `status: 'failed'` + `failureMessage`
      // on the row, and `failures[]` alongside — and this reconciles the two
      // rather than trusting one. `applied === false` on a row the server still
      // described in the preview tense is a REGRESSION, and this is the second
      // line of defence against it reaching a superintendent as "will create".
      const failures = Array.isArray(payload?.failures) ? payload.failures : []
      const messageFor = new Map(failures.map((f) => [f?.schoolId, f?.message]))
      const schools = (Array.isArray(payload?.schools) ? payload.schools : []).map((s) => {
        const failed = messageFor.has(s?.schoolId) || s?.applied === false
        if (!failed || SKIPPED.has(s?.status)) return s
        return {
          ...s,
          status: 'failed',
          failureMessage: s?.failureMessage ?? messageFor.get(s?.schoolId) ?? null,
        }
      })
      setResult({ ...payload, schools, failures })
      setProposal(null)
    } catch (e) {
      const stale = isStale(e)
      setError(
        stale
          ? 'The list changed since you were shown it. Propose again and review the new list before confirming.'
          : (readError(e) ?? 'The adoption could not be applied.'),
      )
      if (stale) setProposal(null)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-gold/30 bg-gold/[0.05] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-serif text-[15px] font-semibold text-navy">
          <Users size={16} aria-hidden className="text-gold" />
          Push one intervention to these schools
        </h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] font-semibold text-muted underline-offset-2 hover:underline"
          >
            Close
          </button>
        )}
      </div>

      <p className="mt-1 text-[12.5px] leading-snug text-muted">
        One initiative is created at each school, on that school&apos;s own copy of the standard.
        Schools that already adopted it keep the initiative they have — nothing is duplicated.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Initiative title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="min-h-[40px] rounded-lg border-2 border-hair bg-white px-3 text-[14px] font-medium normal-case tracking-normal text-navy outline-none ring-gold/40 focus-visible:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Due date (optional)
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            className="min-h-[40px] w-full rounded-lg border-2 border-hair bg-white px-3 text-left text-[14px] font-medium normal-case tracking-normal text-navy outline-none ring-gold/40 focus-visible:ring-2"
          />
        </label>
      </div>

      {!titleOk && (
        <p className="mt-2 text-[12px] text-muted">
          Give the initiative a title of at least 3 characters before proposing.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={propose}
          disabled={busy !== null || !titleOk || !canWrite}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border-2 border-hair px-3.5 text-[13.5px] font-semibold text-navy transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'propose' && <Loader2 size={14} aria-hidden className="animate-spin" />}
          {proposal ? 'Re-propose' : 'Propose'}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={confirmDisabled}
          aria-disabled={confirmDisabled}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-gold-gradient px-4 text-[13.5px] font-semibold text-white shadow-glow transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {busy === 'confirm' && <Loader2 size={14} aria-hidden className="animate-spin" />}
          <Check size={14} aria-hidden />
          Confirm
        </button>
        {!proposal && !result && (
          <span className="text-[12px] text-muted">
            Propose first — confirm stays disabled until you have seen the list.
          </span>
        )}
        {proposal && !inputsChanged && (
          <span className="text-[12px] text-muted">
            {willCreate} of {previewSchools.length} would create a new initiative.
          </span>
        )}
        {inputsChanged && (
          <span className="text-[12px] font-semibold text-navy">
            You changed the {proposal.proposedTitle !== title.trim() ? 'title' : 'due date'} after
            proposing. Propose again to refresh the list before confirming.
          </span>
        )}
      </div>

      {!canWrite && (
        <p className="mt-2 text-[12.5px] font-semibold text-muted">
          You are not an owner or business manager at every school in this list, so this action is
          read-only for you.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] font-semibold text-danger"
        >
          <AlertTriangle size={14} aria-hidden className="mt-[1px] shrink-0" />
          {error}
        </p>
      )}

      {previewSchools.length > 0 && (
        <PreviewList schools={previewSchools} heading="Proposed — review before confirming" />
      )}
      {resultSchools.length > 0 && (
        <PreviewList schools={resultSchools} heading="Applied" summary={summary} />
      )}
    </div>
  )
}

// ── error readers (axios shapes; no interpretation of a server sentence) ──────
function isStale(e) {
  return e?.response?.status === 409 || e?.response?.data?.code === 'PROPOSAL_STALE'
}
function readError(e) {
  const msg = e?.response?.data?.message
  if (typeof msg === 'string') return msg
  if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0]
  // A LOCALLY thrown Error (no HTTP response) carries a user-facing sentence the
  // page composed before it was willing to send the request — e.g. "no school in
  // this priority is below the threshold". An axios error's own `.message` is
  // "Request failed with status code 400" and is deliberately NOT surfaced.
  if (!e?.response && typeof e?.message === 'string' && e.message) return e.message
  return null
}
