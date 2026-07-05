import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

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
  @Max(25)
  @IsOptional()
  historyYears?: number

  /** Pull EVERY prior year with data (ignores historyYears; scans back until QBO returns none). */
  @IsBoolean()
  @IsOptional()
  allHistory?: boolean
}

/**
 * Org-console batch sync: run a scoped import for every CONNECTED school the
 * caller can manage in the org (optionally narrowed to `schoolIds`). Same scope
 * knobs as QbSyncScopeDto but NO periodId — each school targets its own newest
 * period (auto-creating the current fiscal-year period for a school with none,
 * so a freshly-connected org syncs end-to-end with zero manual setup).
 */
export class QbOrgSyncDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  schoolIds?: string[]

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
  @Max(25)
  @IsOptional()
  historyYears?: number

  @IsBoolean()
  @IsOptional()
  allHistory?: boolean
}
