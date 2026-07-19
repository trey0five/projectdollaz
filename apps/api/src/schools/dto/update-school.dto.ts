import { Type } from 'class-transformer'
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'
import { GRADE_KEYS, SCHOOL_TYPES } from '@finrep/analytics'

/**
 * Partial school update (OWNER only). Every field is optional; the "at least one
 * field present" invariant is enforced in SchoolsService.updateSchool (it throws
 * BadRequestException when the assembled update object is empty).
 * Decimal balances validate as non-negative numbers; Prisma coerces to Decimal.
 *
 * Phase-1 Board Report branding (logoBase64/brandColor/defaultCommittee) MUST be
 * whitelisted here or the global forbidNonWhitelisted ValidationPipe 400s them.
 * Each allows an explicit `null` to CLEAR; the @Matches/@MaxLength run only on a
 * non-null string (ValidateIf). The logo @MaxLength is a cheap first gate — the
 * AUTHORITATIVE decoded-byte + mime guard lives in SchoolsService.updateSchool.
 */
export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netAssetsBegin?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pyNetAssetsBegin?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  auditNetAssetsBegin?: number

  // ── Board Report branding (school-wide) ──────────────────────────────────────

  /** Full data URL of the logo, or null to clear. Decoded-size/mime guarded in the service. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  // 5MB decoded -> ~7M base64 chars; a little headroom for the data-URL prefix.
  // The authoritative decoded-byte guard lives in SchoolsService.
  @MaxLength(7200000)
  @Matches(/^data:image\/(png|jpeg|jpg|svg\+xml);base64,/, {
    message: 'Logo must be a PNG/JPG/SVG under 5 MB.',
  })
  logoBase64?: string | null

  /** Optional hex accent (e.g. "#0B1F3A"), or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'brandColor must be a 6-digit hex color like #0B1F3A.' })
  brandColor?: string | null

  /** Default committee-name prefill, or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(120)
  defaultCommittee?: string | null

  // ── School Comparison — peer-benchmarking profile (all optional; null clears) ──

  /** School type from the canonical @finrep/analytics catalog, or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsIn(SCHOOL_TYPES as unknown as string[], {
    message: `schoolType must be one of: ${SCHOOL_TYPES.join(', ')}.`,
  })
  schoolType?: string | null

  /** County name, or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(120)
  county?: string | null

  /** District name, or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(120)
  district?: string | null

  /** Lowest grade served (GradeKey: PK3,PK4,K,1..12), or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsIn(GRADE_KEYS as unknown as string[], { message: 'gradeLow must be a valid grade key.' })
  gradeLow?: string | null

  /** Highest grade served (GradeKey: PK3,PK4,K,1..12), or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsIn(GRADE_KEYS as unknown as string[], { message: 'gradeHigh must be a valid grade key.' })
  gradeHigh?: string | null
}
