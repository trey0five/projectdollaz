import { IsOptional, IsString, Matches } from 'class-validator'

/** Query for the org-wide attention briefing: which fiscal year to roll
 *  up. A verbatim clone of StatementsRollupQueryDto so the global
 *  forbidNonWhitelisted ValidationPipe accepts exactly the one field. */
export class OrgBriefingQueryDto {
  /**
   * First month of the fiscal year, 'YYYY-MM' (e.g. '2025-07'). When omitted the
   * service rolls up each school's most-recent statement snapshot.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fiscalYearStart must be YYYY-MM' })
  fiscalYearStart?: string
}
