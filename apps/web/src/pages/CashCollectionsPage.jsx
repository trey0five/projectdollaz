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
// School-scoped (no period selector). LIGHT navy/gold theme, EB Garamond title.
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
  ArrowRight,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import AgingBars from '../components/cash/AgingBars.jsx'
import AgingRegisterTable from '../components/cash/AgingRegisterTable.jsx'
import CashFlowSection from '../components/cash/CashFlowSection.jsx'
import ReconcileBadge from '../components/cash/ReconcileBadge.jsx'
import PennyAvatar from '../components/penny/PennyAvatar.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
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
function PagePanel({ children }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        {children}
      </div>
    </div>
  )
}

function HandCoinsBadge() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
      <HandCoins size={26} />
    </span>
  )
}

function LoadingPanel() {
  return (
    <PagePanel>
      <HandCoinsBadge />
      <h2 className="font-serif text-xl font-semibold text-navy">Reading your cash position…</h2>
      <p className="max-w-md text-[15px] text-muted">
        Pulling aged receivables and payables from QuickBooks.
      </p>
    </PagePanel>
  )
}

function ErrorPanel() {
  return (
    <PagePanel>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle size={26} />
      </span>
      <h2 className="font-serif text-xl font-semibold text-navy">
        We couldn&apos;t load Cash &amp; Collections
      </h2>
      <p className="max-w-md text-[15px] text-muted">
        Something interrupted the connection. Try again in a moment.
      </p>
    </PagePanel>
  )
}

function OrgFedPanel() {
  return (
    <PagePanel>
      <HandCoinsBadge />
      <h2 className="font-serif text-xl font-semibold text-navy">Consolidated at the org level</h2>
      <p className="max-w-md text-[15px] text-muted">
        This school&apos;s books are consolidated in one organization-wide QuickBooks company.
        Per-school aging is coming soon.
      </p>
    </PagePanel>
  )
}

function ConnectNudge({ onGoToData }) {
  return (
    <PagePanel>
      <PennyAvatar size={64} />
      <h2 className="font-serif text-xl font-semibold text-navy">
        Connect QuickBooks to see your cash
      </h2>
      <p className="max-w-md text-[15px] text-muted">
        Once QuickBooks is connected, Penny shows who owes the school and what it owes — aged into
        buckets, with a one-click jump into each invoice and bill.
      </p>
      <button
        type="button"
        onClick={onGoToData}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-2 text-[14px] font-semibold text-navy shadow-glow transition hover:brightness-105"
      >
        <Database size={16} /> Connect in the Data hub
        <ArrowRight size={15} />
      </button>
    </PagePanel>
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
    return <ConnectNudge onGoToData={() => navigate('/data')} />
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rule/60 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-muted">
          <Clock size={13} className="opacity-70" />
          as of {formatShortDate(data.asOf)}
        </span>
      ) : null}
      {/* Only show the age badge when we actually have an as-of date (a connected-but-
          never-captured degrade has asOf:null → the note below explains it instead). */}
      {data.stale && data.asOf ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#7a5e00]">
          <AlertTriangle size={13} />
          {staleDays} day{staleDays === 1 ? '' : 's'} old
        </span>
      ) : null}
      {/* Non-org-fed notes (e.g. the stale-degrade note) stay a compact header pill.
          The org-fed aging note is surfaced instead as a fuller banner above the bars
          (see beforeBody) so the same note is never shown twice. */}
      {data.note && !orgFed ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12.5px] font-medium text-[#7a5e00]">
          <AlertTriangle size={13} />
          {data.note}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          refresh()
          // Re-verify the reconciliation badge too (it's a separate hook) — a trust
          // check the user explicitly asked to re-run.
          cashFlow.refresh()
        }}
        disabled={refreshing || cashFlow.refreshing}
        className="inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-3.5 py-1.5 text-[13px] font-semibold text-navy shadow-glow transition hover:brightness-105 disabled:opacity-60"
      >
        <RefreshCw size={14} className={refreshing || cashFlow.refreshing ? 'animate-spin' : ''} />
        {refreshing || cashFlow.refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
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
      showBack
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
            <div className="flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-[13.5px] font-medium text-[#7a5e00]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
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

export default function CashCollectionsPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <CashCollectionsWorkspace />
    </div>
  )
}
