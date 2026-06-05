import { Type } from 'class-transformer'
import {
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator'

/** Mirrors @finrep/engine NormalizedRow { acct:number(int), desc, total }. */
export class NormalizedRowDto {
  @IsInt()
  acct!: number

  @IsString()
  desc!: string

  @IsNumber({ allowInfinity: false, allowNaN: false })
  total!: number
}

/** The 3 numeric net-asset begin balances the engine needs (SchoolConfig subset). */
export class SchoolInputDto {
  @IsNumber()
  netAssetsBegin!: number

  @IsNumber()
  pyNetAssetsBegin!: number

  @IsNumber()
  auditNetAssetsBegin!: number
}

export class GenerateReportsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NormalizedRowDto)
  cyData!: NormalizedRowDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NormalizedRowDto)
  pyData!: NormalizedRowDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NormalizedRowDto)
  auditData!: NormalizedRowDto[]

  @ValidateNested()
  @Type(() => SchoolInputDto)
  school!: SchoolInputDto
}
