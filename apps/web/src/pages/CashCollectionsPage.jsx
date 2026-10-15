// ─────────────────────────────────────────────────────────────────────────────
// Cash & Collections (/cash) — the Finance AR/AP aging command center. Built on
// the reusable DomainCommandCenter scaffold (like Facilities / Governance): the
// KPIs that define collections health (overdue receivables, total receivables +
// DSO, bills due, net position), the aging-bucket bars, the AR/AP register with
// one-click-into-QuickBooks rows, and a needs-attention rail of the worst parties.
//
// Finance is CORE (base license) — there is NO entitlement gate here. Instead the
// states are integration-shaped: a school with no QuickBooks connection gets a
// friendly connect nudge (Penny coin + a button to /data), an org-consolidated
// (diocesan) school gets an "aging coming soon" note, and a connected school with
// nothing outstanding reads as "all clear". Live+cached from QuickBooks; the
// header Refresh button forces a fresh pull.
//
// School-scoped (no period selector). The ledger: DomainCommandCenter's PageHeader +
// StatStrip + register, ruled notes for the non-data states.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HandCoins,
  RefreshCw,
  TrendingDown,
  Users,
  Clock,
  Wallet,
  Check,
  Database,
  AlertTriangle,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import ModuleBreadcrumb from '../components/module/ModuleBreadcrumb.jsx'
import { FinanceMoreBlock } from '../components/statements/financeSub.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { AuroraButton, AuroraLightButton } from '../components/ui/aurora/index.js'
import AgingBars from '../components/cash/AgingBars.jsx'
import AgingRegisterTable from '../components/cash/AgingRegisterTable.jsx'
import CashFlowSection from '../components/cash/CashFlowSection.jsx'
import ReconcileBadge from '../components/cash/ReconcileBadge.jsx'
import { Pill, Button } from '../components/ui/surface/index.js'
import '../styles/pending/b2-finance.css'
import { useSchools } from '../context/SchoolContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { addDataHref } from '../lib/dataDestinations.js'
import { useCashCollections } from '../hooks/useCashCollections.js'
import { useCashFlow } from '../hooks/useCashFlow.js'
import { formatShortDate } from '../lib/format.js'

const BUCKET_LABEL = {
  current: 'Current',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
}

function fmtMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '$0'
  const neg = v < 0
  return `${neg ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
}

function bucketCounts(items) {
  const c = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  for (const it of items ?? []) if (c[it.bucket] != null) c[it.bucket] += 1
  return c
}

// ── Full-page state panels (module-level so they're never re-defined in render) ──
// The non-data states (loading / error / org-fed / not connected) wear the same
// Aurora band as the live page — title, one plain sentence, one white button —
// over a designed empty state (one line + one button). This is the screen a new
// school lands on, so it must still read as the module.
// (The breadcrumb — Dashboard › Finance › Cash & Collections — is drawn once by
// the page wrapper below, so the panels and the live page leave showBack off.)
const STATE_BASE = {
  eyebrow: 'Finance',
  title: 'Cash & Collections',
  Icon: HandCoins,
  icon: HandCoins,
}

function LoadingPanel() {
  return (
    <DomainStatePanel
      {...STATE_BASE}
      verdict="Reading your cash position…"
      text="Pulling aged receivables and payables from QuickBooks."
      busy
    />
  )
}

function ErrorPanel() {
  return (
    <DomainStatePanel
      {...STATE_BASE}
      icon={AlertTriangle}
      verdict="We couldn’t load Cash & Collections."
      text="Something interrupted the connection. Try again in a moment."
      action={
        <AuroraLightButton variant="ghost" onClick={() => window.location.reload()}>
          Try again
        </AuroraLightButton>
      }
    />
  )
}

function OrgFedPanel() {
  return (
    <DomainStatePanel
      {...STATE_BASE}
      verdict="This school’s cash is kept at the organization level."
      text="Its books are in one organization-wide QuickBooks company."
      sub="Per-school aging is coming soon."
    />
  )
}

function ConnectNudge({ onGoToData }) {
  return (
    <DomainStatePanel
      {...STATE_BASE}
      verdict="Connect QuickBooks to see who owes the school and what it owes."
      primaryAction={
        <AuroraButton variant="primary" onClick={onGoToData} icon={<Database size={19} aria-hidden="true" />}>
          Connect QuickBooks
        </AuroraButton>
      }
      icon={Database}
      text="Not connected to QuickBooks yet."
      sub="Once it is, money owed both ways shows here, by age."
    />
  )
}

const TABS = [
  { key: 'receivables', label: 'Receivables' },
  { key: 'payables', label: 'Payables' },
]

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function CashCollectionsWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const navigate = useNavigate()
  const uiV2 = useUiV2()

  const { data, loading, refreshing, error, connected, orgFed, refresh } =
    useCashCollections(schoolId)

  // Independent second hook: the live cash-flow + reconciliation payload. Fully
  // decoupled from the aging hook — it fails soft on its own (never blocks the
  // aging surface), so the badge + cash-flow section only appear once it lands
  // connected data of its own.
  const cashFlow = useCashFlow(schoolId)
  const cf = cashFlow.connected ? cashFlow.data : null

  const [tab, setTab] = useState('receivables')

  const ar = data?.ar ?? null
  const ap = data?.ap ?? null

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!ar || !ap) return []
    const over90 = ar.over90 ?? 0
    const overdue = ar.overdue ?? 0
    const dso = typeof ar.dso === 'number' ? Math.round(ar.dso) : null
    const apOverdue = ap.overdue ?? 0
    const apTotal = ap.total ?? 0
    const net = typeof data?.net === 'number' ? data.net : (ar.total ?? 0) - apTotal

    return [
      {
        label: 'Receivables overdue',
        value: fmtMoney(overdue),
        status: over90 > 0 ? 'risk' : overdue > 0 ? 'watch' : 'good',
        sub:
          over90 > 0
            ? { icon: TrendingDown, text: `${fmtMoney(over90)} over 90 days`, tone: 'bad' }
            : { icon: Check, text: 'nothing over 90 days', tone: 'good' },
      },
      {
        label: 'Total receivables',
        value: fmtMoney(ar.total ?? 0),
        status: 'neutral',
        sub: {
          icon: Users,
          text: `${ar.accounts ?? 0} account${(ar.accounts ?? 0) === 1 ? '' : 's'}${
            dso != null ? ` · DSO ${dso}d` : ''
          }`,
          tone: 'neutral',
        },
      },
      {
        label: 'Bills due',
        value: fmtMoney(apOverdue),
        status: apOverdue > 0 ? (apTotal > 0 && apOverdue / apTotal >= 0.5 ? 'risk' : 'watch') : 'good',
        sub: { icon: Clock, text: `${fmtMoney(ap.dueSoon ?? 0)} due ≤30 days`, tone: 'neutral' },
      },
      {
        label: 'Net position',
        value: fmtMoney(net),
        status: 'neutral',
        sub: { icon: Wallet, text: 'receivables minus payables', tone: 'neutral' },
      },
    ]
  }, [ar, ap, data])

  // ── Needs-attention rail (worst parties; over-90 first; capped 6) ────────────
  const attentionItems = useMemo(() => {
    if (!data) return []
    const out = []
    for (const p of ar?.top ?? []) {
      if (!(p.overdue > 0)) continue
      const is90 = p.oldestBucket === 'd90_plus'
      out.push({
        id: `ar-${p.party}`,
        sortKey: is90 ? 0 : 1,
        tone: is90 ? 'risk' : 'watch',
        title: `${p.party} — ${fmtMoney(p.overdue)} overdue`,
        why: `oldest bucket ${BUCKET_LABEL[p.oldestBucket] ?? p.oldestBucket} · ${p.count} open ${
          p.count === 1 ? 'invoice' : 'invoices'
        }`,
        actions: p.worstDeepLink
          ? [
              {
                label: 'Open in QuickBooks',
                primary: is90,
                onClick: () => window.open(p.worstDeepLink, '_blank', 'noopener,noreferrer'),
              },
            ]
          : [],
      })
    }
    for (const p of ap?.top ?? []) {
      if (!(p.overdue > 0)) continue
      out.push({
        id: `ap-${p.party}`,
        sortKey: 2,
        tone: 'watch',
        title: `${p.party} — ${fmtMoney(p.overdue)} to pay`,
        why: `${p.count} open ${p.count === 1 ? 'bill' : 'bills'} past due`,
        actions: p.worstDeepLink
          ? [
              {
                label: 'Open in QuickBooks',
                onClick: () => window.open(p.worstDeepLink, '_blank', 'noopener,noreferrer'),
              },
            ]
          : [],
      })
    }
    return out.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [data, ar, ap])

  // Per-bucket counts are only honest when the register isn't capped (totalCount ≤ shown
  // items) and there are items — otherwise pass null so the bars hide the count line.
  const arCounts = useMemo(
    () => ((ar?.totalCount ?? 0) <= (ar?.items?.length ?? 0) && (ar?.items?.length ?? 0) > 0 ? bucketCounts(ar.items) : null),
    [ar],
  )
  const apCounts = useMemo(
    () => ((ap?.totalCount ?? 0) <= (ap?.items?.length ?? 0) && (ap?.items?.length ?? 0) > 0 ? bucketCounts(ap.items) : null),
    [ap],
  )

  // ── State gates ─────────────────────────────────────────────────────────────
  if (loading) return <LoadingPanel />
  if (error && !data) return <ErrorPanel />
  if (!data) return <LoadingPanel />
  // Gate on data.connected: an org-fed (diocesan) school whose aging came back
  // connected:true (real per-location aging) falls through to the normal register.
  // Only an org-fed school that is NOT connected (no attributed slice) gets the panel.
  if (!connected) {
    if (orgFed) return <OrgFedPanel />
    // Deep-link the QuickBooks tab of the trial-balance flow directly (the
    // /data redirect strips query strings — never route the intent through it).
    return <ConnectNudge onGoToData={() => navigate(addDataHref(uiV2, { add: 'tb', intake: 'qbo' }))} />
  }

  // ── Header aside: as-of chip + stale note + Refresh ──────────────────────────
  const staleDays = data.asOf
    ? Math.max(
        0,
        Math.floor(
          (new Date().getTime() - new Date(`${data.asOf}T00:00:00`).getTime()) / 86400000,
        ),
      )
    : 0

  const headerAside = (
    <div className="flex flex-wrap items-center gap-2">
      {cf?.reconciliation ? <ReconcileBadge reconciliation={cf.reconciliation} stale={!!cf.stale} /> : null}
      {data.asOf ? (
        <Pill>
          <Clock size={11} aria-hidden="true" />
          as of {formatShortDate(data.asOf)}
        </Pill>
      ) : null}
      {/* Only show the age badge when we actually have an as-of date (a connected-but-
          never-captured degrade has asOf:null → the note below explains it instead). */}
      {data.stale && data.asOf ? (
        <Pill variant="status" tone="watch">
          {staleDays} day{staleDays === 1 ? '' : 's'} old
        </Pill>
      ) : null}
      {/* Non-org-fed notes (e.g. the stale-degrade note) stay a compact header pill.
          The org-fed aging note is surfaced instead as a fuller banner above the bars
          (see beforeBody) so the same note is never shown twice. */}
      {data.note && !orgFed ? (
        <Pill variant="status" tone="watch" className="!h-auto min-h-[20px] whitespace-normal py-0.5">
          {data.note}
        </Pill>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          refresh()
          // Re-verify the reconciliation badge too (it's a separate hook) — a trust
          // check the user explicitly asked to re-run.
          cashFlow.refresh()
        }}
        disabled={refreshing || cashFlow.refreshing}
        icon={<RefreshCw size={13} className={refreshing || cashFlow.refreshing ? 'animate-spin' : ''} />}
      >
        {refreshing || cashFlow.refreshing ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  )

  const activeSide = tab === 'payables' ? ap : ar
  const registerTable = (
    <AgingRegisterTable
      items={activeSide?.items ?? []}
      totalCount={activeSide?.totalCount ?? 0}
      side={tab}
    />
  )

  return (
    <DomainCommandCenter
      eyebrow="Finance · Cash & Collections · live from QuickBooks"
      title="Cash & Collections"
      Icon={HandCoins}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={null}
      headerAside={headerAside}
      beforeBody={
        <div className="space-y-6">
          {/* Org-fed (diocesan) aging note — the school's slice comes from location-
              tagged items in the org-wide QuickBooks company, so interlocation and
              untagged items may not appear. Soft amber banner above the bars. */}
          {orgFed && data.note ? (
            <div className="b2-callout b2-watch">
              <AlertTriangle size={14} aria-hidden="true" />
              <p>{data.note}</p>
            </div>
          ) : null}
          {cf?.cashflow ? (
            <CashFlowSection cashflow={cf.cashflow} runway={cf.runway} source={cf.source} />
          ) : null}
          <AgingBars ar={ar} ap={ap} arCounts={arCounts} apCounts={apCounts} />
        </div>
      }
      registerTable={registerTable}
      attentionItems={attentionItems}
    />
  )
}

// Cash & Collections is a Finance tool: the trail names Finance (a real step
// back) and the page ends with "More in Finance", like every Finance sub-page —
// the sidebar shows no Finance group here, so this is the way sideways.
const CRUMBS = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Finance', to: '/finance' },
  { label: 'Cash & Collections' },
]

export default function CashCollectionsPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <div className="mx-auto max-w-page px-4 pt-6 sm:px-10 sm:pt-8">
        <ModuleBreadcrumb crumbs={CRUMBS} />
      </div>
      {/* The command center's own top padding, less the breadcrumb's gap. */}
      <div className="-mt-3 sm:-mt-5">
        <CashCollectionsWorkspace />
      </div>
      <FinanceMoreBlock current="cash" />
    </div>
  )
}
