import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Create-or-get a fiscal period by its natural key (periodEndDate + periodType).
 * `label` is human-facing (e.g. "FY 2025"); when omitted the service derives one.
 */
export class CreatePeriodDto {
  /** Period end date as an ISO date string (YYYY-MM-DD or full ISO). */
  @IsISO8601()
  periodEndDate!: string

  /** Free-form period type tag, e.g. 'ytd' | 'fy' | 'annual'. */
  @IsString()
  @MaxLength(40)
  periodType!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string
}
