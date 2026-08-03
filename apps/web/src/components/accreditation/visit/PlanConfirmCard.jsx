// ─────────────────────────────────────────────────────────────────────────────
// PlanConfirmCard — ACT 6, STEP 2. NOTHING IS WRITTEN UNTIL THE USER CONFIRMS.
//
// The card lists exactly the items that will be created, one row each, with an
// owner picker and a due-date input. Its own copy names the COUNT and nothing
// else; every per-item sentence on screen is the server's `title` and `rationale`,
// verbatim.
//
// THE WRITE PATH IS PHASE G'S, UNCHANGED. On confirm the card issues one
// `POST /schools/:id/improvement/adopt` per selected row, sequentially, through
// the existing `improvementApi.adopt`. There is NO new endpoint, no bulk route, no
// new DTO and no `@IsIn` list to keep in sync — that quintet has 400'd `/apply`
// twice in this repo and this phase gives it no opportunity.
//
// 200 MEANS "ALREADY BEING WORKED", NEVER "CREATED". Phase G's adopt is idempotent
// by Postgres uniqueness and deliberately answers 200 rather than 201 on a repeat.
// A card that toasted "Created" for both would tell a school it made a second
// commitment it did not make — so the status code is read, not assumed, and the
// two outcomes get two different words. A spec pins it.
//
// A PARTIAL FAILURE IS REPORTED PER ROW AND NEVER ROLLED BACK, because the path is
// idempotent and re-running the whole confirm is safe. The copy says so, so a user
// staring at "1 failed" knows that pressing the button again is not how they end
// up with duplicates.
//
// …AND THE REPORT OUTLIVES THE REFETCH. The run ends by calling `onDone`, which
// refetches `/visit`; the new payload has a new `plan.items` identity, and the
// created rows are gone from it (the server drops what has been adopted). Two
// things followed from that and both destroyed the report: the page unmounted this
// card, and the tally — computed over the CURRENT rows — lost every row that had
// succeeded. A user who saw "1 created · 1 failed — retry" for a few milliseconds
// was left staring at a draft with the failed item silently back in it, re-ticked
// by default, with nothing on screen saying anything had gone wrong.
//
// So the card FREEZES the rows it ran at the moment it runs them, and the tally is
// the run's OWN result rather than a projection of current state. Whatever the
// page does with its draft afterwards, the report says what happened.
//
// THE ENGINE SUGGESTS A ROLE, NEVER A PERSON. The members roster carries an access
// role, not a job title, so the suggested owner is shown as a hint and the picker
// still opens Unassigned. An empty roster (a viewer 403s on the members endpoint)
// simply omits the picker rather than rendering a dead control.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleCheck, Loader2, X } from 'lucide-react'
import DatePicker from '../../ui/DatePicker.jsx'
import { OWNER_ROLE_LABELS } from '../../improvement/improvementMeta.js'
import { planItemId } from './ActPlan.jsx'

/** The three per-row outcomes. Frozen: 200 and 201 never share a word. */
export const ROW_COPY = Object.freeze({
  created: 'Created',
  existing: 'Already being worked',
  failed: 'Failed — retry',
})

/** Frozen. The sentence that makes pressing the button twice safe to do. */
export const RERUN_SAFE_NOTE =
  'Adopting the same item twice returns the same initiative — it never mints a second plan. Re-running this whole confirmation is safe.'

function memberLabel(m) {
  return [m?.firstName, m?.lastName].filter(Boolean).join(' ').trim() || m?.email || 'Member'
}

function RowStatus({ state }) {
  if (!state) return null
  if (state === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted">
        <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden /> Working…
      </span>
    )
  }
  const tone =
    state === 'created'
      ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700'
      : state === 'existing'
        ? 'border-navy/20 bg-navy/5 text-navy'
        : 'border-danger/30 bg-danger/10 text-danger'
  const Icon = state === 'failed' ? AlertTriangle : state === 'created' ? Check : CircleCheck
  return (
    <span
      data-testid={`row-${state}`}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold ${tone}`}
    >
      <Icon size={11} aria-hidden /> {ROW_COPY[state]}
    </span>
  )
}

export default function PlanConfirmCard({
  /** The selected draft items, in the server's order. */
  items = [],
  /** School members for the owner picker. Empty → no picker at all. */
  members = [],
  /**
   * `(item, { ownerUserId, dueDate }) => Promise<{status:number}>`.
   * The page hands in `improvementApi.adopt` bound to the school. This component
   * never builds a URL and never touches axios directly.
   */
  adopt,
  onCancel,
  /** Called once, after the whole run, so the page can refetch `/visit`. */
  onDone,
}) {
  // Memoised so the run loop and the tally are not rebuilt on every keystroke in
  // a due-date field.
  const live = useMemo(() => (Array.isArray(items) ? items : []), [items])
  const [owners, setOwners] = useState({})
  const [dueDates, setDueDates] = useState({})
  const [states, setStates] = useState({})
  const [running, setRunning] = useState(false)
  /**
   * THE ROWS THIS CARD RAN, captured at run time. Null until it runs. Once it has
   * run, the card reports on THOSE rows for as long as it is mounted — the refetch
   * `onDone` triggers removes the successful ones from `items`, and a report that
   * silently drops the rows it is reporting on is not a report.
   */
  const [ranRows, setRanRows] = useState(null)
  /** The run's OWN outcome counts. Null until it runs; never re-derived from `items`. */
  const [tally, setTally] = useState(null)
  const rows = ranRows ?? live
  const ran = tally !== null

  const setOwner = useCallback((id, v) => setOwners((s) => ({ ...s, [id]: v })), [])
  const setDue = useCallback((id, v) => setDueDates((s) => ({ ...s, [id]: v })), [])

  const run = useCallback(async () => {
    if (!adopt || running) return
    setRunning(true)
    // THE SET IS FIXED HERE, before the first request. `items` can change under us
    // mid-run (the page refetches on the shared change channel), and a run that
    // reported on a moving list would be reporting on nothing in particular.
    const ranNow = rows
    setRanRows(ranNow)
    // Sequential, not Promise.all: one row per request, so a 400 on one row cannot
    // be mistaken for the whole run failing and the per-row report stays truthful.
    const next = {}
    for (const item of ranNow) {
      const id = planItemId(item)
      setStates((s) => ({ ...s, [id]: 'running' }))
      try {
        const res = await adopt(item, {
          ownerUserId: owners[id] || null,
          dueDate: dueDates[id] || null,
        })
        // 201 CREATED versus 200 OK is the whole distinction. Read it; never assume.
        next[id] = res?.status === 201 ? 'created' : 'existing'
      } catch {
        next[id] = 'failed'
      }
      setStates((s) => ({ ...s, [id]: next[id] }))
    }
    setRunning(false)
    // Counted from the run's own outcomes, not from current state — so `onDone`'s
    // refetch cannot quietly subtract the rows that succeeded from the tally that
    // says they did.
    const t = { created: 0, existing: 0, failed: 0 }
    for (const s of Object.values(next)) if (s in t) t[s] += 1
    setTally(t)
    onDone?.()
  }, [adopt, running, rows, owners, dueDates, onDone])

  if (rows.length === 0) return null

  return (
    <div
      className="rounded-2xl border-2 border-navy/20 bg-white p-4 shadow-sm"
      data-testid="plan-confirm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-[17px] font-semibold text-navy">
          {/* The count, and nothing else. */}
          {rows.length === 1
            ? 'This will create 1 initiative'
            : `This will create ${rows.length} initiatives`}
        </h3>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-full border border-rule/70 bg-white px-3 py-1 text-[12.5px] font-semibold text-navy transition hover:border-navy/40"
        >
          <X size={12} aria-hidden /> Cancel
        </button>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{RERUN_SAFE_NOTE}</p>

      <ul className="mt-3 space-y-2">
        {rows.map((item) => {
          const id = planItemId(item)
          return (
            <li key={id} className="rounded-xl border border-rule/50 bg-cream/30 p-3" data-testid="confirm-row">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  {/* The server's sentences. Verbatim, both of them. */}
                  <p className="text-[13.5px] font-semibold leading-snug text-navy">{item?.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{item?.rationale}</p>
                </div>
                <RowStatus state={states[id]} />
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-2.5">
                {members.length > 0 ? (
                  <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">
                    Owner
                    <select
                      value={owners[id] ?? ''}
                      onChange={(e) => setOwner(id, e.target.value)}
                      disabled={running || ran}
                      className="rounded-lg border border-rule/70 bg-white px-2 py-1 text-[12.5px] font-normal text-navy"
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {memberLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">
                  Due date
                  <DatePicker
                    value={dueDates[id] ?? ''}
                    onChange={(v) => setDue(id, v)}
                    disabled={running || ran}
                    aria-label={`Due date for ${item?.title ?? 'this item'}`}
                  />
                </label>
                {item?.suggestedOwnerRole ? (
                  <span className="pb-1 text-[11.5px] text-muted">
                    Suggested:{' '}
                    {OWNER_ROLE_LABELS[item.suggestedOwnerRole] ?? item.suggestedOwnerRole}
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-full btn-cta px-4 py-2 text-[13.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> : null}
          {ran ? 'Run again' : 'Create these initiatives'}
        </button>
        {tally ? (
          <p className="text-[12.5px] font-semibold text-navy" data-testid="run-tally">
            {/* Counts only. "created" is spoken ONLY of rows that were created. */}
            {[
              tally.created > 0 ? `${tally.created} created` : null,
              tally.existing > 0 ? `${tally.existing} already being worked` : null,
              tally.failed > 0 ? `${tally.failed} failed — retry` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
