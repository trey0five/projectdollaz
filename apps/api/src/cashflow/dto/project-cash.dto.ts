import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator'

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
  @IsIn(['keyed', 'trial_balance'])
  openingSource?: 'keyed' | 'trial_balance'

  @IsOptional()
  @IsIn(['week', 'month'])
  granularity?: 'week' | 'month'

  /** Weekly horizon length. 13 is the cash-management convention. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(104)
  horizonWeeks?: number
}
