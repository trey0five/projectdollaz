// ─────────────────────────────────────────────────────────────────────────────
// campaignMeta — the ONE shared meta module for the Advancement domain. Labels,
// chip palettes and formatters used by the register (AdvancementPage), the
// campaign detail route (CampaignDetailPage) and the advancement components
// (CampaignFormModal / CampaignProgress / GiftFormModal / GiftsLedger). Pure
// data + pure functions — no JSX, no React.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUSES = ['planned', 'active', 'closed']
export const CAMPAIGN_TYPES = ['annual_fund', 'capital', 'other']

export const TYPE_LABEL = {
  annual_fund: 'Annual Fund',
  capital: 'Capital Campaign',
  other: 'Other',
}

export const STATUS_LABEL = {
  planned: 'Planned',
  active: 'Active',
  closed: 'Closed',
}

// ── Light-theme urgency badge (restyled from the old dark pills) ──────────────
export const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-danger/30 bg-danger/10 text-danger' },
  'closing-soon': { label: 'Closing soon', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  'on-track': { label: 'On track', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  none: null,
}

// ── Gifts & pledges ──────────────────────────────────────────────────────────
export const GIFT_KINDS = ['gift', 'pledge']
export const GIFT_KIND_LABEL = { gift: 'Gift', pledge: 'Pledge' }

// LIGHT-palette status chips (the old dark GiftsPanel tones, re-cut for the
// light page surfaces).
export const GIFT_STATUS = {
  received: { label: 'Received', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  partial: { label: 'Partial', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  pledged: { label: 'Pledged', cls: 'border-rule/60 bg-section text-muted' },
  written_off: { label: 'Written off', cls: 'border-danger/30 bg-danger/10 text-danger' },
}

// ── Formatters ───────────────────────────────────────────────────────────────
export function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value).toLocaleString('en-US')}`
}

export function fmtMoneyFull(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

export function fmtPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `${Math.round(value * 100)}%`
}

// ── Short "Jul 6" date from a yyyy-mm-dd string (UTC-safe, no tz drift). ──────
export function shortDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
