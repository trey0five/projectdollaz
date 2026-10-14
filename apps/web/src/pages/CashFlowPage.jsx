// ─────────────────────────────────────────────────────────────────────────────
// CashFlowPage — "on what date do we run out, and by how much?"
//
// V3: real chrome, an editable forecast, and the hero doing the talking.
//
// The page wears the ledger chrome (Premium UI P3: BackLink → Finance, a
// `PageHeader`, no dark band) and splits into two thin tabs: OVERVIEW — the
// headline figures as a `StatStrip` on the ground (id cf-hero) whose values
// re-count on every rebuild, the honesty system, and the two views (charts +
// workbook) inside a Section — and FORECAST INPUTS — every
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
  Info,
  LayoutGrid,
  LineChart,
  Pencil,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react'
import { workbookRows } from '@finrep/analytics'
import { formatMetricValue } from '../lib/metricMeta.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useCashFlowProjection } from '../hooks/useCashFlowProjection.js'
import BackLink from '../components/ui/BackLink.jsx'
import { PageHeader, StatStrip, Stat, Section, Panel, Toolbar, Pill, Button } from '../components/ui/surface/index.js'
import DatePicker from '../components/ui/DatePicker.jsx'
import CashRail from '../components/cashflow/CashRail.jsx'
import CashWorkbook from '../components/cashflow/CashWorkbook.jsx'
import FlowBars from '../components/cashflow/FlowBars.jsx'
import CashInputsRail from '../components/cashflow/CashInputsRail.jsx'
import CommitmentModal from '../components/cashflow/CommitmentModal.jsx'
import CurrencyField from '../components/cashflow/CurrencyField.jsx'
import Sparkline from '../components/analytics/charts/Sparkline.jsx'
import { useCountUp } from '../components/analytics/charts/useCountUp.js'
import { moduleAccentVars } from '../components/module/moduleAnatomy.js'
import { flashElement } from '../components/analytics/v2/flash.js'
import { whyLine, potentialActions } from '../components/cashflow/whyLine.js'

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
  high: { label: 'High confidence', tone: 'good' },
  moderate: { label: 'Moderate confidence', tone: 'watch' },
  limited: { label: 'Limited confidence', tone: 'neutral' },
}

// A hero figure that RE-COUNTS on every rebuild (useCountUp keyed by the value
// string — prev → next, never through $0) and renders dates verbatim.
function LiveValue({ value, countUp = true }) {
  const display = useCountUp(value ?? '—', { duration: 600, enabled: countUp })
  return <>{display}</>
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
    <div role="tablist" aria-label="Cash forecast sections" className="tabs-ink">
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
            className="tab-ink"
          >
            <span>{t.label}</span>
            <span className="tab-ink-cap">{t.caption}</span>
            {active &&
              (reduce ? (
                <span className="tab-ink-rule" aria-hidden="true" />
              ) : (
                <motion.span layoutId="cf-tab-underline" className="tab-ink-rule" aria-hidden="true" />
              ))}
          </button>
        )
      })}
    </div>
  )
}

// ── The ONE operating-cash editor ────────────────────────────────────────────
// One component, one draft state (lifted to the page): opened by the hero tile's
// pencil (inline under the headline strip) and by the Forecast-inputs summary
// row's pencil (light). Confirming is a REAL build — the same persisted run()
// path as the Build button, because an explicit opening change belongs in the
// archive. There is deliberately no second free-standing input anywhere else.
function OpeningEditor({
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
  const labelCls = 'toolbar-label'
  const dateCls = 'w-44 rounded-md border border-hair/30 bg-white px-3 py-2 text-[14px] text-ink'
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
      className="overflow-hidden"
    >
      <Panel className="mt-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Available operating cash</span>
            <CurrencyField
              value={openingValue}
              onChange={onOpeningChange}
              variant="light"
              size="sm"
              className="w-48"
              aria-label="Available operating cash"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>As of</span>
            <DatePicker value={asOf} onChange={onAsOfChange} className={dateCls} />
          </label>
          <Button variant="primary" onClick={onRebuild} disabled={busy || !valid}>
            {busy ? 'Rebuilding…' : 'Rebuild forecast'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          {qboOffer ? (
            <Button variant="secondary" onClick={onUseQbo} icon={<Zap size={13} />}>
              Use QuickBooks balance · {fmt(qboOffer.amount)}
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink2">
          Rebuilding freezes a new run in the archive — the forecast the school actually built.
        </p>
        {error ? <p className="mt-1.5 text-[13px] tone-risk">{error}</p> : null}
      </Panel>
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
  const omissionTone = (cf.projection?.omissions ?? []).some((o) => /tuition|budget|receipt|revenue/i.test(`${o.key} ${o.message}`))
    ? 'risk'
    : 'watch'
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

  // ── Chrome — BackLink + PageHeader (eyebrow FINANCE · CASH FORECAST, the
  //    confidence / reserve / QuickBooks pills as the meta line) ─────────────
  const headerMeta = p ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {qboLive ? (
        <Pill variant="status" tone="good">
          Live from QuickBooks
        </Pill>
      ) : null}
      <Pill variant="status" tone={tier.tone} title={cf.projection?.dataTierReason}>
        {tier.label}
      </Pill>
      <Pill
        title={
          cf.projection?.assumptions.reserveThreshold == null
            ? 'set one to be told when you would breach it'
            : 'the balance you said you must hold'
        }
      >
        Reserve ·{' '}
        {cf.projection?.assumptions.reserveThreshold == null
          ? 'Not set'
          : money(cf.projection.assumptions.reserveThreshold)}
      </Pill>
    </span>
  ) : (
    'When cash runs low, by how much, and why.'
  )
  const header = (
    <div className="mb-2">
      <BackLink fallback="/finance" fallbackLabel="Back to Finance" className="mb-2" />
      <PageHeader
        eyebrow={['Finance', activeSchool?.name, 'Cash forecast'].filter(Boolean).join(' · ')}
        title="Cash forecast"
        hue="37 99 235"
        actions={
          p ? (
            <Button variant="secondary" onClick={() => openAdd()} icon={<Plus size={14} />}>
              Add expected item
            </Button>
          ) : null
        }
      >
        <div className="pg-meta">{headerMeta}</div>
      </PageHeader>
    </div>
  )

  if (cf.notLicensed) {
    return (
      <div
        style={moduleAccentVars('finance')}
        className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8"
      >
        {header}
        <div className="mt-4 border-t border-hair pt-4">
          <p className="text-body text-ink2">
            The cash forecast is part of the Finance and Planning modules. Add either to see when
            your cash is projected to run low.
          </p>
        </div>
      </div>
    )
  }

  // ── The headline — figures as a StatStrip when there is a forecast, the SETUP
  //    Panel when not. On the ground: the dark band is gone (plan §2.1). ──────
  const horizonBar = (
    <Toolbar
      aria-label="Forecast horizon"
      aside={
        p ? (
          <span className="text-small text-ink2 tabular-nums">as of {p.asOfDate}</span>
        ) : null
      }
    >
      <span className="toolbar-label">Horizon</span>
      <div className="seg" role="group" aria-label="Horizon">
        {HORIZONS.map((h) => (
          <button key={h.key} type="button" aria-pressed={horizon === h.key} onClick={() => pickHorizon(h.key)} className="seg-btn">
            {h.label}
          </button>
        ))}
      </div>
    </Toolbar>
  )
  const hero = (
    <motion.section
      // Penny walkthrough anchor 'cashFlow.headline' (see
      // apps/web/src/components/penny/guide/targetRegistry.js). The id is the
      // contract; the class list is not.
      id="cf-hero"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      aria-label="When does cash run low?"
    >
      {p ? (
        <>
          {horizonBar}
          <StatStrip cols={4} className="stats-compact">
            <Stat
              label="Available operating cash"
              value={<LiveValue value={money(p.openingCash)} />}
              status={p.firstShortfallDate ? 'watch' : 'good'}
              note={`as of ${p.asOfDate}`}
            >
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="Edit the opening balance"
                  aria-expanded={openingEditorOpen}
                  onClick={() => setOpeningEditorOpen((v) => !v)}
                  className="btn btn-quiet btn-sm"
                >
                  <Pencil size={12} /> Edit
                </button>
                {qboOffer ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningDraft(String(qboOffer.amount))
                      // A refinement of the CURRENT forecast, not a build — preview only.
                      run({ openingCash: qboOffer.amount, openingSource: 'quickbooks', persist: false })
                    }}
                    className="btn btn-quiet btn-sm"
                  >
                    <Zap size={11} /> Use QuickBooks balance · {money(qboOffer.amount)}
                  </button>
                ) : null}
              </div>
              <div className="mt-2 h-8">
                <Sparkline vals={p.buckets.map((b) => b.closingBalance)} color="#2563EB" h={32} fill stretch />
              </div>
            </Stat>
            <Stat
              label="Lowest projected"
              value={<LiveValue value={money(p.lowestBalance)} />}
              status={p.firstShortfallDate ? 'risk' : 'good'}
              note={p.lowestDate ? `on ${p.lowestDate}` : 'no movement in this horizon'}
            />
            <Stat
              label="Covered through"
              value={
                <LiveValue
                  countUp={false}
                  value={p.firstShortfallDate ? prettyDay(dayBefore(p.firstShortfallDate)) : prettyDay(p.horizonEnd)}
                />
              }
              status={p.firstShortfallDate ? 'watch' : 'good'}
              note={
                p.firstShortfallDate
                  ? `${p.daysOfNotice} days' notice`
                  : p.monthsCashAtLowPoint != null
                    ? `ends at ${money(p.endingBalance)} · ${p.monthsCashAtLowPoint.toFixed(1)} months' cash at the low`
                    : `ends at ${money(p.endingBalance)}`
              }
            />
            {p.firstShortfallDate ? (
              <Stat label="Projected gap" value={<LiveValue value={money(p.shortfallAmount)} />} status="risk" note={`first breach ${p.firstShortfallDate}`} />
            ) : (
              <Stat label="Ending balance" value={<LiveValue value={money(p.endingBalance)} />} status="good" note="stays above the reserve throughout" />
            )}
          </StatStrip>

          {/* The inline opening editor — the Stat's pencil expands it HERE,
              no page jump. Same run() path as Build (a real, persisted run). */}
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
                error={cf.error}
              />
            ) : null}
          </AnimatePresence>
        </>
      ) : cf.loading || (cf.opening?.openingCash != null && !cf.error) ? (
        /* LOADING / REHYDRATING: a previous build exists (or we don't know
           yet) — show the shimmer, never the setup screen. The setup below is
           ONLY for a school that has genuinely never built a forecast. */
        <div className="mt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`shimmer-bar h-[88px] rounded ${reduce ? '' : 'animate-pulse'}`} />
            ))}
          </div>
          <p className="mt-3 text-small font-semibold text-ink2">
            {cf.loading ? 'Loading…' : 'Rebuilding your last forecast…'}
          </p>
        </div>
      ) : (
        /* FIRST-RUN: the headline IS the setup. One field, one date, one click —
           inside the one raised surface, because it is a form. */
        <Panel className="mt-2 max-w-2xl">
          <h2 className="font-serif text-title text-ink">When does cash run low?</h2>
          <p className="mt-1 text-body text-ink2">
            Enter what operations can actually spend — or accept the QuickBooks balance — and
            build the forecast. Commitments, budget phasing, enrollment and your books do the
            rest.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="toolbar-label">Available operating cash</span>
              <CurrencyField
                value={openingInput}
                onChange={setOpeningDraft}
                variant="light"
                size="lg"
                className="w-56"
                aria-label="Available operating cash"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="toolbar-label">As of</span>
              <DatePicker
                value={asOf}
                onChange={setAsOfDraft}
                className="w-44 rounded-md border border-hair/30 bg-white px-3 py-2 text-[14px] text-ink"
              />
            </label>
            <Button variant="primary" onClick={() => run()} disabled={cf.projecting || !Number.isFinite(Number(openingInput))}>
              {cf.projecting ? 'Building…' : 'Build forecast'}
            </Button>
            {qboOffer ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setOpeningDraft(String(qboOffer.amount))
                  run({ openingCash: qboOffer.amount, openingSource: 'quickbooks' })
                }}
                icon={<Zap size={13} />}
              >
                Use QuickBooks balance · {money(qboOffer.amount)}
              </Button>
            ) : null}
          </div>
          {cf.error ? <p className="mt-2 text-[13px] tone-risk">{cf.error}</p> : null}
        </Panel>
      )}
    </motion.section>
  )

  // ── The Forecast-inputs summary (was the second entry strip) — READ-ONLY ───
  // The operating cash is stated ONCE: this row just reads it back, and its
  // pencil opens the same OpeningEditor the hero tile uses. No second input.
  const setupStrip = (
    <Panel as="section">
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
              className="btn btn-quiet btn-sm"
            >
              <Pencil size={13} /> Edit
            </button>
            {unbuiltOpening ? (
              <Pill variant="status" tone="watch">
                Unbuilt change — press Build forecast to apply.
              </Pill>
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
          <p className="text-[14px] text-ink2">
            No forecast yet — state your available operating cash on the Overview tab to build
            the first one.
          </p>
          <Button variant="primary" onClick={() => setTab('overview')}>
            Go to Overview
          </Button>
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
        <p className="mt-2 flex items-start gap-2 border-l-2 border-watch pl-3 text-[12.5px] leading-relaxed text-ink">
          <CalendarClock size={14} className="mt-px shrink-0 tone-watch" />
          This balance was last stated {cf.opening.ageDays} days ago. Every week after a stale
          start inherits its drift — restate it before acting on the forecast.
        </p>
      ) : null}
      {cf.error ? <p className="mt-2 text-[13px] tone-risk">{cf.error}</p> : null}
    </Panel>
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
          className="mt-4 space-y-6"
        >
          {hero}

          {p ? (
            <>
              {/* ── What is not in this forecast ─────────────────────────────── */}
              {cf.projection.omissions?.length > 0 ? (
                <Panel
                  as="section"
                  tone="attention"
                  // The mark follows the WORST omission: a missing receipt
                  // (tuition, a budget) makes the low point an artefact — risk;
                  // anything else is a watch. The server sends no severity.
                  className={omissionTone === 'risk' ? undefined : 'panel-watch'}
                  title={
                    <span className="inline-flex items-center gap-2">
                      <AlertTriangle size={15} className={`tone-${omissionTone}`} aria-hidden="true" /> What is not in this forecast
                    </span>
                  }
                >
                  <ul className="space-y-1.5">
                    {cf.projection.omissions.map((o) => (
                      <li key={o.key} className="text-small leading-relaxed text-ink">
                        {o.message}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {/* ── Why ──────────────────────────────────────────────────────── */}
              {why ? (
                <Section label="Why" as="section">
                  <p className="text-body text-ink">{why}</p>
                </Section>
              ) : null}

              {/* ── The outlook: two views (horizons live in the hero band) ──── */}
              <Section
                label="The outlook"
                as="section"
                aside={
                  <div className="seg" role="group" aria-label="Outlook view">
                    {[
                      { key: 'charts', label: 'Charts', Icon: LineChart },
                      { key: 'workbook', label: 'Workbook', Icon: LayoutGrid },
                    ].map(({ key, label, Icon }) => (
                      <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className="seg-btn">
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                }
              >
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
                          <h3 className="sec-label mb-2">Money in vs money out</h3>
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
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-ground/70">
                      <Pill className={reduce ? '' : 'animate-pulse'}>Rebuilding…</Pill>
                    </div>
                  ) : null}
                </div>

                {/* Provenance — which parts of this forecast came from where. Only
                    sources that actually contributed are shown. */}
                {activeSources.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Sparkles size={13} className="text-ink2" aria-hidden="true" />
                    {activeSources.map(([key, v]) => (
                      <Pill key={key} variant="count" title={`${v.count} event${v.count === 1 ? '' : 's'} · ${money(v.total)}`}>
                        {SOURCE_LABELS[key] ?? key} · {v.count}
                      </Pill>
                    ))}
                  </div>
                ) : null}

                {cf.projection.committedShare != null ? (
                  <p className="sec-note">
                    {Math.round(cf.projection.committedShare * 100)}% of the movement in this forecast is
                    committed — dates and amounts you already know. The rest is scheduled, modelled from
                    your history or budget, or an assumption you entered.
                  </p>
                ) : null}
              </Section>

              {/* ── Potential actions ─────────────────────────────────────────── */}
              {actions.length > 0 ? (
                <Section label="Potential actions" as="section" aside="suggestions, not steps taken for you — every one is a decision">
                  <ul className="m-0 list-none p-0">
                    {actions.map((a) => (
                      <li key={a.key} className="border-b border-hair py-3">
                        <Link to={a.to} className="inline-flex items-center gap-1.5 text-body font-semibold text-ink hover:underline">
                          {a.label} <ArrowRight size={13} />
                        </Link>
                        <p className="mt-1 text-small leading-relaxed text-ink2">{a.detail}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {/* ── Compact inputs summary — adding never requires the tab ──── */}
              <Section label="Forecast inputs" as="section">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-small text-ink2">
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
                    <Button variant="primary" onClick={() => setTab('inputs')}>
                      Open forecast inputs
                    </Button>
                    <Button variant="secondary" onClick={() => openAdd()} icon={<Plus size={13} />}>
                      Add expected item
                    </Button>
                  </div>
                </div>
              </Section>
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
            <div className="panel sticky top-2 z-20 flex items-center gap-4 px-4 py-2.5">
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
                <p className="toolbar-label">Lowest projected</p>
                <p className="text-body font-semibold tabular-nums text-ink">
                  {money(p.lowestBalance)}
                  {p.lowestDate ? (
                    <span className="ml-1 text-small font-normal text-ink2">on {p.lowestDate}</span>
                  ) : null}
                </p>
              </div>
              {cf.projecting ? <Pill className={reduce ? '' : 'animate-pulse'}>Rebuilding…</Pill> : null}
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
        <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink2">
          <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
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
