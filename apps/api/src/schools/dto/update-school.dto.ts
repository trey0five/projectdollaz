import { Type } from 'class-transformer'
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'

/**
 * Partial school update (OWNER only). Every field is optional, but at least one
 * must be present — enforced via the `_hasAny` getter validated by ValidateIf.
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
  @MaxLength(700000)
  @Matches(/^data:image\/(png|jpeg|jpg|svg\+xml);base64,/, {
    message: 'Logo must be a PNG/JPG/SVG under 400KB.',
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
}
