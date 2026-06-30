import { IsOptional, IsString, Matches } from 'class-validator'

/** Query for the org-wide consolidated statements roll-up: which fiscal year to
 *  consolidate. Mirrors BudgetRollupQueryDto so the global forbidNonWhitelisted
 *  ValidationPipe accepts exactly the one field. */
export class StatementsRollupQueryDto {
  /**
   * First month of the fiscal year, 'YYYY-MM' (e.g. '2025-07'). When omitted the
   * service consolidates each school's most-recent statement snapshot.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fiscalYearStart must be YYYY-MM' })
  fiscalYearStart?: string
}
