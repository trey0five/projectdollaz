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
// UNCONFIGURED is a first-class state, not an error: one setup card asking the
// one question the whole feature hangs on — "when was your last accreditation
// visit?" — with the server's prior-visit suggestion offered as a chip
// (human-confirmed, never silently adopted; PriorVisitPanel's own discipline).
//
// Flashy-on-theme: the /strategy Horizon-arc family (navy glass, amber accents,
// serif CountUp) but LINEAR — a cycle is a road, not a gauge. Animate once,
// reduced-motion respected, legibility wins.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Milestone, Pencil, Sparkles, X } from 'lucide-react'
import { CountUp } from '../ui/briefingFx.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import V2StatTile from '../analytics/v2/V2StatTile.jsx'
import { darkStatus } from '../analytics/v2/statusStyle.js'
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

// B3 — the non-count measured milestones render the SERVER'S OWN SENTENCE,
// verbatim — never a derived fraction or a re-derived "%". Same dark-tile
// family as V2StatTile (label + status glow), with the sentence as the body.
function MeasureTextTile({ label, text, status = 'neutral', index = 0 }) {
  const ds = darkStatus(status)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
      data-testid="journey-measure-text-tile"
      className={`relative flex h-full min-w-0 flex-col gap-1.5 rounded-2xl p-4 ${ds.tile} ${ds.ring}`}
    >
      {/* ONE skeleton with V2StatTile: h-full (fills the auto-rows-fr cell),
          a 2-line clamped label box, then the body. Same label box → the two
          tile kinds share a baseline in a row; h-full → same height. */}
      <span className="line-clamp-2 min-h-[2.6em] text-[11px] font-bold uppercase leading-[1.3] tracking-[0.14em] text-white/60">
        {label}
      </span>
      <span className="text-[14px] font-medium leading-snug text-white/85">{text}</span>
    </motion.div>
  )
}

function Shell({ children }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-[#F59E0B]/25 bg-navy-gradient p-5 shadow-navy-glow sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-navy-radial" aria-hidden />
      <div className="relative">{children}</div>
    </div>
  )
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
  const fwDefault =
    cycle?.framework?.defaultTermYears ?? cycle?.frameworks?.[0]?.defaultTermYears ?? 6
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

  return (
    <motion.div
      data-testid="journey-setup-card"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-xl"
    >
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-navy shadow-glow"
          style={{ background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }}
        >
          <Milestone size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#fbbf24]">
            Your accreditation journey
          </p>
          <h3 className="mt-1 font-serif text-[22px] font-semibold leading-tight text-white">
            When was your last accreditation visit?
          </h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/65">
            One date back-plans your whole cycle — the progress report, the self-assessment
            window, the evidence deadline and the visit itself, each measured against what
            you&apos;ve actually recorded here. (For Cognia schools, this is your last
            Engagement Review.)
          </p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg border border-white/20 p-1.5 text-white/60 transition hover:border-white/40 hover:text-white"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {canEdit ? (
        <form onSubmit={submit} className="mt-5 space-y-3.5">
          {suggestion?.lastReviewDate && !lastReviewDate ? (
            <button
              type="button"
              data-testid="cycle-suggestion-chip"
              onClick={() => setLastReviewDate(iso(suggestion.lastReviewDate))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#fde68a] transition hover:bg-[#F59E0B]/20"
            >
              <Sparkles size={13} aria-hidden />
              Use {formatShortDate(iso(suggestion.lastReviewDate))} — from your prior-visit ledger
            </button>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Last review
              </span>
              <DatePicker
                value={lastReviewDate}
                onChange={setLastReviewDate}
                aria-label="Last accreditation visit date"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-[13px] text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Next review (optional)
              </span>
              <DatePicker
                value={nextReviewDate}
                onChange={setNextReviewDate}
                aria-label="Next review date override"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-[13px] text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Term (years)
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={termYears}
                onChange={(e) => setTermYears(e.target.value)}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-[13px] text-white outline-none focus:border-gold/60"
              />
            </label>
          </div>
          {error ? <p className="text-[12.5px] text-red-300">{error}</p> : null}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!lastReviewDate || saving}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-navy shadow-glow transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }}
            >
              {saving ? 'Saving…' : 'Map my journey'}
            </button>
            <p className="text-[12px] text-white/45">
              Leave &ldquo;next review&rdquo; blank and it lands last review + term.
            </p>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-[13px] text-white/50">
          Ask an owner to set your last accreditation visit date — one date lights this whole tab.
        </p>
      )}
    </motion.div>
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
        <div className="h-[180px] rounded-xl bg-white/5 motion-safe:animate-pulse" aria-hidden />
        <p className="mt-3 text-[12.5px] text-white/45">Mapping your accreditation cycle…</p>
      </Shell>
    )
  }
  if (error && !cycle) {
    return (
      <Shell>
        <p className="text-[13px] text-white/55">{error}</p>
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
      {/* ── header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The cycle is the subject ("Your 6-year accreditation cycle"); the
            accreditor is a chip, not the headline — the same surface serves a
            7-year FCC or NIPSA school, and the term is the school's own
            (anchor.termYears), never a hard-coded six. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p
            data-testid="journey-title"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#fbbf24]/90"
          >
            Your {anchor?.termYears ? `${anchor.termYears}-year ` : ''}accreditation cycle
          </p>
          {fw ? (
            <span
              data-testid="journey-framework-chip"
              title={fw.name ?? undefined}
              className="inline-flex max-w-full items-center truncate rounded-full border border-white/20 bg-white/[0.06] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/70"
            >
              {fw.accreditor
                ? `${fw.accreditor}${fw.version ? ` · ${fw.version}` : ''}`
                : (fw.name ?? '')}
            </span>
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            data-testid="journey-edit-dates"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[12px] font-semibold text-white/70 transition hover:border-[#F59E0B]/60 hover:text-[#fde68a]"
          >
            <Pencil size={12} aria-hidden /> Edit dates
          </button>
        ) : null}
      </div>

      {/* ── the road ───────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <CycleRail anchor={anchor} today={cycle.today} milestones={milestones} reduce={reduce} />
      </div>

      {/* ── phase narrative — the server's own sentence about where you are ── */}
      {phase?.narrative ? (
        <p className="mt-2 text-[13.5px] leading-relaxed text-white/70">{phase.narrative}</p>
      ) : null}

      {/* ── NEXT UP + the road to review ───────────────────────────────────── */}
      {/* Outer grid stretches its cells (the default), so the Next-up tile is
          exactly as tall as the 2×2 block beside it — and is a flex column so
          the date line sits at its foot instead of leaving dead space under
          the count. The inner 2×2 uses auto-rows-fr + items-stretch so a
          fraction tile ("25/31", 32px value) and a sentence tile share one
          row height; every box edge lines up. Equal rows only from sm: up —
          a single mobile column takes natural heights. */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {countdown ? (
          <div
            data-testid="journey-next-up"
            className="flex h-full flex-col rounded-2xl border border-[#F59E0B]/35 bg-[#F59E0B]/[0.07] p-4"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#fbbf24]/90">
              <CalendarClock size={12} aria-hidden /> Next up
            </p>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">
              {countdown.label}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif font-semibold leading-none text-[#fbbf24] drop-shadow-[0_0_14px_rgba(245,158,11,0.4)]">
                <CountUp value={countdown.daysRemaining} duration={900} className="text-[44px]" />
              </span>
              <span className="text-[13px] font-semibold text-white/60">
                day{countdown.daysRemaining === 1 ? '' : 's'}
              </span>
            </div>
            {countdown.dueDate ? (
              <p className="mt-auto pt-2 text-[12.5px] text-white/55">
                {formatShortDate(iso(countdown.dueDate))}
              </p>
            ) : null}
          </div>
        ) : null}
        {measured.length ? (
          <div
            data-testid="journey-measure-grid"
            className="grid grid-cols-1 items-stretch gap-3 sm:auto-rows-fr sm:grid-cols-2 lg:col-span-2"
          >
            {measured.slice(0, 4).map((m, i) =>
              COUNT_MEASURE_KINDS.includes(m.measure.kind) && m.measure.den != null ? (
                <V2StatTile
                  key={m.key}
                  label={m.label}
                  value={`${m.measure.num}/${m.measure.den}`}
                  sub={m.measure.text ?? null}
                  status={
                    m.state === 'overdue' ? 'risk' : m.state === 'at_risk' ? 'watch' : 'neutral'
                  }
                  index={i}
                />
              ) : (
                <MeasureTextTile
                  key={m.key}
                  label={m.label}
                  text={m.measure.text}
                  status={
                    m.state === 'overdue' ? 'risk' : m.state === 'at_risk' ? 'watch' : 'neutral'
                  }
                  index={i}
                />
              ),
            )}
          </div>
        ) : null}
      </div>

      {/* ── milestones — chronological, states loud, sentences verbatim ────── */}
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
          Milestones
        </p>
        <ul className="mt-2 space-y-2">
          {milestones.map((m) => (
            <MilestoneCard key={m.key} milestone={m} onNavigate={onNavigate} />
          ))}
        </ul>
      </div>

      {/* ── the implementing window reuses the recorded-readiness strip: years
          2–3 are for evidence of impact, and this is what accrued ──────────── */}
      {phase?.key === 'implementing' && history ? (
        <div className="mt-5">
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
        </div>
      ) : null}
    </Shell>
  )
}
