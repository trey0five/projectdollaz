import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import type { Program } from '@finrep/compliance'

const PROGRAMS = ['FTC', 'FES_EO', 'FES_UA'] as const

/**
 * Upsert the per-period compliance intake (Florida scholarship AUP). All fields
 * optional so a partial PUT is allowed; `null` is allowed (and distinct from
 * omitted) — the service treats an explicit null as "clear this field". camelCase
 * keys match the api-client/web body. Non-negative numbers with sane bounds;
 * `programs` is validated to be a subset of the three tiers (and re-validated in
 * the service before it reaches the pure package).
 */
export class UpsertComplianceInputsDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  scholarshipFundsReceived?: number | null

  @IsOptional()
  @IsArray()
  @IsIn(PROGRAMS, { each: true })
  programs?: Program[]

  @IsOptional()
  @IsBoolean()
  fundsAtInsuredInstitution?: boolean | null

  @IsOptional()
  @IsBoolean()
  avgDailyBalanceOver250k?: boolean | null

  @IsOptional()
  @IsBoolean()
  bankRatingReviewedTopTwo?: boolean | null

  @IsOptional()
  @IsBoolean()
  reconciledWithin60Days?: boolean | null

  @IsOptional()
  @IsBoolean()
  reconciliationIndependentlyReviewed?: boolean | null

  @IsOptional()
  @IsBoolean()
  doeStatusApproved?: boolean | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  yearsInOperation?: number | null

  @IsOptional()
  @IsBoolean()
  suretyBondPosted?: boolean | null

  @IsOptional()
  @IsBoolean()
  fesuaAnyAccountOver50k?: boolean | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null
}
