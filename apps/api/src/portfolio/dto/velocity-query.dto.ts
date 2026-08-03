import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import type { Lens } from '../../analytics/briefing-lens.js'

/** The default observation window for org improvement velocity, in days. */
export const DEFAULT_VELOCITY_WINDOW_DAYS = 180

/**
 * AIC Phase I §4.5(3) — IS THE IMPROVEMENT WORK ALREADY ADOPTED ACTUALLY MOVING?
 *
 * `windowDays` is bounded at both ends deliberately. Below 30 days almost nothing
 * clears `MIN_PROJECTION_SPAN_DAYS` and the endpoint would return a page of
 * `insufficient`; above 730 the window spans framework changes and the deltas stop
 * being comparable readings of the same thing.
 */
export class VelocityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(730)
  windowDays?: number

  /** Scope × Lens override. The server CLAMPS to the caller's org ceiling. */
  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], {
    message: 'lens must be owner, accountant, or viewer',
  })
  lens?: Lens
}
