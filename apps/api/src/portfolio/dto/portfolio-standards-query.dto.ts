import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import type { Lens } from '../../analytics/briefing-lens.js'

/**
 * AIC Phase I §5 — INTERVENTION PRIORITIES: which single standard is weak across
 * enough schools to justify one diocesan workshop instead of nine school projects.
 *
 * Ordering is server-frozen (`schoolsBelowThreshold` desc → `sharePct` desc →
 * `code` asc → `catalogStandardId` asc). There is no client sort here either.
 */
export class PortfolioStandardsQueryDto {
  /** Narrow to one framework's catalog. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,40}$/, { message: 'frameworkCode has an unexpected shape' })
  frameworkCode?: string

  /** How many priorities to return. Default 10, hard max 50. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  /** Scope × Lens override. The server CLAMPS to the caller's org ceiling. */
  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], {
    message: 'lens must be owner, accountant, or viewer',
  })
  lens?: Lens
}
