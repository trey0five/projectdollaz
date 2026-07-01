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
import { CAMPAIGN_STATUSES } from './create-campaign.dto.js'

/**
 * Patch an advancement campaign. ALL fields optional (partial PATCH). Hand-written
 * (not PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it. name cannot be cleared
 * (non-nullable column), so it carries @IsString/@MinLength when present.
 */
export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

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
