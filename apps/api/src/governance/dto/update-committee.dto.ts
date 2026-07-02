import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Patch a committee. ALL fields optional (partial PATCH). Hand-written (not
 * PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it (description/chair). name/kind
 * cannot be cleared (non-nullable columns) → carry @IsString/@MinLength when
 * present.
 */
export class UpdateCommitteeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  kind?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  chair?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
