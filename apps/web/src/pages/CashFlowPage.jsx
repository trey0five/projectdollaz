// ─────────────────────────────────────────────────────────────────────────────
// CashFlowPage — "on what date do we run out, and by how much?"
//
// THIS PAGE DOES NOT OPEN WITH A TABLE, deliberately. A school arriving here has
// one question and a 52-row grid answers it only after work. So the first screen
// is five figures and a sentence explaining them; the detail is underneath for
// anyone who wants to check the working.
//
// The summer trough is the thing being sold. Schools run negative from June
// through August — payroll and benefits continue while tuition receipts stop —
// and most heads feel that rather than see it coming. A dated low point, its
// size, and how many days of warning it carries is the single most useful output
// this product can produce.
//
// EVERY FIGURE ON THIS PAGE CAME OFF THE ENGINE. Nothing here computes cash;
// `whyLine` composes a sentence from figures already returned, and the currency
// formatter is the canonical one from @finrep/analytics so a number in a sentence
// can never disagree with the same number in a card.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CalendarClock, Info, TrendingUp } from 'lucide-react'
import { formatMetricValue } from '../lib/metricMeta.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useCashFlowProjection } from '../hooks/useCashFlowProjection.js'
import CashRail from '../components/cashflow/CashRail.jsx'
import { whyLine, potentialActions } from '../components/cashflow/whyLine.js'

const money = (v) => formatMetricValue(v == null ? null : v, 'currency')
const todayIso = () => new Date().toISOString().slice(0, 10)

const TIER_META = {
  high: { label: 'High confidence', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700' },
  moderate: { label: 'Moderate confidence', cls: 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#8a5a06]' },
  limited: { label: 'Limited confidence', cls: 'border-rule/70 bg-section text-muted' },
}

/** One headline answer. `tone` marks the figure that carries the bad news. */
function Answer({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-rule/60 bg-white p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p
        className={`mt-1 font-serif text-[26px] font-semibold leading-none ${
          tone === 'bad' ? 'text-danger' : 'text-navy'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[12.5px] leading-snug text-muted">{sub}</p> : null}
    </div>
  )
}

export default function CashFlowPage() {
  const { activeSchool } = useSchools()
  const cf = useCashFlowProjection(activeSchool?.id ?? null)
  const [granularity, setGranularity] = useState('week')

  // DERIVED, NOT SYNCED. The last stated balance pre-fills these fields — a
  // school re-forecasting weekly should not retype the same number — but copying
  // it into state inside an effect means two sources of truth for one value and a
  // race on every reload. The draft wins only once the user has actually typed.
  const [openingDraft, setOpeningDraft] = useState(null)
  const [asOfDraft, setAsOfDraft] = useState(null)
  const openingInput =
    openingDraft ?? (cf.opening?.openingCash != null ? String(cf.opening.openingCash) : '')
  const asOf = asOfDraft ?? cf.opening?.asOfDate ?? todayIso()

  const run = useCallback(
    (g) => {
      const n = Number(openingInput)
      if (!Number.isFinite(n)) return
      cf.project({
        openingCash: n,
        asOfDate: asOf,
        openingSource: 'keyed',
        granularity: g ?? granularity,
        ...(( g ?? granularity) === 'week' ? { horizonWeeks: 13 } : {}),
      })
    },
    [openingInput, asOf, granularity, cf],
  )

  const p = cf.projection?.projection ?? null
  const tier = TIER_META[cf.projection?.dataTier ?? 'limited']
  const why = useMemo(() => whyLine(p, money), [p])
  const actions = useMemo(() => potentialActions(p, money), [p])

  const tbGap =
    cf.opening?.tbCash != null && Number.isFinite(Number(openingInput))
      ? cf.opening.tbCash - Number(openingInput)
      : null

  if (cf.notLicensed) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="rounded-2xl border border-rule/60 bg-cream/40 p-6">
          <h1 className="font-serif text-[22px] font-semibold text-navy">Cash forecast</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            The cash forecast is part of the Finance and Planning modules. Add either to see when
            your cash is projected to run low.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-page space-y-6 px-4 py-6 sm:px-10 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
            <TrendingUp size={14} className="text-navy" /> Finance · Cash forecast
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-semibold text-navy">
            When does cash run low?
          </h1>
        </div>
        {cf.projection ? (
          <span
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${tier.cls}`}
            title={cf.projection.dataTierReason}
          >
            {tier.label}
          </span>
        ) : null}
      </header>

      {/* ── Where the forecast starts ─────────────────────────────────────────
          The opening balance is the whole foundation and the one thing KYRO
          cannot derive: there is no bank feed. The trial-balance figure sits
          beside the keyed one rather than replacing it, because the gap between
          them is the point — a school can hold $600k on the balance sheet with
          $125k that operations may actually spend. */}
      <section className="rounded-2xl border border-rule/60 bg-white p-5">
        <h2 className="font-serif text-[17px] font-semibold text-navy">
          Available operating cash
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          The amount operations can actually spend — not the balance-sheet total. Restricted,
          board-designated and reserve balances are not available.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">Amount</span>
            <input
              type="number"
              value={openingInput}
              onChange={(e) => setOpeningDraft(e.target.value)}
              className="w-44 rounded-lg border border-rule/70 px-3 py-2 text-[14px] text-navy"
              placeholder="125000"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">As of</span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOfDraft(e.target.value)}
              className="rounded-lg border border-rule/70 px-3 py-2 text-[14px] text-navy"
            />
          </label>
          <button
            type="button"
            onClick={() => run()}
            disabled={cf.projecting || !Number.isFinite(Number(openingInput))}
            className="rounded-lg btn-cta px-4 py-2 text-[14px] font-semibold disabled:opacity-50"
          >
            {cf.projecting ? 'Building…' : 'Build forecast'}
          </button>
        </div>

        {cf.opening?.tbCash != null ? (
          <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <Info size={14} className="mt-px shrink-0" />
            <span>
              Your trial balance shows <strong className="text-navy">{money(cf.opening.tbCash)}</strong> of
              cash
              {tbGap != null && Math.abs(tbGap) > 0.5 ? (
                <>
                  {' '}— {money(Math.abs(tbGap))} {tbGap > 0 ? 'more' : 'less'} than the figure above.
                  That difference is normal: it is the part that is not available to operations.
                </>
              ) : (
                '.'
              )}
            </span>
          </p>
        ) : null}

        {/* An opening balance keyed weeks ago compounds silently into every week
            that follows it. */}
        {cf.opening?.stale ? (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-[12.5px] leading-relaxed text-[#8a5a06]">
            <CalendarClock size={14} className="mt-px shrink-0" />
            This balance was last stated {cf.opening.ageDays} days ago. Every week after a stale
            start inherits its drift — restate it before acting on the forecast.
          </p>
        ) : null}
        {cf.error ? <p className="mt-2 text-[13px] text-danger">{cf.error}</p> : null}
      </section>

      {p ? (
        <>
          {/* ── The five answers ───────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Answer label="Cash today" value={money(p.openingCash)} sub={`as of ${p.asOfDate}`} />
            <Answer
              label="Lowest projected"
              value={money(p.lowestBalance)}
              sub={p.lowestDate ? `on ${p.lowestDate}` : 'no movement in this horizon'}
              tone={p.firstShortfallDate ? 'bad' : undefined}
            />
            <Answer
              label="Minimum reserve"
              value={
                cf.projection.assumptions.reserveThreshold == null
                  ? 'Not set'
                  : money(cf.projection.assumptions.reserveThreshold)
              }
              sub={
                cf.projection.assumptions.reserveThreshold == null
                  ? 'Set one to be told when you would breach it'
                  : 'the balance you have said you must hold'
              }
            />
            <Answer
              label={p.firstShortfallDate ? 'Projected gap' : 'Ending balance'}
              value={
                p.firstShortfallDate ? money(p.shortfallAmount) : money(p.endingBalance)
              }
              sub={
                p.firstShortfallDate
                  ? `first breach ${p.firstShortfallDate} · ${p.daysOfNotice} days' notice`
                  : 'stays above the reserve throughout'
              }
              tone={p.firstShortfallDate ? 'bad' : undefined}
            />
          </motion.section>

          {/* ── WHAT IS NOT IN THIS FORECAST ──────────────────────────────────
              Live-caught: a school with commitments and no budget saw every
              outflow and none of its tuition — a catastrophic trough that was an
              artefact of missing data, with nothing on screen to say so. A
              forecast quietly missing a school's largest receipt is worse than no
              forecast, because the number looks complete. Sits ABOVE the Why line
              deliberately: it changes how everything below should be read. */}
          {cf.projection.omissions?.length > 0 ? (
            <section className="rounded-2xl border-2 border-[#F59E0B]/40 bg-[#F59E0B]/[0.07] p-5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#8a5a06]">
                <AlertTriangle size={15} /> What is not in this forecast
              </h2>
              <ul className="mt-2 space-y-1.5">
                {cf.projection.omissions.map((o) => (
                  <li key={o.key} className="text-[13.5px] leading-relaxed text-navy/80">
                    {o.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Why ────────────────────────────────────────────────────────── */}
          {why ? (
            <section className="rounded-2xl border border-rule/60 bg-cream/40 p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Why</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-navy">{why}</p>
            </section>
          ) : null}

          {/* ── The line ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-rule/60 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-[17px] font-semibold text-navy">
                {granularity === 'week' ? '13-week cash outlook' : '12-month cash outlook'}
              </h2>
              <div className="inline-flex rounded-full border border-rule/70 bg-white p-0.5">
                {['week', 'month'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGranularity(g)
                      run(g)
                    }}
                    className={
                      granularity === g
                        ? 'rounded-full bg-navy px-3 py-1 text-[12.5px] font-semibold text-white'
                        : 'rounded-full px-3 py-1 text-[12.5px] font-semibold text-muted transition hover:text-navy'
                    }
                  >
                    {g === 'week' ? '13 weeks' : '12 months'}
                  </button>
                ))}
              </div>
            </div>
            <CashRail
              buckets={p.buckets}
              reserveThreshold={cf.projection.assumptions.reserveThreshold}
              lowestDate={p.lowestDate}
              format={money}
            />
            {/* How much of this rests on known dates AND amounts. */}
            {cf.projection.committedShare != null ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                {Math.round(cf.projection.committedShare * 100)}% of the movement in this forecast is
                committed — dates and amounts you already know. The rest is scheduled, modelled from
                your budget, or an assumption you entered.
              </p>
            ) : null}
          </section>

          {/* ── Potential actions ──────────────────────────────────────────── */}
          {actions.length > 0 ? (
            <section className="rounded-2xl border border-rule/60 bg-white p-5">
              <h2 className="font-serif text-[17px] font-semibold text-navy">Potential actions</h2>
              <p className="mt-1 text-[13px] text-muted">
                Suggestions, not steps taken for you — every one of these is a decision.
              </p>
              <ul className="mt-3 space-y-2.5">
                {actions.map((a) => (
                  <li key={a.key} className="rounded-xl border border-rule/60 bg-section/50 p-3.5">
                    <Link
                      to={a.to}
                      className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy hover:underline"
                    >
                      {a.label} <ArrowRight size={13} />
                    </Link>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{a.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── The confidence disclaimer, verbatim ────────────────────────── */}
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>
              {cf.projection.dataTierReason} {cf.projection.disclaimer}
            </span>
          </p>
        </>
      ) : !cf.loading ? (
        <section className="rounded-2xl border border-dashed border-rule/60 bg-cream/30 p-6">
          <p className="text-[14px] leading-relaxed text-muted">
            Enter what operations can actually spend today and build the forecast. It uses the
            commitments you record here, your budget&apos;s monthly phasing, and your enrollment —
            no bank connection required.
          </p>
        </section>
      ) : null}
    </div>
  )
}
