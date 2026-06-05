import { Type } from 'class-transformer'
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator'

export class CreateSchoolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netAssetsBegin!: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pyNetAssetsBegin!: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  auditNetAssetsBegin!: number
}
