// ─────────────────────────────────────────────────────────────────────────────
// InitiativeDrawer — one initiative, in full: the milestone plan, the KPI it is
// bound to, the recorded progress series, and BOTH risk fields.
//
// THE THREE HONESTY RAILS THIS COMPONENT EXISTS TO HOLD
//
// 1. `progressSource === null` is the legacy shape, and it reads EXACTLY as it
//    did before Phase G: "Status only". No bar, no percentage, no zero. A legacy
//    row that suddenly showed "0% complete" would be this phase inventing a fact
//    about work nobody has measured.
//
// 2. `riskSignal` (COMPUTED from pace, due date and staleness) and `riskLevel`
//    (a HUMAN's call) are two different claims and are rendered as two separately
//    labelled chips. They are never merged, never defaulted into each other, and a
//    null `riskLevel` renders NOTHING — not "none", which would silently report
//    that somebody assessed the risk as low.
//
// 3. `projectedCompletionDate` is printed only when the server sent one. When it
//    is null the server's literal `projectionReason` is printed instead, so the
//    absence of a forecast is explained rather than papered over with "—".
//
// 4. A PACE VERDICT NEEDS A SCHEDULE WINDOW. `computePace` falls back to
//    "expected 0%" when an initiative has no start date, so 0%-done work due
//    tomorrow comes back `on_track`. On /strategy that is rare (the plan's start
//    date fills in); here the start-date field is optional and hidden on the
//    adopt path, so a null start is the NORMAL case. `expectedPct === null` is
//    the server's own signal that there is no window, and this component prints
//    "No schedule window" rather than "On pace" — which would be a claim nothing
//    supports.
//
// AND IT IS NOT READ-ONLY. Until it had these controls, an initiative could only
// be created and deleted: an adopted recommendation was permanently "Status
// only", a milestone could never be ticked, nothing could be marked done, and
// `POST .../progress` had no call site anywhere in the app — so the sparkline was
// permanently empty and no projection could ever be emitted. Every write below
// goes to an endpoint that already existed.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarClock,
  CircleCheck,
  Circle,
  Flag,
  Gauge,
  Link2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import ProgressSparkline from './ProgressSparkline.jsx'
import { METRIC_OPTIONS, isPercentMetric } from '../../hooks/useStrategy.js'
import { measurementPatch, milestonesWithToggle } from './improvementFlow.jsx'
import {
  IMPROVEMENT_HUE,
  ORIGIN_LABELS,
  PACE_LABELS,
  PROGRESS_SOURCE_LABELS,
  RISK_LEVEL_LABELS,
  RISK_SIGNAL_META,
  STATUS_LABELS,
  hueAlpha,
  milestoneCounts,
  pctLabel,
  shortDate,
} from './improvementMeta.js'

const TONE_CLASS = {
  bad: 'border-danger/35 bg-danger/10 text-danger',
  warn: 'border-amber-400/40 bg-amber-50 text-amber-700',
  good: 'border-emerald-400/40 bg-emerald-50 text-emerald-700',
  neutral: 'border-rule/60 bg-cream/60 text-muted',
}

function Chip({ label, value, tone = 'neutral', testId }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${TONE_CLASS[tone] ?? TONE_CLASS.neutral}`}
      >
        {value}
      </span>
    </span>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule/40 py-1.5 last:border-0">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="text-[13px] text-navy">{children}</span>
    </div>
  )
}

function Section({ title, Icon, children }) {
  return (
    <section className="rounded-xl border border-rule/50 bg-white p-3.5">
      <h3 className="flex items-center gap-1.5 font-serif text-[15px] font-semibold text-navy">
        {Icon ? <Icon size={14} aria-hidden style={{ color: IMPROVEMENT_HUE }} /> : null}
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

const STATUS_OPTIONS = ['planned', 'in_progress', 'blocked', 'done', 'cancelled']

/** progressSource picker — '' is NULL, the "status only" contract. */
const SOURCE_OPTIONS = [
  { value: '', label: 'Status only — nothing computed' },
  { value: 'metric', label: 'A KPI we already track' },
  { value: 'milestone', label: 'Milestones I list' },
  { value: 'task_rollup', label: 'Tasks linked to this initiative' },
  { value: 'manual', label: 'A percentage I set by hand' },
]

const FIELD =
  'w-full rounded-lg border border-rule/60 bg-white px-2 py-1.5 text-[13px] text-navy focus:border-transparent focus:outline-none focus:ring-2'

/** The civil day, for a reading recorded now. */
const todayIso = () => new Date().toISOString().slice(0, 10)

/** The draft the measurement editor opens with — the row's own stored values. */
function draftOf(it) {
  const pctMetric = it?.metricKey ? isPercentMetric(it.metricKey) : false
  return {
    progressSource: it?.progressSource ?? '',
    metricKey: it?.metricKey ?? '',
    targetValue:
      it?.target == null ? '' : String(pctMetric ? Number(it.target) * 100 : Number(it.target)),
    manualProgressPct:
      it?.progressSource === 'manual' && it?.progressPct != null
        ? String(Math.round(Number(it.progressPct) * 100))
        : '',
    milestoneLines: (it?.milestones ?? []).map((m) => m.label).join('\n'),
  }
}

export default function InitiativeDrawer({
  initiative,
  onClose,
  onDelete,
  onUpdate,
  onRecordReading,
  canEdit = false,
  reduce = false,
}) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!initiative) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [initiative, onClose])

  const it = initiative
  const statusOnly = !it || it.progressSource == null
  const pct = it ? pctLabel(it.progressPct) : null
  const expected = it ? pctLabel(it.expectedPct) : null
  const signal = it ? (RISK_SIGNAL_META[it.riskSignal] ?? RISK_SIGNAL_META.none) : null
  const ms = it ? milestoneCounts(it.milestones) : null
  // No start date (or no due date) means no schedule window, which means the
  // pace verdict is a fallback rather than a finding. Say so instead.
  const paceKnown = !!it && it.expectedPct != null

  // ── The write path ─────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => draftOf(initiative))
  const openId = it?.id ?? null
  const [draftFor, setDraftFor] = useState(openId)

  if (openId !== draftFor) {
    // A different initiative is a different draft, adjusted DURING RENDER (the
    // documented React pattern) rather than in an effect — an effect here would
    // render one frame of the previous row's draft over the new row. Keyed on
    // the id, not the whole object, so a refresh cannot wipe what is being typed.
    setDraftFor(openId)
    setDraft(draftOf(initiative))
    setEditing(false)
    setWriteError('')
  }

  const save = useCallback(
    async (body) => {
      if (!it || !onUpdate) return
      setBusy(true)
      setWriteError('')
      try {
        await onUpdate(it.id, body)
      } catch {
        setWriteError('That change could not be saved. Nothing was recorded.')
      } finally {
        setBusy(false)
      }
    },
    [it, onUpdate],
  )

  const recordReading = useCallback(async () => {
    if (!it || !onRecordReading) return
    setBusy(true)
    setWriteError('')
    try {
      // THE READING IS WHAT THE PRODUCT ALREADY COMPUTED, stamped with the day it
      // was true — never a number the user types. That is the whole premise of
      // the phase, and it is what makes the recorded series worth extrapolating.
      await onRecordReading(it.id, {
        observedOn: todayIso(),
        source: it.progressSource,
        pct: Number(it.progressPct),
        ...(it.current == null ? {} : { value: Number(it.current) }),
      })
    } catch {
      setWriteError('That reading could not be recorded.')
    } finally {
      setBusy(false)
    }
  }, [it, onRecordReading])

  const canRecord =
    canEdit &&
    !!onRecordReading &&
    !!it &&
    it.progressPct != null &&
    ['metric', 'milestone', 'task_rollup'].includes(it.progressSource)

  const metricOptions = useMemo(
    () => METRIC_OPTIONS.map((m) => ({ value: m.key, label: m.label })),
    [],
  )

  return (
    <AnimatePresence>
      {it ? (
        <motion.div
          key="improvement-drawer"
          className="fixed inset-0 z-50 flex justify-end"
          initial={reduce ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close initiative"
            onClick={onClose}
            className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${it.title} — initiative detail`}
            initial={reduce ? false : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-cream shadow-2xl"
          >
            {/* Header */}
            <div
              className="sticky top-0 z-10 border-b border-rule/50 bg-white/95 px-4 py-3 backdrop-blur"
              style={{ boxShadow: `inset 0 -2px 0 0 ${hueAlpha(0.25)}` }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {ORIGIN_LABELS[it.originType] ?? it.originType}
                    {it.originRef ? ` · ${it.originRef}` : ''}
                  </p>
                  <h2 className="mt-0.5 font-serif text-[19px] font-semibold leading-tight text-navy">
                    {it.title}
                  </h2>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-full border border-rule/60 bg-white p-1.5 text-muted transition hover:text-navy"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Chip label="Status" value={STATUS_LABELS[it.status] ?? it.status} />
                {/* ── The two risk fields. NEVER merged. ───────────────────── */}
                <Chip
                  label="Signal"
                  value={signal.label}
                  tone={signal.tone}
                  testId="risk-signal"
                />
                {it.riskLevel ? (
                  <Chip
                    label="Risk (set by your team)"
                    value={RISK_LEVEL_LABELS[it.riskLevel] ?? it.riskLevel}
                    testId="risk-level"
                  />
                ) : null}
              </div>
              {it.riskNote ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{it.riskNote}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 p-4">
              {/* ── Progress ─────────────────────────────────────────────── */}
              <Section title="Progress" Icon={Gauge}>
                {statusOnly ? (
                  <p className="text-[13px] leading-relaxed text-muted" data-testid="status-only">
                    <span className="font-semibold text-navy">
                      {it.progressBasis ?? 'Status only'}
                    </span>{' '}
                    {it.metricKey ? (
                      <>
                        — a KPI is named on this initiative but progress is not bound to it, so
                        nothing is computed. {canEdit ? 'Bind it below' : 'An owner or accountant can bind it'} and
                        progress starts measuring itself.
                      </>
                    ) : (
                      <>
                        — this initiative reports its status and nothing is computed for it.{' '}
                        {canEdit ? 'Bind it below to' : 'An owner or accountant can bind it to'} a KPI,
                        list milestones, or link tasks to it and progress starts measuring itself.
                      </>
                    )}
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-[26px] font-semibold text-navy" data-testid="progress-pct">
                        {pct ?? '—'}
                      </span>
                      <span className="text-[12.5px] text-muted">{it.progressBasis}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-section">
                      {it.progressPct != null ? (
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(Math.max(Number(it.progressPct), 0), 1) * 100}%`,
                            background: IMPROVEMENT_HUE,
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                      {paceKnown ? (
                        <span data-testid="pace-label">{PACE_LABELS[it.paceStatus] ?? it.paceStatus}</span>
                      ) : (
                        <span data-testid="pace-unknown">
                          No schedule window — add a start and a due date to judge pace
                        </span>
                      )}
                      {expected ? <span>· expected {expected} by now</span> : null}
                      {it.overshoot ? <span>· past target</span> : null}
                      {it.progressSource ? (
                        <span>· {PROGRESS_SOURCE_LABELS[it.progressSource] ?? it.progressSource}</span>
                      ) : null}
                    </div>
                  </>
                )}

                <div className="mt-3">
                  {it.projectedCompletionDate ? (
                    <p className="text-[12.5px] text-navy" data-testid="projection">
                      Projected to finish{' '}
                      <span className="font-semibold">
                        {shortDate(it.projectedCompletionDate) ?? it.projectedCompletionDate}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[12.5px] text-muted" data-testid="projection-reason">
                      {it.projectionReason ?? 'No completion date is projected.'}
                    </p>
                  )}
                </div>
              </Section>

              {/* ── The recorded series ──────────────────────────────────── */}
              <Section title="Recorded readings" Icon={CalendarClock}>
                <ProgressSparkline trend={it.trend ?? []} hue={IMPROVEMENT_HUE} />
              </Section>

              {/* ── KPI binding ──────────────────────────────────────────── */}
              {it.metricKey || it.targetRubricScore != null ? (
                <Section title="What it is measured against" Icon={Flag}>
                  {it.metricKey ? (
                    <>
                      <Row label="KPI">{it.metricLabel ?? it.metricKey}</Row>
                      <Row label="Baseline">{it.formattedBaseline ?? '—'}</Row>
                      <Row label="Now">{it.formattedCurrent ?? '—'}</Row>
                      <Row label="Target">{it.formattedTarget ?? '—'}</Row>
                    </>
                  ) : null}
                  {it.targetRubricScore != null ? (
                    <Row label="Target rubric score">{it.targetRubricScore} of 4</Row>
                  ) : null}
                </Section>
              ) : null}

              {/* ── Milestones ───────────────────────────────────────────── */}
              {Array.isArray(it.milestones) && it.milestones.length > 0 ? (
                <Section title={`Milestones · ${ms.done} of ${ms.total}`} Icon={CircleCheck}>
                  <ul className="flex flex-col gap-1.5">
                    {it.milestones.map((m, i) => {
                      const icon = m.done ? (
                        <CircleCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                      ) : (
                        <Circle size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                      )
                      const label = (
                        <span className={m.done ? 'text-muted line-through' : 'text-navy'}>{m.label}</span>
                      )
                      return (
                        <li key={m.id ?? `${m.label}-${i}`} className="text-[13px]">
                          {canEdit && onUpdate ? (
                            // A milestone list nobody can tick is a progress source
                            // pinned at 0% forever — and the register would call
                            // finished work "behind pace".
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => save({ milestones: milestonesWithToggle(it.milestones, i) })}
                              aria-pressed={m.done === true}
                              className="flex w-full items-start gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-cream/70 disabled:opacity-60"
                            >
                              {icon}
                              {label}
                            </button>
                          ) : (
                            <span className="flex items-start gap-2">
                              {icon}
                              {label}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              ) : null}

              {/* ── Where it sits ────────────────────────────────────────── */}
              <Section title="Where it sits" Icon={Link2}>
                <Row label="Owner">{it.owner?.name ?? 'Unassigned'}</Row>
                <Row label="Start">{shortDate(it.startDate) ?? '—'}</Row>
                <Row label="Due">{shortDate(it.dueDate) ?? '—'}</Row>
                <Row label="Completed">{shortDate(it.completedAt) ?? '—'}</Row>
                <Row label="Last progress">{shortDate(it.lastProgressAt) ?? '—'}</Row>
                {it.goalId ? (
                  <Row label="Strategic goal">
                    {[it.pillarName, it.goalTitle].filter(Boolean).join(' · ') || '—'}
                  </Row>
                ) : (
                  <Row label="Strategic goal">Not linked to a plan goal</Row>
                )}
                {it.linkedTaskCounts ? (
                  <Row label="Linked tasks">
                    {it.linkedTaskCounts.done} of {it.linkedTaskCounts.total} done
                  </Row>
                ) : null}
                {it.findingKey ? <Row label="Finding">{it.findingKey}</Row> : null}
              </Section>

              {/* ── The write path. Editors only; every endpoint pre-existed. ── */}
              {canEdit && onUpdate ? (
                <Section title="Update this initiative" Icon={SlidersHorizontal}>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-[170px] flex-1 flex-col gap-1">
                      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                        Status
                      </span>
                      <select
                        className={FIELD}
                        value={it.status}
                        disabled={busy}
                        onChange={(e) => save({ status: e.target.value })}
                        data-testid="status-select"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s] ?? s}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canRecord ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={recordReading}
                        data-testid="record-reading"
                        className="rounded-full border border-rule/70 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy transition hover:border-gold/60 disabled:opacity-60"
                      >
                        Record today’s reading ({pct})
                      </button>
                    ) : null}
                  </div>

                  {canRecord ? (
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                      Records the figure this page already computed, stamped with today’s date. Two
                      readings a fortnight apart are what a completion date is projected from.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className="mt-3 text-[12.5px] font-semibold underline decoration-dotted"
                    style={{ color: IMPROVEMENT_HUE }}
                    data-testid="measure-toggle"
                  >
                    {editing ? 'Cancel' : 'Change how this is measured'}
                  </button>

                  {editing ? (
                    <div className="mt-2 flex flex-col gap-2.5 rounded-lg border border-rule/50 bg-cream/40 p-2.5">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Where does progress come from?
                        </span>
                        <select
                          className={FIELD}
                          value={draft.progressSource}
                          onChange={(e) => setDraft({ ...draft, progressSource: e.target.value })}
                          data-testid="source-select"
                        >
                          {SOURCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {draft.progressSource === 'metric' ? (
                        <>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                              KPI
                            </span>
                            <select
                              className={FIELD}
                              value={draft.metricKey}
                              onChange={(e) => setDraft({ ...draft, metricKey: e.target.value })}
                              data-testid="metric-select"
                            >
                              <option value="">No KPI</option>
                              {metricOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                              Target value
                            </span>
                            <input
                              className={FIELD}
                              type="number"
                              step="any"
                              value={draft.targetValue}
                              onChange={(e) => setDraft({ ...draft, targetValue: e.target.value })}
                              data-testid="target-input"
                            />
                            <span className="text-[11.5px] text-muted">
                              In the KPI’s own unit — a percentage is entered as 8.5, not 0.085.
                            </span>
                          </label>
                        </>
                      ) : null}

                      {draft.progressSource === 'milestone' ? (
                        <label className="flex flex-col gap-1">
                          <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                            Milestones — one per line
                          </span>
                          <textarea
                            className={FIELD}
                            rows={4}
                            value={draft.milestoneLines}
                            onChange={(e) => setDraft({ ...draft, milestoneLines: e.target.value })}
                            data-testid="milestone-lines"
                          />
                          <span className="text-[11.5px] text-muted">
                            Milestones already ticked stay ticked.
                          </span>
                        </label>
                      ) : null}

                      {draft.progressSource === 'manual' ? (
                        <label className="flex flex-col gap-1">
                          <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                            Progress so far (%)
                          </span>
                          <input
                            className={FIELD}
                            type="number"
                            min="0"
                            max="100"
                            value={draft.manualProgressPct}
                            onChange={(e) =>
                              setDraft({ ...draft, manualProgressPct: e.target.value })
                            }
                            data-testid="manual-input"
                          />
                          <span className="text-[11.5px] text-muted">
                            A hand-set percentage never projects a completion date and never feeds an
                            org score.
                          </span>
                        </label>
                      ) : null}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          await save(measurementPatch(draft, it))
                          setEditing(false)
                        }}
                        data-testid="measure-save"
                        className="self-start rounded-full btn-cta px-3.5 py-1.5 text-[12.5px] font-semibold transition disabled:opacity-60"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}

                  {writeError ? (
                    <p className="mt-2 text-[12.5px] font-semibold text-danger" data-testid="write-error">
                      {writeError}
                    </p>
                  ) : null}
                </Section>
              ) : null}

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => onDelete?.(it)}
                  className="inline-flex items-center gap-1.5 self-start rounded-full border border-danger/40 px-3 py-1.5 text-[12.5px] font-semibold text-danger transition hover:bg-danger/10"
                >
                  <Trash2 size={13} aria-hidden /> Delete initiative
                </button>
              ) : null}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
