// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — supporting-schedule enums, MIRRORED VERBATIM from the server's
// apps/api/src/schedules/schedule.constants.ts. Used by the EDITORS only:
//   • the group/restriction selectors,
//   • the in-editor section headers.
// The PRINT labels in the board packet come from the server (assemble is the
// source of truth) — these are never used for the print document.
// ─────────────────────────────────────────────────────────────────────────────

// Capital Budget Summary — project grouping.
export const CAPITAL_GROUPS = ['rollover', 'current']

export const CAPITAL_GROUP_LABELS = {
  rollover: 'Prior-Year Rollover / Construction',
  current: 'Current-Year Capital Expenditures',
}

// Cash & Investments Summary — net-asset restriction grouping.
export const CASH_RESTRICTIONS = [
  'unrestricted',
  'temporarily_restricted',
  'permanently_restricted',
]

export const CASH_RESTRICTION_LABELS = {
  unrestricted: 'Unrestricted',
  temporarily_restricted: 'Temporarily Restricted',
  permanently_restricted: 'Permanently Restricted',
}

// Capital Campaign tracker — per-line column headers (editor display only).
export const CAMPAIGN_COLUMN_LABELS = {
  budget: 'Budget',
  estimate: 'Estimate',
  difference: 'Difference to Budget',
}

// Free-text division names; these are a datalist HINT only — NOT validated and
// NOT a fixed enum (campaigns name their own divisions). The group string is its
// own display label, so there is intentionally no *_LABELS map.
export const CAMPAIGN_GROUP_SUGGESTIONS = [
  'Upper Division',
  'Middle Division',
  'Lower Division',
  'Fundraising',
]
