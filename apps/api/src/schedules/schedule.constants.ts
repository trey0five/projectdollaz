// Phase 3 — supporting-schedule enums + display labels. Single source of truth
// for the DTOs (group/restriction @IsIn) and the board-report assemble (group
// ordering + section header labels). Mirrored VERBATIM in
// apps/web/src/components/reports/schedules/scheduleEnums.js (editor labels only;
// print labels come from the server via assemble).

export const CAPITAL_GROUPS = ['rollover', 'current'] as const
export type CapitalGroup = (typeof CAPITAL_GROUPS)[number]

export const CASH_RESTRICTIONS = [
  'unrestricted',
  'temporarily_restricted',
  'permanently_restricted',
] as const
export type CashRestriction = (typeof CASH_RESTRICTIONS)[number]

export const CAPITAL_GROUP_LABELS: Record<CapitalGroup, string> = {
  rollover: 'Prior-Year Rollover / Construction',
  current: 'Current-Year Capital Expenditures',
}

export const CASH_RESTRICTION_LABELS: Record<CashRestriction, string> = {
  unrestricted: 'Unrestricted',
  temporarily_restricted: 'Temporarily Restricted',
  permanently_restricted: 'Permanently Restricted',
}
