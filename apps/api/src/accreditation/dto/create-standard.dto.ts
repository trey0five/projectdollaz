import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import { STANDARD_RATINGS, type StandardRating } from '@finrep/compliance'

/**
 * Create an accreditation standard. forbidNonWhitelisted-SAFE: EVERY field is
 * class-validator decorated, so a stray/unknown key 400s. Nullable fields
 * (category/reviewDate/owner/notes) are `@IsOptional()`, which — by class-validator
 * semantics — skips validation for BOTH `undefined` (omitted) AND `null` (explicit
 * clear), so `null` passes the whitelist and the validators never reject it (same
 * pattern as the policy DTOs).
 *
 * `code` and `category` are FREE TEXT v1 (schools name their own framework codes /
 * domains) — bounded only by @MaxLength, deliberately NOT @IsIn enums. `code` is
 * NOT unique per school in v1.
 */
export class CreateStandardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null

  /** Parent standard for the NESTED hierarchy (self-relation). null/omitted = top-level.
   *  The service validates parent∈same-school + forbids self-parent/cycles. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null

  /** Accreditor rating — @IsIn the shared closed set; defaults 'not_started' in the service. */
  @IsOptional()
  @IsIn(STANDARD_RATINGS)
  rating?: StandardRating

  @IsOptional()
  @IsDateString()
  reviewDate?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  owner?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}
