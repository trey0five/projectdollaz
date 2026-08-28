import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'

/**
 * Query for GET /schools/:schoolId/enrollment/analytics.
 *
 * EVERY field is decorated. The API runs a global forbidNonWhitelisted
 * ValidationPipe, so an undecorated property is not "ignored" — it 400s the whole
 * request. Four knobs, no more: the page is a read of what the school already
 * has, not a query builder.
 */
export class EnrollmentAnalyticsQueryDto {
  /**
   * Anchor the whole payload on ONE fiscal period (tenant-checked by
   * PeriodsService.getOwnedPeriod). Omitted => the CURRENT FY period, resolved
   * read-only — a GET must never create a period.
   */
  @IsOptional()
  @IsUUID()
  periodId?: string

  /**
   * Answer as of a past date: snapshots observed after it are excluded, so the
   * page can be reproduced exactly as it read on the day a board met. Omitted =>
   * today. YYYY-MM-DD (a full ISO datetime also validates and is truncated).
   */
  @IsOptional()
  @IsDateString()
  asOf?: string

  /**
   * How many school YEARS of grade history to include in the heatmap and the
   * cohort ladders, newest-first. '1'..'5' as a string because it arrives on the
   * query string; the service clamps and defaults to 5. Bounded deliberately: an
   * unbounded window turns one page into an unpaged scan of every snapshot a
   * school has ever filed.
   */
  @IsOptional()
  @IsIn(['1', '2', '3', '4', '5'])
  years?: string

  /**
   * How many consecutive GRADES one cohort panel follows — the length of the
   * ladder, not the number of ladders.
   *
   * Panels of different lengths are not comparable: a two-point cohort has less
   * room to move than a five-point one, so a grid mixing them reads the short
   * ones as steadier than they are. Fixing the length is what makes the small
   * multiples a comparison. Same knob, same vocabulary and the same 2..N bounds
   * as the academics cohort view — the reader meets one idea, not two.
   *
   * NUMERIC, unlike `years` above: this arrives as a string on the query and is
   * coerced by @Type before @IsInt sees it. The server CLAMPS it to what the
   * school's own grades and history can support and echoes both what was asked
   * and what was used, so a link carrying an over-long window still renders.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(5)
  cohortWindow?: number
}
