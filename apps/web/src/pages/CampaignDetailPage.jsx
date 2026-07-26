// ─────────────────────────────────────────────────────────────────────────────
// CampaignDetailPage — /advancement/campaigns/:campaignId, the full-page home for
// ONE fundraising campaign (replaces the old dark row-expand gifts overlay on the
// register). LIGHT page wrapped in the advancement ModuleAccent so every accent —
// including the back pill and the hero thermometer gradient — goes rose.
//
// Layout: BackLink → hero card (name + chips + date range + Edit) with the
// size="hero" CampaignProgress → three stat tiles (raised / pledged outstanding /
// remaining to goal) → gifts & pledges ledger (light GiftFormModal for entry) →
// notes. Deep-link safe: cold loads gate on the module 402 (GatePanel) and an
// unknown id lands a friendly "Campaign not found". AGGREGATE only — no donor PII.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { CalendarClock, HeartHandshake, Pencil, Plus, ShieldCheck } from 'lucide-react'
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
  fmtMoneyFull,
  shortDate,
} from '../components/advancement/campaignMeta.js'
import { GatePanel } from './AdvancementPage.jsx'

function Chip({ children, cls = 'border-rule/60 bg-section text-muted' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${cls}`}>
      {children}
    </span>
  )
}

function StatTile({ label, value }) {
  return (
    <div className="card-soft p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold text-navy">{value}</p>
    </div>
  )
}

function CenteredState({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
      {children}
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
      <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
        <BackLink fallback="/advancement" fallbackLabel="Back to Advancement" />
        <CenteredState>
          {loading ? (
            <p className="text-[14px] text-muted">Loading campaign…</p>
          ) : (
            <>
              <p className="font-serif text-[16px] italic text-muted">Campaign not found.</p>
              <p className="mt-1 text-[13px] text-muted">
                It may have been deleted, or belong to a different school.
              </p>
            </>
          )}
        </CenteredState>
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

  return (
    <div className="mx-auto max-w-page space-y-6 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink fallback="/advancement" fallbackLabel="Back to Advancement" />

      {/* ── Hero — the campaign's identity + its thermometer ─────────────────── */}
      <div className="card-soft p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">
              <HeartHandshake size={13} className="text-gold" />
              Advancement · Campaign
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight text-navy">
              {campaign.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {campaign.campaignType ? <Chip>{TYPE_LABEL[campaign.campaignType] ?? campaign.campaignType}</Chip> : null}
              <Chip>{STATUS_LABEL[campaign.status] ?? campaign.status}</Chip>
              {URGENCY_BADGE[campaign.urgency] ? (
                <Chip cls={URGENCY_BADGE[campaign.urgency].cls}>{URGENCY_BADGE[campaign.urgency].label}</Chip>
              ) : null}
              {campaign.fiscalYear ? <Chip>FY {campaign.fiscalYear}</Chip> : null}
              {campaign.startDate || campaign.closeDate ? (
                <Chip>
                  <CalendarClock size={12} className="text-gold" />
                  {shortDate(campaign.startDate) ?? '—'} → {shortDate(campaign.closeDate) ?? '—'}
                </Chip>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
            >
              <Pencil size={14} /> Edit campaign
            </button>
          ) : null}
        </div>

        <div className="mt-5">
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
      </div>

      {/* ── Stat tiles ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Raised" value={fmtMoneyFull(raised)} />
        <StatTile label="Pledged outstanding" value={fmtMoneyFull(outstanding)} />
        <StatTile label="Remaining to goal" value={remaining != null ? fmtMoneyFull(remaining) : '—'} />
      </div>

      {/* ── Gifts & pledges ──────────────────────────────────────────────────── */}
      <div className="card-soft p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-navy">
              Gifts &amp; pledges
              {giftCount > 0 ? <span className="ml-2 text-[13px] font-sans font-semibold text-muted">{giftCount}</span> : null}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
              <ShieldCheck size={13} className="text-gold" />
              Aggregate only — record amounts, never donor names. &ldquo;Raised&rdquo; is the sum of what has been received.
            </p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setGiftModal({ entity: null })}
              className="inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
            >
              <Plus size={15} /> Add gift / pledge
            </button>
          ) : null}
        </div>
        <GiftsLedger
          gifts={gifts}
          loading={giftsLoading}
          canEdit={canEdit}
          onEdit={(g) => setGiftModal({ entity: g })}
          onWriteOff={onWriteOff}
          onDelete={onGiftDelete}
        />
      </div>

      {/* ── Notes ────────────────────────────────────────────────────────────── */}
      {campaign.notes ? (
        <div className="card-soft p-5">
          <h2 className="mb-2 font-serif text-lg font-semibold text-navy">Notes</h2>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-muted">{campaign.notes}</p>
        </div>
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
      <div className="min-h-screen bg-section">
        <BillingBanner />
        <CampaignDetailBody />
      </div>
    </ModuleAccent>
  )
}
