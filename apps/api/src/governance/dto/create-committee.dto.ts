import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Create a committee. forbidNonWhitelisted-SAFE: EVERY field is class-validator
 * decorated, so a stray/unknown key 400s. `kind` is FREE TEXT v1 (board|finance|
 * governance|advancement|academic|other — schools name their own), bounded only
 * by @MaxLength, deliberately NOT an @IsIn enum. Nullable fields (description/
 * chair) are @IsOptional, which skips validation for BOTH undefined (omitted) AND
 * null (explicit clear) — same pattern as the Policy DTOs.
 */
export class CreateCommitteeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

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
