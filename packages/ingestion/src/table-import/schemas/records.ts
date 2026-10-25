// ─────────────────────────────────────────────────────────────────────────────
// Record schemas for the remaining modules (#51): a maintenance / asset list, a
// gift or pledge list, a campaign list, an accreditation standards list. Each
// reader returns raw-string records (plus a few word→key coercions the file
// can't be expected to spell the app's way); the API validates and writes.
// ─────────────────────────────────────────────────────────────────────────────
import { cell, describeHeader, matchColumns, type ColumnMatches, type FieldSpec } from '../match-columns.js'
import type { TableSheet } from '../read-table.js'

export interface RecordsRead<T> {
  records: T[]
  columns: ColumnMatches
  problem: string | null
}

function readRows<T>(
  sheet: TableSheet,
  fields: readonly FieldSpec[],
  required: { key: string; what: string; example: string },
  build: (r: readonly string[], m: Record<string, number>, row: number) => T | null,
): RecordsRead<T> {
  const columns = matchColumns(sheet.header, fields)
  if (!(required.key in columns.mapping)) {
    return {
      records: [],
      columns,
      problem: `Couldn’t find a ${required.what} column. The columns in this file are ${describeHeader(sheet.header)}. Add a “${required.example}” column and try again.`,
    }
  }
  const records: T[] = []
  sheet.rows.forEach((r, i) => {
    const rec = build(r, columns.mapping, sheet.headerRow + 2 + i)
    if (rec) records.push(rec)
  })
  return { records, columns, problem: null }
}

/** "$12,500.00", "(1,200)", "1.2k" → a number, or null when blank / unreadable. */
export function moneyFromText(raw: string): number | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  const k = /k$/i.test(s) ? 1000 : /m$/i.test(s) ? 1_000_000 : 1
  const n = Number(s.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || s.replace(/[^0-9]/g, '') === '') return null
  return Math.round((neg ? -n : n) * k * 100) / 100
}

// ── Facilities: maintenance / asset list ────────────────────────────────────

export const MAINTENANCE_FIELDS: readonly FieldSpec[] = [
  { key: 'title', label: 'Item', synonyms: ['item', 'task', 'work', 'description', 'asset', 'equipment', 'system', 'maintenance item', 'work order', 'issue', 'name', 'project'] },
  { key: 'location', label: 'Location', synonyms: ['building', 'room', 'area', 'site', 'where', 'campus', 'wing', 'floor'] },
  { key: 'category', label: 'Category', synonyms: ['type', 'kind', 'trade', 'discipline', 'class'] },
  { key: 'priority', label: 'Priority', synonyms: ['urgency', 'severity', 'importance'] },
  { key: 'status', label: 'Status', synonyms: ['state', 'progress', 'stage', 'done', 'complete', 'completed'] },
  { key: 'estimatedCost', label: 'Estimated cost', synonyms: ['estimate', 'cost', 'budget', 'quote', 'est', 'est cost', 'budgeted', 'amount'] },
  { key: 'actualCost', label: 'Actual cost', synonyms: ['actual', 'spent', 'paid', 'final cost', 'invoice'] },
  { key: 'vendor', label: 'Vendor', synonyms: ['contractor', 'company', 'supplier', 'provider', 'assigned to', 'who'] },
  { key: 'targetDate', label: 'Due date', synonyms: ['due', 'next due', 'next service', 'target', 'target date', 'scheduled', 'date', 'deadline', 'next inspection', 'due date', 'when'] },
  { key: 'lastDate', label: 'Last done', synonyms: ['last service', 'last done', 'last inspection', 'completed on', 'last date', 'serviced'] },
  { key: 'recurrence', label: 'Recurrence', synonyms: ['frequency', 'cycle', 'interval', 'how often', 'repeat', 'schedule'] },
  { key: 'notes', label: 'Notes', synonyms: ['note', 'comments', 'comment', 'remarks', 'details'] },
]

export interface MaintenanceRecord {
  row: number
  title: string
  location: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'critical' | ''
  status: 'open' | 'scheduled' | 'in_progress' | 'resolved' | ''
  estimatedCost: number | null
  actualCost: number | null
  vendor: string
  targetDate: string
  lastDate: string
  recurrence: 'none' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | ''
  notes: string
}

export function priorityFromText(raw: string): MaintenanceRecord['priority'] {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/critical|urgent|emergency|immediate|1\b|p1/.test(s)) return 'critical'
  if (/high|important|2\b|p2/.test(s)) return 'high'
  if (/low|minor|later|4\b|p4/.test(s)) return 'low'
  return 'medium'
}

export function maintenanceStatusFromText(raw: string): MaintenanceRecord['status'] {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/done|complete|resolved|closed|finished|yes|y$|✓/.test(s)) return 'resolved'
  if (/progress|working|started|underway|ongoing|active/.test(s)) return 'in_progress'
  if (/schedul|planned|booked|assigned/.test(s)) return 'scheduled'
  return 'open'
}

export function recurrenceFromText(raw: string): MaintenanceRecord['recurrence'] {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/week/.test(s)) return 'weekly'
  if (/month/.test(s)) return 'monthly'
  if (/quarter|3 month/.test(s)) return 'quarterly'
  if (/annual|year|12 month/.test(s)) return 'annual'
  if (/none|once|one[- ]time|n\/a/.test(s)) return 'none'
  return ''
}

export function maintenanceFromSheet(sheet: TableSheet): RecordsRead<MaintenanceRecord> {
  return readRows(sheet, MAINTENANCE_FIELDS, { key: 'title', what: 'item', example: 'Item' }, (r, m, row) => {
    const title = cell(r, m, 'title')
    if (!title) return null
    return {
      row,
      title,
      location: cell(r, m, 'location'),
      category: cell(r, m, 'category'),
      priority: priorityFromText(cell(r, m, 'priority')),
      status: maintenanceStatusFromText(cell(r, m, 'status')),
      estimatedCost: moneyFromText(cell(r, m, 'estimatedCost')),
      actualCost: moneyFromText(cell(r, m, 'actualCost')),
      vendor: cell(r, m, 'vendor'),
      targetDate: cell(r, m, 'targetDate'),
      lastDate: cell(r, m, 'lastDate'),
      recurrence: recurrenceFromText(cell(r, m, 'recurrence')),
      notes: cell(r, m, 'notes'),
    }
  })
}

// ── Advancement: gifts & pledges, campaigns ─────────────────────────────────

export const GIFT_FIELDS: readonly FieldSpec[] = [
  { key: 'donor', label: 'Donor', synonyms: ['donor name', 'constituent', 'from', 'name', 'giver', 'family', 'household', 'contributor', 'contact'] },
  { key: 'amount', label: 'Amount', synonyms: ['gift amount', 'pledge amount', 'total', 'gift', 'pledged', 'value', 'donation'] },
  { key: 'receivedAmount', label: 'Received', synonyms: ['paid', 'received to date', 'paid to date', 'collected', 'payments'] },
  { key: 'occurredOn', label: 'Date', synonyms: ['gift date', 'date received', 'pledge date', 'received on', 'when', 'transaction date'] },
  { key: 'kind', label: 'Type', synonyms: ['gift type', 'kind', 'pledge or gift', 'transaction type'] },
  { key: 'campaign', label: 'Campaign', synonyms: ['appeal', 'fund', 'campaign name', 'designation', 'purpose', 'drive', 'event'] },
  { key: 'note', label: 'Notes', synonyms: ['memo', 'note', 'comments', 'restriction', 'in memory of', 'in honor of', 'description'] },
  { key: 'source', label: 'Source', synonyms: ['channel', 'method', 'payment method', 'how', 'platform'] },
]

export interface GiftRecord {
  row: number
  donor: string
  amount: number | null
  receivedAmount: number | null
  occurredOn: string
  kind: 'gift' | 'pledge'
  campaign: string
  note: string
  source: string
}

export function giftKindFromText(raw: string, receivedAmount: number | null, amount: number | null): GiftRecord['kind'] {
  const s = (raw ?? '').trim().toLowerCase()
  if (/pledge|promise|commit/.test(s)) return 'pledge'
  if (!s && receivedAmount != null && amount != null && receivedAmount < amount) return 'pledge'
  return 'gift'
}

export function giftsFromSheet(sheet: TableSheet): RecordsRead<GiftRecord> {
  return readRows(sheet, GIFT_FIELDS, { key: 'amount', what: 'gift amount', example: 'Amount' }, (r, m, row) => {
    const donor = cell(r, m, 'donor')
    const amount = moneyFromText(cell(r, m, 'amount'))
    if (!donor && amount == null) return null
    const receivedAmount = moneyFromText(cell(r, m, 'receivedAmount'))
    return {
      row,
      donor,
      amount,
      receivedAmount,
      occurredOn: cell(r, m, 'occurredOn'),
      kind: giftKindFromText(cell(r, m, 'kind'), receivedAmount, amount),
      campaign: cell(r, m, 'campaign'),
      note: cell(r, m, 'note'),
      source: cell(r, m, 'source'),
    }
  })
}

export const CAMPAIGN_FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: 'Campaign', synonyms: ['campaign', 'campaign name', 'appeal', 'fund', 'drive', 'event', 'title'] },
  { key: 'campaignType', label: 'Type', synonyms: ['kind', 'category', 'campaign type'] },
  { key: 'goalAmount', label: 'Goal', synonyms: ['target', 'goal amount', 'target amount', 'objective'] },
  { key: 'raisedAmount', label: 'Raised', synonyms: ['raised to date', 'to date', 'total raised', 'received', 'actual', 'progress'] },
  { key: 'fiscalYear', label: 'Fiscal year', synonyms: ['fy', 'year', 'school year'] },
  { key: 'startDate', label: 'Start', synonyms: ['start date', 'begins', 'launch', 'from', 'open'] },
  { key: 'closeDate', label: 'End', synonyms: ['end date', 'close', 'closes', 'ends', 'to', 'through', 'deadline'] },
  { key: 'status', label: 'Status', synonyms: ['state', 'stage', 'active'] },
  { key: 'notes', label: 'Notes', synonyms: ['note', 'description', 'comments', 'purpose'] },
]

export interface CampaignRecord {
  row: number
  name: string
  campaignType: string
  goalAmount: number | null
  raisedAmount: number | null
  fiscalYear: number | null
  startDate: string
  closeDate: string
  status: 'planned' | 'active' | 'closed' | ''
  notes: string
}

/** "FY2027", "2027", "2026-27", "2026/2027" → the fiscal year's END year (2027). */
export function fiscalYearFromText(raw: string): number | null {
  const s = (raw ?? '').trim()
  const span = s.match(/(\d{4})\s*[-–/]\s*(\d{2,4})/)
  if (span) {
    const start = Number(span[1])
    const end = span[2]!.length === 2 ? Math.floor(start / 100) * 100 + Number(span[2]) : Number(span[2])
    return end >= start ? end : start
  }
  const one = s.match(/(\d{4})/)
  return one ? Number(one[1]) : null
}

export function campaignStatusFromText(raw: string): CampaignRecord['status'] {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/closed|complete|done|ended|finished|past/.test(s)) return 'closed'
  if (/plan|upcoming|future|draft|pending/.test(s)) return 'planned'
  return 'active'
}

export function campaignsFromSheet(sheet: TableSheet): RecordsRead<CampaignRecord> {
  return readRows(sheet, CAMPAIGN_FIELDS, { key: 'name', what: 'campaign name', example: 'Campaign' }, (r, m, row) => {
    const name = cell(r, m, 'name')
    if (!name) return null
    return {
      row,
      name,
      campaignType: cell(r, m, 'campaignType'),
      goalAmount: moneyFromText(cell(r, m, 'goalAmount')),
      raisedAmount: moneyFromText(cell(r, m, 'raisedAmount')),
      fiscalYear: fiscalYearFromText(cell(r, m, 'fiscalYear')),
      startDate: cell(r, m, 'startDate'),
      closeDate: cell(r, m, 'closeDate'),
      status: campaignStatusFromText(cell(r, m, 'status')),
      notes: cell(r, m, 'notes'),
    }
  })
}

// ── Accreditation: standards / indicators ───────────────────────────────────

export const STANDARD_FIELDS: readonly FieldSpec[] = [
  { key: 'code', label: 'Code', synonyms: ['standard #', 'standard number', 'number', 'no', 'id', 'indicator #', 'indicator number', 'ref', 'reference', 'item', 'std', 'criterion'] },
  { key: 'title', label: 'Standard', synonyms: ['standard', 'indicator', 'description', 'name', 'statement', 'requirement', 'text', 'criteria', 'expectation'] },
  { key: 'category', label: 'Category', synonyms: ['domain', 'section', 'area', 'strand', 'cluster', 'theme', 'group', 'chapter'] },
  { key: 'rating', label: 'Rating', synonyms: ['status', 'score', 'level', 'met', 'compliance', 'result', 'self-assessment', 'assessment', 'finding'] },
  { key: 'reviewDate', label: 'Review date', synonyms: ['next review', 'review', 'due', 'date', 'target date', 'by when'] },
  { key: 'owner', label: 'Owner', synonyms: ['responsible', 'lead', 'assigned', 'assigned to', 'point person', 'champion', 'who'] },
  { key: 'notes', label: 'Notes', synonyms: ['evidence', 'comments', 'comment', 'note', 'remarks', 'action', 'next steps', 'gap'] },
]

export interface StandardRecord {
  row: number
  code: string
  title: string
  category: string
  rating: 'not_started' | 'not_met' | 'partially_met' | 'met' | ''
  rubricScore: number | null
  reviewDate: string
  owner: string
  notes: string
}

export function ratingFromText(raw: string): { rating: StandardRecord['rating']; rubricScore: number | null } {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return { rating: '', rubricScore: null }
  const n = s.match(/^([1-4])(\s*\/\s*4)?$/)
  if (n) {
    const score = Number(n[1])
    return { rating: score >= 3 ? 'met' : score === 2 ? 'partially_met' : 'not_met', rubricScore: score }
  }
  if (/not\s*(yet\s*)?(start|begun|assessed|rated)|n\/a|tbd|pending/.test(s)) return { rating: 'not_started', rubricScore: null }
  if (/partial|in progress|developing|emerging|some|mostly|progress/.test(s)) return { rating: 'partially_met', rubricScore: null }
  if (/not\s*met|unmet|no\b|fail|below|does not|missing|non[- ]?compliant/.test(s)) return { rating: 'not_met', rubricScore: null }
  if (/\bmet\b|yes|compliant|complete|achieved|exceed|fully|pass|satisf/.test(s)) return { rating: 'met', rubricScore: null }
  return { rating: '', rubricScore: null }
}

export function standardsFromSheet(sheet: TableSheet): RecordsRead<StandardRecord> {
  return readRows(sheet, STANDARD_FIELDS, { key: 'title', what: 'standard', example: 'Standard' }, (r, m, row) => {
    const title = cell(r, m, 'title')
    let code = cell(r, m, 'code')
    if (!title && !code) return null
    // "1.2 Governing body…" — a code at the start of the title when there's no code column.
    if (!code) {
      const lead = title.match(/^([A-Z]?\d+(?:\.\d+)*[a-z]?)[\s.:–-]+/)
      if (lead) code = lead[1]!
    }
    const { rating, rubricScore } = ratingFromText(cell(r, m, 'rating'))
    return {
      row,
      code,
      title,
      category: cell(r, m, 'category'),
      rating,
      rubricScore,
      reviewDate: cell(r, m, 'reviewDate'),
      owner: cell(r, m, 'owner'),
      notes: cell(r, m, 'notes'),
    }
  })
}
