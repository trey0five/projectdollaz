// ─────────────────────────────────────────────────────────────────────────────
// Advancement route — the DOMAIN COMMAND CENTER (Phase 4 register, redesigned to
// match Governance). A LIGHT command-center (matches the Finance home, not the old
// dark banner+list page): Penny lands you on advancement's slice of the briefing —
// the KPIs that define its health (raised this year, active campaigns, behind goal,
// closing soon), the items that need a decision (the attention rail with one-click
// Update actions), with the campaign register a tab away. Built on the reusable
// DomainCommandCenter scaffold.
//
// School-scoped (no period selector). Route stays /advancement; each campaign now
// has a REAL detail route (/advancement/campaigns/:id — CampaignDetailPage) where
// its gifts & pledges live, replacing the old dark row-expand overlay. Create and
// edit share the ONE CampaignFormModal (components/advancement); the RecordFlow
// wizard stays on the Add-data tab for batch entry. Gated by the 'advancement'
// module — a finance-only school direct-navving here gets a friendly light "module
// not on your plan" panel (the API 402 → notLicensed). AGGREGATE-only (no
// per-donor PII).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  HeartHandshake,
  Pencil,
  Trash2,
  Check,
  TrendingDown,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import { CampaignFormModal, campaignToForm } from '../components/advancement/CampaignFormModal.jsx'
import CampaignProgress from '../components/advancement/CampaignProgress.jsx'
import {
  TYPE_LABEL,
  STATUS_LABEL,
  URGENCY_BADGE,
  fmtMoney,
  fmtMoneyFull,
  fmtPct,
  shortDate,
} from '../components/advancement/campaignMeta.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useAdvancement } from '../hooks/useAdvancement.js'
import { PageHeader, DataTable, Pill } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

// Back-compat: the campaign form now lives with the other advancement components
// (shared with CampaignDetailPage) but keeps its old import site.
export { CampaignFormModal } from '../components/advancement/CampaignFormModal.jsx'

// ── Register atoms: quiet icon actions, a ruled state row ────────────────────
function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`b1-icon-act${danger ? ' b1-icon-act-danger' : ''}`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

/** Loading / error / empty — a ruled block on the ground, never a dashed card. */
function StateRow({ title, children, error }) {
  return (
    <div className="b1-empty" role={error ? 'alert' : undefined}>
      {title ? <p className="b1-empty-title">{title}</p> : null}
      {children ? <p className={error ? 'b1-empty-err' : undefined}>{children}</p> : null}
    </div>
  )
}

// ── Entitlement / license gate (shared with CampaignDetailPage) ──────────────
export function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <PageHeader
        eyebrow="Advancement"
        title={notLicensed ? 'Advancement isn\u2019t on your plan yet' : 'Your subscription is paused'}
        meta={
          notLicensed
            ? 'Add the Advancement module to track fundraising campaigns and their giving progress, and land its slice of the briefing here.'
            : 'Resume your plan to manage the advancement register.'
        }
      />
    </div>
  )
}

// ═══════════════════════════ REGISTER TABLE ═════════════════════════════════

function CampaignsTable({ campaigns, loading, error, canEdit, reduce, onEdit, onDelete }) {
  const navigate = useNavigate()
  if (loading) return <StateRow>Loading campaigns…</StateRow>
  if (error) return <StateRow error>{error}</StateRow>
  if (campaigns.length === 0)
    return (
      <StateRow title="No campaigns yet">Add your first campaign to start tracking fundraising progress.</StateRow>
    )

  const detailRoute = (c) => `/advancement/campaigns/${c.id}`
  const columns = [
    {
      key: 'name',
      header: 'Campaign',
      sortable: true,
      render: (c) => (
        <div className="min-w-[11rem] py-1.5">
          <Link to={detailRoute(c)} className="font-semibold text-ink underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
            {c.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink2">
            <span>
              {[TYPE_LABEL[c.campaignType], STATUS_LABEL[c.status] ?? c.status].filter(Boolean).join(' · ')}
            </span>
            {URGENCY_BADGE[c.urgency] ? (
              <Pill variant="status" tone={URGENCY_BADGE[c.urgency].tone}>
                {URGENCY_BADGE[c.urgency].label}
              </Pill>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      sortable: true,
      sortValue: (c) => (typeof c.pctOfGoal === 'number' ? c.pctOfGoal : null),
      render: (c) => (
        <div className="w-32">
          <CampaignProgress
            raised={c.raisedAmount ?? 0}
            pledgedOutstanding={typeof c.pledgedOutstanding === 'number' ? c.pledgedOutstanding : 0}
            goal={c.goalAmount}
            startDate={c.startDate}
            closeDate={c.closeDate}
            size="row"
            reduce={reduce}
          />
        </div>
      ),
    },
    {
      key: 'raisedAmount',
      header: 'Raised · Goal',
      num: true,
      sortable: true,
      render: (c) => {
        const outstanding = typeof c.pledgedOutstanding === 'number' ? c.pledgedOutstanding : 0
        return (
          <>
            <span className="whitespace-nowrap">
              <span className="font-semibold">{fmtMoneyFull(c.raisedAmount ?? 0)}</span>
              <span className="text-ink2">{typeof c.goalAmount === 'number' ? ` / ${fmtMoneyFull(c.goalAmount)}` : ''}</span>
            </span>
            {outstanding > 0 ? <span className="dt-sub">+{fmtMoneyFull(outstanding)} pledged</span> : null}
          </>
        )
      },
    },
    {
      key: 'closeDate',
      header: 'Close',
      sortable: true,
      render: (c) => <span className="whitespace-nowrap text-ink2">{c.closeDate ? (shortDate(c.closeDate) ?? c.closeDate) : '—'}</span>,
    },
    {
      key: 'giftCount',
      header: 'Gifts',
      num: true,
      sortable: true,
      render: (c) => {
        const giftCount = typeof c.giftCount === 'number' ? c.giftCount : 0
        return (
          <div className="inline-flex items-center justify-end gap-1">
            <Link
              to={detailRoute(c)}
              aria-label={`Gifts & pledges for ${c.name}`}
              title="Gifts & pledges"
              className="dt-link whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              {giftCount} gift{giftCount === 1 ? '' : 's'} →
            </Link>
            {canEdit ? (
              <span className="dt-actions inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <IconAction Icon={Pencil} onClick={() => onEdit(c)} label={`Edit ${c.name}`} />
                <IconAction Icon={Trash2} danger onClick={() => onDelete(c)} label={`Delete ${c.name}`} />
              </span>
            ) : null}
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      caption="Campaign register"
      columns={columns}
      rows={campaigns}
      onRowClick={(c) => navigate(detailRoute(c))}
      markOf={(c) => (c.urgency === 'overdue' ? 'risk' : c.urgency === 'closing-soon' ? 'watch' : null)}
    />
  )
}

const TABS = [{ key: 'campaigns', label: 'Campaigns' }]

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function AdvancementWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()

  const {
    items,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    createItem,
    updateItem,
    removeItem,
  } = useAdvancement(schoolId)

  const [tab, setTab] = useState('campaigns')
  const [modal, setModal] = useState(null) // { entity } | null

  const openCreate = () => setModal({ entity: null })
  const openEdit = (entity) => setModal({ entity })
  const closeModal = () => setModal(null)

  const onDelete = async (c) => {
    if (window.confirm(`Delete "${c.name}"?`)) {
      await removeItem(c.id)
    }
  }

  // ── KPIs (computed from the summary) ───────────────────────────────────────
  const kpis = useMemo(() => {
    const totalGoal = summary.totalGoal ?? 0
    const totalRaised = summary.totalRaised ?? 0
    const overallPct = summary.overallPctOfGoal
    const activeCount = summary.activeCount ?? 0
    const behind = summary.behindGoalActiveCount ?? 0
    const closingSoon = summary.closingSoonActiveCount ?? 0
    const overdue = summary.overdueActiveCount ?? 0
    const onGoalPace = typeof overallPct === 'number' && overallPct >= 0.9

    // 1) Raised this year.
    const raisedKpi = {
      label: 'Raised this year',
      value: fmtMoney(totalRaised),
      status: onGoalPace ? 'good' : 'watch',
      sub: {
        icon: onGoalPace ? Check : TrendingDown,
        text:
          totalGoal > 0
            ? `${fmtPct(overallPct) ?? '0%'} of ${fmtMoney(totalGoal)} goal`
            : 'no goal set',
        tone: onGoalPace ? 'good' : 'neutral',
      },
    }

    // 2) Active campaigns.
    const activeKpi = {
      label: 'Active campaigns',
      value: String(activeCount),
      status: behind > 0 ? 'risk' : 'good',
      sub:
        behind > 0
          ? { icon: TrendingDown, text: `${behind} behind goal`, tone: 'bad' }
          : { icon: Check, text: 'on pace', tone: 'good' },
    }

    // 3) Behind goal.
    const behindKpi = {
      label: 'Behind goal',
      value: String(behind),
      status: behind > 0 ? 'risk' : 'good',
      sub:
        behind > 0
          ? { icon: TrendingDown, text: 'active campaigns under pace', tone: 'bad' }
          : { icon: Check, text: 'all on pace', tone: 'good' },
    }

    // 4) Closing soon.
    const closingKpi = {
      label: 'Closing soon',
      value: String(closingSoon),
      status: closingSoon > 0 ? 'watch' : 'neutral',
      sub:
        overdue > 0
          ? { icon: AlertTriangle, text: `${overdue} past close date`, tone: 'bad' }
          : { icon: CalendarClock, text: 'within 45 days', tone: 'neutral' },
    }

    return [raisedKpi, activeKpi, behindKpi, closingKpi]
  }, [summary])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    const active = items.filter((c) => c.status === 'active')
    const raw = []

    // 1) Overdue active campaigns (past their close date).
    for (const c of active.filter((c) => c.urgency === 'overdue')) {
      raw.push({
        id: `overdue-${c.id}`,
        tone: 'risk',
        sortKey: 0,
        title: `${c.name} is past its close date`,
        why:
          typeof c.daysUntilClose === 'number'
            ? `Closed ${Math.abs(c.daysUntilClose)} day${Math.abs(c.daysUntilClose) === 1 ? '' : 's'} ago · still open`
            : 'Past its close date · still open',
        actions: canEdit ? [{ label: 'Update', primary: true, onClick: () => openEdit(c) }] : [],
      })
    }

    // 2) Active campaigns behind goal.
    const behind = active.filter(
      (c) => typeof c.pctOfGoal === 'number' && c.pctOfGoal < 0.9 && c.urgency !== 'overdue',
    )
    for (const c of behind) {
      raw.push({
        id: `behind-${c.id}`,
        tone: 'watch',
        sortKey: 1,
        title: `${c.name} is behind goal`,
        why: `${fmtPct(c.pctOfGoal) ?? '0%'} of goal raised`,
        actions: canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(c) }] : [],
      })
    }

    // 3) Active campaigns closing soon.
    for (const c of active.filter((c) => c.urgency === 'closing-soon')) {
      const days = typeof c.daysUntilClose === 'number' ? c.daysUntilClose : null
      raw.push({
        id: `closing-${c.id}`,
        tone: 'watch',
        sortKey: 2,
        title: days != null ? `${c.name} closes in ${days} day${days === 1 ? '' : 's'}` : `${c.name} closes soon`,
        why:
          typeof c.pctOfGoal === 'number'
            ? `${fmtPct(c.pctOfGoal)} of goal raised so far`
            : 'Approaching its close date',
        actions: canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(c) }] : [],
      })
    }

    return raw.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [items, canEdit])

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  const registerTable = (
    <CampaignsTable
      campaigns={items}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      onEdit={openEdit}
      onDelete={onDelete}
    />
  )

  // "+ New" opens the ONE create/edit modal; the Add-data tab keeps the batch wizard.
  const onNew = canEdit ? openCreate : null

  const onSave = async (body) => {
    if (modal?.entity) await updateItem(modal.entity.id, body)
    else await createItem(body)
  }

  const commandCenter = (
    <DomainCommandCenter
      showAddData
      moduleKey="advancement"
      eyebrow={`Advancement · ${activeSchool?.name ?? 'School'}`}
      title="Advancement"
      Icon={HeartHandshake}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={onNew}
      registerTable={registerTable}
      registerTitle="Campaign register"
      attentionItems={attentionItems}
    />
  )

  const overlays = modal ? (
    <CampaignFormModal
      key={modal.entity ? modal.entity.id : 'new'}
      initial={campaignToForm(modal.entity)}
      onClose={closeModal}
      onSave={onSave}
      reduce={reduce}
    />
  ) : null

  if (uiV2) {
    return (
      <ModuleAccent moduleKey="advancement">
        <ModuleTabs
          moduleKey="advancement"
          overview={commandCenter}
          addData={<AddDataTab module="advancement" schoolId={schoolId} canEdit={canEdit} />}
          records={
            <ModuleRegister
              moduleKey="advancement"
              hue={moduleHue('advancement')}
              tabs={TABS}
              activeTab={tab}
              onTabChange={setTab}
              onNew={onNew}
              registerTable={registerTable}
            />
          }
        />
        {overlays}
      </ModuleAccent>
    )
  }

  return (
    <>
      {commandCenter}
      {overlays}
    </>
  )
}

export default function AdvancementPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <AdvancementWorkspace />
    </div>
  )
}
