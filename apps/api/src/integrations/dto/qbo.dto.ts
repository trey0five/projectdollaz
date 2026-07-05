import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

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

// ── Diocesan QuickBooks (Topology B) — ONE company for the whole org ──────────

/** OAuth callback for the ORG-level connection (state carried `org:<orgId>`). */
export class OrgQbCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @MinLength(1)
  realmId!: string
}

/**
 * One explicit mapping decision for a dimension value: qboId is the QBO entity
 * Id (or '__unspecified__' for the report's "Not Specified" column). The
 * service 400s unless EXACTLY ONE of schoolId / ignored(true) is present.
 */
export class OrgQbMappingEntryDto {
  @IsString()
  @MinLength(1)
  qboId!: string

  @IsString()
  @MinLength(1)
  qboName!: string

  @IsUUID('4')
  @IsOptional()
  schoolId?: string

  @IsBoolean()
  @IsOptional()
  ignored?: boolean
}

/** Full replace of the org connection's stored decisions for ONE dimension. */
export class OrgQbMappingDto {
  @IsIn(['department', 'class'])
  dimension!: 'department' | 'class'

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrgQbMappingEntryDto)
  entries!: OrgQbMappingEntryDto[]
}

/**
 * Org-company import: every mapped school (or the explicit schoolIds subset —
 * [] means none, matching QbOrgSyncDto semantics) from ONE report pull per
 * window. currentYear defaults ON (the base); priorYear/monthly opt in.
 */
export class OrgQbCompanyImportDto {
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
}
