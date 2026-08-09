// ─────────────────────────────────────────────────────────────────────────────
// CashFlowPage — "on what date do we run out, and by how much?"
//
// V3: real chrome, an editable forecast, and the hero doing the talking.
//
// The page now wears the app's sub-page chrome (BackLink → Finance, breadcrumb,
// finance-blue identity) and splits into two thin tabs: OVERVIEW — the navy
// hero band whose V2StatTile figures re-count on every rebuild, the honesty
// system, and the two views (charts + workbook) — and FORECAST INPUTS — every
// line that feeds the projection, editable: QuickBooks-derived lines behind an
// include switch (a server-side line ADJUSTMENT; the books are never touched)
// and the school's own expected items behind a real add/edit modal.
//
// EVERY FIGURE CAME OFF THE ENGINE. Edits re-run the projection server-side as
// persist:false previews (only the explicit "Build forecast" freezes a run) and
// the client never recomputes a bucket. The workbook's rows come from the
// engine's own workbookRows — one derivation, so the grid can never disagree
// with the chart beside it — and the flash never displaces the honesty system:
// the omissions band, the Why line, the data-tier sentence and the confidence
// disclaimer all render exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Info,
  LayoutGrid,
  LineChart,
  Pencil,
  Plus,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { workbookRows } from '@finrep/analytics'
import { formatMetricValue } from '../lib/metricMeta.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useCashFlowProjection } from '../hooks/useCashFlowProjection.js'
import AuroraFlow from '../components/home/AuroraFlow.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import CashRail from '../components/cashflow/CashRail.jsx'
import CashWorkbook from '../components/cashflow/CashWorkbook.jsx'
import FlowBars from '../components/cashflow/FlowBars.jsx'
import CashHeroTile from '../components/cashflow/CashHeroTile.jsx'
import CashInputsRail from '../components/cashflow/CashInputsRail.jsx'
import CommitmentModal from '../components/cashflow/CommitmentModal.jsx'
import CurrencyField from '../components/cashflow/CurrencyField.jsx'
import Sparkline from '../components/analytics/charts/Sparkline.jsx'
import { moduleAccentVars } from '../components/module/moduleAnatomy.js'
import { flashElement } from '../components/analytics/v2/flash.js'
import { whyLine, potentialActions } from '../components/cashflow/whyLine.js'
import '../styles/analytics-v2.css'

const money = (v) => formatMetricValue(v == null ? null : v, 'currency')
const todayIso = () => new Date().toISOString().slice(0, 10)

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${MONTH_ABBR[+m[2] - 1]} ${+m[3]}, ${m[1]}` : (iso ?? '')
}
const dayBefore = (iso) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

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

// The last-used horizon, remembered per school so the mount-time rehydration
// restores the view the user actually left. Display preference only — never data.
const horizonKey = (sid) => `finrep.cashflow.horizon.${sid}`
const readHorizon = (sid) => {
  try {
    const v = localStorage.getItem(horizonKey(sid))
    return HORIZONS.some((h) => h.key === v) ? v : '13w'
  } catch {
    return '13w'
  }
}
const rememberHorizon = (sid, h) => {
  try {
    localStorage.setItem(horizonKey(sid), h)
  } catch {
    /* private mode etc. — the preference just doesn't stick */
  }
}

const OPENING_SOURCE_TEXT = {
  quickbooks: 'from QuickBooks',
  trial_balance: 'from your trial balance',
  keyed: 'keyed by you',
}

const SOURCE_LABELS = {
  commitments: 'Your commitments',
  tuition_driver: 'Tuition driver',
  budget: 'Budget phasing',
  qbo_ar: 'QuickBooks invoices',
  qbo_ap: 'QuickBooks bills',
  qbo_history: 'QuickBooks history',
}

// ── Tabs-lite: TWO keys, ?tab= in the URL (overview clears it) — a 2-key clone
//    of useModuleTab, because this page is not a module home and ModuleTabs
//    would drag four panels it doesn't have. ──
const CASH_TABS = [
  { key: 'overview', label: 'Overview', caption: 'the outlook' },
  { key: 'inputs', label: 'Forecast inputs', caption: 'what feeds it' },
]

function useCashTab() {
  const [params, setParams] = useSearchParams()
  const active = params.get('tab') === 'inputs' ? 'inputs' : 'overview'
  const setTab = useCallback(
    (key) => {
      const next = new URLSearchParams(params)
      if (key === 'inputs') next.set('tab', 'inputs')
      else next.delete('tab')
      setParams(next)
    },
    [params, setParams],
  )
  return [active, setTab]
}

function CashTabs({ tab, onTab }) {
  const reduce = useReducedMotion()
  const refs = useRef([])
  const onKeyDown = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % CASH_TABS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + CASH_TABS.length) % CASH_TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = CASH_TABS.length - 1
    if (next == null) return
    e.preventDefault()
    onTab(CASH_TABS[next].key)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label="Cash forecast sections" className="flex gap-1 border-b border-rule/60">
      {CASH_TABS.map((t, i) => {
        const active = t.key === tab
        return (
          <button
            key={t.key}
            id={`cf-tab-${t.key}`}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            aria-selected={active}
            aria-controls={`cf-panel-${t.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onTab(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex shrink-0 flex-col items-start gap-0.5 rounded-t-lg border-x border-t px-4 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 ${
              active ? 'border-gold/50 bg-white' : 'border-transparent text-muted hover:bg-cream/60'
            }`}
          >
            <span className={`text-[14px] font-semibold ${active ? 'text-navy' : 'text-muted'}`}>
              {t.label}
            </span>
            <span className="text-[10.5px] uppercase tracking-wide text-muted/80">{t.caption}</span>
            {active &&
              (reduce ? (
                <span className="absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-gold" />
              ) : (
                <motion.span
                  layoutId="cf-tab-underline"
                  className="absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-gold"
                />
              ))}
          </button>
        )
      })}
    </div>
  )
}

// ── The ONE operating-cash editor ────────────────────────────────────────────
// One component, one draft state (lifted to the page): opened by the hero tile's
// pencil (dark, inline in the hero band) and by the Forecast-inputs summary
// row's pencil (light). Confirming is a REAL build — the same persisted run()
// path as the Build button, because an explicit opening change belongs in the
// archive. There is deliberately no second free-standing input anywhere else.
function OpeningEditor({
  dark = false,
  openingValue,
  onOpeningChange,
  asOf,
  onAsOfChange,
  onRebuild,
  onCancel,
  busy = false,
  qboOffer = null,
  onUseQbo,
  fmt,
  error = '',
}) {
  const reduce = useReducedMotion()
  const valid = openingValue !== '' && Number.isFinite(Number(openingValue))
  const labelCls = dark
    ? 'text-[11px] font-bold uppercase tracking-[0.14em] text-white/60'
    : 'text-[12px] font-semibold text-muted'
  const dateCls = dark
    ? 'w-44 rounded-xl border-2 border-white/15 bg-white/10 px-3 py-2 text-[14px] text-white'
    : 'w-44 rounded-xl border-2 border-rule/80 bg-white px-3 py-2 text-[14px] text-navy'
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
      className="overflow-hidden"
    >
      <div
        className={`mt-3 rounded-2xl p-4 ${
          dark ? 'border border-white/15 bg-white/[0.06]' : 'border border-rule/60 bg-cream/40'
        }`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Available operating cash</span>
            <CurrencyField
              value={openingValue}
              onChange={onOpeningChange}
              variant={dark ? 'dark' : 'light'}
              size={dark ? 'lg' : 'sm'}
              className={dark ? 'w-56' : 'w-48'}
              aria-label="Available operating cash"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>As of</span>
            <DatePicker value={asOf} onChange={onAsOfChange} className={dateCls} />
          </label>
          <button
            type="button"
            onClick={onRebuild}
            disabled={busy || !valid}
            className="rounded-lg btn-cta px-4 py-2 text-[14px] font-semibold disabled:opacity-50"
          >
            {busy ? 'Rebuilding…' : 'Rebuild forecast'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition ${
              dark
                ? 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
                : 'border-rule/70 text-muted hover:border-gold/60 hover:text-navy'
            }`}
          >
            Cancel
          </button>
          {qboOffer ? (
            <button
              type="button"
              onClick={onUseQbo}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition ${
                dark
                  ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
              }`}
            >
              <Zap size={13} /> Use QuickBooks balance · {fmt(qboOffer.amount)}
            </button>
          ) : null}
        </div>
        <p className={`mt-2 text-[12px] leading-relaxed ${dark ? 'text-white/50' : 'text-muted'}`}>
          Rebuilding freezes a new run in the archive — the forecast the school actually built.
        </p>
        {error ? (
          <p className={`mt-1.5 text-[13px] ${dark ? 'text-red-300' : 'text-danger'}`}>{error}</p>
        ) : null}
      </div>
    </motion.div>
  )
}

export default function CashFlowPage() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const cf = useCashFlowProjection(schoolId)
  const reduce = useReducedMotion()
  const [view, setView] = useState('charts')
  const [horizon, setHorizon] = useState(() => readHorizon(schoolId))
  const [tab, setTab] = useCashTab()

  // The ONE opening-cash editor (see OpeningEditor above) — opened from the hero
  // tile's pencil or the Forecast-inputs summary row's pencil.
  const [openingEditorOpen, setOpeningEditorOpen] = useState(false)

  // The add/edit modal: null | {mode:'add', seed} | {mode:'edit', commitment}.
  const [modal, setModal] = useState(null)
  const [savingItem, setSavingItem] = useState(false)
  const [modalError, setModalError] = useState('')

  // DERIVED, NOT SYNCED — see v1's note: the last stated balance pre-fills, the
  // draft wins once the user types, and there is never a second source of truth.
  const [openingDraft, setOpeningDraft] = useState(null)
  const [asOfDraft, setAsOfDraft] = useState(null)
  const openingInput =
    openingDraft ?? (cf.opening?.openingCash != null ? String(cf.opening.openingCash) : '')
  const asOf = asOfDraft ?? cf.opening?.asOfDate ?? todayIso()

  // The opening balance the LAST run actually projected with — so an edited
  // field that was never re-built can be disclosed (toggles and commitment
  // saves replay the last-built body, not the draft).
  const [lastBuiltOpening, setLastBuiltOpening] = useState(null)

  // ── REHYDRATE ON RETURN ────────────────────────────────────────────────────
  // A school that already built a forecast should land ON it, not on the setup
  // screen. Once per mount per school, after load() resolves: restore the last
  // built state as a persist:false PREVIEW (a re-read, never a new frozen run —
  // the archive stays "what the school actually built"), at the horizon the
  // user last used. Never fires while loading, unlicensed, already projected,
  // or for a genuinely never-built school (opening.openingCash == null).
  const rehydratedForRef = useRef(null)
  useEffect(() => {
    if (!schoolId || cf.loading || cf.notLicensed) return
    if (cf.projection || cf.projecting) return
    if (cf.opening?.openingCash == null) return
    if (rehydratedForRef.current === schoolId) return
    rehydratedForRef.current = schoolId
    const h = readHorizon(schoolId)
    setHorizon(h)
    // Seed the round-1 unbuilt-change disclosure from the restored opening so
    // the hint stays quiet until the user actually edits something.
    setLastBuiltOpening(cf.opening.openingCash)
    cf.project({
      openingCash: cf.opening.openingCash,
      asOfDate: cf.opening.asOfDate ?? todayIso(),
      openingSource: cf.opening.source ?? 'keyed',
      horizon: h,
      persist: false,
    })
  }, [schoolId, cf])

  const run = useCallback(
    (over = {}) => {
      const amount = over.openingCash ?? Number(openingInput)
      if (!Number.isFinite(amount)) return
      setLastBuiltOpening(amount)
      cf.project({
        openingCash: amount,
        asOfDate: over.asOfDate ?? asOf,
        openingSource: over.openingSource ?? 'keyed',
        horizon: over.horizon ?? horizon,
        // ARCHIVE DISCIPLINE: only the explicit "Build forecast" click persists
        // a frozen run; view changes and edit-driven rebuilds are previews.
        ...(over.persist === false ? { persist: false } : {}),
      })
    },
    [openingInput, asOf, horizon, cf],
  )

  const pickHorizon = (h) => {
    setHorizon(h)
    if (schoolId) rememberHorizon(schoolId, h)
    if (cf.projection) run({ horizon: h, persist: false })
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

  // Edited-but-not-built disclosure: reprojections (toggles, commitment saves)
  // replay the LAST-BUILT opening, so a typed-but-unbuilt figure must be called
  // out rather than silently ignored.
  const unbuiltOpening =
    lastBuiltOpening != null &&
    Number.isFinite(Number(openingInput)) &&
    Number(openingInput) !== lastBuiltOpening

  const flows = cf.flows
  const adjustableFlows = useMemo(
    () => (flows ?? []).filter((f) => f.editable === 'adjustable'),
    [flows],
  )
  const excludedCount = adjustableFlows.filter((f) => f.adjustment?.kind === 'exclude').length

  // PROJECTION IDENTITY — the chart's redraw key. Width is deliberately absent.
  const redrawKey = p
    ? [p.asOfDate, p.horizonEnd, p.totalReceipts, p.totalDisbursements].join('|')
    : ''

  // ── Add / edit / remove expected items ─────────────────────────────────────
  const openAdd = (seed = null) => {
    setModalError('')
    setModal({ mode: 'add', seed })
  }
  const openEdit = (c) => {
    setModalError('')
    setModal({ mode: 'edit', commitment: c })
  }

  const saveItem = async (body) => {
    setSavingItem(true)
    setModalError('')
    try {
      let itemId = null
      if (modal?.mode === 'edit') {
        await cf.updateCommitment(modal.commitment.id, body)
        itemId = modal.commitment.id
      } else {
        const created = await cf.addCommitment(body)
        itemId = created?.id ?? null
      }
      setModal(null)
      if (cf.projection) await cf.reproject()
      if (itemId) flashElement(`cf-item-${itemId}`, reduce)
    } catch {
      setModalError('Could not save this item. Check the fields and try again.')
    } finally {
      setSavingItem(false)
    }
  }

  const removeItem = async (id) => {
    await cf.removeCommitment(id)
    if (cf.projection) cf.reproject()
  }

  // The include switch. Turning OFF writes an exclude adjustment; turning ON
  // clears it. Both throw on failure so the rail's optimistic flip reverts.
  const toggleFlow = async (flow, include) => {
    if (include) {
      const adj =
        flow.adjustment ?? cf.adjustments.find((a) => a.sourceRef === flow.sourceRef) ?? null
      // No resolved adjustment id yet (the list refresh is still in flight) —
      // throw so the rail's optimistic switch reverts instead of stranding ON.
      if (!adj?.id) throw new Error('adjustment not resolved yet')
      await cf.clearAdjustment(adj.id)
    } else {
      await cf.setAdjustment({ sourceRef: flow.sourceRef, kind: 'exclude' })
    }
  }

  // ── Chrome — BackLink, breadcrumb, finance-blue identity (Shell pattern) ───
  const header = (
    <div className="mb-4">
      <BackLink fallback="/finance" fallbackLabel="Back to Finance" className="mb-3" />
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-[12.5px] text-muted">
        <Link to="/app" className="hover:text-navy">
          Home
        </Link>
        <ChevronRight size={13} />
        <Link to="/finance" className="hover:text-navy">
          Finance
        </Link>
        <ChevronRight size={13} />
        <span className="font-semibold text-navy">Cash forecast</span>
      </nav>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-white shadow-lg shadow-blue-600/25">
          <TrendingUp size={20} />
        </span>
        <div>
          <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">Cash forecast</h1>
          <p className="text-[14px] text-muted">When cash runs low, by how much, and why.</p>
        </div>
      </div>
    </div>
  )

  if (cf.notLicensed) {
    return (
      <div
        style={moduleAccentVars('finance')}
        className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8"
      >
        {header}
        <div className="mt-4 rounded-2xl border border-rule/60 bg-cream/40 p-6">
          <p className="text-[14px] leading-relaxed text-muted">
            The cash forecast is part of the Finance and Planning modules. Add either to see when
            your cash is projected to run low.
          </p>
        </div>
      </div>
    )
  }

  // ── The hero band — figures when there is a forecast, the SETUP when not ───
  const hero = (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-3xl bg-navy-gradient px-6 py-6 sm:px-8 sm:py-7"
    >
      <AuroraFlow />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-serif text-[24px] font-semibold leading-tight text-white sm:text-[27px]">
            When does cash run low?
          </h2>
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
            {cf.projection ? (
              <span
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/75"
                title={
                  cf.projection.assumptions.reserveThreshold == null
                    ? 'set one to be told when you would breach it'
                    : 'the balance you said you must hold'
                }
              >
                Reserve ·{' '}
                {cf.projection.assumptions.reserveThreshold == null
                  ? 'Not set'
                  : money(cf.projection.assumptions.reserveThreshold)}
              </span>
            ) : null}
          </div>
        </div>

        {p ? (
          <>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <CashHeroTile
                wide
                index={0}
                label="Available operating cash"
                value={money(p.openingCash)}
                sub={`as of ${p.asOfDate}`}
                status={p.firstShortfallDate ? 'watch' : 'good'}
                sparkVals={p.buckets.map((b) => b.closingBalance)}
                action={
                  <button
                    type="button"
                    aria-label="Edit the opening balance"
                    aria-expanded={openingEditorOpen}
                    onClick={() => setOpeningEditorOpen((v) => !v)}
                    className={`rounded-md p-1 transition hover:bg-white/10 hover:text-white ${
                      openingEditorOpen ? 'bg-white/15 text-white' : 'text-white/50'
                    }`}
                  >
                    <Pencil size={13} />
                  </button>
                }
                chip={
                  qboOffer ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpeningDraft(String(qboOffer.amount))
                        // A refinement of the CURRENT forecast, not a build — preview only.
                        run({ openingCash: qboOffer.amount, openingSource: 'quickbooks', persist: false })
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-100 transition hover:bg-emerald-400/25"
                    >
                      <Zap size={11} /> Use QuickBooks balance · {money(qboOffer.amount)}
                    </button>
                  ) : null
                }
              />
              <CashHeroTile
                index={1}
                label="Lowest projected"
                value={money(p.lowestBalance)}
                sub={p.lowestDate ? `on ${p.lowestDate}` : 'no movement in this horizon'}
                status={p.firstShortfallDate ? 'risk' : 'good'}
              />
              <CashHeroTile
                index={2}
                countUp={false}
                label="Covered through"
                value={
                  p.firstShortfallDate
                    ? prettyDay(dayBefore(p.firstShortfallDate))
                    : prettyDay(p.horizonEnd)
                }
                sub={
                  p.firstShortfallDate
                    ? `${p.daysOfNotice} days' notice`
                    : p.monthsCashAtLowPoint != null
                      ? `ends at ${money(p.endingBalance)} · ${p.monthsCashAtLowPoint.toFixed(1)} months' cash at the low`
                      : `ends at ${money(p.endingBalance)}`
                }
                status={p.firstShortfallDate ? 'watch' : 'good'}
              />
              {p.firstShortfallDate ? (
                <CashHeroTile
                  index={3}
                  label="Projected gap"
                  value={money(p.shortfallAmount)}
                  sub={`first breach ${p.firstShortfallDate}`}
                  status="risk"
                />
              ) : (
                <CashHeroTile
                  index={3}
                  label="Ending balance"
                  value={money(p.endingBalance)}
                  sub="stays above the reserve throughout"
                  status="good"
                />
              )}
            </div>

            {/* The inline opening editor — the tile's pencil expands it HERE,
                no page jump. Same run() path as Build (a real, persisted run). */}
            <AnimatePresence initial={false}>
              {openingEditorOpen ? (
                <OpeningEditor
                  dark
                  openingValue={openingInput}
                  onOpeningChange={setOpeningDraft}
                  asOf={asOf}
                  onAsOfChange={setAsOfDraft}
                  busy={cf.projecting}
                  onRebuild={() => {
                    run()
                    setOpeningEditorOpen(false)
                  }}
                  onCancel={() => setOpeningEditorOpen(false)}
                  qboOffer={qboOffer}
                  onUseQbo={() => {
                    setOpeningDraft(String(qboOffer.amount))
                    run({ openingCash: qboOffer.amount, openingSource: 'quickbooks' })
                    setOpeningEditorOpen(false)
                  }}
                  fmt={money}
                  error={cf.error}
                />
              ) : null}
            </AnimatePresence>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 p-0.5">
                {HORIZONS.map((h) => {
                  const active = horizon === h.key
                  return (
                    <motion.button
                      key={h.key}
                      type="button"
                      onClick={() => pickHorizon(h.key)}
                      whileHover={reduce || active ? undefined : { y: -1 }}
                      className={`relative rounded-full px-3.5 py-1 text-[12.5px] ${
                        active
                          ? 'font-bold text-navy'
                          : 'font-semibold text-white/65 transition hover:text-white'
                      }`}
                    >
                      {/* The active pill GLIDES between horizons (shared
                          layoutId) — static under reduced motion. */}
                      {active ? (
                        reduce ? (
                          <span className="absolute inset-0 rounded-full bg-white shadow-sm" />
                        ) : (
                          <motion.span
                            layoutId="cf-horizon-pill"
                            className="absolute inset-0 rounded-full bg-white shadow-sm"
                            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                          />
                        )
                      ) : null}
                      <span className="relative">{h.label}</span>
                    </motion.button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => openAdd()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.16]"
              >
                <Plus size={14} /> Add expected item
              </button>
            </div>
          </>
        ) : cf.loading || (cf.opening?.openingCash != null && !cf.error) ? (
          /* LOADING / REHYDRATING: a previous build exists (or we don't know
             yet) — show the shimmer, never the setup screen. The setup below is
             ONLY for a school that has genuinely never built a forecast. */
          <div className="mt-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-[132px] rounded-2xl border border-white/10 bg-white/[0.07] ${
                    reduce ? '' : 'animate-pulse'
                  } ${i === 0 ? 'sm:col-span-2' : ''}`}
                />
              ))}
            </div>
            <p className="mt-3 text-[12.5px] font-semibold text-white/55">
              {cf.loading ? 'Loading…' : 'Rebuilding your last forecast…'}
            </p>
          </div>
        ) : (
          /* FIRST-RUN: the hero IS the setup. One field, one date, one click. */
          <div className="mt-4 max-w-2xl">
            <p className="text-[14px] leading-relaxed text-white/70">
              Enter what operations can actually spend — or accept the QuickBooks balance — and
              build the forecast. Commitments, budget phasing, enrollment and your books do the
              rest.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                  Available operating cash
                </span>
                <CurrencyField
                  value={openingInput}
                  onChange={setOpeningDraft}
                  variant="dark"
                  size="lg"
                  className="w-56"
                  aria-label="Available operating cash"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                  As of
                </span>
                <DatePicker
                  value={asOf}
                  onChange={setAsOfDraft}
                  className="w-44 rounded-xl border-2 border-white/15 bg-white/10 px-3 py-2 text-[14px] text-white"
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
              {qboOffer ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpeningDraft(String(qboOffer.amount))
                    run({ openingCash: qboOffer.amount, openingSource: 'quickbooks' })
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-3.5 py-2 text-[13px] font-semibold text-emerald-100 transition hover:bg-emerald-400/25"
                >
                  <Zap size={13} /> Use QuickBooks balance · {money(qboOffer.amount)}
                </button>
              ) : null}
            </div>
            {cf.error ? <p className="mt-2 text-[13px] text-red-300">{cf.error}</p> : null}
          </div>
        )}
      </div>
    </motion.section>
  )

  // ── The Forecast-inputs summary (was the second entry strip) — READ-ONLY ───
  // The operating cash is stated ONCE: this row just reads it back, and its
  // pencil opens the same OpeningEditor the hero tile uses. No second input.
  const setupStrip = (
    <section className="rounded-2xl border border-rule/60 bg-white p-5">
      {cf.opening?.openingCash != null || lastBuiltOpening != null ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[14px] text-navy">
              Opening cash{' '}
              <strong className="tabular-nums">
                {money(cf.opening?.openingCash ?? lastBuiltOpening)}
              </strong>
              <span className="text-muted">
                {' '}
                · as of {prettyDay(cf.opening?.asOfDate ?? asOf)} ·{' '}
                {OPENING_SOURCE_TEXT[cf.opening?.source] ?? OPENING_SOURCE_TEXT.keyed}
              </span>
            </span>
            <button
              type="button"
              aria-label="Edit the opening balance"
              aria-expanded={openingEditorOpen}
              onClick={() => setOpeningEditorOpen((v) => !v)}
              className={`rounded-md border p-1.5 transition hover:border-gold/60 hover:text-navy ${
                openingEditorOpen ? 'border-gold/60 text-navy' : 'border-rule/70 text-muted'
              }`}
            >
              <Pencil size={13} />
            </button>
            {unbuiltOpening ? (
              <span className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-[12.5px] font-semibold text-[#8a5a06]">
                Unbuilt change — press Build forecast to apply.
              </span>
            ) : null}
          </div>
          <AnimatePresence initial={false}>
            {openingEditorOpen ? (
              <OpeningEditor
                openingValue={openingInput}
                onOpeningChange={setOpeningDraft}
                asOf={asOf}
                onAsOfChange={setAsOfDraft}
                busy={cf.projecting}
                onRebuild={() => {
                  run()
                  setOpeningEditorOpen(false)
                }}
                onCancel={() => setOpeningEditorOpen(false)}
                qboOffer={qboOffer}
                onUseQbo={() => {
                  setOpeningDraft(String(qboOffer.amount))
                  run({ openingCash: qboOffer.amount, openingSource: 'quickbooks' })
                  setOpeningEditorOpen(false)
                }}
                fmt={money}
              />
            ) : null}
          </AnimatePresence>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-muted">
            No forecast yet — state your available operating cash on the Overview tab to build
            the first one.
          </p>
          <button
            type="button"
            onClick={() => setTab('overview')}
            className="rounded-lg btn-cta px-4 py-2 text-[13px] font-semibold"
          >
            Go to Overview
          </button>
        </div>
      )}

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
  )

  return (
    <div
      style={moduleAccentVars('finance')}
      className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8"
    >
      {header}
      <CashTabs tab={tab} onTab={setTab} />

      {tab === 'overview' ? (
        <div
          id="cf-panel-overview"
          role="tabpanel"
          aria-labelledby="cf-tab-overview"
          tabIndex={0}
          className="mt-5 space-y-5"
        >
          {hero}

          {p ? (
            <>
              {/* ── What is not in this forecast ─────────────────────────────── */}
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

              {/* ── Why ──────────────────────────────────────────────────────── */}
              {why ? (
                <section className="rounded-2xl border border-rule/60 bg-cream/40 p-5">
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Why</h2>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-navy">{why}</p>
                </section>
              ) : null}

              {/* ── The outlook: two views (horizons live in the hero band) ──── */}
              <section className="rounded-2xl border border-rule/60 bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
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

                <div className="relative">
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
                          redrawKey={redrawKey}
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

                  {/* Rebuild shimmer — HONEST loading: the figures underneath are
                      the old projection, so they blur rather than pretend. */}
                  {cf.projecting ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px]">
                      <span
                        className={`rounded-full border border-rule/70 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-muted shadow-sm ${
                          reduce ? '' : 'animate-pulse'
                        }`}
                      >
                        Rebuilding…
                      </span>
                    </div>
                  ) : null}
                </div>

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

              {/* ── Potential actions ─────────────────────────────────────────── */}
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

              {/* ── Compact inputs summary — adding never requires the tab ──── */}
              <section className="rounded-2xl border border-rule/60 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-[17px] font-semibold text-navy">Forecast inputs</h2>
                    <p className="mt-1 text-[13px] text-muted">
                      {flows != null
                        ? `${adjustableFlows.length} QuickBooks-fed line${
                            adjustableFlows.length === 1 ? '' : 's'
                          }${excludedCount > 0 ? ` · ${excludedCount} switched off` : ''} · ${
                            cf.commitments.length
                          } expected item${cf.commitments.length === 1 ? '' : 's'} of your own`
                        : `${cf.commitments.length} expected item${
                            cf.commitments.length === 1 ? '' : 's'
                          } of your own · line-level QuickBooks detail arrives with the next rebuild`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTab('inputs')}
                      className="rounded-lg btn-cta px-4 py-2 text-[13px] font-semibold"
                    >
                      Open forecast inputs
                    </button>
                    <button
                      type="button"
                      onClick={() => openAdd()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rule/70 px-4 py-2 text-[13px] font-semibold text-navy transition hover:border-gold/60"
                    >
                      <Plus size={13} /> Add expected item
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      ) : (
        <div
          id="cf-panel-inputs"
          role="tabpanel"
          aria-labelledby="cf-tab-inputs"
          tabIndex={0}
          className="mt-5 space-y-5"
        >
          {setupStrip}

          {/* Sticky mini-projection — edits visibly redraw WITHOUT leaving the tab. */}
          {p ? (
            <div className="sticky top-2 z-20 flex items-center gap-4 rounded-2xl border border-rule/60 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
              <div className="min-w-0 flex-1">
                <Sparkline
                  vals={p.buckets.map((b) => b.closingBalance)}
                  color="#1D4ED8"
                  h={40}
                  fill
                  stretch
                />
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                  Lowest projected
                </p>
                <p className="text-[15px] font-semibold tabular-nums text-navy">
                  {money(p.lowestBalance)}
                  {p.lowestDate ? (
                    <span className="ml-1 text-[12px] font-normal text-muted">on {p.lowestDate}</span>
                  ) : null}
                </p>
              </div>
              {cf.projecting ? (
                <span
                  className={`shrink-0 rounded-full bg-section px-2.5 py-1 text-[11.5px] font-semibold text-muted ${
                    reduce ? '' : 'animate-pulse'
                  }`}
                >
                  Rebuilding…
                </span>
              ) : null}
            </div>
          ) : null}

          <CashInputsRail
            flows={flows}
            hasProjection={p != null}
            commitments={cf.commitments}
            sourceLabels={SOURCE_LABELS}
            format={money}
            onToggleFlow={toggleFlow}
            onAddItem={openAdd}
            onEditItem={openEdit}
            onRemoveItem={removeItem}
            busy={cf.projecting}
          />
        </div>
      )}

      {/* Data-tier + confidence disclaimer — visible on BOTH tabs; the honesty
          system travels with the forecast, not with the Overview panel. */}
      {p ? (
        <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            {cf.projection.dataTierReason} {cf.projection.disclaimer}
          </span>
        </p>
      ) : null}

      <CommitmentModal
        open={modal != null}
        onClose={() => setModal(null)}
        onSave={saveItem}
        saving={savingItem}
        error={modalError}
        initial={modal?.mode === 'edit' ? modal.commitment : (modal?.seed ?? null)}
        editing={modal?.mode === 'edit'}
      />
    </div>
  )
}
