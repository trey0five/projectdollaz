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
//
// PREMIUM UI P4 (a2): the card is a Panel — the one raised surface, because it
// is the one place on the visit page that writes. Rows are ruled, the per-row
// outcome is a ledger Pill with a semantic mark, fields are plain, actions flat.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleCheck, Loader2, X } from 'lucide-react'
import DatePicker from '../../ui/DatePicker.jsx'
import { Select, fieldInput } from '../../ui/EntityFormModal.jsx'
import { OWNER_ROLE_LABELS } from '../../improvement/improvementMeta.js'
import { planItemId } from './ActPlan.jsx'
import { memberLabel } from '../../../lib/memberLabels.js'
import { Button, Panel, Pill } from '../../ui/surface/index.js'
import '../../../styles/pending/a2-carry.css'

/** The three per-row outcomes. Frozen: 200 and 201 never share a word. */
export const ROW_COPY = Object.freeze({
  created: 'Created',
  existing: 'Already being worked',
  failed: 'Failed — retry',
})

/** Frozen. The sentence that makes pressing the button twice safe to do. */
export const RERUN_SAFE_NOTE =
  'Adopting the same item twice returns the same initiative — it never mints a second plan. Re-running this whole confirmation is safe.'

function RowStatus({ state }) {
  if (!state) return null
  if (state === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink2">
        <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden /> Working…
      </span>
    )
  }
  const tone = state === 'created' ? 'good' : state === 'existing' ? 'neutral' : 'risk'
  const Icon = state === 'failed' ? AlertTriangle : state === 'created' ? Check : CircleCheck
  return (
    <Pill variant="status" tone={tone} data-testid={`row-${state}`}>
      <Icon size={11} aria-hidden /> {ROW_COPY[state]}
    </Pill>
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
    <Panel data-testid="plan-confirm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-[22px] font-medium leading-7 text-ink">
          {/* The count, and nothing else. */}
          {rows.length === 1
            ? 'This will create 1 initiative'
            : `This will create ${rows.length} initiatives`}
        </h3>
        <span className="flex-1" />
        <Button variant="quiet" size="sm" onClick={onCancel} icon={<X size={12} />}>
          Cancel
        </Button>
      </div>
      <p className="mt-1 text-small leading-relaxed text-ink2">{RERUN_SAFE_NOTE}</p>

      <ul className="a2-rows mt-4">
        {rows.map((item) => {
          const id = planItemId(item)
          return (
            <li key={id} data-testid="confirm-row">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  {/* The server's sentences. Verbatim, both of them. */}
                  <p className="text-[14px] font-semibold leading-snug text-ink">{item?.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">{item?.rationale}</p>
                </div>
                <RowStatus state={states[id]} />
              </div>

              <div className="mt-2.5 flex flex-wrap items-end gap-3">
                {members.length > 0 ? (
                  <label className="flex w-56 max-w-full flex-col">
                    <span className="a2-label">Owner</span>
                    <Select
                      value={owners[id] ?? ''}
                      onChange={(e) => setOwner(id, e.target.value)}
                      disabled={running || ran}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {memberLabel(m)}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}
                <label className="flex w-48 max-w-full flex-col">
                  <span className="a2-label">Due date</span>
                  <DatePicker
                    value={dueDates[id] ?? ''}
                    onChange={(v) => setDue(id, v)}
                    disabled={running || ran}
                    aria-label={`Due date for ${item?.title ?? 'this item'}`}
                    className={fieldInput}
                  />
                </label>
                {item?.suggestedOwnerRole ? (
                  <span className="pb-2.5 text-[12px] text-ink2">
                    Suggested:{' '}
                    {OWNER_ROLE_LABELS[item.suggestedOwnerRole] ?? item.suggestedOwnerRole}
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={run}
          disabled={running}
          icon={running ? <Loader2 size={14} className="motion-safe:animate-spin" /> : null}
        >
          {ran ? 'Run again' : 'Create these initiatives'}
        </Button>
        {tally ? (
          <p className="text-small font-semibold tabular-nums text-ink" data-testid="run-tally">
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
    </Panel>
  )
}
