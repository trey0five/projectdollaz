import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

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
