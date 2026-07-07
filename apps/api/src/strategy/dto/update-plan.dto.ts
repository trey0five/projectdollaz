import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PLAN_STATUSES, type PlanStatus } from '../strategy.constants.js'

/**
 * Patch a strategic plan. ALL fields optional. Hand-written (not PartialType) so the
 * whitelist stays explicit and merge-pick is obvious: omitted keeps, explicit null
 * clears a nullable field (mission/nextReviewDate). startDate/endDate/adoptedAt stay
 * server-derived (changing fyStartYear/fyEndYear re-derives start/end; status →
 * 'adopted' stamps adoptedAt) — never client-settable.
 */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mission?: string | null

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  fyStartYear?: number

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  fyEndYear?: number

  @IsOptional()
  @IsIn(PLAN_STATUSES)
  status?: PlanStatus

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string | null
}
