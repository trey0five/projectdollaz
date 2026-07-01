import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

/** Exported enum array so the service, tests, and FE stay in sync with the DTO. */
export const CAMPAIGN_STATUSES = ['planned', 'active', 'closed'] as const

/**
 * Create an advancement campaign. forbidNonWhitelisted-SAFE: EVERY field is
 * class-validator decorated, so a stray/unknown key 400s. Nullable fields are
 * `@IsOptional()`, which — by class-validator semantics — skips validation for BOTH
 * `undefined` (omitted) AND `null` (explicit clear), so `null` passes the whitelist
 * (same pattern as the facilities DTOs).
 *
 * status is an @IsIn enum (the DB stores TEXT with a @default). campaignType is FREE
 * TEXT v1. goalAmount/raisedAmount are bounded 2-dp non-negative numbers
 * (Decimal(14,2) caps at ~1 trillion; @Max keeps them well under JS Number cents
 * exactness). fiscalYear is a bounded whole year.
 */
export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  campaignType?: string | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  goalAmount?: number | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  raisedAmount?: number | null

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  fiscalYear?: number | null

  @IsOptional()
  @IsDateString()
  startDate?: string | null

  @IsOptional()
  @IsDateString()
  closeDate?: string | null

  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}
