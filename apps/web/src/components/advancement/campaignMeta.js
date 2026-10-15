// ─────────────────────────────────────────────────────────────────────────────
// campaignMeta — the ONE shared meta module for the Advancement domain. Labels,
// chip palettes and formatters used by the register (AdvancementPage), the
// campaign detail route (CampaignDetailPage) and the advancement components
// (CampaignFormModal / CampaignProgress / GiftFormModal / GiftsLedger). Pure
// data + pure functions — no JSX, no React. Status maps carry a Pill `tone`.
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

// ── Urgency → status Pill tone (2px mark + ink text; never a tinted chip) ────
export const URGENCY_BADGE = {
  overdue: { label: 'Overdue', tone: 'risk' },
  'closing-soon': { label: 'Closing soon', tone: 'watch' },
  'on-track': { label: 'On track', tone: 'good' },
  none: null,
}

// ── Gifts & pledges ──────────────────────────────────────────────────────────
export const GIFT_KINDS = ['gift', 'pledge']
export const GIFT_KIND_LABEL = { gift: 'Gift', pledge: 'Pledge' }

// Gift status → status Pill tone.
export const GIFT_STATUS = {
  received: { label: 'Received', tone: 'good' },
  partial: { label: 'Partial', tone: 'watch' },
  pledged: { label: 'Pledged', tone: 'neutral' },
  written_off: { label: 'Written off', tone: 'risk' },
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
