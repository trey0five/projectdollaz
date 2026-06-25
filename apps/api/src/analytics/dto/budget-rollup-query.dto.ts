import { IsOptional, IsString, Matches } from 'class-validator'

/** Query for the org-wide budget roll-up: which fiscal year to consolidate. */
export class BudgetRollupQueryDto {
  /**
   * First month of the fiscal year, 'YYYY-MM' (e.g. '2025-07'). When omitted the
   * service consolidates each school's most-recent imported budget.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fiscalYearStart must be YYYY-MM' })
  fiscalYearStart?: string
}
