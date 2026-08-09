import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator'

/**
 * The projection request.
 *
 * EVERY FIELD IS EXPLICITLY DECORATED — the global forbidNonWhitelisted
 * ValidationPipe 400s any undecorated property, which is exactly right here: a
 * typo'd horizon must fail loudly rather than be ignored and answered with a
 * forecast over a window the caller did not ask for.
 */
export class ProjectCashDto {
  /**
   * AVAILABLE OPERATING CASH, not the balance-sheet total. Negative is permitted:
   * a school already overdrawn is exactly the school that needs this screen, and
   * rejecting the number would lock it out.
   */
  @IsNumber()
  openingCash!: number

  /** The date that balance is true as of. Everything rolls forward from here. */
  @IsISO8601()
  asOfDate!: string

  @IsOptional()
  @IsIn(['keyed', 'trial_balance', 'quickbooks'])
  openingSource?: 'keyed' | 'trial_balance' | 'quickbooks'

  @IsOptional()
  @IsIn(['week', 'month'])
  granularity?: 'week' | 'month'

  /**
   * Horizon preset. Each carries its sensible grain — weekly buckets while the
   * window is short enough to read week by week, monthly beyond that:
   *   13w → 13 weeks, weekly (the treasury convention; the default)
   *   1m  →  1 month, weekly
   *   3m  →  3 months, weekly
   *   6m  →  6 months, monthly
   *   12m → 12 months, monthly
   * An explicit `granularity` overrides the preset's grain.
   */
  @IsOptional()
  @IsIn(['13w', '1m', '3m', '6m', '12m'])
  horizon?: '13w' | '1m' | '3m' | '6m' | '12m'

  /** Weekly horizon length — the pre-preset compat knob. `horizon` wins. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(104)
  horizonWeeks?: number

  /**
   * Include the QuickBooks event source (open AR/AP + seasonal history) when
   * the school is connected. Defaults ON — a connected school's whole point is
   * zero manual entry; pass false to see the manual-only forecast.
   */
  @IsOptional()
  @IsBoolean()
  useQuickBooks?: boolean

  /**
   * Freeze this run? Defaults ON — the archive is what back-testing is built
   * from. Pass false for previews: every toggle, adjustment and edit re-projects
   * with persist:false, and only the explicit "Build forecast" writes a run, so
   * the archive records decisions rather than keystrokes. The service honored
   * this before the DTO admitted it — forbidNonWhitelisted 400'd any caller who
   * tried, which is why every UI re-projection used to freeze a run.
   */
  @IsOptional()
  @IsBoolean()
  persist?: boolean
}
