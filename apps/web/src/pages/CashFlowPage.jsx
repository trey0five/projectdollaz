// ─────────────────────────────────────────────────────────────────────────────
// CashFlowPage — "on what date do we run out, and by how much?"
//
// V2: five horizons, two views, and QuickBooks doing the typing.
//
// The page opens with a HERO that answers the question before anything else —
// the five figures as counting numerals over the navy aurora band, because the
// first three seconds of a demo are the whole demo. Below it: the setup strip
// (opening cash, with a one-click QuickBooks offer beside the keyed field),
// horizon pills, and the two views — CHARTS (balance rail + receipts/
// disbursements bars) and WORKBOOK (the treasury grid every business manager
// already reads in Excel).
//
// EVERY FIGURE CAME OFF THE ENGINE. The workbook's rows come from the engine's
// own workbookRows — one derivation, so the grid can never disagree with the
// chart beside it — and the flash never displaces the honesty system: the
// omissions band, the Why line, the data-tier sentence and the confidence
// disclaimer all render exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Info,
  LayoutGrid,
  LineChart,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { workbookRows } from '@finrep/analytics'
import { formatMetricValue } from '../lib/metricMeta.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useCashFlowProjection } from '../hooks/useCashFlowProjection.js'
import AuroraFlow from '../components/home/AuroraFlow.jsx'
import CountUp from '../components/CountUp.jsx'
import CashRail from '../components/cashflow/CashRail.jsx'
import CashWorkbook from '../components/cashflow/CashWorkbook.jsx'
import FlowBars from '../components/cashflow/FlowBars.jsx'
import { whyLine, potentialActions } from '../components/cashflow/whyLine.js'

const money = (v) => formatMetricValue(v == null ? null : v, 'currency')
const todayIso = () => new Date().toISOString().slice(0, 10)

const TIER_META = {
  high: { label: 'High confidence', cls: 'border-emerald-300/60 bg-emerald-400/15 text-emerald-100' },
  moderate: { label: 'Moderate confidence', cls: 'border-[#F59E0B]/50 bg-[#F59E0B]/15 text-amber-100' },
  limited: { label: 'Limited confidence', cls: 'border-white/25 bg-white/10 text-white/75' },
}

const HORIZONS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: '13w', label: '13W' },
]

const SOURCE_LABELS = {
  commitments: 'Your commitments',
  tuition_driver: 'Tuition driver',
  budget: 'Budget phasing',
  qbo_ar: 'QuickBooks invoices',
  qbo_ap: 'QuickBooks bills',
  qbo_history: 'QuickBooks history',
}

/** One hero figure — a counting numeral with its caption beneath. */
function HeroStat({ label, value, sub, tone }) {
  const negative = typeof value === 'number' && value < 0
  return (
    <div className="min-w-[140px]">
      <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p
        className={`mt-1 font-serif text-[30px] font-semibold leading-none tabular-nums ${
          tone === 'bad' ? 'text-[#ff8a80]' : 'text-white'
        }`}
      >
        {typeof value === 'number' ? (
          <>
            {negative ? '−' : ''}$<CountUp value={Math.abs(Math.round(value))} />
          </>
        ) : (
          value
        )}
      </p>
      {sub ? <p className="mt-1 text-[12px] leading-snug text-white/60">{sub}</p> : null}
    </div>
  )
}

export default function CashFlowPage() {
  const { activeSchool } = useSchools()
  const cf = useCashFlowProjection(activeSchool?.id ?? null)
  const [view, setView] = useState('charts')
  const [horizon, setHorizon] = useState('13w')

  // DERIVED, NOT SYNCED — see v1's note: the last stated balance pre-fills, the
  // draft wins once the user types, and there is never a second source of truth.
  const [openingDraft, setOpeningDraft] = useState(null)
  const [asOfDraft, setAsOfDraft] = useState(null)
  const openingInput =
    openingDraft ?? (cf.opening?.openingCash != null ? String(cf.opening.openingCash) : '')
  const asOf = asOfDraft ?? cf.opening?.asOfDate ?? todayIso()

  const run = useCallback(
    (over = {}) => {
      const amount = over.openingCash ?? Number(openingInput)
      if (!Number.isFinite(amount)) return
      cf.project({
        openingCash: amount,
        asOfDate: over.asOfDate ?? asOf,
        openingSource: over.openingSource ?? 'keyed',
        horizon: over.horizon ?? horizon,
      })
    },
    [openingInput, asOf, horizon, cf],
  )

  const pickHorizon = (h) => {
    setHorizon(h)
    if (cf.projection) run({ horizon: h })
  }

  const p = cf.projection?.projection ?? null
  const tier = TIER_META[cf.projection?.dataTier ?? 'limited']
  const why = useMemo(() => whyLine(p, money), [p])
  const actions = useMemo(() => potentialActions(p, money), [p])
  const workbook = useMemo(() => (p ? workbookRows(p) : null), [p])
  const sources = cf.projection?.sources ?? null
  const activeSources = useMemo(
    () => Object.entries(sources ?? {}).filter(([, v]) => v.count > 0),
    [sources],
  )
  const qboLive =
    (sources?.qbo_ar?.count ?? 0) + (sources?.qbo_ap?.count ?? 0) + (sources?.qbo_history?.count ?? 0) > 0
  const qboOffer = cf.projection?.qboOpeningCash ?? null

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
    <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:px-10 sm:py-8">
      {/* ── HERO — the five answers, counting in over the aurora ───────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-3xl bg-navy-gradient px-6 py-6 sm:px-8 sm:py-7"
      >
        <AuroraFlow />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-penny-light">
                <TrendingUp size={13} /> Finance · Cash forecast
              </p>
              <h1 className="mt-1.5 font-serif text-[26px] font-semibold leading-tight text-white sm:text-[30px]">
                When does cash run low?
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {qboLive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-400/15 px-3 py-1 text-[12px] font-semibold text-emerald-100">
                  <Zap size={12} /> Live from QuickBooks
                </span>
              ) : null}
              {cf.projection ? (
                <span
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${tier.cls}`}
                  title={cf.projection.dataTierReason}
                >
                  {tier.label}
                </span>
              ) : null}
            </div>
          </div>

          {p ? (
            <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
              <HeroStat label="Cash today" value={p.openingCash} sub={`as of ${p.asOfDate}`} />
              <HeroStat
                label="Lowest projected"
                value={p.lowestBalance}
                sub={p.lowestDate ? `on ${p.lowestDate}` : 'no movement in this horizon'}
                tone={p.firstShortfallDate ? 'bad' : undefined}
              />
              <HeroStat
                label="Minimum reserve"
                value={
                  cf.projection.assumptions.reserveThreshold == null
                    ? 'Not set'
                    : cf.projection.assumptions.reserveThreshold
                }
                sub={
                  cf.projection.assumptions.reserveThreshold == null
                    ? 'set one to be told when you would breach it'
                    : 'the balance you said you must hold'
                }
              />
              {p.firstShortfallDate ? (
                <HeroStat
                  label="Projected gap"
                  value={p.shortfallAmount}
                  sub={`first breach ${p.firstShortfallDate} · ${p.daysOfNotice} days' notice`}
                  tone="bad"
                />
              ) : (
                <HeroStat
                  label="Ending balance"
                  value={p.endingBalance}
                  sub="stays above the reserve throughout"
                />
              )}
            </div>
          ) : (
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-white/70">
              Enter what operations can actually spend — or accept the QuickBooks balance — and
              build the forecast. Commitments, budget phasing, enrollment and your books do the
              rest.
            </p>
          )}
        </div>
      </motion.section>

      {/* ── Setup strip ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-rule/60 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">Available operating cash</span>
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

          {/* The one-click QuickBooks OFFER — beside the keyed field, never in
              place of it. Accepting it states the amount AND records the source. */}
          {qboOffer ? (
            <button
              type="button"
              onClick={() => {
                setOpeningDraft(String(qboOffer.amount))
                run({ openingCash: qboOffer.amount, openingSource: 'quickbooks' })
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20"
            >
              <Zap size={13} /> Use QuickBooks balance · {money(qboOffer.amount)}
            </button>
          ) : null}
        </div>

        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          The amount operations can actually spend — not the balance-sheet total. Restricted,
          board-designated and reserve balances are not available.
        </p>
        {cf.opening?.tbCash != null ? (
          <p className="mt-1.5 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <Info size={14} className="mt-px shrink-0" />
            <span>
              Your trial balance shows <strong className="text-navy">{money(cf.opening.tbCash)}</strong> of cash
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
          {/* ── What is not in this forecast ─────────────────────────────────── */}
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

          {/* ── Why ──────────────────────────────────────────────────────────── */}
          {why ? (
            <section className="rounded-2xl border border-rule/60 bg-cream/40 p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Why</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-navy">{why}</p>
            </section>
          ) : null}

          {/* ── The outlook: horizons + views ────────────────────────────────── */}
          <section className="rounded-2xl border border-rule/60 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-rule/70 bg-white p-0.5">
                {HORIZONS.map((h) => (
                  <button
                    key={h.key}
                    type="button"
                    onClick={() => pickHorizon(h.key)}
                    className={
                      horizon === h.key
                        ? 'rounded-full bg-gold-gradient px-3.5 py-1 text-[12.5px] font-bold text-navy shadow-glow'
                        : 'rounded-full px-3.5 py-1 text-[12.5px] font-semibold text-muted transition hover:text-navy'
                    }
                  >
                    {h.label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-full border border-rule/70 bg-white p-0.5">
                {[
                  { key: 'charts', label: 'Charts', Icon: LineChart },
                  { key: 'workbook', label: 'Workbook', Icon: LayoutGrid },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={
                      view === key
                        ? 'inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-1 text-[12.5px] font-semibold text-white'
                        : 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[12.5px] font-semibold text-muted transition hover:text-navy'
                    }
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {view === 'charts' ? (
                <motion.div
                  key="charts"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <CashRail
                    buckets={p.buckets}
                    reserveThreshold={cf.projection.assumptions.reserveThreshold}
                    lowestDate={p.lowestDate}
                    lowestBalance={p.lowestBalance}
                    format={money}
                  />
                  <div>
                    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                      Money in vs money out
                    </h3>
                    <FlowBars buckets={p.buckets} format={money} />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="workbook"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                >
                  <CashWorkbook
                    workbook={workbook}
                    granularity={p.granularity}
                    sources={sources}
                    reserveThreshold={cf.projection.assumptions.reserveThreshold}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Provenance — which parts of this forecast came from where. Only
                sources that actually contributed are shown. */}
            {activeSources.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Sparkles size={13} className="text-muted" />
                {activeSources.map(([key, v]) => (
                  <span
                    key={key}
                    className="rounded-full border border-rule/70 bg-section px-2.5 py-0.5 text-[11.5px] font-semibold text-muted"
                    title={`${v.count} event${v.count === 1 ? '' : 's'} · ${money(v.total)}`}
                  >
                    {SOURCE_LABELS[key] ?? key} · {v.count}
                  </span>
                ))}
              </div>
            ) : null}

            {cf.projection.committedShare != null ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                {Math.round(cf.projection.committedShare * 100)}% of the movement in this forecast is
                committed — dates and amounts you already know. The rest is scheduled, modelled from
                your history or budget, or an assumption you entered.
              </p>
            ) : null}
          </section>

          {/* ── Potential actions ───────────────────────────────────────────── */}
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
            commitments you record here, your budget&apos;s monthly phasing, your enrollment — and,
            when QuickBooks is connected, your open invoices, bills and seasonal history, with no
            typing at all.
          </p>
        </section>
      ) : null}
    </div>
  )
}
