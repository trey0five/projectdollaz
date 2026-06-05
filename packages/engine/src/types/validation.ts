// ─────────────────────────────────────────────────────────────
// Structured validation result (debits = credits + unmapped issues).
// ─────────────────────────────────────────────────────────────
export interface ValidationIssue {
  code: 'UNBALANCED' | 'UNMAPPED_ACCOUNT' | 'OPENING_EQUITY_EXTERNAL'
  severity: 'error' | 'warning' | 'info'
  message: string
  acct?: number
  desc?: string
  total?: number
}

export interface ValidationResult {
  balanced: boolean
  /** Sum of positive (debit) totals. */
  totalDebits: number
  /** Absolute value of the sum of negative (credit) totals. */
  totalCredits: number
  /** Signed sum of all totals (totalDebits - totalCredits). */
  difference: number
  issues: ValidationIssue[]
}
