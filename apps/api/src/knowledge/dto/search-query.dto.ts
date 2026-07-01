import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Phase 4 Knowledge/Search — the ONE query param for GET .../search.
 *
 * forbidNonWhitelisted-SAFE: `q` is the ONLY whitelisted field, so any OTHER query
 * key 400s at the global ValidationPipe (keep the FE sending only `q`).
 *
 * `q` is @IsOptional (not @IsNotEmpty) DELIBERATELY: a bare / too-short query is
 * handled by the service min-length short-circuit → an EMPTY grouped response,
 * NOT a 400 — friendlier for the debounced search box (a 1-char keystroke should
 * quietly return nothing rather than error). @MaxLength(200) bounds abuse; Prisma
 * `contains` parameterizes the value (no SQL injection) so no further sanitizing.
 */
export class SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string
}
