import { IsIn, IsOptional, IsString, Matches } from 'class-validator'
import type { Lens } from '../briefing-lens.js'

/** Query for the org-wide attention briefing: which fiscal year to roll
 *  up, plus an optional Scope × Lens override. forbidNonWhitelisted requires
 *  every accepted field to be whitelisted here. */
export class OrgBriefingQueryDto {
  /**
   * First month of the fiscal year, 'YYYY-MM' (e.g. '2025-07'). When omitted the
   * service rolls up each school's most-recent statement snapshot.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fiscalYearStart must be YYYY-MM' })
  fiscalYearStart?: string

  /**
   * ADDITIVE (Scope × Lens). Optional lens override for the org rollup. Default =
   * the caller's widest in-org role. The server CLAMPS to that ceiling, so it can
   * only NARROW the view. @IsIn so garbage 400s at the boundary.
   */
  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], {
    message: 'lens must be owner, accountant, or viewer',
  })
  lens?: Lens
}
