import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import { STANDARD_RATINGS, type StandardRating } from '@finrep/compliance'

/**
 * Patch an accreditation standard. ALL fields optional (partial PATCH). Hand-written
 * (not PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it (category/reviewDate/owner/notes).
 * code/title cannot be cleared (non-nullable columns), so they carry
 * @IsString/@MinLength when present.
 */
export class UpdateStandardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null

  /** Re-parent in the hierarchy: a UUID moves under that standard, explicit null makes it
   *  top-level, omitted keeps the current parent. Service guards same-school + cycles. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null

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
