import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'

export class QbCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @MinLength(1)
  realmId!: string
}

export class QbSyncDto {
  @IsString()
  @MinLength(1)
  periodId!: string
}

/**
 * Scoped import: pull a chosen mix from QuickBooks into `periodId`. currentYear
 * defaults ON (the base). priorYear fills the period's PY comparative; monthly
 * pulls a TB as of each month-end in the period's FY; historyYears pulls N older
 * fiscal-year-ends, each into its own period (multi-year trend).
 */
export class QbSyncScopeDto {
  @IsString()
  @MinLength(1)
  periodId!: string

  @IsBoolean()
  @IsOptional()
  currentYear?: boolean

  @IsBoolean()
  @IsOptional()
  priorYear?: boolean

  @IsBoolean()
  @IsOptional()
  monthly?: boolean

  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  historyYears?: number
}
