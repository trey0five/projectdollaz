import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

export class CreateSchoolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  // Opening net-asset balances are OPTIONAL: the web app derives them from the
  // uploaded trial balances (see deriveOpeningNetAssets), so school creation
  // only requires a name. They default to 0 when omitted.
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
