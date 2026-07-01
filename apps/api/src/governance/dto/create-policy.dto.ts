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

/** Policy lifecycle status — a small closed enum (re-validated in the service). */
export const POLICY_STATUSES = ['active', 'draft', 'retired'] as const
export type PolicyStatus = (typeof POLICY_STATUSES)[number]

/**
 * Create a policy. forbidNonWhitelisted-SAFE: EVERY field is class-validator
 * decorated, so a stray/unknown key 400s. Nullable fields (owner/adoptedDate/
 * lastReviewedDate/notes) are `@IsOptional()`, which — by class-validator
 * semantics — skips validation for BOTH `undefined` (omitted) AND `null`
 * (explicit clear), so `null` passes the whitelist and the date validators never
 * reject it (same pattern as the CAP targetDate DTO).
 *
 * `category` is FREE TEXT v1 (schools name their own categories) — bounded only by
 * @MaxLength, deliberately NOT an @IsIn enum.
 */
export class CreatePolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string

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
