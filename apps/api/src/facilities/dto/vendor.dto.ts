import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Vendor register DTOs (Facilities vendors/bids). forbidNonWhitelisted-SAFE: every
 * field decorated; @IsOptional() lets explicit `null` clear a nullable column
 * (same convention as the maintenance DTOs). name is required on create only.
 * Dedupe is ADVISORY in the service (case-insensitive name match on CREATE → 400).
 */
export class CreateVendorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(254)
  contactEmail?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}

/** Partial PATCH — omitted keeps, explicit null clears (name not clearable). */
export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(254)
  contactEmail?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
