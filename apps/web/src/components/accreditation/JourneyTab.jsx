// ─────────────────────────────────────────────────────────────────────────────
// JourneyTab — F1 THE JOURNEY: where the school is in its accreditation cycle
// (six years for Cognia, seven for FCC/NIPSA — `anchor.termYears` is per school)
// and what is due next. The sixth center tab, placed FIRST, because a head of school
// opening this page should first see WHEN — exposure (Domains) is one click away.
//
// Everything factual on this surface is the CYCLE PAYLOAD's: the phase
// narrative, the countdown, every milestone's state and threshold sentence,
// every not-measurable reason. The web places dates on an axis (geometry, like
// the trend strip), formats them, and computes nothing else.
//
// UNCONFIGURED is a first-class state, not an error: one setup `Panel` asking
// the one question the whole feature hangs on — "when was your last
// accreditation visit?" — with the server's prior-visit suggestion offered as a
// chip (human-confirmed, never silently adopted; PriorVisitPanel's own discipline).
//
// PREMIUM UI P4: the navy shell is gone. The road (CycleRail, now ink on the
// ground with the driven distance in the module hue) sits under a `Section`
// label; "Next up" and the measure tiles are Stats in one strip; milestones
// are ruled rows. Animate once, reduced-motion respected, legibility wins.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Milestone, Pencil, Sparkles, X } from 'lucide-react'
import { CountUp } from '../ui/briefingFx.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { Section, Panel, Button, Pill } from '../ui/surface/index.js'
import { MARK } from '../analytics/v2/statusStyle.js'
import ReadinessTrendStrip from './ReadinessTrendStrip.jsx'
import CycleRail from './CycleRail.jsx'
import MilestoneCard from './MilestoneCard.jsx'
import { formatShortDate } from '../../lib/format.js'

const iso = (v) => (v ? String(v).slice(0, 10) : '')

// B3 — ONLY these measure kinds are true N-of-M counts, where a num/den
// fraction is the honest tile headline. The engine's percentage kinds
// (evidence_currency, defensible, readiness_pair) emit num:0..100/den:100, and
// "0/100" renders a fraction the payload never asserted.
const COUNT_MEASURE_KINDS = ['prior_findings_closed', 'scored']

const stateStatus = (state) => (state === 'overdue' ? 'risk' : state === 'at_risk' ? 'watch' : 'neutral')

/** A count-kind milestone as a Stat: label / "N/M" / the server's sentence. ONE
 *  skeleton with MeasureTextTile — h-full flex column, a 2-line clamped label
 *  box, then the body — so the two kinds share a baseline and a height. */
function MeasureStatTile({ label, value, sub, status = 'neutral', index = 0 }) {
  const mark = MARK[status]
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
      className="stat flex h-full min-w-0 flex-col"
    >
      <span className="stat-label line-clamp-2 min-h-[2.6em]">{label}</span>
      <span className="stat-value num">{value}</span>
      {mark ? <span className={`stat-mark tone-${mark}`} aria-hidden="true" /> : null}
      {sub ? <span className="stat-foot line-clamp-2 leading-snug">{sub}</span> : null}
    </motion.div>
  )
}

// B3 — the non-count measured milestones render the SERVER'S OWN SENTENCE,
// verbatim — never a derived fraction or a re-derived "%". Same skeleton as the
// Stat tile above (label box + status mark), with the sentence as the body.
function MeasureTextTile({ label, text, status = 'neutral', index = 0 }) {
  const mark = MARK[status]
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
      data-testid="journey-measure-text-tile"
      className="stat flex h-full min-w-0 flex-col"
    >
      <span className="stat-label line-clamp-2 min-h-[2.6em]">{label}</span>
      <span className="mt-1 text-small font-medium leading-snug text-ink">{text}</span>
      {mark ? <span className={`stat-mark tone-${mark}`} aria-hidden="true" /> : null}
    </motion.div>
  )
}

function Shell({ children }) {
  return <div className="min-w-0">{children}</div>
}

// ── The setup card — the one question the journey hangs on ───────────────────
function SetupCard({ cycle, canEdit, saving, error, onSubmit, onCancel = null, reduce }) {
  const anchor = cycle?.anchor ?? null
  const [lastReviewDate, setLastReviewDate] = useState(iso(anchor?.lastReviewDate))
  const [nextReviewDate, setNextReviewDate] = useState(iso(anchor?.nextReviewDate))
  // The term defaults to the accreditor's PUBLISHED cycle (7 for FCC/NIPSA, 5
  // for FCIS/ACSI/SAIS, 6 for Cognia/WASC) — never a hard-coded six, which
  // would read "Your 6-year accreditation cycle" beside a 7-year chip. Server-
  // resolved (`framework.defaultTermYears`); 6 only when the payload has none.
  const fwDefault = cycle?.framework?.defaultTermYears ?? cycle?.frameworks?.[0]?.defaultTermYears ?? 6
  const [termYears, setTermYears] = useState(String(anchor?.termYears ?? fwDefault))
  const suggestion = cycle?.suggestion ?? null

  const submit = (e) => {
    e.preventDefault()
    if (!lastReviewDate) return
    const years = Number(termYears)
    onSubmit({
      lastReviewDate,
      nextReviewDate: nextReviewDate ? nextReviewDate : null,
      ...(Number.isInteger(years) && years > 0 ? { termYears: years } : {}),
    })
  }

  const field = 'mt-1 h-9 w-full rounded-md border border-hair/30 bg-white px-3 text-small text-ink outline-none focus:border-ink'

  return (
    <Panel
      as={motion.div}
      data-testid="journey-setup-card"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-6 max-w-xl"
    >
      <div className="flex items-start gap-4">
        <Milestone size={22} className="mt-1 shrink-0 text-ink2" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="pg-eyebrow">Your accreditation journey</p>
          <h3 className="font-serif text-title font-medium leading-tight text-ink">When was your last accreditation visit?</h3>
          <p className="mt-1.5 text-small leading-relaxed text-ink2">
            One date back-plans your whole cycle — the progress report, the self-assessment
            window, the evidence deadline and the visit itself, each measured against what
            you&apos;ve actually recorded here. (For Cognia schools, this is your last
            Engagement Review.)
          </p>
        </div>
        {onCancel ? <Button variant="quiet" size="sm" onClick={onCancel} aria-label="Close" icon={<X size={14} />} /> : null}
      </div>

      {canEdit ? (
        <form onSubmit={submit} className="mt-5 space-y-3.5">
          {suggestion?.lastReviewDate && !lastReviewDate ? (
            <Button
              variant="secondary"
              size="sm"
              data-testid="cycle-suggestion-chip"
              onClick={() => setLastReviewDate(iso(suggestion.lastReviewDate))}
              icon={<Sparkles size={13} />}
            >
              Use {formatShortDate(iso(suggestion.lastReviewDate))} — from your prior-visit ledger
            </Button>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="text-micro font-semibold uppercase text-ink2">Last review</span>
              <DatePicker value={lastReviewDate} onChange={setLastReviewDate} aria-label="Last accreditation visit date" className={field} />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-micro font-semibold uppercase text-ink2">Next review (optional)</span>
              <DatePicker value={nextReviewDate} onChange={setNextReviewDate} aria-label="Next review date override" className={field} />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-micro font-semibold uppercase text-ink2">Term (years)</span>
              <input type="number" min={1} max={10} value={termYears} onChange={(e) => setTermYears(e.target.value)} className={field} />
            </label>
          </div>
          {error ? <p className="text-small text-risk">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={!lastReviewDate || saving}>
              {saving ? 'Saving…' : 'Map my journey'}
            </Button>
            <p className="text-[12px] text-ink2">Leave &ldquo;next review&rdquo; blank and it lands last review + term.</p>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-small text-ink2">Ask an owner to set your last accreditation visit date — one date lights this whole tab.</p>
      )}
    </Panel>
  )
}

// ═════════════════════════════════════════════════════════════════════════════

export default function JourneyTab({
  cycle,
  loading = false,
  error = '',
  notLicensed = false,
  canEdit = false,
  onSave, // async (body-without-frameworkId) => void — the page injects frameworkId
  history = null, // useReadinessTrend value — reused during the implementing window
  reduce = false,
  onNavigate = null, // (path) => void — milestone links
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const submit = async (body) => {
    setSaving(true)
    setSaveErr('')
    try {
      await onSave(body)
      setEditing(false)
    } catch {
      setSaveErr('Could not save your cycle dates. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (notLicensed) return null
  if (loading && !cycle) {
    return (
      <Shell>
        <div className="h-[180px] rounded bg-ink/[.04] motion-safe:animate-pulse" aria-hidden />
        <p className="mt-3 text-small text-ink2">Mapping your accreditation cycle…</p>
      </Shell>
    )
  }
  if (error && !cycle) {
    return (
      <Shell>
        <p className="text-small text-ink2">{error}</p>
      </Shell>
    )
  }
  if (!cycle) return null

  // ── Unconfigured (or editing): the setup card, nothing else ────────────────
  if (!cycle.configured || editing) {
    return (
      <Shell>
        <SetupCard
          cycle={cycle}
          canEdit={canEdit}
          saving={saving}
          error={saveErr}
          onSubmit={submit}
          onCancel={editing ? () => setEditing(false) : null}
          reduce={reduce}
        />
      </Shell>
    )
  }

  const fw = cycle.framework ?? null
  const anchor = cycle.anchor ?? null
  const countdown = cycle.countdown ?? null
  const phase = cycle.phase ?? null
  const milestones = cycle.milestones ?? []
  // The road tiles read each milestone's own server-computed measure — a lookup,
  // never a re-derivation. COUNT kinds become N/M fraction tiles; every other
  // measured milestone shows the server's own sentence verbatim (B3 — the
  // engine's percentage kinds arrive as num/100 and must never print "0/100").
  const measured = milestones.filter((m) => m?.measure)

  return (
    <Shell>
      {/* ── header: the cycle is the subject ("Your 6-year accreditation cycle");
          the accreditor is a Pill, not the headline — the same surface serves a
          7-year FCC or NIPSA school, and the term is the school's own
          (anchor.termYears), never a hard-coded six. ──────────────────────── */}
      <Section
        label={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span data-testid="journey-title">Your {anchor?.termYears ? `${anchor.termYears}-year ` : ''}accreditation cycle</span>
            {fw ? (
              <Pill data-testid="journey-framework-chip" title={fw.name ?? undefined} className="normal-case tracking-normal">
                {fw.accreditor ? `${fw.accreditor}${fw.version ? ` · ${fw.version}` : ''}` : (fw.name ?? '')}
              </Pill>
            ) : null}
          </span>
        }
        aside={
          canEdit ? (
            <Button variant="quiet" size="sm" data-testid="journey-edit-dates" onClick={() => setEditing(true)} icon={<Pencil size={12} />}>
              Edit dates
            </Button>
          ) : null
        }
        className="!mt-0"
      >
        {/* ── the road ─────────────────────────────────────────────────────── */}
        <CycleRail anchor={anchor} today={cycle.today} milestones={milestones} reduce={reduce} />

        {/* ── phase narrative — the server's own sentence about where you are ── */}
        {phase?.narrative ? <p className="mt-2 max-w-[72ch] text-body leading-relaxed text-ink">{phase.narrative}</p> : null}

        {/* ── NEXT UP + the road to review ─────────────────────────────────── */}
        {/* Outer grid stretches its cells (the default), so the Next-up Stat is
            exactly as tall as the 2×2 block beside it — and is a flex column so
            the date line sits at its foot instead of leaving dead space under
            the count. The inner 2×2 uses auto-rows-fr + items-stretch so a
            fraction tile ("25/31") and a sentence tile share one row height;
            every rule lines up. Equal rows only from sm: up — a single mobile
            column takes natural heights. */}
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 border-y border-hair lg:grid-cols-3">
          {countdown ? (
            <div data-testid="journey-next-up" className="stat flex h-full flex-col !pr-6">
              <p className="stat-label inline-flex items-center gap-1.5">
                <CalendarClock size={12} aria-hidden /> Next up
              </p>
              <p className="mt-1 text-body font-semibold leading-snug text-ink">{countdown.label}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="stat-value num !mt-0 font-serif text-[40px] leading-none">
                  <CountUp value={countdown.daysRemaining} duration={900} />
                </span>
                <span className="text-small font-semibold text-ink2">day{countdown.daysRemaining === 1 ? '' : 's'}</span>
              </div>
              <span className="stat-mark tone-hue" aria-hidden="true" />
              {countdown.dueDate ? <p className="stat-foot mt-auto pt-2">{formatShortDate(iso(countdown.dueDate))}</p> : null}
            </div>
          ) : null}
          {measured.length ? (
            <div
              data-testid="journey-measure-grid"
              className="stats-wrap grid grid-cols-1 items-stretch gap-x-6 sm:auto-rows-fr sm:grid-cols-2 lg:col-span-2"
            >
              {measured.slice(0, 4).map((m, i) =>
                COUNT_MEASURE_KINDS.includes(m.measure.kind) && m.measure.den != null ? (
                  <MeasureStatTile
                    key={m.key}
                    label={m.label}
                    value={`${m.measure.num}/${m.measure.den}`}
                    sub={m.measure.text ?? null}
                    status={stateStatus(m.state)}
                    index={i}
                  />
                ) : (
                  <MeasureTextTile key={m.key} label={m.label} text={m.measure.text} status={stateStatus(m.state)} index={i} />
                ),
              )}
            </div>
          ) : null}
        </div>
      </Section>

      {/* ── milestones — chronological, states loud, sentences verbatim ────── */}
      <Section label="Milestones">
        <ul className="border-t border-hair">
          {milestones.map((m) => (
            <MilestoneCard key={m.key} milestone={m} onNavigate={onNavigate} />
          ))}
        </ul>
      </Section>

      {/* ── the implementing window reuses the recorded-readiness strip: years
          2–3 are for evidence of impact, and this is what accrued ──────────── */}
      {phase?.key === 'implementing' && history ? (
        <ReadinessTrendStrip
          series={history.series}
          seriesKey={history.seriesKey}
          onSeriesKeyChange={history.setSeriesKey}
          trend={history.trend}
          loading={history.loading}
          error={history.error}
          notLicensed={history.notLicensed}
          reduce={reduce}
        />
      ) : null}
    </Shell>
  )
}
