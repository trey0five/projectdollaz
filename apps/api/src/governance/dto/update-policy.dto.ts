import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { POLICY_STATUSES, type PolicyStatus } from './create-policy.dto.js'

/**
 * Patch a policy. ALL fields optional (partial PATCH). Hand-written (not
 * PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it (owner/adoptedDate/
 * lastReviewedDate/notes). title/category cannot be cleared (non-nullable
 * columns), so they carry @IsString/@MinLength when present.
 */
export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string

  @IsOptional()
  @IsIn(POLICY_STATUSES)
  status?: PolicyStatus

  @IsOptional()
  @IsString()
  @MaxLength(200)
  owner?: string | null

  @IsOptional()
  @IsDateString()
  adoptedDate?: string | null

  @IsOptional()
  @IsDateString()
  lastReviewedDate?: string | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  reviewIntervalMonths?: number

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}
