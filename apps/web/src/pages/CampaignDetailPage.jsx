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
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Pencil, Plus, ShieldCheck } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAdvancement } from '../hooks/useAdvancement.js'
import { CampaignFormModal, campaignToForm } from '../components/advancement/CampaignFormModal.jsx'
import { GiftFormModal } from '../components/advancement/GiftFormModal.jsx'
import GiftsLedger from '../components/advancement/GiftsLedger.jsx'
import CampaignProgress from '../components/advancement/CampaignProgress.jsx'
import {
  TYPE_LABEL,
  STATUS_LABEL,
  URGENCY_BADGE,
  shortDate,
} from '../components/advancement/campaignMeta.js'
import { GatePanel } from './AdvancementPage.jsx'
import { PageHeader, StatStrip, Stat, Section, Pill, Button } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

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
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <BackLink fallback="/advancement" fallbackLabel="Back to Advancement" />
        <PageHeader
          eyebrow={`Advancement · ${activeSchool?.name ?? 'School'}`}
          title={loading ? 'Loading campaign…' : 'Campaign not found'}
          meta={loading ? null : 'It may have been deleted, or belong to a different school.'}
        />
      </div>
    )
  }

  const raised = campaign.raisedAmount ?? 0
  const outstanding = typeof campaign.pledgedOutstanding === 'number' ? campaign.pledgedOutstanding : 0
  const goal = typeof campaign.goalAmount === 'number' ? campaign.goalAmount : null
  const remaining = goal != null ? Math.max(0, goal - raised - outstanding) : null
  const giftCount = gifts?.length ?? (typeof campaign.giftCount === 'number' ? campaign.giftCount : 0)

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

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <BackLink fallback="/advancement" fallbackLabel="Back to Advancement" />

      {/* ── Header — the campaign's identity ─────────────────────────────────── */}
      <PageHeader
        eyebrow={`Advancement · ${activeSchool?.name ?? 'School'}`}
        title={campaign.name}
        actions={
          canEdit ? (
            <Button onClick={() => setEditOpen(true)} icon={<Pencil size={14} />}>
              Edit campaign
            </Button>
          ) : null
        }
      >
        <div className="pg-meta flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{metaParts.join(' · ')}</span>
          {urgency ? (
            <Pill variant="status" tone={urgency.tone}>
              {urgency.label}
            </Pill>
          ) : null}
        </div>
      </PageHeader>

      {/* ── Progress rule + the three figures ────────────────────────────────── */}
      <div className="mt-6">
        <CampaignProgress
          size="hero"
          raised={raised}
          pledgedOutstanding={outstanding}
          goal={campaign.goalAmount}
          startDate={campaign.startDate}
          closeDate={campaign.closeDate}
          reduce={reduce}
        />
      </div>
      <StatStrip cols={3} className="mt-6">
        <Stat label="Raised" value={raised} format="currency" />
        <Stat label="Pledged outstanding" value={outstanding} format="currency" />
        <Stat label="Remaining to goal" value={remaining != null ? remaining : '—'} format="currency" />
      </StatStrip>

      {/* ── Gifts & pledges ──────────────────────────────────────────────────── */}
      <Section
        label={giftCount > 0 ? `Gifts & pledges · ${giftCount}` : 'Gifts & pledges'}
        aside={
          canEdit ? (
            <Button variant="primary" size="sm" onClick={() => setGiftModal({ entity: null })} icon={<Plus size={14} />}>
              Add gift / pledge
            </Button>
          ) : null
        }
      >
        <p className="mb-3 flex items-center gap-1.5 text-[12px] text-ink2">
          <ShieldCheck size={13} aria-hidden="true" />
          Aggregate only. Record amounts, never donor names. &ldquo;Raised&rdquo; is the sum of what has been received.
        </p>
        <GiftsLedger
          gifts={gifts}
          loading={giftsLoading}
          canEdit={canEdit}
          onEdit={(g) => setGiftModal({ entity: g })}
          onWriteOff={onWriteOff}
          onDelete={onGiftDelete}
        />
      </Section>

      {/* ── Notes ────────────────────────────────────────────────────────────── */}
      {campaign.notes ? (
        <Section label="Notes">
          <p className="max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-ink2">{campaign.notes}</p>
        </Section>
      ) : null}

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
