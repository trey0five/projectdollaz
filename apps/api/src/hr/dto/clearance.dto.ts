// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase K — CLEARANCE DTOs.
//
// `kind` is TEXT + @IsIn rather than a Postgres enum because the vocabulary is
// diocesan and varies by state: a new diocese must be a copy edit, not a
// migration. Every field is decorated — the global forbidNonWhitelisted pipe
// 400s anything not listed here, which is the whole reason an unexpected column
// cannot arrive from a client.
// ─────────────────────────────────────────────────────────────────────────────
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** The frozen clearance vocabulary. TEXT in the database; validated here. */
export const CLEARANCE_KINDS = [
  'background_check',
  'safe_environment_training',
  'fingerprinting',
  'mandated_reporter',
  'child_abuse_clearance',
  'other',
] as const
export type ClearanceKind = (typeof CLEARANCE_KINDS)[number]

/** One import may carry a whole diocese's file, but not an unbounded one. */
export const CLEARANCE_IMPORT_MAX_ROWS = 2000

export class CreateClearanceDto {
  @IsUUID()
  personId!: string

  @IsIn(CLEARANCE_KINDS)
  kind!: ClearanceKind

  @IsISO8601()
  issuedOn!: string

  /**
   * OPTIONAL, and its absence is meaningful: some clearances genuinely never
   * expire. A null is "no expiry recorded" and is NEVER read as lapsed — treating
   * a blank field as expired would manufacture a safeguarding finding out of
   * nothing.
   */
  @IsOptional()
  @IsISO8601()
  expiresOn?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  verifiedBy?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRef?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

export class UpdateClearanceDto {
  @IsOptional()
  @IsIn(CLEARANCE_KINDS)
  kind?: ClearanceKind

  @IsOptional()
  @IsISO8601()
  issuedOn?: string

  @IsOptional()
  @IsISO8601()
  expiresOn?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  verifiedBy?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRef?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

export class ListClearancesQueryDto {
  @IsOptional()
  @IsIn(CLEARANCE_KINDS)
  kind?: ClearanceKind

  /** true ⇒ only records past their recorded expiry date. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  lapsedOnly?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number
}

/**
 * ONE ROW OF A DIOCESAN FILE, already parsed by the browser.
 *
 * The person is matched BY NAME, because a diocesan export does not carry KYRO's
 * person ids and never will. The service refuses to create people it cannot
 * match rather than inventing staff records from a spreadsheet — a mistyped name
 * would otherwise silently become a second employee with a clean clearance.
 */
export class ClearanceImportRowDto {
  @IsString()
  @MaxLength(120)
  personName!: string

  @IsIn(CLEARANCE_KINDS)
  kind!: ClearanceKind

  @IsISO8601()
  issuedOn!: string

  @IsOptional()
  @IsISO8601()
  expiresOn?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRef?: string
}

export class ImportClearancesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClearanceImportRowDto)
  rows!: ClearanceImportRowDto[]
}
