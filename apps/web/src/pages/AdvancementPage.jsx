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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  HeartHandshake,
  Pencil,
  Trash2,
  Check,
  TrendingDown,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
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

// Back-compat: the campaign form now lives with the other advancement components
// (shared with CampaignDetailPage) but keeps its old import site.
export { CampaignFormModal } from '../components/advancement/CampaignFormModal.jsx'

// ── Light-theme register table primitives ────────────────────────────────────
function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy ${
        danger ? 'hover:border-danger/50 hover:text-danger' : 'hover:border-gold/60'
      }`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

function TableShell({ children, cols }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule/50">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-cream">
          <tr>{cols}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function StateRow({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
      {children}
    </div>
  )
}

function Badge({ def }) {
  if (!def) return null
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      {def.label}
    </span>
  )
}

// ── Light-theme entitlement / license gate (shared with CampaignDetailPage) ───
export function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <HeartHandshake size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Advancement isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Advancement module to track fundraising campaigns and their giving progress —
              and land its slice of the briefing here.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Resume your plan to manage the advancement register.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ LIGHT REGISTER TABLE ═══════════════════════════

function CampaignsTable({ campaigns, loading, error, canEdit, reduce, onEdit, onDelete }) {
  if (loading) return <StateRow><p className="text-[14px] text-muted">Loading campaigns…</p></StateRow>
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (campaigns.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No campaigns yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Add your first campaign to start tracking fundraising progress.
        </p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Campaign</Th>
          <Th>Type</Th>
          <Th>Progress</Th>
          <Th right>Raised · Goal</Th>
          <Th>Close</Th>
          <Th right>Gifts</Th>
        </>
      }
    >
      <AnimatePresence initial={false}>
        {campaigns.map((c) => {
          const outstanding = typeof c.pledgedOutstanding === 'number' ? c.pledgedOutstanding : 0
          const giftCount = typeof c.giftCount === 'number' ? c.giftCount : 0
          const detailRoute = `/advancement/campaigns/${c.id}`
          return (
            <motion.tr
              key={c.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="group border-t border-rule/50"
            >
              <td className="px-4 py-3">
                <Link
                  to={detailRoute}
                  className="font-semibold text-navy underline-offset-2 hover:underline hover:decoration-gold/60"
                >
                  {c.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] capitalize text-muted">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  <Badge def={URGENCY_BADGE[c.urgency]} />
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{TYPE_LABEL[c.campaignType] ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="w-40">
                  <CampaignProgress
                    raised={c.raisedAmount ?? 0}
                    pledgedOutstanding={outstanding}
                    goal={c.goalAmount}
                    startDate={c.startDate}
                    closeDate={c.closeDate}
                    size="row"
                    reduce={reduce}
                  />
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-semibold text-navy">{fmtMoneyFull(c.raisedAmount ?? 0)}</span>
                <span className="text-muted">
                  {typeof c.goalAmount === 'number' ? ` / ${fmtMoneyFull(c.goalAmount)}` : ''}
                </span>
                {outstanding > 0 ? (
                  <div className="mt-0.5 text-[11.5px] font-semibold text-[#7a5e00]">
                    +{fmtMoneyFull(outstanding)} pledged
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-muted">{c.closeDate ? (shortDate(c.closeDate) ?? c.closeDate) : '—'}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <Link
                    to={detailRoute}
                    aria-label={`Gifts & pledges for ${c.name}`}
                    title="Gifts & pledges"
                    className="inline-flex items-center gap-1 rounded-lg border border-rule/60 px-2 py-1 text-[12px] font-semibold text-muted transition hover:border-gold/60 hover:text-navy"
                  >
                    {giftCount} gift{giftCount === 1 ? '' : 's'} →
                  </Link>
                  {canEdit ? (
                    <span className="flex gap-1.5 opacity-60 transition group-hover:opacity-100">
                      <IconAction Icon={Pencil} onClick={() => onEdit(c)} label={`Edit ${c.name}`} />
                      <IconAction Icon={Trash2} danger onClick={() => onDelete(c)} label={`Delete ${c.name}`} />
                    </span>
                  ) : null}
                </div>
              </td>
            </motion.tr>
          )
        })}
      </AnimatePresence>
    </TableShell>
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
      eyebrow="Domain · Advancement engine · system of record"
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
