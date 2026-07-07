import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PLAN_STATUSES, type PlanStatus } from '../strategy.constants.js'

/**
 * Create a strategic plan. forbidNonWhitelisted-SAFE: EVERY field is decorated, so
 * a stray key 400s. The server DERIVES startDate/endDate (from the FY years; FY is
 * Jul–Jun) and adoptedAt (when status → 'adopted') — they are deliberately NOT
 * client fields. nextReviewDate IS a client field (drives the review-due signal);
 * `@IsOptional` skips validation for both undefined and null (nullable clear).
 */
export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mission?: string | null

  /** FY the plan STARTS (Jul–Jun) — startDate = Jul 1 of this year (server-derived). */
  @IsInt()
  @Min(2000)
  @Max(2100)
  fyStartYear!: number

  /** FY the plan ENDS — endDate = Jun 30 of this year. Service enforces >= fyStartYear. */
  @IsInt()
  @Min(2000)
  @Max(2100)
  fyEndYear!: number

  @IsOptional()
  @IsIn(PLAN_STATUSES)
  status?: PlanStatus

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string | null
}
