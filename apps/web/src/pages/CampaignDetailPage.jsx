// ─────────────────────────────────────────────────────────────────────────────
// CampaignDetailPage — /advancement/campaigns/:campaignId, the full-page home for
// ONE fundraising campaign (replaces the old dark row-expand gifts overlay on the
// register). Wrapped in the advancement ModuleAccent so the header rule and the
// progress rule take the module hue.
//
// Layout (Premium UI P4, the ledger): BackLink → PageHeader (name, type · status
// · FY · window as meta, Edit as the action) → the size="hero" CampaignProgress
// rule → a StatStrip (raised / pledged outstanding / remaining to goal) → the
// gifts & pledges DataTable in a Section → notes as a Section. No cards. Deep-link safe: cold loads gate on the module 402 (GatePanel) and an
// unknown id lands a friendly "Campaign not found". AGGREGATE only — no donor PII.
//
// AURORA (2026-10-15): the advancement band (school chip · type/status/FY/window
// eyebrow · the campaign name · one plain sentence on what it has raised and
// its pace · Add gift + Edit · glass cards for raised / still owed / left to
// raise / entries), then medallion sections: Progress (the rule in a white
// card), Gifts & pledges (the ledger), Notes. The privacy note sits behind
// How this works.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  Gift,
  HandCoins,
  HeartHandshake,
  Hourglass,
  NotebookText,
  Pencil,
  Plus,
  Receipt,
  Target,
  TrendingUp,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import ModuleBreadcrumb from '../components/module/ModuleBreadcrumb.jsx'
import { RegisterNewContext } from '../components/module/RegisterEmpty.jsx'
import { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import {
  AuroraHero,
  AuroraSection,
  AuroraCard,
  AuroraButton,
  AuroraLightButton,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAdvancement } from '../hooks/useAdvancement.js'
import { CampaignFormModal, campaignToForm } from '../components/advancement/CampaignFormModal.jsx'
import { GiftFormModal } from '../components/advancement/GiftFormModal.jsx'
import GiftsLedger from '../components/advancement/GiftsLedger.jsx'
import CampaignProgress, { campaignPace } from '../components/advancement/CampaignProgress.jsx'
import {
  TYPE_LABEL,
  STATUS_LABEL,
  URGENCY_BADGE,
  fmtMoney,
  fmtMoneyFull,
  fmtPct,
  shortDate,
} from '../components/advancement/campaignMeta.js'
import { GatePanel } from './AdvancementPage.jsx'
import '../styles/pending/b1-domain.css'

const PACE_VERDICT = { good: 'good', risk: 'risk' }

function CampaignTrail({ name }) {
  return (
    <div className="mb-3">
      <ModuleBreadcrumb
        crumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Advancement', to: '/advancement' }, { label: name }]}
      />
    </div>
  )
}

function CampaignDetailBody() {
  const { campaignId } = useParams()
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const {
    items,
    loading,
    notLicensed,
    notEntitled,
    updateItem,
    listGifts,
    createGift,
    updateGift,
    removeGift,
  } = useAdvancement(schoolId)

  const campaign = items.find((c) => c.id === campaignId) ?? null

  // ── Gifts (lazy, local — reloaded after every mutation; the hook already
  //    refetches the campaign list so the rollups stay in sync). ──────────────
  const [gifts, setGifts] = useState(null) // null = not yet loaded
  const [giftsLoading, setGiftsLoading] = useState(true)
  const [giftModal, setGiftModal] = useState(null) // { entity } | null
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (!schoolId || !campaignId) return undefined
    let cancelled = false
    // Microtask defer before the first setState (the house react-hooks/set-state-
    // in-effect-safe pattern — mirrors useAdvancement/useFacilities).
    Promise.resolve().then(async () => {
      if (cancelled) return
      setGiftsLoading(true)
      try {
        const rows = await listGifts(campaignId)
        if (!cancelled) setGifts(rows)
      } catch {
        if (!cancelled) setGifts([])
      } finally {
        if (!cancelled) setGiftsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, campaignId])

  const reloadGifts = async () => {
    const rows = await listGifts(campaignId)
    setGifts(rows)
  }

  const onGiftSubmit = async (body) => {
    if (giftModal?.entity) await updateGift(giftModal.entity.id, body)
    else await createGift(campaignId, body)
    await reloadGifts()
  }
  const onWriteOff = async (g) => {
    if (window.confirm(`Write off this ${g.kind}? Its outstanding pledge stops counting.`)) {
      await updateGift(g.id, { status: 'written_off' })
      await reloadGifts()
    }
  }
  const onGiftDelete = async (g) => {
    if (window.confirm('Delete this entry?')) {
      await removeGift(g.id)
      await reloadGifts()
    }
  }

  // ── Gate / loading / not-found ─────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  if (!campaign) {
    return (
      <DomainStatePanel
        showBack
        moduleKey="advancement"
        title={loading ? 'Loading campaign…' : 'Campaign not found'}
        Icon={HeartHandshake}
        icon={HeartHandshake}
        busy={loading}
        verdict={loading ? 'Reading the campaign and its gifts.' : 'It may have been deleted, or belong to another school.'}
        primaryAction={
          loading ? null : (
            <AuroraButton variant="primary" to="/advancement" icon={<ArrowLeft size={19} aria-hidden="true" />}>
              Back to Advancement
            </AuroraButton>
          )
        }
        text={loading ? 'One moment…' : 'No campaign at this link.'}
      />
    )
  }

  const raised = campaign.raisedAmount ?? 0
  const outstanding = typeof campaign.pledgedOutstanding === 'number' ? campaign.pledgedOutstanding : 0
  const goal = typeof campaign.goalAmount === 'number' ? campaign.goalAmount : null
  const remaining = goal != null ? Math.max(0, goal - raised - outstanding) : null
  const giftCount = gifts?.length ?? (typeof campaign.giftCount === 'number' ? campaign.giftCount : 0)
  const pace = campaignPace({
    raised,
    goal,
    startDate: campaign.startDate,
    closeDate: campaign.closeDate,
    status: campaign.status,
  })
  const pctOfGoal = goal ? raised / goal : null

  const giftInitial = giftModal?.entity
    ? {
        kind: giftModal.entity.kind,
        amount: String(giftModal.entity.amount),
        receivedAmount: String(giftModal.entity.receivedAmount),
        occurredOn: giftModal.entity.occurredOn ?? '',
        label: giftModal.entity.label ?? '',
        source: giftModal.entity.source ?? '',
        note: giftModal.entity.note ?? '',
      }
    : null

  const metaParts = [
    campaign.campaignType ? (TYPE_LABEL[campaign.campaignType] ?? campaign.campaignType) : null,
    STATUS_LABEL[campaign.status] ?? campaign.status,
    campaign.fiscalYear ? `FY ${campaign.fiscalYear}` : null,
    campaign.startDate || campaign.closeDate
      ? `${shortDate(campaign.startDate) ?? '—'} → ${shortDate(campaign.closeDate) ?? '—'}`
      : null,
  ].filter(Boolean)
  const urgency = URGENCY_BADGE[campaign.urgency]
  const openAddGift = canEdit ? () => setGiftModal({ entity: null }) : null

  // The band's one sentence: what it has raised, against its own goal, and its
  // pace against its own timeline (null pace → no judgement clause).
  const verdict = (
    <>
      <VerdictEm>{fmtMoneyFull(raised)} raised</VerdictEm>
      {goal ? (
        <>
          {' '}of a <VerdictEm>{fmtMoneyFull(goal)}</VerdictEm> goal
        </>
      ) : null}
      .{' '}
      {pace ? (
        <VerdictEm tone={pace.tone === 'neutral' ? null : pace.tone}>{pace.label}.</VerdictEm>
      ) : urgency && urgency.tone !== 'neutral' ? (
        <VerdictEm tone={urgency.tone}>{urgency.label}.</VerdictEm>
      ) : null}
    </>
  )

  const kpis = [
    {
      key: 'raised',
      icon: HandCoins,
      label: 'Raised',
      value: fmtMoney(raised),
      caption: pctOfGoal != null ? `${fmtPct(pctOfGoal) ?? '0%'} of goal` : 'No goal set',
      // A closed campaign has an outcome, not a pace: it gets no pill.
      verdict: pace?.closed ? null : (PACE_VERDICT[pace?.tone] ?? null),
      verdictLabel: pace && !pace.closed && pace.tone !== 'neutral' ? pace.label : null,
    },
    {
      key: 'owed',
      icon: Hourglass,
      label: 'Pledges still owed',
      value: fmtMoney(outstanding),
      caption: 'Promised, not yet received',
    },
    {
      key: 'left',
      icon: Target,
      label: 'Left to raise',
      value: remaining != null ? fmtMoney(remaining) : null,
      caption: remaining != null ? 'After pledges come in' : 'No goal set',
    },
    {
      key: 'entries',
      icon: Receipt,
      label: 'Gifts & pledges',
      value: String(giftCount),
      caption: giftCount === 1 ? 'entry logged' : 'entries logged',
    },
  ]

  return (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <CampaignTrail name={campaign.name} />

      {/* ── The band — the campaign's identity, its one sentence, its jobs ── */}
      <AuroraHero
        moduleKey="advancement"
        school={activeSchool?.name ?? null}
        eyebrow={metaParts.join(' · ')}
        title={campaign.name}
        verdict={verdict}
        actions={
          canEdit ? (
            <>
              <AuroraButton variant="primary" onClick={openAddGift} icon={<Plus size={19} aria-hidden="true" />}>
                Add gift / pledge
              </AuroraButton>
              <AuroraButton onClick={() => setEditOpen(true)} icon={<Pencil size={19} aria-hidden="true" />}>
                Edit campaign
              </AuroraButton>
            </>
          ) : null
        }
        kpis={kpis}
      />

      {/* ── Progress — the rule in a white card ───────────────────────────── */}
      <AuroraSection
        first
        icon={TrendingUp}
        title="Progress"
        subtitle="Raised and pledged against the goal"
        count={pctOfGoal != null ? `${fmtPct(pctOfGoal) ?? '0%'} of goal` : null}
      >
        <AuroraCard>
          <CampaignProgress
            size="hero"
            raised={raised}
            pledgedOutstanding={outstanding}
            goal={campaign.goalAmount}
            startDate={campaign.startDate}
            closeDate={campaign.closeDate}
            status={campaign.status}
            reduce={reduce}
          />
        </AuroraCard>
      </AuroraSection>

      {/* ── Gifts & pledges ──────────────────────────────────────────────────── */}
      <AuroraSection
        icon={Gift}
        title="Gifts & pledges"
        subtitle="Amounts only, never donor names"
        count={giftCount > 0 ? `${giftCount} logged` : null}
        aside={
          openAddGift ? (
            <AuroraLightButton size="sm" onClick={openAddGift} icon={<Plus size={15} aria-hidden="true" />}>
              New
            </AuroraLightButton>
          ) : null
        }
      >
        <div className="au-card au-card-flat au-register min-w-0">
          <RegisterNewContext.Provider value={openAddGift}>
            <GiftsLedger
              gifts={gifts}
              loading={giftsLoading}
              canEdit={canEdit}
              onEdit={(g) => setGiftModal({ entity: g })}
              onWriteOff={onWriteOff}
              onDelete={onGiftDelete}
            />
          </RegisterNewContext.Provider>
        </div>
      </AuroraSection>

      {/* ── Notes ────────────────────────────────────────────────────────────── */}
      {campaign.notes ? (
        <AuroraSection icon={NotebookText} title="Notes">
          <AuroraCard>
            <p className="max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-ink2">{campaign.notes}</p>
          </AuroraCard>
        </AuroraSection>
      ) : null}

      <HowThisWorks>
        <p>Raised is the sum of what has been received. Pledges still owed are promised but not yet in.</p>
        <p>
          Pace compares how much of the goal is raised with how much of the campaign&rsquo;s own window has passed.
        </p>
        <p>Record amounts only, never donor names.</p>
      </HowThisWorks>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {editOpen ? (
        <CampaignFormModal
          key={campaign.id}
          initial={campaignToForm(campaign)}
          onClose={() => setEditOpen(false)}
          onSave={(body) => updateItem(campaign.id, body)}
          reduce={reduce}
        />
      ) : null}
      {giftModal ? (
        <GiftFormModal
          open
          key={giftModal.entity ? giftModal.entity.id : 'new'}
          initial={giftInitial}
          campaignName={campaign.name}
          onClose={() => setGiftModal(null)}
          onSubmit={onGiftSubmit}
          reduce={reduce}
        />
      ) : null}
    </div>
  )
}

export default function CampaignDetailPage() {
  return (
    <ModuleAccent moduleKey="advancement">
      <div className="min-h-screen">
        <BillingBanner />
        <CampaignDetailBody />
      </div>
    </ModuleAccent>
  )
}
