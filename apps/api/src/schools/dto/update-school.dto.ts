import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

/**
 * Partial school update (OWNER only). Every field is optional, but at least one
 * must be present — enforced via the `_hasAny` getter validated by ValidateIf.
 * Decimal balances validate as non-negative numbers; Prisma coerces to Decimal.
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
}
